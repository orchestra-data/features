import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';
export const path = '/companies/:companyId/academic-years/:calendarId/stats';

export const middlewares = [requirePermission('edu.class_instance.read')];

type Deps = { pool: Pool };

/**
 * MEC compliance defaults by education level (LDB Art. 24, Art. 47)
 */
const MEC_DEFAULTS: Record<string, { minDays: number; minHours: number }> = {
  infantil:              { minDays: 200, minHours: 800 },
  fundamental_1:         { minDays: 200, minHours: 800 },
  fundamental_2:         { minDays: 200, minHours: 800 },
  medio:                 { minDays: 200, minHours: 800 },
  medio_tecnico:         { minDays: 200, minHours: 800 },
  superior_anual:        { minDays: 200, minHours: 800 },
  superior_semestral:    { minDays: 100, minHours: 400 },
};

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId, calendarId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      // 1. Get academic_calendar + linked academic_year
      const { rows: calRows } = await pool.query(
        `SELECT
           ac.id,
           ac.title,
           ac.year,
           ac.semester,
           ac.academic_status AS "status",
           ac.mec_compliance_enabled AS "mecComplianceEnabled",
           ac.education_level AS "educationLevel",
           ac.course_type AS "courseType",
           ac.academic_regime AS "academicRegime",
           ac.cached_metrics AS "cachedMetrics",
           ay.start_date AS "startDate",
           ay.end_date AS "endDate",
           ay.display_name AS "yearName"
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
      const startDate = cal.startDate;
      const endDate = cal.endDate;

      // If no academic_year dates, use calendar year range
      const effectiveStart = startDate ?? `${cal.year}-01-01`;
      const effectiveEnd = endDate ?? `${cal.year}-12-31`;

      // 2. Count calendar_day by type (table may not exist yet)
      const defaultDayStats = {
        instructionalDays: 0, holidayDays: 0, recessDays: 0, examDays: 0,
        makeupDays: 0, saturdayClassDays: 0, totalDays: 0, totalInstructionalHours: 0,
      };
      let ds = defaultDayStats;
      try {
        const { rows: dayStats } = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE is_instructional = true)::integer AS "instructionalDays",
             COUNT(*) FILTER (WHERE day_type = 'holiday')::integer AS "holidayDays",
             COUNT(*) FILTER (WHERE day_type = 'recess')::integer AS "recessDays",
             COUNT(*) FILTER (WHERE day_type = 'exam')::integer AS "examDays",
             COUNT(*) FILTER (WHERE day_type = 'makeup')::integer AS "makeupDays",
             COUNT(*) FILTER (WHERE day_type = 'saturday_class')::integer AS "saturdayClassDays",
             COUNT(*)::integer AS "totalDays",
             COALESCE(SUM(instructional_hours) FILTER (WHERE is_instructional = true), 0)::numeric AS "totalInstructionalHours"
           FROM calendar_day
           WHERE academic_calendar_id = $1`,
          [calendarId]
        );
        ds = dayStats[0] ?? defaultDayStats;
      } catch {
        // calendar_day table may not exist yet — use defaults
      }

      // 3. Count holidays (company_blocked_day within the year range)
      const { rows: holidayRows } = await pool.query(
        `SELECT
           COUNT(*)::integer AS "totalHolidays"
         FROM company_blocked_day
         WHERE (company_id = $1 OR (company_id IS NULL AND tenant_id = $2))
           AND blocked_date >= $3::date AND blocked_date <= $4::date`,
        [companyId, tenantId, effectiveStart, effectiveEnd]
      );
      const holidays = {
        totalHolidays: holidayRows[0]?.totalHolidays ?? 0,
        requiresMakeup: 0,
        makeupCompleted: 0,
      };

      // 4. Count company_events in the period (aulas)
      const { rows: eventRows } = await pool.query(
        `SELECT
           COUNT(*)::integer AS "scheduledClasses",
           COALESCE(SUM(EXTRACT(EPOCH FROM (end_datetime - start_datetime)) / 3600), 0) AS "scheduledHours"
         FROM company_event
         WHERE company_id = $1
           AND (tenant_id IS NULL OR tenant_id = $2)
           AND deleted_at IS NULL AND archived_at IS NULL
           AND status != 'cancelled'
           AND event_type = 'aula'
           AND start_datetime >= $3::timestamptz
           AND start_datetime <= $4::timestamptz`,
        [companyId, tenantId, effectiveStart, effectiveEnd]
      );
      const events = eventRows[0] ?? { scheduledClasses: 0, scheduledHours: 0 };

      // 5. Events on holidays
      const { rows: onHolidayRows } = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM company_event ce
         INNER JOIN company_blocked_day cbd
           ON ce.start_datetime::date = cbd.blocked_date
           AND (
             (cbd.company_id = ce.company_id)
             OR (cbd.company_id IS NULL AND cbd.tenant_id = ce.tenant_id)
           )
         WHERE ce.company_id = $1
           AND (ce.tenant_id IS NULL OR ce.tenant_id = $2)
           AND ce.deleted_at IS NULL AND ce.archived_at IS NULL
           AND ce.status != 'cancelled'
           AND ce.start_datetime >= $3::timestamptz
           AND ce.start_datetime <= $4::timestamptz`,
        [companyId, tenantId, effectiveStart, effectiveEnd]
      );

      // 6. Business days in period (fallback if no calendar_day data)
      const { rows: bizRows } = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM generate_series($1::date, $2::date, '1 day'::interval) AS d
         WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)`,
        [effectiveStart, effectiveEnd]
      );
      const totalBusinessDays = parseInt(bizRows[0].count, 10);

      // 7. Blocked days on business days
      const { rows: blockedRows } = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM company_blocked_day
         WHERE (company_id = $1 OR (company_id IS NULL AND tenant_id = $2))
           AND blocked_date >= $3::date AND blocked_date <= $4::date
           AND EXTRACT(DOW FROM blocked_date) NOT IN (0, 6)`,
        [companyId, tenantId, effectiveStart, effectiveEnd]
      );

      // 8. MEC compliance calculation
      const mecDefaults = MEC_DEFAULTS[cal.educationLevel ?? 'medio'] ?? MEC_DEFAULTS.medio;

      // Use calendar_day instructional days if populated, otherwise calculate from business days
      const instructionalDays = ds.instructionalDays > 0
        ? ds.instructionalDays
        : totalBusinessDays - parseInt(blockedRows[0].count, 10);

      const rawDsHours = Number(ds.totalInstructionalHours);
      const rawEvHours = Number(events.scheduledHours);
      const instructionalHours = rawDsHours > 0
        ? parseFloat(rawDsHours.toFixed(1))
        : parseFloat(rawEvHours.toFixed(1));

      const minDays = mecDefaults.minDays;
      const minHours = mecDefaults.minHours;
      const schoolDaysMet = instructionalDays >= minDays;
      const hoursMet = instructionalHours >= minHours;
      const schoolDaysPercent = Math.min(Math.round((instructionalDays / minDays) * 100), 100);
      const hoursPercent = Math.min(Math.round((instructionalHours / minHours) * 100), 100);

      let complianceStatus: 'compliant' | 'warning' | 'critical';
      if (schoolDaysMet && hoursMet) {
        complianceStatus = 'compliant';
      } else if (schoolDaysPercent >= 80 && hoursPercent >= 80) {
        complianceStatus = 'warning';
      } else {
        complianceStatus = 'critical';
      }

      // 9. Get latest mec_compliance_audit if exists (table may not exist yet)
      let auditRows: any[] = [];
      try {
        const result = await pool.query(
          `SELECT overall_status AS "overallStatus", violations, warnings, can_publish AS "canPublish",
                  validation_timestamp AS "validatedAt"
           FROM mec_compliance_audit
           WHERE academic_calendar_id = $1
           ORDER BY validation_timestamp DESC LIMIT 1`,
          [calendarId]
        );
        auditRows = result.rows;
      } catch {
        // mec_compliance_audit table may not exist yet
      }

      res.json({
        calendar: {
          id: cal.id,
          title: cal.title,
          year: cal.year,
          semester: cal.semester,
          status: cal.status,
          educationLevel: cal.educationLevel,
          academicRegime: cal.academicRegime,
          mecComplianceEnabled: cal.mecComplianceEnabled,
          startDate: effectiveStart,
          endDate: effectiveEnd,
        },
        stats: {
          totalBusinessDays,
          instructionalDays,
          instructionalHours,
          holidayDays: ds.holidayDays,
          recessDays: ds.recessDays,
          makeupDays: ds.makeupDays,
          saturdayClassDays: ds.saturdayClassDays,
          scheduledClasses: parseInt(events.scheduledClasses, 10),
          scheduledHours: parseFloat(Number(events.scheduledHours).toFixed(1)),
          eventsOnHolidays: parseInt(onHolidayRows[0].count, 10),
          calendarDaysPopulated: ds.totalDays > 0,
        },
        holidays: {
          total: holidays.totalHolidays,
          requiresMakeup: holidays.requiresMakeup,
          makeupCompleted: holidays.makeupCompleted,
        },
        compliance: {
          status: complianceStatus,
          schoolDays: {
            current: instructionalDays,
            target: minDays,
            percent: schoolDaysPercent,
            met: schoolDaysMet,
          },
          hours: {
            current: instructionalHours,
            target: minHours,
            percent: hoursPercent,
            met: hoursMet,
          },
          lastAudit: auditRows[0] ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
