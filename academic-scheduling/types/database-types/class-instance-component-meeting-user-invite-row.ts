/**
 * Class Instance Component Meeting User Invite Row
 *
 * Represents a Zoom meeting invite for a specific user in a meeting.
 * Links users to meetings via class_instance_component_meeting.
 *
 * @see libs/migrations/identity/1924000002--class_instance_component_meeting_user_invite.sql
 */
export interface ClassInstanceComponentMeetingUserInviteRow {
  id: string; // UUID
  tenant_id: string | null; // UUID
  class_instance_component_meeting_id: string; // UUID - Reference to class_instance_component_meeting
  user_id: string; // UUID - Reference to user
  join_url: string; // Zoom join URL for the specific user
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateClassInstanceComponentMeetingUserInviteInput {
  tenant_id?: string | null;
  class_instance_component_meeting_id: string;
  user_id: string;
  join_url: string;
}

export interface UpdateClassInstanceComponentMeetingUserInviteInput {
  join_url?: string;
}

