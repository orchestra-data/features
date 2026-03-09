import { randomUUID } from 'crypto';

import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { boolean, object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { enqueueOutbox } from '../../app/events/outbox-enqueue';
import { validateBody } from '../../app/validation/validate';

export const method = 'post';
export const path = '/recurrence-groups/:groupId/shift';

const schema = object({
  eventId: string().uuid().required(),
  newDate: string()
    .required()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'newDate must be YYYY-MM-DD'),
  cascade: boolean().default(false),
});

export const middlewares = [requirePermission('company.update'), validateBody(schema)];

type Deps = { pool: Pool };

// ── helpers ──────────────────────────────────────────────────────────

/** Check if a date falls on Saturday (6) or Sunday (0) */
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Format Date as YYYY-MM-DD */
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add N calendar days to a date (UTC) */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/**
 * Given a candidate date, advance forward until it does not land on a
 * weekend or a blocked day. Returns the adjusted date.
 */
function skipBlockedAndWeekends(candidate: Date, blockedSet: Set<string>): Date {
  let d = new Date(candidate);
  while (isWeekend(d) || blockedSet.has(fmt(d))) {
    d = addDays(d, 1);
  }
  return d;
}

/** Parse a date string (YYYY-MM-DD or ISO datetime) into a UTC-midnight Date */
function toUTCDate(s: string): Date {
  // If it's a full ISO datetime, extract just the date portion
  const dateStr = s.slice(0, 10);
  return new Date(dateStr + 'T00:00:00Z');
}

/** Replace the date portion of an ISO datetime string, keeping the time */
function replaceDate(original: string, newDateStr: string): string {
  // original can be "2026-03-10T14:00:00.000Z" or "2026-03-10 14:00:00+00"
  return newDateStr + original.slice(10);
}

// ── types ────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  start_datetime: string;
  end_datetime: string;
  allow_on_holiday: boolean;
  company_id: string;
}

interface ShiftedEvent {
  id: string;
  originalStartDate: string;
  originalEndDate: string;
  newStartDate: string;
  newEndDate: string;
}

interface Warning {
  eventId: string;
  date: string;
  reason: string;
  blockedReason: string | null;
}

// ── fetch helpers ────────────────────────────────────────────────────

async function fetchGroupEvents(
  client: PoolClient,
  groupId: string,
  tenantId: string | null,
): Promise<EventRow[]> {
  const { rows } = await client.query<EventRow>(
    `SELECT id, start_datetime, end_datetime, allow_on_holiday, company_id
     FROM company_event
     WHERE recurrence_group_id = $1
       AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
       AND deleted_at IS NULL
       AND status NOT IN ('cancelled')
     ORDER BY start_datetime ASC`,
    [groupId, tenantId],
  );
  return rows;
}

interface BlockedDayRow {
  blocked_date: string;
  reason: string | null;
}

async function fetchBlockedDays(
  client: PoolClient,
  companyId: string,
  tenantId: string | null,
): Promise<BlockedDayRow[]> {
  const { rows } = await client.query<BlockedDayRow>(
    `SELECT blocked_date, reason
     FROM company_blocked_day
     WHERE (
       (company_id = $1 AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id)))
       OR
       (company_id IS NULL AND tenant_id = $2)
     )`,
    [companyId, tenantId],
  );
  return rows;
}

