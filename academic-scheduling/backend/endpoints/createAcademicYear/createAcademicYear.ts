import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string, number, boolean } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { validateBody } from '../../app/validation/validate';

export const method = 'post';
export const path = '/companies/:companyId/academic-years';

const schema = object({
  title: string().required().max(200),
  year: number().integer().min(2000).max(2100).required(),
  semester: number().integer().min(1).max(2).nullable().optional(),
  educationLevel: string().nullable().optional(),
  courseType: string().nullable().optional(),
  academicRegime: string().oneOf(['anual', 'semestral']).default('semestral'),
  mecComplianceEnabled: boolean().default(false),
  // Academic year dates (creates linked academic_year record)
  startDate: string().required().matches(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: string().required().matches(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
});

export const middlewares = [requirePermission('edu.class_instance.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { companyId } = req.params;
      const body = req.body as Awaited<ReturnType<typeof schema.validate>>;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const userId = (req as any).user?.id ?? null;

      await client.query('BEGIN');

      // 1. Create academic_year record
      const yearCode = body.semester
        ? `${body.year}/${body.semester}`
        : `${body.year}`;

      const { rows: yearRows } = await client.query<{ id: string }>(
        `INSERT INTO academic_year (tenant_id, year_code, year_number, display_name, start_date, end_date, status, is_current_year)
         VALUES ($1, $2, $3, $4, $5::date, $6::date, 'active', false)
         ON CONFLICT ON CONSTRAINT unique_year_per_tenant DO UPDATE SET
           display_name = EXCLUDED.display_name,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date
         RETURNING id`,
        [tenantId, yearCode, body.year, body.title, body.startDate, body.endDate]
      );
      const academicYearId = yearRows[0].id;

      // 2. Create academic_calendar record
      const { rows: calendarRows } = await client.query<{ id: string }>(
        `INSERT INTO academic_calendar (
           tenant_id, company_id, title, year, semester,
           academic_status, education_level, course_type, academic_regime,
           mec_compliance_enabled, academic_year_id, created_by
         ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          tenantId, companyId, body.title, body.year, body.semester ?? null,
          body.educationLevel ?? null, body.courseType ?? null, body.academicRegime,
          body.mecComplianceEnabled, academicYearId, userId,
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        id: calendarRows[0].id,
        academicYearId,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  };
}
