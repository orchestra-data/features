import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string, number, boolean } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { validateBody } from '../../app/validation/validate';

export const method = 'put';
export const path = '/companies/:companyId/academic-years/:calendarId';

const schema = object({
  title: string().max(200).optional(),
  status: string().oneOf(['draft', 'published', 'archived']).optional(),
  mecComplianceEnabled: boolean().optional(),
  educationLevel: string().nullable().optional(),
  courseType: string().nullable().optional(),
  startDate: string().matches(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: string().matches(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
});

export const middlewares = [requirePermission('edu.class_instance.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId, calendarId } = req.params;
      const body = req.body as Awaited<ReturnType<typeof schema.validate>>;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [calendarId, tenantId, companyId];

      if (body.title !== undefined) {
        params.push(body.title);
        setClauses.push(`title = $${params.length}`);
      }
      if (body.status !== undefined) {
        params.push(body.status);
        setClauses.push(`academic_status = $${params.length}`);
      }
      if (body.mecComplianceEnabled !== undefined) {
        params.push(body.mecComplianceEnabled);
        setClauses.push(`mec_compliance_enabled = $${params.length}`);
      }
      if (body.educationLevel !== undefined) {
        params.push(body.educationLevel);
        setClauses.push(`education_level = $${params.length}`);
      }
      if (body.courseType !== undefined) {
        params.push(body.courseType);
        setClauses.push(`course_type = $${params.length}`);
      }

      const { rowCount } = await pool.query(
        `UPDATE academic_calendar
         SET ${setClauses.join(', ')}
         WHERE id = $1 AND tenant_id = $2 AND (company_id = $3 OR company_id IS NULL)`,
        params
      );

      // Also update linked academic_year dates if provided
      if (body.startDate || body.endDate) {
        const yearSetClauses: string[] = ['updated_at = NOW()'];
        const yearParams: unknown[] = [];

        // Get academic_year_id
        const { rows: calRows } = await pool.query(
          `SELECT academic_year_id FROM academic_calendar WHERE id = $1`,
          [calendarId]
        );
        if (calRows[0]?.academic_year_id) {
          yearParams.push(calRows[0].academic_year_id);
          if (body.startDate) {
            yearParams.push(body.startDate);
            yearSetClauses.push(`start_date = $${yearParams.length}::date`);
          }
          if (body.endDate) {
            yearParams.push(body.endDate);
            yearSetClauses.push(`end_date = $${yearParams.length}::date`);
          }
          await pool.query(
            `UPDATE academic_year SET ${yearSetClauses.join(', ')} WHERE id = $1`,
            yearParams
          );
        }
      }

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Academic calendar not found' });
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}
