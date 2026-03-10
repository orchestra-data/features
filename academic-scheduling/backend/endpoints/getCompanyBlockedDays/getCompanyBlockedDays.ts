import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';

export const middlewares = [requirePermission('edu.class_instance.read')];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const { companyId, from, to } = req.query as {
        companyId: string;
        from?: string;
        to?: string;
      };

      if (!companyId) {
        return res.status(400).json({ error: 'companyId query param is required' });
      }

      const dateConditions: string[] = [];
      const params: unknown[] = [companyId, tenantId];

      if (from) {
        params.push(from);
        dateConditions.push(`blocked_date >= $${params.length}::date`);
      }
      if (to) {
        params.push(to);
        dateConditions.push(`blocked_date <= $${params.length}::date`);
      }

      const datePart = dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

      // Returns:
      //   1. Company-specific blocked days (company_id = $1)
      //   2. Tenant-wide blocked days (company_id IS NULL) that match the tenant
      const { rows } = await pool.query(
        `SELECT id,
                company_id AS "companyId",
                blocked_date AS "blockedDate",
                reason
         FROM company_blocked_day
         WHERE (
           -- Company-specific
           (company_id = $1 AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id)))
           OR
           -- Tenant-wide (null company_id)
           (company_id IS NULL AND tenant_id = $2)
         )
         ${datePart}
         ORDER BY blocked_date`,
        params
      );

      res.json({ blockedDays: rows });
    } catch (err) {
      next(err);
    }
  };
}
