/**
 * Company Event Entity - Database Row Interface
 *
 * Represents a scheduled event that uses company resources.
 * Events can be classes, workshops, meetings, etc.
 *
 * @see Migration 1802000000 - Company Resources & Events System
 */

export type EventType =
  | 'aula'
  | 'estagio'
  | 'palestra'
  | 'visitacao_tecnica'
  | 'workshop'
  | 'seminario'
  | 'reuniao'
  | 'avaliacao'
  | 'outro';

export type EventStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval?: number;
  until?: string; // ISO 8601 date
  count?: number;
  byday?: string[]; // e.g., ['MO', 'WE', 'FR']
}

export interface CompanyEventRow {
  id: string;
  tenant_id: string | null;
  company_id: string;

  // Event identification
  title: string;
  description: string | null;
  event_type: EventType;

  // Schedule
  start_datetime: string;
  end_datetime: string;
  timezone: string;

  // Recurrence (optional) - instances generated on-demand
  is_recurring: boolean;
  recurrence_rule: RecurrenceRule | null;
  recurrence_parent_id: string | null;

  // Participants
  max_participants: number | null;
  instructor_user_id: string | null;

  // Links
  class_instance_id: string | null;
  recurrence_group_id: string | null;
  component_id: string | null;

  // Holiday override
  allow_on_holiday: boolean;

  // Status
  status: EventStatus;

  // Check-in control (for attendance)
  is_checkin_open: boolean;
  checkin_mode: 'professor_reads_qr' | 'student_reads_qr' | 'manual' | null;

  // Audit
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived_at: string | null;

  // Metadata
  metadata: Record<string, unknown> | null;
}

export interface CreateCompanyEventInput {
  tenant_id?: string | null;
  company_id: string;
  title: string;
  description?: string | null;
  event_type: EventType;
  start_datetime: string;
  end_datetime: string;
  timezone?: string;
  is_recurring?: boolean;
  recurrence_rule?: RecurrenceRule | null;
  recurrence_parent_id?: string | null;
  max_participants?: number | null;
  instructor_user_id?: string | null;
  class_instance_id?: string | null;
  recurrence_group_id?: string | null;
  component_id?: string | null;
  allow_on_holiday?: boolean;
  status?: EventStatus;
  created_by_user_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateCompanyEventInput {
  title?: string;
  description?: string | null;
  event_type?: EventType;
  start_datetime?: string;
  end_datetime?: string;
  timezone?: string;
  is_recurring?: boolean;
  recurrence_rule?: RecurrenceRule | null;
  max_participants?: number | null;
  instructor_user_id?: string | null;
  class_instance_id?: string | null;
  recurrence_group_id?: string | null;
  component_id?: string | null;
  allow_on_holiday?: boolean;
  status?: EventStatus;
  metadata?: Record<string, unknown> | null;
}

export interface CompanyEventSummary {
  id: string;
  tenant_id: string | null;
  company_id: string;
  title: string;
  event_type: EventType;
  start_datetime: string;
  end_datetime: string;
  status: EventStatus;
  instructor_user_id: string | null;
  class_instance_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Extended type for API responses with resources
 */
export interface CompanyEventWithResources extends CompanyEventRow {
  resources: Array<{
    id: string;
    name: string;
    resource_type: string;
    full_location: string;
    pivot: {
      quantity: number;
      notes: string | null;
    };
  }>;
}

/**
 * Calendar event format for frontend
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  event_type: EventType;
  status: EventStatus;
  company_id: string;
  component_id: string | null;
  component_name: string | null;
  recurrence_group_id: string | null;
  allow_on_holiday: boolean;
  resources: Array<{
    id: string;
    name: string;
  }>;
}
