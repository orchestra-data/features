import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'delete';
export const path = '/companies/:companyId/academic-years/:calendarId';

export const middlewares = [requirePermission('edu.class_instance.update')];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { companyId, calendarId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      await client.query('BEGIN');

      // Get the academic_year_id before deleting
      const { rows: calRows } = await client.query(
        `SELECT academic_year_id FROM academic_calendar
         WHERE id = $1 AND tenant_id = $2 AND (company_id = $3 OR company_id IS NULL)`,
        [calendarId, tenantId, companyId]
      );

      if (calRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Academic calendar not found' });
      }

      const academicYearId = calRows[0].academic_year_id;

      // Delete calendar_day records (table may not exist yet)
      try {
        await client.query(
          `DELETE FROM calendar_day WHERE academic_calendar_id = $1`,
          [calendarId]
        );
      } catch { /* table may not exist */ }

      // Delete mec_compliance_audit records (table may not exist yet)
      try {
        await client.query(
          `DELETE FROM mec_compliance_audit WHERE academic_calendar_id = $1`,
          [calendarId]
        );
      } catch { /* table may not exist */ }

      // Delete the academic_calendar
      await client.query(
        `DELETE FROM academic_calendar WHERE id = $1`,
        [calendarId]
      );

      // Delete the academic_year if no other calendars reference it
      if (academicYearId) {
        const { rows: otherCals } = await client.query(
          `SELECT id FROM academic_calendar WHERE academic_year_id = $1 LIMIT 1`,
          [academicYearId]
        );
        if (otherCals.length === 0) {
          await client.query(
            `DELETE FROM academic_year WHERE id = $1`,
            [academicYearId]
          );
        }
      }

      await client.query('COMMIT');

      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  };
}
