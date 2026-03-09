import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { array, number, object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { enqueueOutbox } from '../../app/events/outbox-enqueue';
import { validateBody } from '../../app/validation/validate';
import type { EventType, RecurrencePattern } from '@cogedu/ava-database-types';
import { randomUUID } from 'crypto';

export const method = 'post';
export const path = '/companies/:companyId/recurrence-groups';

const schema = object({
  classInstanceId: string().uuid().nullable().optional(),
  pattern: string().oneOf(['weekly', 'biweekly', 'custom']).required(),
  customDays: array()
    .of(number().integer().min(0).max(6))
    .nullable()
    .optional(),
  startDate: string().required(), // YYYY-MM-DD
  endDate: string().required(), // YYYY-MM-DD
  componentIds: array().of(string().uuid().required()).min(1).required(),
  resourceIds: array().of(string().uuid().required()).optional().default([]),
  eventType: string()
    .oneOf([
      'aula',
      'estagio',
      'palestra',
      'visitacao_tecnica',
      'workshop',
      'seminario',
      'reuniao',
      'avaliacao',
      'outro',
    ])
    .default('aula'),
  title: string().optional().default(''),
  timezone: string().default('America/Sao_Paulo'),
});

export const middlewares = [requirePermission('company.create'), validateBody(schema)];

type Deps = { pool: Pool };

// ---------------------------------------------------------------------------
// Date generation helpers
// ---------------------------------------------------------------------------

/** ISO weekday: 0 = Sunday, 1 = Monday, ... 6 = Saturday */
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/**
 * Generate all valid dates between start and end according to the recurrence
 * pattern, skipping weekends and company blocked days.
 */
function generateDates(
  start: Date,
  end: Date,
  pattern: RecurrencePattern,
  customDays: number[] | null | undefined,
  blockedSet: Set<string>
): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const dominated = shouldIncludeDay(cursor, pattern, customDays);
    if (dominated && !isWeekend(cursor) && !blockedSet.has(formatDate(cursor))) {
      dates.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function shouldIncludeDay(
  d: Date,
  pattern: RecurrencePattern,
  customDays: number[] | null | undefined
): boolean {
  const dayOfWeek = d.getUTCDay(); // 0=Sun .. 6=Sat

  switch (pattern) {
    case 'weekly':
      // weekly with customDays: only those days; otherwise every weekday
      if (customDays && customDays.length > 0) {
        return customDays.includes(dayOfWeek);
      }
      return !isWeekend(d);

    case 'biweekly':
      // Same as weekly but every other week (based on ISO week number parity)
      if (customDays && customDays.length > 0) {
        if (!customDays.includes(dayOfWeek)) return false;
      } else if (isWeekend(d)) {
        return false;
      }
      // Use week number parity relative to start
      return true; // biweekly filtering handled via week delta in generateDates caller

    case 'custom':
      if (customDays && customDays.length > 0) {
        return customDays.includes(dayOfWeek);
      }
      return !isWeekend(d);

    default:
      return !isWeekend(d);
  }
}

/**
 * Biweekly needs special handling: skip every other week.
 */
function generateDatesBiweekly(
  start: Date,
  end: Date,
  customDays: number[] | null | undefined,
  blockedSet: Set<string>
): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(start);
  // Track week index relative to start
  const startWeek = getISOWeek(start);

  while (cursor <= end) {
    const weekDelta = getISOWeek(cursor) - startWeek;
    const isActiveWeek = weekDelta % 2 === 0;
    const dayOfWeek = cursor.getUTCDay();

    if (isActiveWeek && !isWeekend(cursor) && !blockedSet.has(formatDate(cursor))) {
      if (customDays && customDays.length > 0) {
        if (customDays.includes(dayOfWeek)) dates.push(new Date(cursor));
      } else {
        dates.push(new Date(cursor));
      }
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
      const { companyId } = req.params;
      const body = req.body as {
        classInstanceId?: string | null;
        pattern: RecurrencePattern;
        customDays?: number[] | null;
        startDate: string;
        endDate: string;
        componentIds: string[];
        resourceIds?: string[];
        eventType: EventType;
        title?: string;
        timezone?: string;
      };

      const startDate = new Date(body.startDate + 'T00:00:00Z');
      const endDate = new Date(body.endDate + 'T00:00:00Z');

      if (endDate < startDate) {
        res.status(400).json({ error: 'endDate must be on or after startDate' });
        return;
      }

      const result = await withTransaction(pool, async (client) => {
        // 1. Fetch blocked days for this company (and tenant-wide)
        const { rows: blockedRows } = await client.query<{ blocked_date: string }>(
          `SELECT blocked_date::text FROM company_blocked_day
           WHERE (company_id = $1 OR company_id IS NULL)
             AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
             AND blocked_date >= $3::date
             AND blocked_date <= $4::date`,
          [companyId, tenantId, body.startDate, body.endDate]
        );

        const blockedSet = new Set(blockedRows.map((r) => r.blocked_date.slice(0, 10)));

        // 2. Generate dates
        let dates: Date[];
        if (body.pattern === 'biweekly') {
          dates = generateDatesBiweekly(startDate, endDate, body.customDays, blockedSet);
        } else {
          dates = generateDates(startDate, endDate, body.pattern, body.customDays, blockedSet);
        }

        if (dates.length === 0) {
          throw Object.assign(new Error('No valid dates generated for the given range and pattern'), {
            status: 422,
          });
        }

        // 3. Build recurrence rule JSONB (stored on the parent event)
        const recurrenceRule = {
          pattern: body.pattern,
          customDays: body.customDays && body.customDays.length > 0 ? body.customDays : null,
          startDate: body.startDate,
          endDate: body.endDate,
        };

        // 4. Generate events: one per component per date
        //    First event = parent (recurrence_parent_id = NULL)
        //    Remaining events = children (recurrence_parent_id = parent.id)
        const events: Array<{
          id: string;
          component_id: string;
          start_datetime: string;
          end_datetime: string;
          date: string;
        }> = [];

        const tz = body.timezone ?? 'America/Sao_Paulo';
        const eventType = body.eventType ?? 'aula';
        let parentEventId: string | null = null;

        for (const date of dates) {
          const dateStr = formatDate(date);
          const startDt = `${dateStr}T08:00:00`;
          const endDt = `${dateStr}T09:00:00`;

          for (const componentId of body.componentIds) {
            const titleText =
              body.title || `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} - ${dateStr}`;

            const isFirst = parentEventId === null;
            const eventMetadata = JSON.stringify({ componentId });

            const { rows: eventRows } = await client.query<{ id: string }>(
              `INSERT INTO company_event (
                tenant_id, company_id, title, event_type,
                start_datetime, end_datetime, timezone,
                is_recurring, recurrence_rule, recurrence_parent_id,
                class_instance_id, metadata,
                status, created_at, updated_at
              )
              VALUES (
                $1, $2, $3, $4,
                $5::timestamptz, $6::timestamptz, $7,
                true, $8::jsonb, $9,
                $10, $11::jsonb,
                'scheduled', NOW(), NOW()
              )
              RETURNING id`,
              [
                tenantId,
                companyId,
                titleText,
                eventType,
                startDt,
                endDt,
                tz,
                isFirst ? JSON.stringify(recurrenceRule) : null,
                isFirst ? null : parentEventId,
                body.classInstanceId ?? null,
                eventMetadata,
              ]
            );

            const eventId = eventRows[0].id;

            // First event becomes the parent for all subsequent events
            if (isFirst) {
              parentEventId = eventId;
            }

            // Link resources to each event
            if (body.resourceIds && body.resourceIds.length > 0) {
              for (const resourceId of body.resourceIds) {
                await client.query(
                  `INSERT INTO event_resource (event_id, resource_id, quantity, notes, created_at)
                   VALUES ($1, $2, 1, NULL, NOW())`,
                  [eventId, resourceId]
                );
              }
            }

            events.push({
              id: eventId,
              component_id: componentId,
              start_datetime: startDt,
              end_datetime: endDt,
              date: dateStr,
            });
          }
        }

        await enqueueOutbox(
          client,
          'recurrence-group.created',
          { id: parentEventId, companyId, tenantId, eventCount: events.length },
          correlationId
        );

        return {
          recurrenceGroup: {
            id: parentEventId,
            company_id: companyId,
            class_instance_id: body.classInstanceId ?? null,
            pattern: body.pattern,
            custom_days: body.customDays ?? null,
            start_date: body.startDate,
            end_date: body.endDate,
          },
          events,
          summary: {
            total_dates: dates.length,
            total_events: events.length,
            components: body.componentIds.length,
            blocked_days_skipped: blockedRows.length,
          },
        };
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err.status === 422) {
        res.status(422).json({ error: err.message });
        return;
      }
      if (err.status === 409) {
        res.status(409).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}
