import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { validateBody } from '../../app/validation/validate';

export const method = 'put';

const schema = object({
  id: string().uuid().required(),
  blockedDate: string().matches(/^\d{4}-\d{2}-\d{2}$/, 'blockedDate must be YYYY-MM-DD').optional(),
  reason: string().nullable().optional(),
});

export const middlewares = [requirePermission('edu.class_instance.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const body = req.body as Awaited<ReturnType<typeof schema.validate>>;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [body.id, tenantId];

      if (body.blockedDate !== undefined) {
        params.push(body.blockedDate);
        setClauses.push(`blocked_date = $${params.length}::date`);
      }
      if (body.reason !== undefined) {
        params.push(body.reason);
        setClauses.push(`reason = $${params.length}`);
      }

      const { rowCount } = await pool.query(
        `UPDATE company_blocked_day
         SET ${setClauses.join(', ')}
         WHERE id = $1
           AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))`,
        params
      );

      if (!rowCount) {
        return res.status(404).json({ error: 'Blocked day not found' });
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}
