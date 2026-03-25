import { ComponentRow } from '@cogedu/ava-database-types';
import type { PoolClient } from 'pg';

/**
 * Extended component with professor info resolved via FK chain: component → unit → series
 */
export interface ComponentWithProfessor extends ComponentRow {
  professor_id: string | null;
  professor_full_name: string | null;
  professor_photo_url: string | null;
}

export class ComponentsRepository {
  constructor(private readonly client: PoolClient) { }

  async createComponent(
    tenantId: string | null,
    unitId: string,
    companyId: string,
    authorUserId: string,
    fields: {
      componentType: string;
      subtype?: string | null;
      title: string;
      description?: string | null;
      thumbnailUrl?: string | null;
      contentUrl?: string | null;
      contentData?: unknown | null;
      estimatedDurationMinutes?: number | null;
      isRequired?: boolean;
      sku?: string | null;
      taxonomy?: unknown | null;
      sequenceOrder?: number | null;
      metadata?: unknown | null;
      scheduledDate?: string | null;
      assessmentConfig?: unknown | null;
      displayNews?: boolean;
    }
  ): Promise<string> {
    const { rows } = await this.client.query<Pick<ComponentRow, 'id'>>(
      `INSERT INTO component (tenant_id, unit_id, company_id, author_user_id, component_type, subtype, title, description,
        thumbnail_url, content_url, content_data, estimated_duration_minutes, is_required, sku, taxonomy, sequence_order, metadata, scheduled_date, assessment_config, display_news, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()) RETURNING id`,
      [
        tenantId,
        unitId,
        companyId,
        authorUserId,
        fields.componentType,
        fields.subtype ?? null,
        fields.title,
        fields.description ?? null,
        fields.thumbnailUrl ?? null,
        fields.contentUrl ?? null,
        fields.contentData ? JSON.stringify(fields.contentData) : null,
        fields.estimatedDurationMinutes ?? null,
        fields.isRequired ?? true,
        fields.sku ?? null,
        fields.taxonomy ? JSON.stringify(fields.taxonomy) : null,
        fields.sequenceOrder ?? null,
        fields.metadata ? JSON.stringify(fields.metadata) : null,
        fields.scheduledDate ?? null,
        fields.assessmentConfig ? JSON.stringify(fields.assessmentConfig) : null,
        fields.displayNews ?? false,
      ]
    );

    return rows[0].id;
  }

