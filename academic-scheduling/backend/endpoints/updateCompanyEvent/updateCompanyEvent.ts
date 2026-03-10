import { randomUUID } from 'crypto';

import type { EventStatus, EventType, RecurrenceRule } from '@cogedu/ava-api-types';
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { array, boolean, number, object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { enqueueOutbox } from '../../app/events/outbox-enqueue';
import { AttendanceRecordsRepository } from '../../app/repositories/attendance-records-repository';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';
import { CompanyResourcesRepository } from '../../app/repositories/company-resources-repository';
import { attendanceCalculationService } from '../../app/services/attendance';
import { validateBody } from '../../app/validation/validate';

export const method = 'patch';
export const path = '/companies/:companyId/events/:eventId';

const resourceSchema = object({
  resourceId: string().uuid().required(),
  quantity: number().positive().integer().default(1),
  notes: string().nullable().optional(),
});

const recurrenceRuleSchema = object({
  freq: string().oneOf(['DAILY', 'WEEKLY', 'MONTHLY']).required(),
  interval: number().positive().integer().optional(),
  until: string().optional(),
  count: number().positive().integer().optional(),
  byday: array().of(string()).optional(),
});

const schema = object({
  title: string().min(1).max(255).optional(),
  description: string().nullable().optional(),
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
    .optional(),
  startDatetime: string().optional(),
  endDatetime: string().optional(),
  timezone: string().optional(),
  isRecurring: boolean().optional(),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
  maxParticipants: number().nullable().positive().integer().optional(),
  instructorUserId: string().uuid().nullable().optional(),
  classInstanceId: string().uuid().nullable().optional(),
  status: string()
    .oneOf(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  resources: array().of(resourceSchema).optional(), // If provided, replaces all resources
  metadata: object().nullable().optional(),
});

export const middlewares = [requirePermission('company.update'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
      const { companyId, eventId } = req.params;
      const body = req.body as {
        title?: string;
        description?: string | null;
        eventType?: EventType;
        startDatetime?: string;
        endDatetime?: string;
        timezone?: string;
        isRecurring?: boolean;
        recurrenceRule?: RecurrenceRule | null;
        maxParticipants?: number | null;
        instructorUserId?: string | null;
        classInstanceId?: string | null;
        status?: EventStatus;
        resources?: Array<{ resourceId: string; quantity: number; notes?: string | null }>;
        metadata?: Record<string, unknown> | null;
      };

      await withTransaction(pool, async (client) => {
        const eventsRepo = new CompanyEventsRepository(client);
        const resourcesRepo = new CompanyResourcesRepository(client);

        // Verify event exists and belongs to company
        const existing = await eventsRepo.getEvent(tenantId, eventId);
        if (!existing) {
          throw Object.assign(new Error('Event not found'), { status: 404 });
        }
        if (existing.company_id !== companyId) {
          throw Object.assign(new Error('Event does not belong to this company'), { status: 403 });
        }

        // Validate dates if provided
        const startDatetime = body.startDatetime ?? existing.start_datetime;
        const endDatetime = body.endDatetime ?? existing.end_datetime;
        if (new Date(endDatetime) <= new Date(startDatetime)) {
          throw Object.assign(new Error('End datetime must be after start datetime'), {
            status: 400,
          });
        }

        // If resources are being updated, check availability for all new resources
        if (body.resources !== undefined) {
          for (const resource of body.resources) {
            const isAvailable = await resourcesRepo.checkAvailability(
              resource.resourceId,
              startDatetime,
              endDatetime,
              eventId, // Exclude current event from conflict check
              resource.quantity
            );

            if (!isAvailable) {
              const resourceInfo = await resourcesRepo.getResource(tenantId, resource.resourceId);
              throw Object.assign(
                new Error(
                  `Resource "${resourceInfo?.name || resource.resourceId}" is not available for the specified time slot`
                ),
                { status: 409 }
              );
            }
          }

          // Remove all existing resources
          const existingResources = await eventsRepo.getEventResources(eventId);
          for (const er of existingResources) {
            await eventsRepo.removeEventResource(eventId, er.resource_id);
          }

          // Add new resources
          for (const resource of body.resources) {
            await eventsRepo.addEventResource(
              eventId,
              resource.resourceId,
              resource.quantity,
              resource.notes ?? null
            );
          }
        }

        // Update the event
        await eventsRepo.updateEvent(eventId, {
          title: body.title,
          description: body.description,
          event_type: body.eventType,
          start_datetime: body.startDatetime,
          end_datetime: body.endDatetime,
          timezone: body.timezone,
          is_recurring: body.isRecurring,
          recurrence_rule: body.recurrenceRule,
          max_participants: body.maxParticipants,
          instructor_user_id: body.instructorUserId,
          class_instance_id: body.classInstanceId,
          status: body.status,
          metadata: body.metadata,
        });

        // When event status changes to 'completed', create absence records for enrolled students
        // who didn't check in, and recalculate attendance for all students
        if (body.status === 'completed') {
          const classInstanceId = existing.class_instance_id || body.classInstanceId;

          if (classInstanceId && tenantId) {
            // 1. Get component and series linked to this event
            // NOTE: series_id comes from component -> unit -> series (NOT from class_instance!)
            const { rows: compRows } = await client.query<{
              component_id: string;
              series_id: string;
            }>(
              `SELECT c.id as component_id, s.id as series_id
               FROM component c
               JOIN unit u ON u.id = c.unit_id
               JOIN series s ON s.id = u.series_id
               WHERE c.event_id = $1
               LIMIT 1`,
              [eventId]
            );

            if (compRows.length > 0) {
              const { component_id: componentId, series_id: seriesId } = compRows[0];

              // 2. Get enrolled students WITHOUT attendance_record for this component
              const { rows: absentStudents } = await client.query<{ user_id: string }>(
                `SELECT ce.user_id
                 FROM class_enrollment ce
                 WHERE ce.class_instance_id = $1
                   AND ce.status = 'enrolled'
                   AND NOT EXISTS (
                     SELECT 1 FROM attendance_record ar
                     WHERE ar.student_id = ce.user_id
                       AND ar.component_id = $2
                       AND ar.class_instance_id = $1
                   )`,
                [classInstanceId, componentId]
              );

              // 3. Create absence records and recalculate
              const recordsRepo = new AttendanceRecordsRepository(client);

              for (const student of absentStudents) {
                // Use source='manual' because these students don't have event_attendee records
                // (they didn't check in, so no event_attendee was created for them)
                await recordsRepo.upsertRecord({
                  tenant_id: tenantId,
                  student_id: student.user_id,
                  component_id: componentId,
                  series_id: seriesId,
                  class_instance_id: classInstanceId,
                  source: 'manual',
                  session_type: 'presencial',
                  status: 'absent',
                });

                await attendanceCalculationService.calculateAndPersist(
                  client,
                  tenantId,
                  student.user_id,
                  classInstanceId,
                  seriesId
                );
              }

              // 4. Recalculate for students who already have records (present/late)
              const { rows: presentStudents } = await client.query<{ student_id: string }>(
                `SELECT DISTINCT ar.student_id
                 FROM attendance_record ar
                 WHERE ar.component_id = $1
                   AND ar.class_instance_id = $2`,
                [componentId, classInstanceId]
              );

              for (const student of presentStudents) {
                await attendanceCalculationService.calculateAndPersist(
                  client,
                  tenantId,
                  student.student_id,
                  classInstanceId,
                  seriesId
                );
              }
            }
          }
        }

        await enqueueOutbox(
          client,
          'event.updated',
          { id: eventId, companyId, tenantId },
          correlationId
        );
      });

      res.status(204).send();
    } catch (err: any) {
      if (err.status === 400) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err.status === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err.status === 403) {
        res.status(403).json({ error: err.message });
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
