import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { enqueueOutbox } from '../../app/events/outbox-enqueue';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';
import { validateQuery } from '../../app/validation/validate';
import { randomUUID } from 'crypto';

export const method = 'delete';
export const path = '/companies/:companyId/events/:eventId';

const querySchema = object({
  action: string().oneOf(['delete', 'cancel', 'archive']).default('delete'),
});

export const middlewares = [requirePermission('company.delete'), validateQuery(querySchema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
      const { companyId, eventId } = req.params;
      const { action } = req.query as { action: 'delete' | 'cancel' | 'archive' };

      await withTransaction(pool, async (client) => {
        const repo = new CompanyEventsRepository(client);

        // Verify event exists and belongs to company
        const existing = await repo.getEvent(tenantId, eventId);
        if (!existing) {
          throw Object.assign(new Error('Event not found'), { status: 404 });
        }
        if (existing.company_id !== companyId) {
          throw Object.assign(new Error('Event does not belong to this company'), { status: 403 });
        }

        // Check if event is in the past
        const now = new Date();
        const eventEnd = new Date(existing.end_datetime);

        if (action === 'delete') {
          // Only allow deletion for draft events or future events
          if (existing.status !== 'draft' && eventEnd < now) {
            throw Object.assign(
              new Error('Cannot delete past events. Use cancel action instead.'),
              { status: 409 }
            );
          }

          // Check if there are any attendees marked as attended
          const { rows } = await client.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM event_attendee WHERE event_id = $1 AND status = 'attended'`,
            [eventId]
          );
          if (parseInt(rows[0].count, 10) > 0) {
            throw Object.assign(
              new Error(
                'Cannot delete event with attended participants. Use cancel action instead.'
              ),
              { status: 409 }
            );
          }

          await repo.softDeleteEvent(eventId);
          await enqueueOutbox(
            client,
            'event.deleted',
            { id: eventId, companyId, tenantId },
            correlationId
          );
        } else if (action === 'archive') {
          await repo.archiveEvent(eventId);
          await enqueueOutbox(
            client,
            'event.archived',
            { id: eventId, companyId, tenantId },
            correlationId
          );
        } else {
          // Cancel the event
          await repo.cancelEvent(eventId);
          await enqueueOutbox(
            client,
            'event.cancelled',
            { id: eventId, companyId, tenantId },
            correlationId
          );
        }
      });

      res.status(204).send();
    } catch (err: any) {
      if (err.status === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err.status === 403) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err.status === 409) {
        res.status(409).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}
