/**
 * Recurrence Group Entity - Database Row Interface
 *
 * Represents a recurrence pattern for academic scheduling.
 * Supports weekly, biweekly, custom day patterns with optional split tracking.
 *
 * @see Migration 202603080001 - Create recurrence_group
 */

export type RecurrencePattern = 'weekly' | 'biweekly' | 'custom';

export interface RecurrenceGroupRow {
  id: string;
  tenant_id: string | null;
  company_id: string;
  class_instance_id: string | null;
  pattern: RecurrencePattern;
  custom_days: number[] | null;
  start_date: string;
  end_date: string | null;
  parent_group_id: string | null;
  split_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateRecurrenceGroupInput {
  tenant_id?: string | null;
  company_id: string;
  class_instance_id?: string | null;
  pattern: RecurrencePattern;
  custom_days?: number[] | null;
  start_date: string;
  end_date?: string | null;
  parent_group_id?: string | null;
  split_reason?: string | null;
}

export interface UpdateRecurrenceGroupInput {
  class_instance_id?: string | null;
  pattern?: RecurrencePattern;
  custom_days?: number[] | null;
  start_date?: string;
  end_date?: string | null;
  parent_group_id?: string | null;
  split_reason?: string | null;
}
