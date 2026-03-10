import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { array, boolean, number, object, string } from 'yup';

import { requirePermission } from '../../app/auth/permissions';
import { withTransaction } from '../../app/db/with-transaction';
import { enqueueOutbox } from '../../app/events/outbox-enqueue';
import { CompanyEventsRepository } from '../../app/repositories/company-events-repository';
import { CompanyResourcesRepository } from '../../app/repositories/company-resources-repository';
import { validateBody } from '../../app/validation/validate';
import type { EventStatus, EventType, RecurrenceRule } from '@cogedu/ava-api-types';
import { randomUUID } from 'crypto';

export const method = 'post';
export const path = '/companies/:companyId/events';

const resourceSchema = object({
  resourceId: string().uuid().required(),
  quantity: number().positive().integer().default(1),
  notes: string().nullable().optional(),
});

const recurrenceRuleSchema = object({
  freq: string().oneOf(['DAILY', 'WEEKLY', 'MONTHLY']).required(),
  interval: number().positive().integer().optional(),
  until: string().optional(), // ISO date
  count: number().positive().integer().optional(),
  byday: array().of(string()).optional(),
});

const schema = object({
  title: string().required().min(1).max(255),
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
    .required(),
  startDatetime: string().required(), // ISO datetime
  endDatetime: string().required(), // ISO datetime
  timezone: string().default('America/Sao_Paulo'),
  isRecurring: boolean().default(false),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
  maxParticipants: number().nullable().positive().integer().optional(),
  instructorUserId: string().uuid().nullable().optional(),
  classInstanceId: string().uuid().nullable().optional(),
  componentId: string().uuid().nullable().optional(),
  recurrenceGroupId: string().uuid().nullable().optional(),
  allowOnHoliday: boolean().default(false),
  status: string()
    .oneOf(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'])
    .default('scheduled'),
  resources: array().of(resourceSchema).default([]), // Resources optional — online events may not need a room
  metadata: object().nullable().optional(),
});

export const middlewares = [requirePermission('company.create'), validateBody(schema)];

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
      const userId = (req as any).user?.id ?? null;
      const { companyId } = req.params;
      const body = req.body as {
        title: string;
        description?: string | null;
        eventType: EventType;
        startDatetime: string;
        endDatetime: string;
        timezone?: string;
        isRecurring?: boolean;
        recurrenceRule?: RecurrenceRule | null;
        maxParticipants?: number | null;
        instructorUserId?: string | null;
        classInstanceId?: string | null;
        componentId?: string | null;
        recurrenceGroupId?: string | null;
        allowOnHoliday?: boolean;
        status?: EventStatus;
        resources: Array<{ resourceId: string; quantity: number; notes?: string | null }>;
        metadata?: Record<string, unknown> | null;
      };

      // Validate dates
      const startDate = new Date(body.startDatetime);
      const endDate = new Date(body.endDatetime);
      if (endDate <= startDate) {
        res.status(400).json({ error: 'End datetime must be after start datetime' });
        return;
      }

      const id = await withTransaction(pool, async (client) => {
        const eventsRepo = new CompanyEventsRepository(client);
        const resourcesRepo = new CompanyResourcesRepository(client);

        // Check availability for all resources
        for (const resource of body.resources) {
          const isAvailable = await resourcesRepo.checkAvailability(
            resource.resourceId,
            body.startDatetime,
            body.endDatetime,
            null,
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

        // Create the event (pass null for created_by_user_id since Keycloak user may not be synced to user table)
        const eventId = await eventsRepo.createEvent(tenantId, companyId, null, {
          title: body.title,
          description: body.description ?? null,
          event_type: body.eventType,
          start_datetime: body.startDatetime,
          end_datetime: body.endDatetime,
          timezone: body.timezone ?? 'America/Sao_Paulo',
          is_recurring: body.isRecurring ?? false,
          recurrence_rule: (body.recurrenceRule as Record<string, unknown> | null) ?? null,
          max_participants: body.maxParticipants ?? null,
          instructor_user_id: body.instructorUserId ?? null,
          class_instance_id: body.classInstanceId ?? null,
          component_id: body.componentId ?? null,
          recurrence_group_id: body.recurrenceGroupId ?? null,
          allow_on_holiday: body.allowOnHoliday ?? false,
          status: body.status ?? 'scheduled',
          metadata: body.metadata ?? null,
        });

        // Add resources to the event
        for (const resource of body.resources) {
          await eventsRepo.addEventResource(
            eventId,
            resource.resourceId,
            resource.quantity,
            resource.notes ?? null
          );
        }

        await enqueueOutbox(
          client,
          'event.created',
          { id: eventId, companyId, tenantId },
          correlationId
        );

        return eventId;
      });

      res.status(201).json({ id });
    } catch (err: any) {
      if (err.status === 409) {
        res.status(409).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}
