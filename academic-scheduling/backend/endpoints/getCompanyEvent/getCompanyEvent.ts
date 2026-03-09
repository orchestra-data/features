import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';

export const method = 'get';
export const path = '/companies/:companyId/events/:eventId';

export const middlewares = [requirePermission('company.read')];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const { eventId } = req.params;

      const client = await pool.connect();
      try {
        const repo = new CompanyEventsRepository(client);
        const event = await repo.getEvent(tenantId, eventId);

        if (!event) {
          res.status(404).json({ error: 'Event not found' });
          return;
        }

        // Get resources for this event
        const resources = await repo.getEventResources(eventId);

        res.json({
          ...event,
          resources: resources.map((r) => ({
            id: r.resource_id,
            name: r.name,
            code: r.code,
            resource_type: r.resource_type,
            capacity: r.capacity,
            full_location: r.full_location,
            status: r.status,
            pivot: {
              quantity: r.quantity,
              notes: r.notes,
            },
          })),
        });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  };
}