async function updateEventDates(
  client: PoolClient,
  eventId: string,
  startDatetime: string,
  endDatetime: string,
): Promise<void> {
  await client.query(
    `UPDATE company_event
     SET start_datetime = $2::timestamptz,
         end_datetime   = $3::timestamptz,
         updated_at     = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [eventId, startDatetime, endDatetime],
  );
}

// ── handler ──────────────────────────────────────────────────────────

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
      const { groupId } = req.params;
      const body = req.body as { eventId: string; newDate: string; cascade: boolean };

      const result = await withTransaction(pool, async (client) => {
        // 1. Fetch all non-cancelled events in the group
        const events = await fetchGroupEvents(client, groupId, tenantId);
        if (events.length === 0) {
          throw Object.assign(new Error('Recurrence group not found or has no events'), {
            status: 404,
          });
        }

        // 2. Locate the target event
        const targetIdx = events.findIndex((e) => e.id === body.eventId);
        if (targetIdx === -1) {
          throw Object.assign(
            new Error('Event not found in this recurrence group'),
            { status: 404 },
          );
        }
        const target = events[targetIdx];
        const companyId = target.company_id;

        // 3. Fetch blocked days for this company / tenant
        const blockedRows = await fetchBlockedDays(client, companyId, tenantId);
        const blockedSet = new Set<string>(blockedRows.map((r) => fmt(toUTCDate(r.blocked_date))));
        const blockedReasonMap = new Map<string, string | null>(
          blockedRows.map((r) => [fmt(toUTCDate(r.blocked_date)), r.reason]),
        );

        // 4. Compute delta in calendar days
        const originalDate = toUTCDate(target.start_datetime);
        const newDate = toUTCDate(body.newDate);
        const deltaDays = Math.round(
          (newDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        const movedEvents: ShiftedEvent[] = [];
        const warnings: Warning[] = [];

        // Helper: shift a single event, skip weekends/blocked, collect warnings
        const shiftEvent = async (ev: EventRow, candidateDate: Date) => {
          const adjustedDate = skipBlockedAndWeekends(candidateDate, blockedSet);

          // Duration in ms between start and end stays the same
          const origStart = new Date(ev.start_datetime);
          const origEnd = new Date(ev.end_datetime);
          const durationMs = origEnd.getTime() - origStart.getTime();

          const newStart = replaceDate(ev.start_datetime, fmt(adjustedDate));
          // Build end datetime preserving the same wall-clock duration
          const endAdjusted = new Date(adjustedDate.getTime() + durationMs);
          const newEnd = replaceDate(ev.end_datetime, fmt(endAdjusted));

          // Check holiday warning (blocked day where allow_on_holiday is false)
          const landedOnBlocked = blockedSet.has(fmt(candidateDate));
          if (landedOnBlocked && !ev.allow_on_holiday) {
            warnings.push({
              eventId: ev.id,
              date: fmt(adjustedDate),
              reason: 'Event date conflicts with a blocked day',
              blockedReason: blockedReasonMap.get(fmt(candidateDate)) ?? null,
            });
          }

          await updateEventDates(client, ev.id, newStart, newEnd);

          movedEvents.push({
            id: ev.id,
            originalStartDate: ev.start_datetime,
            originalEndDate: ev.end_datetime,
            newStartDate: newStart,
            newEndDate: newEnd,
          });
        };

        // 5. Shift the target event
        await shiftEvent(target, newDate);

        // 6. If cascade, shift all subsequent events
        if (body.cascade && targetIdx < events.length - 1) {
          // Build the pattern of day-gaps between consecutive events starting from target
          const subsequentEvents = events.slice(targetIdx + 1);

          // We recalculate from the new date forward, preserving the original gap pattern
          let previousOriginalDate = originalDate;
          let previousNewDate = toUTCDate(fmt(
            skipBlockedAndWeekends(newDate, blockedSet),
          ));

          for (const ev of subsequentEvents) {
            const evOrigDate = toUTCDate(ev.start_datetime);
            // Gap between this event and the previous one in original schedule
            const gapDays = Math.round(
              (evOrigDate.getTime() - previousOriginalDate.getTime()) / (1000 * 60 * 60 * 24),
            );

            const candidateDate = addDays(previousNewDate, gapDays);
            const adjusted = skipBlockedAndWeekends(candidateDate, blockedSet);

            await shiftEvent(ev, candidateDate);

            previousOriginalDate = evOrigDate;
            previousNewDate = adjusted;
          }
        }

        // 7. Outbox event
        await enqueueOutbox(
          client,
          'recurrence_group.shifted',
          {
            groupId,
            eventId: body.eventId,
            cascade: body.cascade,
            movedCount: movedEvents.length,
            tenantId,
          },
          correlationId,
        );

        return { movedEvents, warnings };
      });

      res.status(200).json({
        shifted: result.movedEvents,
        warnings: result.warnings,
      });
    } catch (err: any) {
      if (err.status === 400) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err.status === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}
