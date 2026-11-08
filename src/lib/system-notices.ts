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
    message: "Event budget and category allocations saved.",
  },
  "category-created": {
    type: "success",
    title: "Category Added",
    message: "Event finance category added.",
  },
  "category-renamed": {
    type: "success",
    title: "Category Renamed",
    message: "Finance category renamed.",
  },
  "category-retired": {
    type: "info",
    title: "Category Retired",
    message: "Finance category retired.",
  },

  // Event Financial Transactions & Ledger
  "transaction-recorded": {
    type: "success",
    title: "Transaction Recorded",
    message: "Event transaction recorded.",
  },
  "transaction-corrected": {
    type: "info",
    title: "Transaction Updated",
    message: "Event transaction updated.",
  },
  "transaction-voided": {
    type: "warning",
    title: "Transaction Voided",
    message: "Event transaction voided.",
  },
  saved: {
    type: "success",
    title: "Saved",
    message: "Record saved.",
  },
  corrected: {
    type: "info",
    title: "Record Updated",
    message: "Record updated.",
  },
  voided: {
    type: "warning",
    title: "Record Voided",
    message: "Record voided.",
  },

  // Ticketing & Sales
  "tier-saved": {
    type: "success",
    title: "Ticket Tier Saved",
    message: "Ticket tier saved.",
  },
  "tier-retired": {
    type: "info",
    title: "Ticket Tier Retired",
    message: "Ticket tier retired.",
  },
  "ticket-recorded": {
    type: "success",
    title: "Ticket Sale Recorded",
    message: "Ticket sale recorded.",
  },
  "ticket-refunded": {
    type: "warning",
    title: "Ticket Refunded",
    message: "Ticket sale refunded.",
  },
  "sale-saved": {
    type: "success",
    title: "Ticket Order Saved",
    message: "Ticket order recorded.",
  },
  "sale-edited": {
    type: "info",
    title: "Ticket Order Updated",
    message: "Ticket order updated.",
  },
  refunded: {
    type: "warning",
    title: "Refund Recorded",
    message: "Refund recorded.",
  },

  // Event Lifecycle
  created: {
    type: "success",
    title: "Event Created",
    message: "Event created successfully.",
  },
  updated: {
    type: "success",
    title: "Event Updated",
    message: "Event details updated.",
  },
  completed: {
    type: "success",
    title: "Event Completed",
    message: "Event marked as completed.",
  },
  cancelled: {
    type: "warning",
    title: "Event Cancelled",
    message: "Event cancelled.",
  },
  reopened: {
    type: "info",
    title: "Event Reopened",
    message: "Event reopened for active planning.",
  },
  archived: {
    type: "info",
    title: "Event Archived",
    message: "Event archived.",
  },

  // Club Finances & Receipts
  "category-saved": {
    type: "success",
    title: "Category Added",
    message: "Financial category added.",
  },
  "receipt-uploaded": {
    type: "success",
    title: "Receipt Attached",
    message: "Receipt attached to the financial record.",
  },
  "receipt-duplicate": {
    type: "error",
    title: "Duplicate Receipt",
    message: "This receipt is already attached to this record.",
  },
  "receipt-invalid": {
    type: "error",
    title: "Invalid Receipt File",
    message: "Please choose a PDF, JPEG, or PNG under 4 MB.",
  },
  "receipt-too-large": {
    type: "error",
    title: "File Too Large",
    message: "Receipt must be under 4 MB.",
  },
  "receipt-failed": {
    type: "error",
    title: "Upload Failed",
    message: "Could not attach receipt. Please try again.",
  },
  "receipt-unavailable": {
    type: "error",
    title: "Storage Unavailable",
    message:
      "Receipt storage is temporarily unavailable. Please try again shortly.",
  },
  "receipt-required": {
    type: "error",
    title: "Receipt Required",
    message: "Please attach your proof of transfer before submitting.",
  },
  "receipt-upload-failed": {
    type: "error",
    title: "Upload Failed",
    message: "Could not save proof of transfer. Check the file and try again.",
  },
  "receipt-storage-unavailable": {
    type: "error",
    title: "Storage Unavailable",
    message: "Receipt storage is temporarily unavailable. Try again later.",
  },

  // Dues Treasury
  "rate-saved": {
    type: "success",
    title: "Dues Rate Saved",
    message: "Monthly dues rate saved for next month.",
  },
  "dues-request-submitted": {
    type: "success",
    title: "Dues Submitted",
    message: "Dues payment submitted for officer review.",
  },
  "dues-request-approved": {
    type: "success",
    title: "Dues Approved",
    message: "Dues payment approved.",
  },
  "dues-request-rejected": {
    type: "error",
    title: "Payment Needs Attention",
    message:
      "Dues payment could not be verified. Please review or contact an officer.",
  },
  "payment-settings-saved": {
    code: "payment-settings-saved",
    type: "success",
    variant: "success",
    title: "Bank Details Saved",
    message: "Club bank details and payment instructions updated.",
  },
  "invalid-payment-settings": {
    code: "invalid-payment-settings",
    type: "error",
    variant: "error",
    title: "Invalid Bank Details",
    message: "Please verify bank name, 10-digit NUBAN, and account name.",
  },
  "opening-balance-recorded": {
    code: "opening-balance-recorded",
    type: "success",
    variant: "success",
    title: "Opening Balance Recorded",
    message: "Opening treasury balance recorded.",
  },
  "historical-dues-reconciled": {
    code: "historical-dues-reconciled",
    type: "success",
    variant: "success",
    title: "Dues Reconciled",
    message: "Historical member dues reconciled.",
  },
  "invalid-reconciliation-months": {
    code: "invalid-reconciliation-months",
    type: "error",
    variant: "error",
    title: "Invalid Months Selected",
    message:
      "Select at least one valid month between January and the current period.",
  },

  // Secretariat Attendance & Minutes
  "minutes-saved": {
    type: "success",
    title: "Minutes Saved",
    message: "Meeting minutes saved and published.",
  },
  "attendance-opened": {
    type: "success",
    title: "Check-in Open",
    message: "Member check-in is now open.",
  },
  "attendance-closed": {
    type: "info",
    title: "Check-in Closed",
    message: "Member check-in has ended.",
  },
  "attendance-corrected": {
    type: "info",
    title: "Attendance Updated",
    message: "Attendance record updated.",
  },
  "checked-in": {
    type: "success",
    title: "Checked In!",
    message: "You're checked in for this meeting.",
  },
  "cutoff-saved": {
    type: "success",
    title: "Check-in Window Set",
    message: "Automatic check-in window saved.",
  },

  // Communications & Polls
  "announcement-created": {
    type: "success",
    title: "Announcement Published",
    message: "Announcement is now live for all members.",
  },
  "announcement-updated": {
    type: "success",
    title: "Announcement Updated",
    message: "Announcement updated.",
  },
  "announcement-read": {
    type: "info",
    title: "Marked as Read",
    message: "Announcement marked as read.",
  },
  "poll-created": {
    type: "success",
    title: "Poll Created",
    message: "Poll is now open for voting.",
  },
  "poll-updated": {
    type: "info",
    title: "Poll Updated",
    message: "Poll details updated.",
  },
  voted: {
    type: "success",
    title: "Vote Recorded",
    message: "Thanks for voting! Your vote has been counted.",
  },
  read: {
    type: "info",
    title: "Notification Read",
    message: "Notification marked as read.",
  },
  unread: {
    type: "info",
    title: "Notification Unread",
    message: "Notification marked as unread.",
  },
  "preference-saved": {
    type: "success",
    title: "Preferences Saved",
    message: "Notification settings updated.",
  },

  // Member Administration
  "member-approved": {
    type: "success",
    title: "Member Approved",
    message: "Membership approved and invitation sent.",
  },
  "member-rejected": {
    type: "info",
    title: "Application Declined",
    message: "Membership application declined.",
  },
  "member-deactivated": {
    type: "warning",
    title: "Member Deactivated",
    message: "Member account deactivated.",
  },
  "member-reactivated": {
    type: "success",
    title: "Member Reactivated",
    message: "Member access restored.",
  },
  "email-confirmation-required": {
    type: "error",
    title: "Email Confirmation Needed",
    message: "Email confirmation is required before approval.",
  },
  "profile-incomplete": {
    type: "error",
    title: "Profile Incomplete",
    message: "Please complete your profile to continue.",
  },
  "confirmation-resent": {
    type: "success",
    title: "Confirmation Sent",
    message: "A new confirmation link was sent to your email.",
  },
  "already-confirmed": {
    type: "info",
    title: "Already Confirmed",
    message: "This email address is already verified.",
  },
  "not-pending": {
    type: "info",
    title: "Already Processed",
    message: "This account is not pending confirmation.",
  },
  "resend-cooldown": {
    type: "warning",
    title: "Please Wait a Moment",
    message:
      "A confirmation email was sent recently. Please wait a minute before requesting another.",
  },
  "confirmation-send-failed": {
    type: "error",
    title: "Email Not Sent",
    message:
      "Could not send confirmation email. Please check the address and try again.",
  },
  "role-updated": {
    type: "success",
    title: "Role Updated",
    message: "Member club role updated.",
  },
  "event-role-assigned": {
    type: "success",
    title: "Event Role Assigned",
    message: "Member assigned to the event team.",
  },
  "event-role-revoked": {
    type: "info",
    title: "Event Role Removed",
    message: "Member removed from the event team.",
  },
  "self-action-denied": {
    type: "error",
    title: "Action Not Allowed",
    message: "You cannot change your own administrative role.",
  },

  // Common Rejections & Errors
  "already-checked-in": {
    type: "info",
    title: "Already Checked In",
    message: "You have already checked in for this meeting.",
  },
  "event-read-only": {
    type: "error",
    title: "Event Is View-Only",
    message: "Archived events cannot be modified.",
  },
  "closed-or-locked": {
    type: "error",
    title: "Event Locked",
    message: "This event is closed and can no longer be modified.",
  },
  "budget-exceeded": {
    type: "error",
    title: "Budget Exceeded",
    message:
      "Allocations exceed the event budget total. Please adjust category amounts.",
  },
  "budget-required": {
    type: "error",
    title: "Budget Required",
    message: "Set the event budget total before assigning category amounts.",
  },
  "already-processed": {
    type: "info",
    title: "Already Processed",
    message: "This item has already been reviewed or refunded.",
  },
  "duplicate-record": {
    type: "error",
    title: "Already Exists",
    message:
      "A record with this name already exists. Please choose a different name.",
  },
  "invalid-state": {
    type: "error",
    title: "Not Available",
    message: "This action is not available for the event's current status.",
  },
  "revoke-club-admin-first": {
    type: "error",
    title: "Remove Admin Role First",
    message:
      "Revoke the Club Admin role on Governance before deactivating this account.",
  },

  // Public box office (guest ticket till)
  "pending-review-blocks-close": {
    type: "error",
    title: "Pending Orders Remain",
    message:
      "Review, reject, or cancel all pending ticket orders before closing this event.",
  },
  "ticket-order-limit-reached": {
    type: "error",
    title: "Order Limit Reached",
    message: "You already have pending ticket orders awaiting review.",
  },
  "box-office-closed": {
    type: "error",
    title: "Ticket Sales Closed",
    message: "Ticket sales have ended for this event.",
  },
  "box-office-at-capacity": {
    type: "error",
    title: "Ticket Desk Busy",
    message:
      "Too many orders are currently awaiting review. Please try again shortly.",
  },
  "lookup-unavailable": {
    type: "error",
    title: "Lookup Unavailable",
    message: "Could not check that order right now. Please try again shortly.",
  },
  denied: {
    type: "error",
    title: "Access Denied",
    message: "You do not have permission to perform this action.",
  },
  "invalid-request": {
    type: "error",
    title: "Check Required Fields",
    message: "Please check the submitted fields and try again.",
  },
  "operation-failed": {
    type: "error",
    title: "Something Went Wrong",
    message: "Could not save your changes. Please try again.",
  },
  configuration: {
    type: "error",
    title: "System Notice",
    message: "This service is temporarily unavailable. Please try again later.",
  },
  "sign-in": {
    type: "warning",
    title: "Sign In Required",
    message: "Please sign in to access this page.",
  },
  "auth-failed": {
    type: "error",
    title: "Sign-In Failed",
    message: "Incorrect email or password. Please try again.",
  },
  "profile-settings-updated": {
    type: "success",
    title: "Profile Saved",
    message: "Profile details updated.",
  },
  "email-update-requested": {
    type: "info",
    title: "Check Your Inbox",
    message:
      "A confirmation link was sent to your new email. Click it to complete the update.",
  },
  "password-change-failed": {
    type: "error",
    title: "Password Error",
    message: "Passwords must be at least 12 characters and match each other.",
  },
  "username-taken": {
    type: "error",
    title: "Username Taken",
    message: "That username is already taken. Please choose another.",
  },
  // /settings renders no notice of its own, so these codes only reach the
  // member through the toast. The wording matches the sign-in screen, which
  // already says the same thing for the same failures.
  "password-updated": {
    type: "success",
    title: "Password Updated",
    message: "Your password was updated.",
  },
  "invalid-profile": {
    type: "error",
    title: "Check Profile Details",
    message:
      "Use a name of at most 120 characters and a username of 3–30 letters, numbers, or underscores.",
  },
  "profile-update-failed": {
    type: "error",
    title: "Could Not Update Profile",
    message:
      "The profile could not be saved. The username may already be in use.",
  },

  // Public Intake & Member Invites
  "membership-request-submitted": {
    type: "success",
    title: "Application Received!",
    message:
      "Thank you for applying! Club officers will review your application shortly.",
  },
  "partnership-enquiry-submitted": {
    type: "success",
    title: "Enquiry Received!",
    message:
      "Thanks for reaching out! A club officer will get in touch with you shortly.",
  },
  "request-already-pending": {
    type: "error",
    title: "Application Already Submitted",
    message: "An application with this email is already awaiting review.",
  },
  "invite-invalid": {
    type: "error",
    title: "Invalid Invitation",
    message: "This invitation link is invalid or has already been used.",
  },
  "invite-expired": {
    type: "error",
    title: "Invitation Expired",
    message:
      "This invitation link has expired. Please submit a new membership request.",
  },
  "invalid-intake": {
    type: "error",
    title: "Incomplete Details",
    message: "Please fill in all required fields before submitting.",
  },
  "membership-approved": {
    type: "success",
    title: "Application Approved",
    message: "Membership application approved and invitation sent.",
  },
  "membership-rejected": {
    type: "success",
    title: "Application Declined",
    message: "Membership application declined.",
  },
  "enquiry-updated": {
    type: "success",
    title: "Enquiry Updated",
    message: "Partnership enquiry status updated.",
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
