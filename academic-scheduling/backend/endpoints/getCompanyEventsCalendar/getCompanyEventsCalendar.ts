import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';
import { validateQuery } from '../../app/validation/validate';

export const method = 'get';
export const path = '/companies/:companyId/events/calendar';

const querySchema = object({
  startDate: string().required(), // ISO date (YYYY-MM-DD)
  endDate: string().required(), // ISO date (YYYY-MM-DD)
  classInstanceId: string().optional(), // Filter by turma (comma-separated for multiple)
});

export const middlewares = [requirePermission('company.read'), validateQuery(querySchema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const { companyId } = req.params;
      const { startDate, endDate, classInstanceId } = req.query as {
        startDate: string;
        endDate: string;
        classInstanceId?: string;
      };

      // Support comma-separated classInstanceIds
      const classInstanceIds = classInstanceId
        ? classInstanceId.split(',').map((id) => id.trim()).filter(Boolean)
        : undefined;

      const client = await pool.connect();
      try {
        const repo = new CompanyEventsRepository(client);

        const events = await repo.getCalendarEvents(
          tenantId,
          companyId,
          startDate,
          endDate,
          classInstanceIds,
        );

        res.json({
          data: events,
          period: { startDate, endDate },
        });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  };
}
