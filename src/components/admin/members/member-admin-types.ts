/**
 * Types for Member Administration
 * Corresponds to prototype types/memberAdmin.ts and production schema.
 */

export type OfficerRole = "admin" | "president" | "executive" | "member";

export type AccountStatus = "pending" | "active" | "deactivated" | "rejected";

export type ProfileCompletionState =
  | "complete"
  | "incomplete_email"
  | "incomplete_guarantor"
  | "incomplete_bio";

export type EventStaffRole = "Event lead" | "Event assistant" | "Committee";

export interface ClubMemberRecord {
  id: string;
  fullName: string;
  username: string; // e.g. @c.obi, @e.okonkwo
  accountStatus: AccountStatus;
  profileState: ProfileCompletionState;
  profileStateDescription?: string;
  clubRole: "Member" | "Executive" | "Admin" | "President";
  requestDateWAT: string;
  activationDateWAT?: string;
  lastStatusChangeReason?: string;
  lastStatusChangedBy?: string;
  lastStatusChangedAtWAT?: string;
  chapter: string;
}

export interface EventAssignment {
  id: string;
  eventId: string;
  memberId: string;
  memberName: string;
  memberUsername: string;
  eventRole: EventStaffRole;
  assignedBy: string;
  assignedAtWAT: string;
}

export interface MemberAdminAuditEntry {
  id: string;
  timestampWAT: string;
  actorName: string;
  actorRole: string;
  targetMemberName: string;
  targetMemberUsername: string;
  actionType:
    | "membership_approved"
    | "membership_rejected"
    | "account_deactivated"
    | "account_reactivated"
    | "executive_role_assigned"
    | "executive_role_removed"
    | "event_role_assigned"
    | "event_role_removed"
    | "event_lead_replaced";
  reason: string;
  details: string;
}

export interface ManagedEvent {
  id: string;
  title: string;
  type: string;
  status: string;
  dateFormatted: string;
  timeWAT: string;
  location: string;
  archived: boolean;
}
