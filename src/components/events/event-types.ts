export interface EventTeamMemberRow {
  id: string;
  name: string;
  role: string;
}

export interface EventRow {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  location: string;
  description: string | null;
  minutes_enabled: boolean;
  attendance_enabled: boolean;
  budget_enabled: boolean;
  income_enabled: boolean;
  expenses_enabled: boolean;
  ticketing_enabled: boolean;
  status: string;
  status_changed_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  team?: EventTeamMemberRow[];
  budgetCeiling?: number | null;
  ticketsSold?: number | null;
  ticketsCapacity?: number | null;
  dressCode?: string | null;
}

export interface EventCardAccessInfo {
  isManager: boolean;
  canEdit: boolean;
  canSetStatus: boolean;
  canReopen: boolean;
  mutable: boolean;
}
