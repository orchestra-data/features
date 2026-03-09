import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { validateBody } from '../../app/validation/validate';

export const method = 'delete';

const schema = object({
  id: string().uuid().required(),
  companyId: string().uuid().nullable().optional(),
});

export const middlewares = [requirePermission('edu.class_instance.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const body = req.body as Awaited<ReturnType<typeof schema.validate>>;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      const { rowCount } = await pool.query(
        `DELETE FROM company_blocked_day
         WHERE id = $1
           AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
           AND (company_id IS NULL OR company_id = COALESCE($3, company_id))`,
        [body.id, tenantId, body.companyId ?? null]
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