  async updateComponent(
    id: string,
    fields: Partial<Omit<ComponentRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>
  ): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) {
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        updates.push(`${snakeKey} = $${idx++}`);
        values.push(
          ['contentData', 'taxonomy', 'metadata', 'assessmentConfig'].includes(key) && value
            ? JSON.stringify(value)
            : value
        );
      }
    });

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      await this.client.query(
        `UPDATE component SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL`,
        values
      );
    }
  }

  async softDeleteComponent(id: string): Promise<void> {
    await this.client.query(
      'UPDATE component SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
  }

  async getComponent(tenantId: string | null, componentId: string): Promise<ComponentRow | null> {
    const { rows } = await this.client.query<ComponentRow>(
      'SELECT * FROM component WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = COALESCE($2, tenant_id)) AND deleted_at IS NULL',
      [componentId, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * Get component with professor info resolved via FK chain: component → unit → series
   */
  async getComponentWithProfessor(
    tenantId: string | null,
    componentId: string
  ): Promise<ComponentWithProfessor | null> {
    const { rows } = await this.client.query<ComponentWithProfessor>(
      `SELECT c.*,
              s.professor_id,
              pu.full_name as professor_full_name,
              pu.photo_url as professor_photo_url
       FROM component c
       JOIN unit u ON u.id = c.unit_id
       JOIN series s ON s.id = u.series_id
       LEFT JOIN "user" pu ON pu.id = s.professor_id
       WHERE c.id = $1
         AND (c.tenant_id IS NULL OR c.tenant_id = COALESCE($2, c.tenant_id))
         AND c.deleted_at IS NULL`,
      [componentId, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * Duplicate a component to another unit (Copy-on-Share approach)
   * Creates a new component with the same data but different unit_id
   * Returns the ID of the newly created duplicate
   */
  async duplicateComponent(
    sourceComponent: ComponentRow,
    targetUnitId: string,
    authorUserId: string
  ): Promise<string> {
    const { rows } = await this.client.query<Pick<ComponentRow, 'id'>>(
      `INSERT INTO component (
        tenant_id, unit_id, company_id, author_user_id, component_type, subtype, title, description,
        thumbnail_url, content_url, content_data, estimated_duration_minutes, is_required, sku,
        taxonomy, sequence_order, metadata, assessment_config, conference_provider, conference_date,
        conference_link, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
       RETURNING id`,
      [
        sourceComponent.tenant_id,
        targetUnitId,
        sourceComponent.company_id,
        authorUserId,
        sourceComponent.component_type,
        sourceComponent.subtype,
        sourceComponent.title,
        sourceComponent.description,
        sourceComponent.thumbnail_url,
        sourceComponent.content_url,
        sourceComponent.content_data ? JSON.stringify(sourceComponent.content_data) : null,
        sourceComponent.estimated_duration_minutes,
        sourceComponent.is_required,
        null, // SKU must be unique - duplicates get null SKU (can be set later)
        sourceComponent.taxonomy ? JSON.stringify(sourceComponent.taxonomy) : null,
        sourceComponent.sequence_order,
        sourceComponent.metadata ? JSON.stringify(sourceComponent.metadata) : null,
        sourceComponent.assessment_config
          ? JSON.stringify(sourceComponent.assessment_config)
          : null,
        sourceComponent.conference_provider,
        sourceComponent.conference_date,
        sourceComponent.conference_link,
      ]
    );
    return rows[0].id;
  }

  /**
   * Duplicate a component for professor isolation (clears Zoom meeting_id and event_id)
   * Used when duplicating units for professor assignment (Rule 1)
   */
  async duplicateComponentForProfessorIsolation(
    sourceComponent: ComponentRow,
    targetUnitId: string,
    authorUserId: string
  ): Promise<string> {
    // Clear meeting_id from content_data for Zoom components
    let contentData: unknown = sourceComponent.content_data;
    if (
      sourceComponent.component_type === 'live_session' &&
      contentData &&
      typeof contentData === 'object'
    ) {
      const data = contentData as Record<string, unknown>;
      if (data.meeting_id) {
        // Remove meeting_id for professor isolation - Zoom must be reconfigured
        const { meeting_id: _meetingId, ...rest } = data;
        void _meetingId; // Suppress unused variable warning
        contentData = rest;
      }
    }

    const { rows } = await this.client.query<Pick<ComponentRow, 'id'>>(
      `INSERT INTO component (
        tenant_id, unit_id, company_id, author_user_id, component_type, subtype, title, description,
        thumbnail_url, content_url, content_data, estimated_duration_minutes, is_required, sku,
        taxonomy, sequence_order, metadata, assessment_config, conference_provider, conference_date,
        conference_link, event_id, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
       RETURNING id`,
      [
        sourceComponent.tenant_id,
        targetUnitId,
        sourceComponent.company_id,
        authorUserId,
        sourceComponent.component_type,
        sourceComponent.subtype,
        sourceComponent.title,
        sourceComponent.description,
        sourceComponent.thumbnail_url,
        sourceComponent.content_url,
        contentData ? JSON.stringify(contentData) : null,
        sourceComponent.estimated_duration_minutes,
        sourceComponent.is_required,
        null, // SKU must be unique
        sourceComponent.taxonomy ? JSON.stringify(sourceComponent.taxonomy) : null,
        sourceComponent.sequence_order,
        sourceComponent.metadata ? JSON.stringify(sourceComponent.metadata) : null,
        sourceComponent.assessment_config
          ? JSON.stringify(sourceComponent.assessment_config)
          : null,
        sourceComponent.conference_provider,
        sourceComponent.conference_date,
        sourceComponent.conference_link,
        null, // event_id cleared for professor isolation
      ]
    );
    return rows[0].id;
  }

  async listComponents(
    tenantId: string | null,
    opts: {
      limit?: number;
      offset?: number;
      unitId?: string;
      componentType?: string;
      companyId?: string;
      companyIds?: string[];
      search?: string;
      ids?: string[];
      /** When provided, attaches scheduled_date from class_instance_component_schedule */
      classInstanceId?: string;
    } = {}
  ): Promise<(ComponentWithProfessor & { company_name?: string | null; scheduled_date?: string | null })[]> {
    const params: unknown[] = [tenantId];
    const where = [
      '(c.tenant_id IS NULL OR c.tenant_id = COALESCE($1, c.tenant_id))',
      'c.deleted_at IS NULL',
    ];

    // Direct unit_id filter (duplication approach - each component has exactly one unit)
    if (opts.unitId) {
      params.push(opts.unitId);
      where.push(`c.unit_id = $${params.length}`);
    }
    if (opts.componentType) {
      params.push(opts.componentType);
      where.push(`c.component_type = $${params.length}`);
    }
    if (opts.companyIds?.length) {
      params.push(opts.companyIds);
      where.push(`c.company_id = ANY($${params.length}::uuid[])`);
    } else if (opts.companyId) {
      params.push(opts.companyId);
      where.push(`c.company_id = $${params.length}`);
    }
    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
    }

    if (opts.ids?.length) {
      params.push(opts.ids);
      where.push(`c.id = ANY($${params.length}::uuid[])`);
    }

    // Schedule join — only when a class instance context is provided
    let scheduleJoin = '';
    let scheduleSelect = '';
    if (opts.classInstanceId) {
      params.push(opts.classInstanceId);
      scheduleJoin = `LEFT JOIN class_instance_component_schedule cics
                        ON cics.component_id = c.id
                        AND cics.class_instance_id = $${params.length}
                        AND cics.deleted_at IS NULL`;
      scheduleSelect = ', cics.scheduled_date';
    }

    params.push(opts.limit ?? 50, opts.offset ?? 0);

    const { rows } = await this.client.query<ComponentWithProfessor & { company_name?: string | null; scheduled_date?: string | null }>(
      `SELECT c.*,
              u.title as unit_title,
              s.title as series_title,
              s.professor_id,
              pu.full_name as professor_full_name,
              pu.photo_url as professor_photo_url,
              co.legal_name AS company_name
              ${scheduleSelect}
       FROM component c
       JOIN unit u ON u.id = c.unit_id
       JOIN series s ON s.id = u.series_id
       LEFT JOIN "user" pu ON pu.id = s.professor_id
       LEFT JOIN company co ON co.id = c.company_id
       ${scheduleJoin}
       WHERE ${where.join(' AND ')}
       ORDER BY c.unit_id, c.sequence_order NULLS LAST, c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  async countComponents(
    tenantId: string | null,
    opts: { unitId?: string; componentType?: string; companyId?: string; companyIds?: string[]; search?: string } = {}
  ): Promise<number> {
    const params: unknown[] = [tenantId];
    const where = [
      '(c.tenant_id IS NULL OR c.tenant_id = COALESCE($1, c.tenant_id))',
      'c.deleted_at IS NULL',
    ];

    // Direct unit_id filter (duplication approach - each component has exactly one unit)
    if (opts.unitId) {
      params.push(opts.unitId);
      where.push(`c.unit_id = $${params.length}`);
    }
    if (opts.componentType) {
      params.push(opts.componentType);
      where.push(`c.component_type = $${params.length}`);
    }
    if (opts.companyIds?.length) {
      params.push(opts.companyIds);
      where.push(`c.company_id = ANY($${params.length}::uuid[])`);
    } else if (opts.companyId) {
      params.push(opts.companyId);
      where.push(`c.company_id = $${params.length}`);
    }
    if (opts.search) {
      params.push(`%${opts.search}%`);
      where.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
    }

    const { rows } = await this.client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM component c WHERE ${where.join(' AND ')}`,
      params
    );
    return parseInt(rows[0].count, 10);
  }
}
