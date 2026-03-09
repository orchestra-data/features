import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { validateBody } from '../../app/validation/validate';

export const method = 'post';

const schema = object({
  companyId: string().uuid().nullable().optional(), // null = tenant-wide
  blockedDate: string().required().matches(/^\d{4}-\d{2}-\d{2}$/, 'blockedDate must be YYYY-MM-DD'),
  reason: string().nullable().optional(),
});

export const middlewares = [requirePermission('edu.class_instance.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const body = req.body as Awaited<ReturnType<typeof schema.validate>>;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const userId = (req as any).user?.id ?? null;

      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO company_blocked_day (tenant_id, company_id, blocked_date, reason, created_by_user_id)
         VALUES ($1, $2, $3::date, $4, $5)
         ON CONFLICT ON CONSTRAINT company_blocked_day_unique DO NOTHING
         RETURNING id`,
        [tenantId, body.companyId ?? null, body.blockedDate, body.reason ?? null, userId]
      );

      if (rows.length === 0) {
        return res.status(409).json({ error: 'Blocked day already exists for this date' });
      }

      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      next(err);
    }
  };
}
