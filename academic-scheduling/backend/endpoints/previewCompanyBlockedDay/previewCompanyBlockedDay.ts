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
      const { companyId, date } = req.query as { companyId?: string; date?: string };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!companyId) {
        return res.status(400).json({ error: 'companyId query param is required' });
      }
      if (!UUID_RE.test(companyId)) {
        return res.status(400).json({ error: 'companyId must be a valid UUID' });
      }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
      }

      const { rows } = await pool.query<{
        id: string;
        title: string;
        start_datetime: string;
        end_datetime: string;
        class_instance_id: string | null;
        company_id: string;
        status: string;
      }>(
        `SELECT id, title, start_datetime, end_datetime, class_instance_id, company_id, status
         FROM company_event
         WHERE company_id = $1
           AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
           AND deleted_at IS NULL
           AND archived_at IS NULL
           AND status NOT IN ('cancelled', 'completed')
           AND start_datetime::date = $3::date
         ORDER BY start_datetime`,
        [companyId, tenantId, date]
      );

      res.json({ events: rows });
    } catch (err) {
      next(err);
    }
  };
}
