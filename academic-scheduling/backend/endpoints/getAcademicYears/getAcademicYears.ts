import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';
export const path = '/companies/:companyId/academic-years';

export const middlewares = [requirePermission('edu.class_instance.read')];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      // academic_calendar is the main entity for "Ano Letivo"
      // It has company_id, year, mec_compliance_enabled, etc.
      // academic_year is linked via academic_year_id but may be empty
      const { rows } = await pool.query(
        `SELECT
           ac.id,
           ac.title,
           ac.description,
           ac.year,
           ac.semester,
           ac.academic_status AS "status",
           ac.mec_compliance_enabled AS "mecComplianceEnabled",
           ac.education_level AS "educationLevel",
           ac.course_type AS "courseType",
           ac.academic_regime AS "academicRegime",
           ac.is_default AS "isDefault",
           ac.is_institutional AS "isInstitutional",
           ac.calendar_type AS "calendarType",
           ac.cached_metrics AS "cachedMetrics",
           ac.created_at AS "createdAt",
           ay.id AS "academicYearId",
           ay.display_name AS "academicYearName",
           ay.start_date AS "startDate",
           ay.end_date AS "endDate",
           ay.status AS "yearStatus"
         FROM academic_calendar ac
         LEFT JOIN academic_year ay ON ac.academic_year_id = ay.id
         WHERE ac.tenant_id = $1
           AND (ac.company_id = $2 OR ac.company_id IS NULL)
           AND ac.academic_status != 'archived'
         ORDER BY ac.year DESC NULLS LAST, ac.created_at DESC`,
        [tenantId, companyId]
      );

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  };
}
