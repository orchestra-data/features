import type { EventStatus, EventType } from '@cogedu/ava-api-types';
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { number, object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';
import { validateQuery } from '../../app/validation/validate';

export const method = 'get';
export const path = '/companies/:companyId/events';

const querySchema = object({
  limit: number().min(1).max(300).default(50),
  offset: number().min(0).default(0),
  eventType: string()
    .oneOf([
      'aula',
      'estagio',
      'palestra',
      'visitacao_tecnica',
      'workshop',
      'seminario',
      'reuniao',
      'avaliacao',
      'outro',
    ])
    .optional(),
  status: string()
    .oneOf(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  instructorUserId: string().uuid().optional(),
  classInstanceId: string().uuid().optional(),
  startDateFrom: string().optional(), // ISO datetime
  startDateTo: string().optional(), // ISO datetime
  search: string().optional(),
  archived: string().oneOf(['true', 'false']).optional(),
});

export const middlewares = [requirePermission('company.read'), validateQuery(querySchema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const { companyId } = req.params;
      const query = req.query as unknown as {
        limit: number;
        offset: number;
        eventType?: EventType;
        status?: EventStatus;
        instructorUserId?: string;
        classInstanceId?: string;
        startDateFrom?: string;
        startDateTo?: string;
        search?: string;
        archived?: string;
      };

      const client = await pool.connect();
      try {
        const repo = new CompanyEventsRepository(client);

        const [events, total] = await Promise.all([
          repo.listEvents(tenantId, {
            companyId,
            limit: query.limit,
            offset: query.offset,
            eventType: query.eventType,
            status: query.status,
            instructorUserId: query.instructorUserId,
            classInstanceId: query.classInstanceId,
            startDateFrom: query.startDateFrom,
            startDateTo: query.startDateTo,
            search: query.search,
            archived: query.archived === 'true',
          }),
          repo.countEvents(tenantId, {
            companyId,
            eventType: query.eventType,
            status: query.status,
            instructorUserId: query.instructorUserId,
            classInstanceId: query.classInstanceId,
            startDateFrom: query.startDateFrom,
            startDateTo: query.startDateTo,
            search: query.search,
            archived: query.archived === 'true',
          }),
        ]);

        res.json({
          data: events,
          pagination: {
            total,
            limit: query.limit,
            offset: query.offset,
          },
        });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  };
}
