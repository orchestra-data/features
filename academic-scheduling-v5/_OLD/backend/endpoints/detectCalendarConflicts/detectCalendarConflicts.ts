import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string, boolean } from 'yup';
import { requirePermission } from '../../app/auth/permissions';

export const method = 'post';
export const path = '/companies/:companyId/calendar/detect-conflicts';
export const auth = true;
export const middlewares = [requirePermission('company.read')];

const bodySchema = object({
  startDate: string().required(),
  endDate: string().required(),
  classInstanceId: string().optional(),
  saturdayIsSchoolDay: boolean().default(false),
});

type Deps = { pool: Pool };

interface Conflict {
  eventId: string;
  eventTitle: string;
  currentDate: string;
  conflictType: 'holiday' | 'weekend' | 'time_overlap' | 'outside_school_day';
  detail: string;
  suggestedDate: string | null;
}

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const body = await bodySchema.validate(req.body);

      const client = await pool.connect();
      try {
        // 1. Get all events in range
        const params: unknown[] = [companyId, tenantId, body.startDate, body.endDate];
        let turmaFilter = '';
        if (body.classInstanceId) {
          params.push(body.classInstanceId);
          turmaFilter = ` AND class_instance_id = $${params.length}`;
        }

        const { rows: events } = await client.query<{
          id: string;
          title: string;
          start_datetime: string;
          end_datetime: string;
          allow_on_holiday: boolean;
        }>(
          `SELECT id, title, start_datetime, end_datetime, COALESCE(allow_on_holiday, false) as allow_on_holiday
           FROM company_event
           WHERE company_id = $1
             AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
             AND deleted_at IS NULL
             AND start_datetime >= $3::timestamptz
             AND end_datetime <= $4::timestamptz
             ${turmaFilter}
           ORDER BY start_datetime ASC`,
          params
        );

        // 2. Get blocked days
        const { rows: blockedDays } = await client.query<{ blocked_date: string; reason: string }>(
          `SELECT blocked_date::text, reason FROM company_blocked_day
           WHERE company_id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
          [companyId, tenantId]
        );
        const holidayMap = new Map(blockedDays.map(b => [b.blocked_date.substring(0, 10), b.reason]));

        // 3. Detect conflicts
        const conflicts: Conflict[] = [];

        for (const event of events) {
          const eventDate = new Date(event.start_datetime);
          const dateStr = eventDate.toISOString().substring(0, 10);
          const dow = eventDate.getDay();

          // Holiday conflict
          const holidayName = holidayMap.get(dateStr);
          if (holidayName && !event.allow_on_holiday) {
            // Find next business day
            let candidate = new Date(eventDate);
            candidate.setDate(candidate.getDate() + 1);
            let found = '';
            for (let i = 0; i < 30; i++) {
              const cStr = candidate.toISOString().substring(0, 10);
              const cDow = candidate.getDay();
              if (!holidayMap.has(cStr) && cDow !== 0 && (cDow !== 6 || body.saturdayIsSchoolDay)) {
                found = cStr;
                break;
              }
              candidate.setDate(candidate.getDate() + 1);
            }

            conflicts.push({
              eventId: event.id,
              eventTitle: event.title,
              currentDate: dateStr,
              conflictType: 'holiday',
              detail: `Feriado: ${holidayName}`,
              suggestedDate: found || null,
            });
          }

          // Weekend conflict
          if (dow === 0 || (dow === 6 && !body.saturdayIsSchoolDay)) {
            conflicts.push({
              eventId: event.id,
              eventTitle: event.title,
              currentDate: dateStr,
              conflictType: 'weekend',
              detail: dow === 0 ? 'Domingo' : 'Sábado (não letivo)',
              suggestedDate: null,
            });
          }
        }

        // 4. Detect time overlaps (same day, same turma, overlapping times)
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const a = events[i]!;
            const b = events[j]!;
            const aStart = new Date(a.start_datetime).getTime();
            const aEnd = new Date(a.end_datetime).getTime();
            const bStart = new Date(b.start_datetime).getTime();
            const bEnd = new Date(b.end_datetime).getTime();

            if (aStart < bEnd && bStart < aEnd) {
              conflicts.push({
                eventId: a.id,
                eventTitle: `${a.title} × ${b.title}`,
                currentDate: a.start_datetime.substring(0, 10),
                conflictType: 'time_overlap',
                detail: `Sobreposição de horário`,
                suggestedDate: null,
              });
            }
          }
        }

        res.json({
          totalEvents: events.length,
          totalConflicts: conflicts.length,
          conflicts,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  };
}
