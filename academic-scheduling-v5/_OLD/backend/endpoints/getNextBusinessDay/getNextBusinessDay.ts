import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string, boolean } from 'yup';
import { requirePermission } from '../../app/auth/permissions';
import { validateQuery } from '../../app/validation/validate';

export const method = 'get';
export const path = '/companies/:companyId/next-business-day';
export const auth = true;

const querySchema = object({
  from: string().required(), // ISO date YYYY-MM-DD
  saturdayIsSchoolDay: string().optional(), // 'true' or 'false'
});

export const middlewares = [requirePermission('company.read'), validateQuery(querySchema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const { from, saturdayIsSchoolDay } = req.query as { from: string; saturdayIsSchoolDay?: string };
      const satOk = saturdayIsSchoolDay === 'true';

      // Get blocked days
      const client = await pool.connect();
      try {
        const { rows: blockedDays } = await client.query<{ blocked_date: string }>(
          `SELECT blocked_date::text FROM company_blocked_day
           WHERE company_id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
          [companyId, tenantId]
        );
        const holidaySet = new Set(blockedDays.map(b => b.blocked_date.substring(0, 10)));

        // Find next business day starting from 'from' + 1
        let candidate = new Date(from);
        candidate.setDate(candidate.getDate() + 1);
        let attempts = 0;

        while (attempts < 60) {
          const dateStr = candidate.toISOString().substring(0, 10);
          const dow = candidate.getDay();
          const isHoliday = holidaySet.has(dateStr);
          const isSunday = dow === 0;
          const isSaturday = dow === 6 && !satOk;

          if (!isHoliday && !isSunday && !isSaturday) {
            return res.json({
              from,
              nextBusinessDay: dateStr,
              dayOfWeek: ['Domingo','Segunda','Terca','Quarta','Quinta','Sexta','Sabado'][dow],
              skippedDays: attempts,
            });
          }
          candidate.setDate(candidate.getDate() + 1);
          attempts++;
        }

        res.status(400).json({ error: 'Could not find business day within 60 days' });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  };
}
