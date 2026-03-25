import {
  CompanyResourceRow,
  CompanyResourceSummary,
  CreateCompanyResourceInput,
  UpdateCompanyResourceInput,
  ResourceType,
  ResourceStatus,
} from '@cogedu/ava-database-types';
import type { PoolClient } from 'pg';

export const RESOURCE_SUMMARY_COLUMNS = `
  id, tenant_id, company_id, name, code, resource_type,
  capacity, quantity, full_location, status, created_at, updated_at
`.trim();

export class CompanyResourcesRepository {
  constructor(private readonly client: PoolClient) {}

  /**
   * Create a new company resource
   * @returns The ID of the created resource
   */
  async createResource(
    tenantId: string | null,
    companyId: string,
    fields: {
      name: string;
      code?: string | null;
      resource_type: ResourceType;
      capacity?: number | null;
      quantity?: number;
      location_building?: string | null;
      location_floor?: string | null;
      location_room?: string | null;
      description?: string | null;
      features?: Record<string, boolean> | null;
      notes?: string | null;
      operating_hours?: Record<string, { start: string; end: string }> | null;
      status?: ResourceStatus;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<string> {
    const { rows } = await this.client.query<Pick<CompanyResourceRow, 'id'>>(
      `INSERT INTO company_resource (
        tenant_id, company_id, name, code, resource_type,
        capacity, quantity, location_building, location_floor, location_room,
        description, features, notes, operating_hours, status, metadata,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
      RETURNING id`,
      [
        tenantId,
        companyId,
        fields.name,
        fields.code ?? null,
        fields.resource_type,
        fields.capacity ?? null,
        fields.quantity ?? 1,
        fields.location_building ?? null,
        fields.location_floor ?? null,
        fields.location_room ?? null,
        fields.description ?? null,
        fields.features ? JSON.stringify(fields.features) : null,
        fields.notes ?? null,
        fields.operating_hours ? JSON.stringify(fields.operating_hours) : null,
        fields.status ?? 'available',
        fields.metadata ? JSON.stringify(fields.metadata) : null,
      ]
    );
    return rows[0].id;
  }

  /**
   * Update an existing resource
   */
  async updateResource(id: string, fields: UpdateCompanyResourceInput): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (fields.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(fields.name);
    }
    if (fields.code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      values.push(fields.code);
    }
    if (fields.resource_type !== undefined) {
      updates.push(`resource_type = $${paramIndex++}`);
      values.push(fields.resource_type);
    }
    if (fields.capacity !== undefined) {
      updates.push(`capacity = $${paramIndex++}`);
      values.push(fields.capacity);
    }
    if (fields.quantity !== undefined) {
      updates.push(`quantity = $${paramIndex++}`);
      values.push(fields.quantity);
    }
    if (fields.location_building !== undefined) {
      updates.push(`location_building = $${paramIndex++}`);
      values.push(fields.location_building);
    }
    if (fields.location_floor !== undefined) {
      updates.push(`location_floor = $${paramIndex++}`);
      values.push(fields.location_floor);
    }
    if (fields.location_room !== undefined) {
      updates.push(`location_room = $${paramIndex++}`);
      values.push(fields.location_room);
    }
    if (fields.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(fields.description);
    }
    if (fields.features !== undefined) {
      updates.push(`features = $${paramIndex++}`);
      values.push(fields.features ? JSON.stringify(fields.features) : null);
    }
    if (fields.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(fields.notes);
    }
    if (fields.operating_hours !== undefined) {
      updates.push(`operating_hours = $${paramIndex++}`);
      values.push(fields.operating_hours ? JSON.stringify(fields.operating_hours) : null);
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
      `UPDATE company_resource SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL`,
      values
    );
  }

  /**
   * Soft delete a resource
   */
  async softDeleteResource(id: string): Promise<void> {
    await this.client.query(
      'UPDATE company_resource SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
  }

  /**
   * Get a single resource by ID
   */
  async getResource(
    tenantId: string | null,
    resourceId: string
  ): Promise<CompanyResourceRow | null> {
    const { rows } = await this.client.query<CompanyResourceRow>(
      `SELECT * FROM company_resource
       WHERE id = $1
         AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
         AND deleted_at IS NULL`,
      [resourceId, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * Get a resource summary (lighter weight)
   */
  async getResourceSummary(
    tenantId: string | null,
    resourceId: string
  ): Promise<CompanyResourceSummary | null> {
    const { rows } = await this.client.query<CompanyResourceSummary>(
      `SELECT ${RESOURCE_SUMMARY_COLUMNS} FROM company_resource
       WHERE id = $1
         AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id))
         AND deleted_at IS NULL`,
      [resourceId, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * List resources with pagination and filtering
   */
  async listResources(
    tenantId: string | null,
    opts: {
      limit?: number;
      offset?: number;
      companyId?: string;
      resourceType?: ResourceType;
      status?: ResourceStatus;
      search?: string;
    } = {}
  ): Promise<CompanyResourceSummary[]> {
    const params: unknown[] = [tenantId];
    const where: string[] = [
      '(tenant_id IS NULL OR tenant_id = COALESCE($1, tenant_id))',
      'deleted_at IS NULL',
    ];

    if (opts.companyId) {
      params.push(opts.companyId);
      where.push(`company_id = $${params.length}`);
    }

    if (opts.resourceType) {
      params.push(opts.resourceType);
      where.push(`resource_type = $${params.length}`);
    }

    if (opts.status) {
      params.push(opts.status);
      where.push(`status = $${params.length}`);
    }

    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(
        `(name ILIKE $${params.length} OR code ILIKE $${params.length} OR description ILIKE $${params.length})`
      );
    }

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    params.push(limit, offset);

    const { rows } = await this.client.query<CompanyResourceSummary>(
      `SELECT ${RESOURCE_SUMMARY_COLUMNS} FROM company_resource
       WHERE ${where.join(' AND ')}
       ORDER BY name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows;
  }

  /**
   * Count resources matching filters
   */
  async countResources(
    tenantId: string | null,
    opts: {
      companyId?: string;
      resourceType?: ResourceType;
      status?: ResourceStatus;
      search?: string;
    } = {}
  ): Promise<number> {
    const params: unknown[] = [tenantId];
    const where: string[] = [
      '(tenant_id IS NULL OR tenant_id = COALESCE($1, tenant_id))',
      'deleted_at IS NULL',
    ];

    if (opts.companyId) {
      params.push(opts.companyId);
      where.push(`company_id = $${params.length}`);
    }

    if (opts.resourceType) {
      params.push(opts.resourceType);
      where.push(`resource_type = $${params.length}`);
    }

    if (opts.status) {
      params.push(opts.status);
      where.push(`status = $${params.length}`);
    }

    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(
        `(name ILIKE $${params.length} OR code ILIKE $${params.length} OR description ILIKE $${params.length})`
      );
    }

    const { rows } = await this.client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM company_resource WHERE ${where.join(' AND ')}`,
      params
    );

    return parseInt(rows[0].count, 10);
  }

  /**
   * Check resource availability for a time slot
   * Uses the database function check_resource_availability
   */
  async checkAvailability(
    resourceId: string,
    startDatetime: string,
    endDatetime: string,
    excludeEventId?: string | null,
    quantityNeeded?: number
  ): Promise<boolean> {
    const { rows } = await this.client.query<{ available: boolean }>(
      `SELECT check_resource_availability($1, $2::timestamptz, $3::timestamptz, $4, $5) as available`,
      [resourceId, startDatetime, endDatetime, excludeEventId ?? null, quantityNeeded ?? 1]
    );
    return rows[0]?.available ?? false;
  }

  /**
   * Get availability slots for a resource on a given date range
   */
  async getAvailabilitySlots(
    resourceId: string,
    startDate: string,
    endDate: string
  ): Promise<
    Array<{ start: string; end: string; event_id: string | null; block_id: string | null }>
  > {
    // Get all events using this resource in the date range
    const { rows: events } = await this.client.query<{
      start_datetime: string;
      end_datetime: string;
      event_id: string;
    }>(
      `SELECT ce.start_datetime, ce.end_datetime, ce.id as event_id
       FROM company_event ce
       JOIN event_resource er ON er.event_id = ce.id
       WHERE er.resource_id = $1
         AND ce.deleted_at IS NULL
         AND ce.status NOT IN ('cancelled', 'draft')
         AND ce.start_datetime < $3::timestamptz
         AND ce.end_datetime > $2::timestamptz
       ORDER BY ce.start_datetime`,
      [resourceId, startDate, endDate]
    );

    // Get all blocks for this resource in the date range
    const { rows: blocks } = await this.client.query<{
      start_datetime: string;
      end_datetime: string;
      block_id: string;
    }>(
      `SELECT start_datetime, end_datetime, id as block_id
       FROM resource_block
       WHERE resource_id = $1
         AND start_datetime < $3::timestamptz
         AND end_datetime > $2::timestamptz
       ORDER BY start_datetime`,
      [resourceId, startDate, endDate]
    );

    // Combine and return
    const bookedSlots = [
      ...events.map((e) => ({
        start: e.start_datetime,
        end: e.end_datetime,
        event_id: e.event_id,
        block_id: null,
      })),
      ...blocks.map((b) => ({
        start: b.start_datetime,
        end: b.end_datetime,
        event_id: null,
        block_id: b.block_id,
      })),
    ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return bookedSlots;
  }

  /**
   * Get resource by code within a company
   */
  async getResourceByCode(
    tenantId: string | null,
    companyId: string,
    code: string
  ): Promise<CompanyResourceRow | null> {
    const { rows } = await this.client.query<CompanyResourceRow>(
      `SELECT * FROM company_resource
       WHERE company_id = $1
         AND code = $2
         AND (tenant_id IS NULL OR tenant_id = COALESCE($3, tenant_id))
         AND deleted_at IS NULL`,
      [companyId, code, tenantId]
    );
    return rows[0] ?? null;
  }
}
