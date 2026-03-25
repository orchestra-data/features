import { randomUUID } from 'crypto';

import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { enqueueOutbox } from '../../app/events/outbox-enqueue';
import { validateBody } from '../../app/validation/validate';

export const method = 'post';
export const path = '/recurrence-groups/:groupId/split';

const schema = object({
  eventId: string().uuid().required(),
  splitReason: string().default('manual_split'),
});

export const middlewares = [requirePermission('company.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
      const { groupId } = req.params;
      const { eventId, splitReason } = req.body as { eventId: string; splitReason: string };

      const result = await withTransaction(pool, async (client) => {
        // 1. Fetch the original recurrence group
        const { rows: groupRows } = await client.query<{
          id: string;
          tenant_id: string | null;
          company_id: string;
          class_instance_id: string | null;
          pattern: string;
          custom_days: number[] | null;
          start_date: string;
          end_date: string | null;
        }>(
          `SELECT id, tenant_id, company_id, class_instance_id, pattern, custom_days, start_date, end_date
           FROM recurrence_group
           WHERE id = $1 AND deleted_at IS NULL`,
          [groupId]
        );

        if (groupRows.length === 0) {
          throw Object.assign(new Error('Recurrence group not found'), { status: 404 });
        }

        const originalGroup = groupRows[0];

        // 2. Fetch the split-point event to validate it belongs to this group
        const { rows: splitEventRows } = await client.query<{
          id: string;
          start_datetime: string;
        }>(
          `SELECT id, start_datetime
           FROM company_event
           WHERE id = $1
             AND recurrence_group_id = $2
             AND deleted_at IS NULL`,
          [eventId, groupId]
        );

        if (splitEventRows.length === 0) {
          throw Object.assign(
            new Error('Event not found or does not belong to this recurrence group'),
            { status: 400 }
          );
        }

        const splitEvent = splitEventRows[0];

        // 3. Get all events in the group ordered by start_date
        const { rows: allEvents } = await client.query<{
          id: string;
          start_datetime: string;
        }>(
          `SELECT id, start_datetime
           FROM company_event
           WHERE recurrence_group_id = $1
             AND deleted_at IS NULL
           ORDER BY start_datetime ASC`,
          [groupId]
        );

        // Partition: events before the split point stay, split point + after move
        const splitDate = new Date(splitEvent.start_datetime);
        const eventsBefore = allEvents.filter(
          (e) => new Date(e.start_datetime) < splitDate
        );
        const eventsAfter = allEvents.filter(
          (e) => new Date(e.start_datetime) >= splitDate
        );

        if (eventsBefore.length === 0) {
          throw Object.assign(
            new Error('Cannot split: no events would remain in the original group'),
            { status: 400 }
          );
        }

        if (eventsAfter.length === 0) {
          throw Object.assign(
            new Error('Cannot split: no events would move to the new group'),
            { status: 400 }
          );
        }

        // 4. Compute new start/end dates
        const lastBeforeDate = eventsBefore[eventsBefore.length - 1].start_datetime;
        const firstAfterDate = eventsAfter[0].start_datetime;
        const lastAfterDate = eventsAfter[eventsAfter.length - 1].start_datetime;

        // 5. Create the new recurrence group
        const { rows: newGroupRows } = await client.query<{ id: string }>(
          `INSERT INTO recurrence_group (
             tenant_id, company_id, class_instance_id, pattern, custom_days,
             start_date, end_date, parent_group_id, split_reason,
             created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, NOW(), NOW())
           RETURNING id`,
          [
            originalGroup.tenant_id,
            originalGroup.company_id,
            originalGroup.class_instance_id,
            originalGroup.pattern,
            originalGroup.custom_days,
            firstAfterDate,
            originalGroup.end_date ?? lastAfterDate,
            groupId, // parent_group_id → original group
            splitReason,
          ]
        );

        const newGroupId = newGroupRows[0].id;

        // 6. Move events from split point onward to the new group
        const afterIds = eventsAfter.map((e) => e.id);
        await client.query(
          `UPDATE company_event
           SET recurrence_group_id = $1, updated_at = NOW()
           WHERE id = ANY($2)`,
          [newGroupId, afterIds]
        );

        // 7. Shrink original group end_date to the last remaining event
        await client.query(
          `UPDATE recurrence_group
           SET end_date = $1::date, updated_at = NOW()
           WHERE id = $2`,
          [lastBeforeDate, groupId]
        );

        // 8. Fetch final state of both groups with their events
        const { rows: originalGroupFinal } = await client.query(
          `SELECT * FROM recurrence_group WHERE id = $1`,
          [groupId]
        );
        const { rows: newGroupFinal } = await client.query(
          `SELECT * FROM recurrence_group WHERE id = $1`,
          [newGroupId]
        );

        const { rows: originalEvents } = await client.query(
          `SELECT id, title, start_datetime, end_datetime, status
           FROM company_event
           WHERE recurrence_group_id = $1 AND deleted_at IS NULL
           ORDER BY start_datetime ASC`,
          [groupId]
        );

        const { rows: newEvents } = await client.query(
          `SELECT id, title, start_datetime, end_datetime, status
           FROM company_event
           WHERE recurrence_group_id = $1 AND deleted_at IS NULL
           ORDER BY start_datetime ASC`,
          [newGroupId]
        );

        await enqueueOutbox(
          client,
          'recurrence_group.split',
          {
            originalGroupId: groupId,
            newGroupId,
            splitEventId: eventId,
            companyId: originalGroup.company_id,
            tenantId,
          },
          correlationId
        );

        return {
          originalGroup: { ...originalGroupFinal[0], events: originalEvents },
          newGroup: { ...newGroupFinal[0], events: newEvents },
        };
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err.status === 400) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err.status === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}
