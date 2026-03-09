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
      const companyId = req.headers['x-company-id'] as string | undefined;
      const { classInstanceId } = req.query as { classInstanceId: string };

      if (!classInstanceId) {
        return res.status(400).json({ error: 'classInstanceId query param is required' });
      }

      // Fetch class instance times alongside schedule rows
      const [{ rows }, { rows: ciRows }] = await Promise.all([
        pool.query(
          `SELECT
             s.component_id AS "componentId",
             TO_CHAR(s.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
             comp.title AS "componentTitle",
             comp.component_type AS "componentType",
             comp.estimated_duration_minutes AS "estimatedDurationMinutes",
             ce.id AS "eventId",
             ce.title AS "eventTitle",
             EXTRACT(EPOCH FROM (ce.start_datetime AT TIME ZONE 'UTC')) AS "eventStartEpoch",
             EXTRACT(EPOCH FROM (ce.end_datetime   AT TIME ZONE 'UTC')) AS "eventEndEpoch",
             er.resource_id AS "eventResourceId"
           FROM class_instance_component_schedule s
           LEFT JOIN component comp ON comp.id = s.component_id AND comp.deleted_at IS NULL
           LEFT JOIN company_event ce ON ce.class_instance_id = s.class_instance_id
             AND ce.deleted_at IS NULL
             AND ce.start_datetime::date = s.scheduled_date::date
             AND (ce.metadata->>'component_id' = s.component_id::text
                  OR ce.class_instance_id = s.class_instance_id)
           LEFT JOIN event_resource er ON er.event_id = ce.id
           WHERE s.class_instance_id = $1
             AND s.deleted_at IS NULL
             AND (s.tenant_id IS NULL OR s.tenant_id = COALESCE($2, s.tenant_id))
           ORDER BY s.scheduled_date`,
          [classInstanceId, tenantId]
        ),
        pool.query(
          `SELECT class_start_time AS "classStartTime", class_end_time AS "classEndTime"
           FROM class_instance WHERE id = $1`,
          [classInstanceId]
        ),
      ]);

      const classStartTime: string | null = ciRows[0]?.classStartTime ?? null;
      const classEndTime: string | null = ciRows[0]?.classEndTime ?? null;

      // Helper: convert HH:MM to total minutes
      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
      };
      // Helper: minutes back to HH:MM
      const toHHMM = (mins: number) => {
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      // Group rows by date so we can assign sequential time slots per day
      const byDate = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = r.scheduledDate as string;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(r);
      }

      const schedule = rows.map((r) => {
        const dateKey = r.scheduledDate as string;
        const dayRows = byDate.get(dateKey)!;

        // Determine the day's window (from event or class_instance times)
        let windowStartMin: number | null = null;
        let windowEndMin: number | null = null;

        if (r.eventStartEpoch != null && r.eventEndEpoch != null) {
          // Extract HH:MM from epoch (seconds since epoch → UTC hours/minutes)
          const startSec = Number(r.eventStartEpoch);
          const endSec = Number(r.eventEndEpoch);
          windowStartMin = Math.floor((startSec % 86400) / 60);
          windowEndMin = Math.floor((endSec % 86400) / 60);
        } else if (classStartTime && classEndTime) {
          windowStartMin = toMinutes(classStartTime);
          windowEndMin = toMinutes(classEndTime);
        }

        let startTime: string | null = null;
        let endTime: string | null = null;

        if (windowStartMin !== null && windowEndMin !== null) {
          const totalWindow = windowEndMin - windowStartMin;

          // Use estimated_duration_minutes when available; otherwise divide window equally
          const durations = dayRows.map((d) =>
            d.estimatedDurationMinutes != null ? Number(d.estimatedDurationMinutes) : null
          );
          const allHaveDuration = durations.every((d) => d !== null);
          const totalDuration = allHaveDuration
            ? durations.reduce((a, b) => a! + b!, 0)!
            : null;

          const idx = dayRows.indexOf(r);
          if (allHaveDuration && totalDuration! > 0) {
            // Proportional slots based on component duration
            let cursor = windowStartMin;
            for (let i = 0; i < idx; i++) {
              cursor += Math.round((durations[i]! / totalDuration!) * totalWindow);
            }
            const slotLen = Math.round((durations[idx]! / totalDuration!) * totalWindow);
            startTime = toHHMM(cursor);
            endTime = toHHMM(cursor + slotLen);
          } else {
            // Equal division
            const slotLen = Math.floor(totalWindow / dayRows.length);
            startTime = toHHMM(windowStartMin + idx * slotLen);
            endTime = toHHMM(windowStartMin + (idx + 1) * slotLen);
          }
        }

        return {
          componentId: r.componentId,
          componentTitle: r.componentTitle ?? null,
          componentType: r.componentType ?? null,
          scheduledDate: r.scheduledDate as string,
          startTime,
          endTime,
          ...(r.eventId
            ? {
                event: {
                  id: r.eventId,
                  title: r.eventTitle,
                  resourceId: r.eventResourceId ?? undefined,
                },
              }
            : {}),
        };
      });

      res.json({ schedule, classStartTime, classEndTime });
    } catch (err) {
      next(err);
    }
  };
}
