/**
 * Class Instance Component Meeting Row
 *
 * Represents a meeting link specific to a class instance and component combination.
 * This allows the same component to have different meeting links for different class instances.
 * Generic design to support multiple meeting providers (Zoom, Teams, Meet, etc.).
 *
 * @see libs/migrations/identity/1923000000--class_instance_component_meeting.sql
 */
export interface ClassInstanceComponentMeetingRow {
  id: string; // UUID
  tenant_id: string | null; // UUID
  class_instance_id: string; // UUID - Reference to class_instance
  component_id: string; // UUID - Reference to component
  provider: 'zoom' | 'teams' | 'meet'; // Meeting provider
  meeting_id: string; // Meeting ID from provider API
  meeting_url: string; // Meeting join URL for participants
  start_url: string | null; // Meeting start URL for host
  start_date: Date | null; // Scheduled start date/time of the meeting
  end_date: Date | null; // Scheduled end date/time of the meeting
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateClassInstanceComponentMeetingInput {
  tenant_id?: string | null;
  class_instance_id: string;
  component_id: string;
  provider: 'zoom' | 'teams' | 'meet'; // Meeting provider
  meeting_id: string;
  meeting_url: string;
  start_url?: string | null;
  start_date?: Date | null; // Scheduled start date/time of the meeting
  end_date?: Date | null; // Scheduled end date/time of the meeting
}

export interface UpdateClassInstanceComponentMeetingInput {
  meeting_id?: string;
  meeting_url?: string;
  start_url?: string | null;
  start_date?: Date | null; // Scheduled start date/time of the meeting
  end_date?: Date | null; // Scheduled end date/time of the meeting
}

