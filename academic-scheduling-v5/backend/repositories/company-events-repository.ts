import {
  CompanyEventRow,
  CompanyEventSummary,
  CreateCompanyEventInput,
  UpdateCompanyEventInput,
  EventType,
  EventStatus,
  CalendarEvent,
  EventResourceRow,
} from '@cogedu/ava-database-types';
import type { PoolClient } from 'pg';

export const EVENT_SUMMARY_COLUMNS = `
  id, tenant_id, company_id, title, event_type, start_datetime, end_datetime,
  status, instructor_user_id, class_instance_id, archived_at, created_at, updated_at
`.trim();

export class CompanyEventsRepository {
  constructor(private readonly client: PoolClient) {}

  /**
   * Create a new company event
   * @returns The ID of the created event
   */
  async createEvent(
    tenantId: string | null,
    companyId: string,
    createdByUserId: string | null,
    fields: {
      title: string;
      description?: string | null;
      event_type: EventType;
      start_datetime: string;
      end_datetime: string;
      timezone?: string;
      is_recurring?: boolean;
      recurrence_rule?: Record<string, unknown> | null;
      recurrence_parent_id?: string | null;
      max_participants?: number | null;
      instructor_user_id?: string | null;
      class_instance_id?: string | null;
      status?: EventStatus;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<string> {
    const { rows } = await this.client.query<Pick<CompanyEventRow, 'id'>>(
      `INSERT INTO company_event (
        tenant_id, company_id, title, description, event_type,
        start_datetime, end_datetime, timezone, is_recurring, recurrence_rule,
        recurrence_parent_id, max_participants, instructor_user_id, class_instance_id,
        status, created_by_user_id, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      RETURNING id`,
      [
        tenantId,
        companyId,
        fields.title,
        fields.description ?? null,
        fields.event_type,
        fields.start_datetime,
        fields.end_datetime,
        fields.timezone ?? 'America/Sao_Paulo',
        fields.is_recurring ?? false,
        fields.recurrence_rule ? JSON.stringify(fields.recurrence_rule) : null,
        fields.recurrence_parent_id ?? null,
        fields.max_participants ?? null,
        fields.instructor_user_id ?? null,
        fields.class_instance_id ?? null,
        fields.status ?? 'scheduled',
        createdByUserId,
        fields.metadata ? JSON.stringify(fields.metadata) : null,
      ]
    );
    return rows[0].id;
  }

  /**
   * Update an existing event
   */
  async updateEvent(id: string, fields: UpdateCompanyEventInput): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (fields.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(fields.title);
    }
    if (fields.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(fields.description);
    }
    if (fields.event_type !== undefined) {
      updates.push(`event_type = $${paramIndex++}`);
      values.push(fields.event_type);
    }
    if (fields.start_datetime !== undefined) {
      updates.push(`start_datetime = $${paramIndex++}::timestamptz`);
      values.push(fields.start_datetime);
    }
    if (fields.end_datetime !== undefined) {
      updates.push(`end_datetime = $${paramIndex++}::timestamptz`);
      values.push(fields.end_datetime);
    }
    if (fields.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(fields.timezone);
    }
    if (fields.is_recurring !== undefined) {
      updates.push(`is_recurring = $${paramIndex++}`);
      values.push(fields.is_recurring);
    }
    if (fields.recurrence_rule !== undefined) {
      updates.push(`recurrence_rule = $${paramIndex++}`);
      values.push(fields.recurrence_rule ? JSON.stringify(fields.recurrence_rule) : null);
    }
    if (fields.max_participants !== undefined) {
      updates.push(`max_participants = $${paramIndex++}`);
      values.push(fields.max_participants);
    }
    if (fields.instructor_user_id !== undefined) {
      updates.push(`instructor_user_id = $${paramIndex++}`);
      values.push(fields.instructor_user_id);
    }
    if (fields.class_instance_id !== undefined) {
      updates.push(`class_instance_id = $${paramIndex++}`);
      values.push(fields.class_instance_id);
    }
    if (fields.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(fields.status);
    }
    if (fields.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(fields.metadata ? JSON.stringify(fields.metadata) : null);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = NOW()');

    await this.client.query(
      `UPDATE company_event SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL`,
      values
    );
  }

  /**
   * Soft delete an event
   */
  async softDeleteEvent(id: string): Promise<void> {
    await this.client.query(
      'UPDATE company_event SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
  }

  /**
   * Archive an event (softer than delete — event stays visible in archived section)
   */
  async archiveEvent(id: string): Promise<void> {
    await this.client.query(
      `UPDATE company_event SET archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
  }

  /**
   * Cancel an event (set status to cancelled)
   */
  async cancelEvent(id: string): Promise<void> {
    await this.client.query(
      `UPDATE company_event SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
  }

  /**
   * Get a single event by ID
   */
  async getEvent(tenantId: string | null, eventId: string): Promise<CompanyEventRow | null> {
    const { rows } = await this.client.query<CompanyEventRow>(
      `SELECT * FROM company_event
       WHERE id = $1
         AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
         AND deleted_at IS NULL`,
      [eventId, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * Get an event summary (lighter weight)
   */
  async getEventSummary(
    tenantId: string | null,
    eventId: string
  ): Promise<CompanyEventSummary | null> {
    const { rows } = await this.client.query<CompanyEventSummary>(
      `SELECT ${EVENT_SUMMARY_COLUMNS} FROM company_event
       WHERE id = $1
         AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
         AND deleted_at IS NULL`,
      [eventId, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * List events with pagination and filtering
   */
  async listEvents(
    tenantId: string | null,
    opts: {
      limit?: number;
      offset?: number;
      companyId?: string;
      eventType?: EventType;
      status?: EventStatus;
      instructorUserId?: string;
      classInstanceId?: string;
      startDateFrom?: string;
      startDateTo?: string;
      search?: string;
      /** When true, return only archived events. When false/omitted, exclude archived. */
      archived?: boolean;
    } = {}
  ): Promise<CompanyEventSummary[]> {
    const params: unknown[] = [tenantId];
    const where: string[] = [
      '(tenant_id IS NULL OR tenant_id = COALESCE($1, tenant_id))',
      'deleted_at IS NULL',
      opts.archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL',
    ];

    if (opts.companyId) {
      params.push(opts.companyId);
      where.push(`company_id = $${params.length}`);
    }

    if (opts.eventType) {
      params.push(opts.eventType);
      where.push(`event_type = $${params.length}`);
    }

    if (opts.status) {
      params.push(opts.status);
      where.push(`status = $${params.length}`);
    }

    if (opts.instructorUserId) {
      params.push(opts.instructorUserId);
      where.push(`instructor_user_id = $${params.length}`);
    }

    if (opts.classInstanceId) {
      params.push(opts.classInstanceId);
      where.push(`class_instance_id = $${params.length}`);
    }

    if (opts.startDateFrom) {
      params.push(opts.startDateFrom);
      where.push(`start_datetime >= $${params.length}::timestamptz`);
    }

    if (opts.startDateTo) {
      params.push(opts.startDateTo);
      where.push(`start_datetime <= $${params.length}::timestamptz`);
    }

    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    params.push(limit, offset);

    const { rows } = await this.client.query<CompanyEventSummary>(
      `SELECT ${EVENT_SUMMARY_COLUMNS} FROM company_event
       WHERE ${where.join(' AND ')}
       ORDER BY start_datetime ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows;
  }

  /**
   * Count events matching filters
   */
  async countEvents(
    tenantId: string | null,
    opts: {
      companyId?: string;
      eventType?: EventType;
      status?: EventStatus;
      instructorUserId?: string;
      classInstanceId?: string;
      startDateFrom?: string;
      startDateTo?: string;
      search?: string;
      archived?: boolean;
    } = {}
  ): Promise<number> {
    const params: unknown[] = [tenantId];
    const where: string[] = [
      '(tenant_id IS NULL OR tenant_id = COALESCE($1, tenant_id))',
      'deleted_at IS NULL',
      opts.archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL',
    ];

    if (opts.companyId) {
      params.push(opts.companyId);
      where.push(`company_id = $${params.length}`);
    }

    if (opts.eventType) {
      params.push(opts.eventType);
      where.push(`event_type = $${params.length}`);
    }

    if (opts.status) {
      params.push(opts.status);
      where.push(`status = $${params.length}`);
    }

    if (opts.instructorUserId) {
      params.push(opts.instructorUserId);
      where.push(`instructor_user_id = $${params.length}`);
    }

    if (opts.classInstanceId) {
      params.push(opts.classInstanceId);
      where.push(`class_instance_id = $${params.length}`);
    }

    if (opts.startDateFrom) {
      params.push(opts.startDateFrom);
      where.push(`start_datetime >= $${params.length}::timestamptz`);
    }

    if (opts.startDateTo) {
      params.push(opts.startDateTo);
      where.push(`start_datetime <= $${params.length}::timestamptz`);
    }

    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    const { rows } = await this.client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM company_event WHERE ${where.join(' AND ')}`,
      params
    );

    return parseInt(rows[0].count, 10);
  }

  /**
   * Get events for calendar view
   */
  async getCalendarEvents(
    tenantId: string | null,
    companyId: string,
    startDate: string,
    endDate: string,
    classInstanceIds?: string[],
  ): Promise<CalendarEvent[]> {
    const params: unknown[] = [companyId, tenantId, startDate, endDate];
    let classFilter = '';
    if (classInstanceIds && classInstanceIds.length > 0) {
      params.push(classInstanceIds);
      classFilter = ` AND (class_instance_id = ANY($${params.length}) OR class_instance_id IS NULL)`;
    }

    const { rows } = await this.client.query<{
      id: string;
      title: string;
      start_datetime: string;
      end_datetime: string;
      event_type: EventType;
      status: EventStatus;
      company_id: string;
      class_instance_id: string | null;
      component_id: string | null;
      component_title: string | null;
      component_type: string | null;
      component_duration: number | null;
      recurrence_group_id: string | null;
      allow_on_holiday: boolean;
    }>(
      `SELECT ce.id, ce.title, ce.start_datetime, ce.end_datetime, ce.event_type, ce.status, ce.company_id,
              ce.class_instance_id, ce.component_id,
              c.title as component_title, c.component_type, c.estimated_duration_minutes as component_duration,
              ce.recurrence_group_id, COALESCE(ce.allow_on_holiday, false) as allow_on_holiday
       FROM company_event ce
       LEFT JOIN component c ON c.id = ce.component_id
       WHERE ce.company_id = $1
         AND (ce.tenant_id IS NULL OR ce.tenant_id = COALESCE($2, ce.tenant_id))
         AND ce.deleted_at IS NULL
         AND ce.start_datetime < $4::timestamptz
         AND ce.end_datetime > $3::timestamptz
         ${classFilter}
       ORDER BY ce.start_datetime ASC`,
      params
    );

    // Get resources for each event
    const eventIds = rows.map((r) => r.id);
    if (eventIds.length === 0) return [];

    const { rows: resources } = await this.client.query<{
      event_id: string;
      resource_id: string;
      resource_name: string;
    }>(
      `SELECT er.event_id, er.resource_id, cr.name as resource_name
       FROM event_resource er
       JOIN company_resource cr ON cr.id = er.resource_id
       WHERE er.event_id = ANY($1)`,
      [eventIds]
    );

    // Group resources by event
    const resourcesByEvent = new Map<string, Array<{ id: string; name: string }>>();
    for (const r of resources) {
      if (!resourcesByEvent.has(r.event_id)) {
        resourcesByEvent.set(r.event_id, []);
      }
      resourcesByEvent.get(r.event_id)!.push({ id: r.resource_id, name: r.resource_name });
    }

    return rows.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start_datetime,
      end: event.end_datetime,
      event_type: event.event_type,
      status: event.status,
      company_id: event.company_id,
      class_instance_id: event.class_instance_id,
      component_id: event.component_id,
      component_name: event.component_title,
      component_type: event.component_type,
      component_duration: event.component_duration,
      recurrence_group_id: event.recurrence_group_id,
      allow_on_holiday: event.allow_on_holiday,
      resources: resourcesByEvent.get(event.id) ?? [],
    }));
  }

  // ===== Event-Resource linking methods =====

  /**
   * Add a resource to an event
   */
  async addEventResource(
    eventId: string,
    resourceId: string,
    quantity: number = 1,
    notes: string | null = null
  ): Promise<string> {
    const { rows } = await this.client.query<Pick<EventResourceRow, 'id'>>(
      `INSERT INTO event_resource (event_id, resource_id, quantity, notes, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [eventId, resourceId, quantity, notes]
    );
    return rows[0].id;
  }

  /**
   * Remove a resource from an event
   */
  async removeEventResource(eventId: string, resourceId: string): Promise<void> {
    await this.client.query('DELETE FROM event_resource WHERE event_id = $1 AND resource_id = $2', [
      eventId,
      resourceId,
    ]);
  }

  /**
   * Update event resource (quantity/notes)
   */
  async updateEventResource(
    eventId: string,
    resourceId: string,
    fields: { quantity?: number; notes?: string | null }
  ): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [eventId, resourceId];
    let paramIndex = 3;

    if (fields.quantity !== undefined) {
      updates.push(`quantity = $${paramIndex++}`);
      values.push(fields.quantity);
    }
    if (fields.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(fields.notes);
    }

    if (updates.length === 0) return;

    await this.client.query(
      `UPDATE event_resource SET ${updates.join(', ')} WHERE event_id = $1 AND resource_id = $2`,
      values
    );
  }

  /**
   * Get all resources for an event
   */
  async getEventResources(eventId: string): Promise<
    Array<{
      id: string;
      resource_id: string;
      quantity: number;
      notes: string | null;
      name: string;
      code: string | null;
      resource_type: string;
      capacity: number | null;
      full_location: string;
      status: string;
    }>
  > {
    const { rows } = await this.client.query(
      `SELECT er.id, er.resource_id, er.quantity, er.notes,
              cr.name, cr.code, cr.resource_type, cr.capacity, cr.full_location, cr.status
       FROM event_resource er
       JOIN company_resource cr ON cr.id = er.resource_id
       WHERE er.event_id = $1 AND cr.deleted_at IS NULL`,
      [eventId]
    );
    return rows;
  }

  /**
   * Get all events using a resource
   */
  async getResourceEvents(
    resourceId: string,
    startDate?: string,
    endDate?: string
  ): Promise<
    Array<{
      id: string;
      event_id: string;
      quantity: number;
      notes: string | null;
      title: string;
      event_type: string;
      start_datetime: string;
      end_datetime: string;
      status: string;
    }>
  > {
    const params: unknown[] = [resourceId];
    let dateFilter = '';

    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `AND ce.start_datetime < $3::timestamptz AND ce.end_datetime > $2::timestamptz`;
    }

    const { rows } = await this.client.query(
      `SELECT er.id, er.event_id, er.quantity, er.notes,
              ce.title, ce.event_type, ce.start_datetime, ce.end_datetime, ce.status
       FROM event_resource er
       JOIN company_event ce ON ce.id = er.event_id
       WHERE er.resource_id = $1
         AND ce.deleted_at IS NULL
         AND ce.status NOT IN ('cancelled')
         ${dateFilter}
       ORDER BY ce.start_datetime ASC`,
      params
    );
    return rows;
  }
}
