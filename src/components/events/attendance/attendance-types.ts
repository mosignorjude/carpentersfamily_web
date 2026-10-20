export interface EventRow {
  id: string;
  title: string;
  event_type?: string;
  location?: string;
  starts_at: string;
  minutes_enabled: boolean;
  attendance_enabled: boolean;
  status: string;
  archived_at: string | null;
}

export interface MinutesRow {
  event_id: string;
  content: string;
  revision_number: number;
  updated_at: string;
}

export interface SessionRow {
  event_id: string;
  opened_at: string;
  late_after_minutes: number;
  late_after_at: string;
  closed_at: string | null;
}

export interface AttendanceRow {
  event_id: string;
  member_id: string;
  attendance_status: string;
  check_in_method: string;
  checked_in_at: string | null;
  recorded_at: string;
  corrected_at: string | null;
  correction_reason: string | null;
}

export interface MemberRow {
  id: string;
  full_name: string;
  username: string;
  status: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  target_member_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
}
