import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { object, string, boolean, number } from 'yup';
import { requirePermission } from '../../app/auth/permissions';

export const method = 'post';
export const path = '/companies/:companyId/events/:eventId/cascade-push';
export const auth = true;
export const middlewares = [requirePermission('company.update')];

const bodySchema = object({
  newDate: string().required(),       // ISO date YYYY-MM-DD for the moved event
  newStartTime: string().optional(),  // HH:MM — if not provided, keep same time
  skipHolidays: boolean().default(true),
  skipWeekends: boolean().default(true),
  saturdayIsSchoolDay: boolean().default(false),
  affectSameTurma: boolean().default(true), // only push events from same class_instance
  dryRun: boolean().default(false),         // preview mode — R11: preview OBRIGATÓRIO
});

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId, eventId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const body = await bodySchema.validate(req.body);

      const client = await pool.connect();
      try {
        // 1. Get the event being moved
        const { rows: [movedEvent] } = await client.query<{
          id: string;
          start_datetime: string;
          end_datetime: string;
          class_instance_id: string | null;
        }>(
          `SELECT id, start_datetime, end_datetime, class_instance_id
           FROM company_event
           WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
          [eventId, companyId]
        );

        if (!movedEvent) {
          return res.status(404).json({ error: 'Event not found' });
        }

        // 2. Calculate the delta (how many days we're pushing)
        const originalDate = new Date(movedEvent.start_datetime);
        const newDate = new Date(body.newDate);
        const deltaDays = Math.round((newDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));

        if (deltaDays === 0) {
          return res.json({ moved: [], skipped: [], deltaDays: 0 });
        }

        // 3. Get blocked days (holidays) for this company
        const { rows: blockedDays } = await client.query<{ blocked_date: string }>(
          `SELECT blocked_date::text FROM company_blocked_day
           WHERE company_id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
          [companyId, tenantId]
        );
        const holidaySet = new Set(blockedDays.map(b => b.blocked_date.substring(0, 10)));

        // 4. Get all subsequent events (same day or later)
        let turmaFilter = '';
        const params: unknown[] = [companyId, tenantId, movedEvent.start_datetime];
        if (body.affectSameTurma && movedEvent.class_instance_id) {
          params.push(movedEvent.class_instance_id);
          turmaFilter = ` AND class_instance_id = $${params.length}`;
        }

        const { rows: subsequentEvents } = await client.query<{
          id: string;
          title: string;
          start_datetime: string;
          end_datetime: string;
        }>(
          `SELECT id, title, start_datetime, end_datetime
           FROM company_event
           WHERE company_id = $1
             AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
             AND deleted_at IS NULL
             AND start_datetime >= $3
             ${turmaFilter}
           ORDER BY start_datetime ASC`,
          params
        );

        // 5. Calculate new dates for each event
        const moved: Array<{ eventId: string; title: string; from: string; to: string }> = [];
        const skipped: Array<{ eventId: string; title: string; reason: string }> = [];

        // R12: Check if cascade crosses months
        const originalMonth = originalDate.getMonth();
        let crossesMonths = false;

        for (const event of subsequentEvents) {
          const eventStart = new Date(event.start_datetime);
          const eventEnd = new Date(event.end_datetime);
          const durationMs = eventEnd.getTime() - eventStart.getTime();

          // Apply delta
          let candidateDate = new Date(eventStart.getTime() + deltaDays * 24 * 60 * 60 * 1000);

          // Skip holidays and weekends
          let attempts = 0;
          while (attempts < 30) {
            const dateStr = candidateDate.toISOString().substring(0, 10);
            const dayOfWeek = candidateDate.getDay(); // 0=Sun, 6=Sat

            const isHoliday = body.skipHolidays && holidaySet.has(dateStr);
            const isSunday = body.skipWeekends && dayOfWeek === 0;
            const isSaturday = body.skipWeekends && dayOfWeek === 6 && !body.saturdayIsSchoolDay;

            if (!isHoliday && !isSunday && !isSaturday) break;

            // Push forward by 1 day
            candidateDate = new Date(candidateDate.getTime() + 24 * 60 * 60 * 1000);
            attempts++;
          }

          // R12: check cross-month
          if (candidateDate.getMonth() !== originalMonth) {
            crossesMonths = true;
          }

          const newEnd = new Date(candidateDate.getTime() + durationMs);

          moved.push({
            eventId: event.id,
            title: event.title,
            from: eventStart.toISOString().substring(0, 10),
            to: candidateDate.toISOString().substring(0, 10),
          });
        }

        // 6. If dry run, return preview
        if (body.dryRun) {
          return res.json({
            dryRun: true,
            deltaDays,
            crossesMonths,
            moved,
            skipped,
            totalAffected: moved.length,
          });
        }

        // 7. R13: ATOMIC — Execute all moves in a single transaction
        await client.query('BEGIN');
        try {
          for (const m of moved) {
            const eventStart = new Date(
              subsequentEvents.find(e => e.id === m.eventId)!.start_datetime
            );
            const eventEnd = new Date(
              subsequentEvents.find(e => e.id === m.eventId)!.end_datetime
            );
            const durationMs = eventEnd.getTime() - eventStart.getTime();
            const newStart = new Date(m.to + 'T' + eventStart.toISOString().substring(11));
            const newEnd = new Date(newStart.getTime() + durationMs);

            await client.query(
              `UPDATE company_event
               SET start_datetime = $1, end_datetime = $2, updated_at = NOW()
               WHERE id = $3`,
              [newStart.toISOString(), newEnd.toISOString(), m.eventId]
            );
          }
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK');
          // R13: If one fails, NONE are moved
          return res.status(409).json({
            error: 'Cascade push failed — all changes rolled back (R13 Atomic)',
            detail: (txErr as Error).message,
            moved: [],
          });
        }

        res.json({
          dryRun: false,
          deltaDays,
          crossesMonths,
          moved,
          skipped,
          totalAffected: moved.length,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  };
}
