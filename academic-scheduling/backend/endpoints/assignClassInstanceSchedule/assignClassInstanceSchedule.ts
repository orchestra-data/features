import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { array, boolean, object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';
import { validateBody } from '../../app/validation/validate';

export const method = 'post';

const assignmentSchema = object({
  componentId: string().uuid().required(),
  scheduledDate: string().required(),
  resourceId: string().uuid().nullable().optional(),
  isOnsite: boolean().required(),
  eventTitle: string().nullable().optional(),
  eventType: string().nullable().optional(),
});

const schema = object({
  classInstanceId: string().uuid().required(),
  assignments: array().of(assignmentSchema).required().min(1),
  replaceExisting: boolean().optional().default(true),
  classStartTime: string().nullable().optional(),
  classEndTime: string().nullable().optional(),
});

export const middlewares = [requirePermission('edu.class_instance.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const body = req.body as Awaited<ReturnType<typeof schema.validate>>;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const companyId = req.headers['x-company-id'] as string | undefined;

      if (!companyId) {
        return res.status(400).json({ error: 'x-company-id header is required' });
      }

      // Verify class instance belongs to this tenant/company
      const { rows: ciRows } = await pool.query(
        `SELECT id, name, company_id, class_start_time, class_end_time
         FROM class_instance
         WHERE id = $1
           AND company_id = $2
           AND (tenant_id IS NULL OR tenant_id = COALESCE($3, tenant_id))
           AND deleted_at IS NULL`,
        [body.classInstanceId, companyId, tenantId]
      );

      if (ciRows.length === 0) {
        return res.status(404).json({ error: 'Class instance not found' });
      }

      const classInstance = ciRows[0];

      await withTransaction(pool, async (client) => {
        // Persist class times if provided
        if (body.classStartTime !== undefined || body.classEndTime !== undefined) {
          await client.query(
            `UPDATE class_instance
             SET class_start_time = COALESCE($2, class_start_time),
                 class_end_time   = COALESCE($3, class_end_time)
             WHERE id = $1`,
            [body.classInstanceId, body.classStartTime ?? null, body.classEndTime ?? null]
          );
        }

        const effectiveStartTime = body.classStartTime ?? classInstance.class_start_time;
        const effectiveEndTime = body.classEndTime ?? classInstance.class_end_time;

        // Soft-delete existing schedule entries and their linked events if replaceExisting
        if (body.replaceExisting !== false) {
          // Hard-delete events that belong exclusively to this class instance.
          // class_instance_id = $1 is the hard guard — events from other class
          // instances are never touched regardless of any FK link.
          await client.query(
            `DELETE FROM company_event
             WHERE class_instance_id = $1`,
            [body.classInstanceId]
          );

          await client.query(
            `UPDATE class_instance_component_schedule
             SET deleted_at = NOW()
             WHERE class_instance_id = $1
               AND deleted_at IS NULL`,
            [body.classInstanceId]
          );
        }

        const eventsRepo = new CompanyEventsRepository(client);

        // Cache events already created this run keyed by "date_resourceId" so that
        // multiple components on the same day sharing the same resource reuse a single
        // event instead of trying to double-book it.
        const eventCache = new Map<string, string>(); // key → eventId

        for (const assignment of body.assignments!) {
          // Insert schedule entry
          const { rows: scheduleRows } = await client.query<{ id: string }>(
            `INSERT INTO class_instance_component_schedule
               (tenant_id, class_instance_id, component_id, scheduled_date)
             VALUES ($1, $2, $3, $4::timestamptz)
             ON CONFLICT (class_instance_id, component_id) WHERE deleted_at IS NULL DO NOTHING
             RETURNING id`,
            [tenantId, body.classInstanceId, assignment.componentId, assignment.scheduledDate]
          );
          const scheduleRowId = scheduleRows[0]?.id ?? null;

          if (assignment.isOnsite) {
            const dateOnly = assignment.scheduledDate.split('T')[0];

            let endDatetime: string;
            if (effectiveStartTime && effectiveEndTime) {
              endDatetime = `${dateOnly}T${effectiveEndTime}`;
            } else {
              const start = new Date(assignment.scheduledDate);
              start.setMinutes(start.getMinutes() + 60);
              endDatetime = start.toISOString();
            }

            // Reuse an existing event when the same day + resource combination
            // was already created in this batch to avoid double-booking.
            const cacheKey = `${dateOnly}_${assignment.resourceId ?? 'no-resource'}`;
            let eventId = eventCache.get(cacheKey);

            if (!eventId) {
              const { rows: compRows } = await client.query<{ title: string }>(
                `SELECT title FROM component WHERE id = $1 AND deleted_at IS NULL`,
                [assignment.componentId]
              );
              const componentTitle = compRows[0]?.title ?? 'Aula presencial';
              const classInstanceName = classInstance.name ?? '';
              const defaultTitle = classInstanceName
                ? `${classInstanceName} - ${componentTitle}`
                : componentTitle;

              eventId = await eventsRepo.createEvent(tenantId, companyId, null, {
                title: assignment.eventTitle ?? defaultTitle,
                event_type: (assignment.eventType as any) ?? 'aula',
                start_datetime: assignment.scheduledDate,
                end_datetime: endDatetime,
                class_instance_id: body.classInstanceId,
                status: 'scheduled',
              });

              if (assignment.resourceId) {
                await eventsRepo.addEventResource(eventId, assignment.resourceId, 1, null);
              }

              eventCache.set(cacheKey, eventId);
            }

            if (scheduleRowId) {
              await client.query(
                `UPDATE class_instance_component_schedule SET company_event_id = $1 WHERE id = $2`,
                [eventId, scheduleRowId]
              );
            }
          }
        }
      });

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}
