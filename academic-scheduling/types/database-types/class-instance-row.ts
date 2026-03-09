/**
 * Class Instance Entity - Database Row Interface
 *
 * Represents a scheduled class offering/cohort linked to collection or series content.
 * Multiple class instances can reference the same collection/series for different schedules.
 *
 * @see Migration: 1796000000--class_management_module.sql
 * @see Migration: 1800000000--class_instance_unified_content_id.sql
 */

export type ContentType = 'collection' | 'series';
export type ScheduleType =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'full_time'
  | 'flexible'
  | 'weekend';
export type DeliveryMode = 'in_person' | 'online' | 'hybrid';
export type ClassInstanceStatus = 'active' | 'inactive' | 'completed' | 'cancelled';

export interface ClassInstanceRow {
  id: string;
  tenant_id: string | null;
  company_id: string;

  // Content reference - content_type determines which table content_id refers to
  content_type: ContentType;
  content_id: string; // UUID reference to collection or series based on content_type

  // Class identification
  code: string; // e.g., "SENAC-JS101-2025-1"
  name: string; // e.g., "JavaScript 101 - Spring 2025"
  institution: string; // Educational institution

  // Class configuration
  class_type: string | null; // Free text: course, workshop, bootcamp, etc.
  schedule_type: ScheduleType;
  delivery_mode: DeliveryMode;
  max_students: number;

  // Dates
  start_date: Date | null;
  end_date: Date | null;

  // Shift times
  class_start_time: string | null;
  class_end_time: string | null;

  // Status
  status: ClassInstanceStatus;

  // Metrics (calculated by application)
  enrolled_students_count: number;
  engagement_score: number;
  churn_rate: number;

  // Certification (links to existing company)
  certificate_issuer_company_id: string | null;

  // Flexible metadata
  metadata: unknown | null;

  // Audit
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateClassInstanceInput {
  tenant_id?: string | null;
  company_id: string;
  content_type: ContentType;
  content_id: string; // Required - UUID of collection or series based on content_type
  code: string;
  name: string;
  institution: string;
  class_type?: string | null;
  schedule_type: ScheduleType;
  delivery_mode: DeliveryMode;
  max_students?: number;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
  class_start_time?: string | null;
  class_end_time?: string | null;
  status?: ClassInstanceStatus;
  certificate_issuer_company_id?: string | null;
  metadata?: unknown | null;
}

export interface UpdateClassInstanceInput {
  code?: string;
  name?: string;
  institution?: string;
  class_type?: string | null;
  schedule_type?: ScheduleType;
  delivery_mode?: DeliveryMode;
  max_students?: number;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
  class_start_time?: string | null;
  class_end_time?: string | null;
  status?: ClassInstanceStatus;
  certificate_issuer_company_id?: string | null;
  metadata?: unknown | null;
  // Note: content_type and content_id cannot be changed after creation
}

/**
 * Summary interface for list operations (excludes heavy fields like metadata)
 */
export interface ClassInstanceSummary {
  id: string;
  tenant_id: string | null;
  company_id: string;
  content_type: ContentType;
  content_id: string;
  code: string;
  name: string;
  institution: string;
  class_type: string | null;
  schedule_type: ScheduleType;
  delivery_mode: DeliveryMode;
  max_students: number;
  start_date: Date | null;
  end_date: Date | null;
  status: ClassInstanceStatus;
  enrolled_students_count: number;
  engagement_score: number;
  churn_rate: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Extended interface with content info (for joins)
 */
export interface ClassInstanceWithContent extends ClassInstanceRow {
  // Collection info (when content_type = 'collection')
  collection_title?: string | null;
  collection_status?: 'draft' | 'published' | 'archived' | null;
  // Series info (when content_type = 'series')
  series_title?: string | null;
  series_code?: string | null;
  // Professor info (resolved from series when content_type = 'series')
  series_professor_id?: string | null;
  professor_full_name?: string | null;
  professor_photo_url?: string | null;
}

// Backwards compatibility
export type ClassInstanceWithCollection = ClassInstanceWithContent;
