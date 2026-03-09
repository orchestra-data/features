import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';
export const path = '/companies/:companyId/academic-years/:calendarId/holidays';

export const middlewares = [requirePermission('edu.class_instance.read')];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId, calendarId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      // Get the academic year date range
      const { rows: calRows } = await pool.query(
        `SELECT ay.start_date, ay.end_date, ac.year
         FROM academic_calendar ac
         LEFT JOIN academic_year ay ON ac.academic_year_id = ay.id
         WHERE ac.id = $1 AND ac.tenant_id = $2
           AND (ac.company_id = $3 OR ac.company_id IS NULL)`,
        [calendarId, tenantId, companyId]
      );

      if (calRows.length === 0) {
        return res.status(404).json({ error: 'Academic calendar not found' });
      }

      const cal = calRows[0];
      const effectiveStart = cal.start_date ?? `${cal.year}-01-01`;
      const effectiveEnd = cal.end_date ?? `${cal.year}-12-31`;

      // Get all blocked days within this range
      const { rows } = await pool.query(
        `SELECT id, blocked_date::text AS "date", reason, created_at AS "createdAt"
         FROM company_blocked_day
         WHERE (company_id = $1 OR (company_id IS NULL AND tenant_id = $2))
           AND blocked_date >= $3::date AND blocked_date <= $4::date
         ORDER BY blocked_date ASC`,
        [companyId, tenantId, effectiveStart, effectiveEnd]
      );

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  };
}
