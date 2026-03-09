/**
 * Class Instance Component Schedule Entity - Database Row Interface
 *
 * Per-instance scheduling of components, allowing different dates per class instance.
 *
 * @see Migration: 202603040002--create_class_instance_component_schedule.sql
 */

export interface ClassInstanceComponentScheduleRow {
  id: string;
  tenant_id: string | null;
  class_instance_id: string;
  component_id: string;
  scheduled_date: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateClassInstanceComponentScheduleInput {
  tenant_id?: string | null;
  class_instance_id: string;
  component_id: string;
  scheduled_date: string | Date;
}
