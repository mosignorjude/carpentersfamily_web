import type { FlashCardType } from "@/components/ui/flash-card";

export interface SystemNoticeDefinition {
  type: FlashCardType;
  title: string;
  message: string;
  code?: string;
  variant?: FlashCardType;
}

export const SYSTEM_NOTICES: Record<string, SystemNoticeDefinition> = {
  // Event Budget & Categories
  "budget-saved": {
    type: "success",
    title: "Budget Saved",
    message: "The event budget and allocations were saved.",
  },
  "category-created": {
    type: "success",
    title: "Category Created",
    message: "The event finance category was created and logged.",
  },
  "category-renamed": {
    type: "success",
    title: "Category Renamed",
    message: "The event finance category was renamed and logged.",
  },
  "category-retired": {
    type: "info",
    title: "Category Retired",
    message: "The event finance category was retired and logged.",
  },

  // Event Financial Transactions & Ledger
  "transaction-recorded": {
    type: "success",
    title: "Transaction Recorded",
    message: "The event financial transaction was recorded.",
  },
  "transaction-corrected": {
    type: "info",
    title: "Transaction Corrected",
    message: "The event financial transaction was corrected.",
  },
  "transaction-voided": {
    type: "warning",
    title: "Transaction Voided",
    message: "The event financial transaction was voided and retained.",
  },
  saved: {
    type: "success",
    title: "Operation Recorded",
    message: "The record was saved into the institutional ledger.",
  },
  corrected: {
    type: "info",
    title: "Record Corrected",
    message: "The record was corrected and prior values were audited.",
  },
  voided: {
    type: "warning",
    title: "Record Voided",
    message: "The record was voided and retained in the history.",
  },

  // Ticketing & Sales
  "tier-saved": {
    type: "success",
    title: "Ticket Tier Saved",
    message: "The ticket tier was saved.",
  },
  "tier-retired": {
    type: "info",
    title: "Ticket Tier Retired",
    message: "The ticket tier was retired.",
  },
  "ticket-recorded": {
    type: "success",
    title: "Ticket Sale Recorded",
    message: "The ticket sale was recorded.",
  },
  "ticket-refunded": {
    type: "warning",
    title: "Ticket Refunded",
    message: "The ticket sale was marked refunded.",
  },
  "sale-saved": {
    type: "success",
    title: "Ticket Sale Recorded",
    message: "The ticket sale was recorded.",
  },
  "sale-edited": {
    type: "info",
    title: "Ticket Sale Updated",
    message: "The ticket sale was updated.",
  },
  refunded: {
    type: "warning",
    title: "Ticket Refunded",
    message: "The ticket sale was marked refunded.",
  },

  // Event Lifecycle
  created: {
    type: "success",
    title: "Event Created",
    message: "The event was created.",
  },
  updated: {
    type: "success",
    title: "Event Updated",
    message: "The event details were updated.",
  },
  completed: {
    type: "success",
    title: "Event Completed",
    message: "The event was marked completed.",
  },
  cancelled: {
    type: "warning",
    title: "Event Cancelled",
    message: "The event was cancelled.",
  },
  reopened: {
    type: "info",
    title: "Event Reopened",
    message: "The event was reopened.",
  },
  archived: {
    type: "info",
    title: "Event Archived",
    message: "The event was moved to retained archive.",
  },

  // Club Finances & Receipts
  "category-saved": {
    type: "success",
    title: "Category Added",
    message: "The category was added.",
  },
  "receipt-uploaded": {
    type: "success",
    title: "Receipt Attached",
    message: "The receipt was securely attached to the financial record.",
  },
  "receipt-duplicate": {
    type: "error",
    title: "Duplicate Receipt",
    message: "That receipt is already attached to this financial record.",
  },
  "receipt-invalid": {
    type: "error",
    title: "Invalid Receipt",
    message: "Choose a valid PDF, JPEG, or PNG receipt under 4 MiB.",
  },
  "receipt-too-large": {
    type: "error",
    title: "Receipt Too Large",
    message: "The receipt upload is too large.",
  },
  "receipt-failed": {
    type: "error",
    title: "Upload Failed",
    message: "The receipt could not be attached. Try again later.",
  },
  "receipt-unavailable": {
    type: "error",
    title: "Storage Unavailable",
    message: "Receipt storage is not configured or is temporarily unavailable.",
  },

  // Dues Treasury
  "rate-saved": {
    type: "success",
    title: "Rate Saved",
    message: "The next-month dues rate was saved.",
  },
  "dues-request-submitted": {
    type: "success",
    title: "Dues Submitted",
    message:
      "Your dues payment submission has been received and queued for officer review.",
  },
  "dues-request-approved": {
    type: "success",
    title: "Dues Approved",
    message:
      "The dues payment submission was verified and approved into the club ledger.",
  },
  "dues-request-rejected": {
    type: "error",
    title: "Dues Rejected",
    message: "The dues payment submission was rejected.",
  },
  "payment-settings-saved": {
    code: "payment-settings-saved",
    type: "success",
    variant: "success",
    title: "Payment Settings Saved",
    message: "Club bank payment settings updated successfully.",
  },
  "invalid-payment-settings": {
    code: "invalid-payment-settings",
    type: "error",
    variant: "error",
    title: "Invalid Payment Settings",
    message:
      "Invalid club bank details provided. Verify bank name, 10-digit NUBAN, and account name.",
  },
  "opening-balance-recorded": {
    code: "opening-balance-recorded",
    type: "success",
    variant: "success",
    title: "Opening Balance Recorded",
    message: "Verified opening treasury reserve balance recorded successfully.",
  },
  "historical-dues-reconciled": {
    code: "historical-dues-reconciled",
    type: "success",
    variant: "success",
    title: "Historical Dues Reconciled",
    message: "Historical member dues reconciled and cleared.",
  },
  "invalid-reconciliation-months": {
    code: "invalid-reconciliation-months",
    type: "error",
    variant: "error",
    title: "Invalid Reconciliation Months",
    message:
      "Invalid reconciliation months provided. Only Feb–Sep 2026 are permitted.",
  },

  // Secretariat Attendance & Minutes
  "minutes-saved": {
    type: "success",
    title: "Minutes Saved",
    message:
      "Meeting minutes were saved and recorded in the Secretariat archive.",
  },
  "attendance-opened": {
    type: "success",
    title: "Check-in Open",
    message: "Attendance check-in is now open.",
  },
  "attendance-closed": {
    type: "info",
    title: "Check-in Closed",
    message: "Attendance is closed and missing members were marked absent.",
  },
  "attendance-corrected": {
    type: "info",
    title: "Attendance Corrected",
    message: "The attendance record was corrected and audited.",
  },
  "checked-in": {
    type: "success",
    title: "Checked In",
    message: "Your attendance was recorded.",
  },
  "cutoff-saved": {
    type: "success",
    title: "Cutoff Saved",
    message: "The club-wide late cutoff was updated.",
  },

  // Communications & Polls
  "announcement-created": {
    type: "success",
    title: "Announcement Published",
    message: "The announcement is now visible to active members.",
  },
  "announcement-updated": {
    type: "success",
    title: "Announcement Updated",
    message: "The announcement edit and its reason were saved.",
  },
  "announcement-read": {
    type: "info",
    title: "Marked as Read",
    message: "The announcement was marked as read.",
  },
  "poll-created": {
    type: "success",
    title: "Poll Created",
    message: "The poll is open for voting.",
  },
  "poll-updated": {
    type: "info",
    title: "Poll Updated",
    message: "The poll edit and its reason were saved.",
  },
  voted: {
    type: "success",
    title: "Vote Recorded",
    message: "Your final vote was recorded.",
  },
  read: {
    type: "info",
    title: "Notification Read",
    message: "Your private read marker was saved.",
  },
  unread: {
    type: "info",
    title: "Notification Unread",
    message: "The notification was marked unread.",
  },
  "preference-saved": {
    type: "success",
    title: "Preferences Saved",
    message: "Your notification preferences were saved.",
  },

  // Member Administration
  "member-approved": {
    type: "success",
    title: "Member Approved",
    message:
      "The membership request was approved and member access is now enabled.",
  },
  "member-rejected": {
    type: "info",
    title: "Request Declined",
    message: "The membership request was declined and the decision was logged.",
  },
  "member-deactivated": {
    type: "warning",
    title: "Member Deactivated",
    message: "The member's access was deactivated. Their history is retained.",
  },
  "member-reactivated": {
    type: "success",
    title: "Member Reactivated",
    message: "The member's access was restored.",
  },
  "role-updated": {
    type: "success",
    title: "Club Role Updated",
    message: "The club role change was saved and logged.",
  },
  "event-role-assigned": {
    type: "success",
    title: "Event Role Assigned",
    message: "The event role was assigned and logged.",
  },
  "event-role-revoked": {
    type: "info",
    title: "Event Role Revoked",
    message: "The event role was revoked and logged.",
  },
  "self-action-denied": {
    type: "error",
    title: "Not Allowed on Your Own Account",
    message:
      "For accountability, another authorized officer must perform this action on your account.",
  },

  // Common Rejections & Errors
  "already-checked-in": {
    type: "info",
    title: "Already Checked In",
    message: "Your attendance for this event was already recorded.",
  },
  "event-read-only": {
    type: "error",
    title: "Event Is Read-Only",
    message:
      "Archived events and their records are retained as read-only history.",
  },
  "closed-or-locked": {
    type: "error",
    title: "No Longer Open",
    message:
      "This session or poll is closed or locked, so it can no longer be changed.",
  },
  "budget-exceeded": {
    type: "error",
    title: "Budget Limit Reached",
    message:
      "The amounts don't fit the event budget. Check that allocations add up to the budget total and stay within limits.",
  },
  "budget-required": {
    type: "error",
    title: "Budget Required",
    message: "Set the event budget total before adding allocation categories.",
  },
  "already-processed": {
    type: "info",
    title: "Already Processed",
    message:
      "This item was already reviewed or refunded. Refresh to see its current status.",
  },
  "duplicate-record": {
    type: "error",
    title: "Already Exists",
    message:
      "A matching record already exists. Use a different name or review the existing entry.",
  },
  "invalid-state": {
    type: "error",
    title: "Not Available Right Now",
    message:
      "This action isn't allowed for the record's current status (for example, a completed or cancelled event).",
  },
  denied: {
    type: "error",
    title: "Access Denied",
    message: "You are not authorized to perform that action.",
  },
  "invalid-request": {
    type: "error",
    title: "Invalid Request",
    message: "Check the submitted fields and try again.",
  },
  "operation-failed": {
    type: "error",
    title: "Action Failed",
    message:
      "The requested change could not be saved. Check input requirements and permissions.",
  },
  configuration: {
    type: "error",
    title: "Configuration Error",
    message: "Authentication or storage is not configured in this environment.",
  },
  "sign-in": {
    type: "warning",
    title: "Sign In Required",
    message: "Please sign in with your verified member credentials.",
  },
  "auth-failed": {
    type: "error",
    title: "Authentication Failed",
    message: "Sign in could not be completed. Check your credentials.",
  },
};

/**
 * Safely look up a system notice by key, protecting against prototype pollution.
 */
export function getSystemNotice(key: string): SystemNoticeDefinition | null {
  if (typeof key !== "string" || !Object.hasOwn(SYSTEM_NOTICES, key)) {
    return null;
  }
  return SYSTEM_NOTICES[key];
}
