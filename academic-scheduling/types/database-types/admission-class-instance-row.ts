/**
 * Admission Class Instance Row Types
 *
 * N:N junction table linking admissions to multiple class instances (turmas).
 * Used when enrollment_mode = 'multiple_choice' to allow candidates to select
 * their preferred turmas.
 *
 * @see Migration 1929000000 - Multi-Turma Enrollment Support
 */

/**
 * Base row type representing a single record in the admission_class_instance table.
 */
export interface AdmissionClassInstanceRow {
  /** Primary key (UUID) */
  id: string;

  /** Tenant ID for multi-tenancy (logical, no FK) */
  tenant_id: string;

  /** Reference to the admission */
  admission_id: string;

  /** Reference to the class instance (turma) */
  class_instance_id: string;

  /** Display order in admin UI and public form (NOT candidate preference) */
  display_order: number;

  /** Optional metadata (JSON) - e.g., reserved spots per process */
  metadata: Record<string, unknown> | null;

  /** Audit timestamp */
  created_at: Date;

  /** Audit timestamp */
  updated_at: Date;
}

/**
 * Summary columns for list queries
 */
export interface AdmissionClassInstanceSummary {
  id: string;
  tenant_id: string;
  admission_id: string;
  class_instance_id: string;
  display_order: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Input type for creating a new admission-class instance link
 */
export interface CreateAdmissionClassInstanceInput {
  admission_id: string;
  class_instance_id: string;
  display_order?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input type for updating an admission-class instance link
 */
export interface UpdateAdmissionClassInstanceInput {
  display_order?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Extended type with class instance details for list queries
 */
export interface AdmissionClassInstanceWithDetails extends AdmissionClassInstanceRow {
  /** Class instance name */
  class_name: string;

  /** Class instance code */
  class_code: string;

  /** Class instance status */
  class_status: string;

  /** Maximum number of students */
  max_students: number | null;

  /** Current enrolled students count */
  enrolled_students_count: number;

  /** Available spots (max_students - enrolled_students_count) */
  available_spots: number | null;
}

/**
 * Bulk upsert input for setting multiple turmas at once
 */
export interface BulkUpsertAdmissionClassInstanceInput {
  admission_id: string;
  class_instances: Array<{
    class_instance_id: string;
    display_order: number;
    metadata?: Record<string, unknown>;
  }>;
}
