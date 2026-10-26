function normalizedId(value: string): string {
  return value.trim().toLowerCase();
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function finalize(key: string): string {
  return key.slice(0, 255);
}

function minuteStamp(value: Date): string {
  return value.toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

function idKey(trigger: string, entityType: string, entityId: string): string {
  return finalize(`${trigger}:${entityType}:${normalizedId(entityId)}`);
}

function userKey(trigger: string, userId: string, suffix = ""): string {
  return finalize(`${trigger}:user:${normalizedId(userId)}${suffix}`);
}

export function welcomeKey(userId: string): string {
  return userKey("welcome", userId);
}

export function signupReceiptKey(userId: string): string {
  return userKey("signup_receipt", userId);
}

export function roleUpgradeKey(params: {
  userId: string;
  role: string;
  occurredAt: Date;
}): string {
  return userKey(
    "role_upgrade",
    params.userId,
    `:role:${slug(params.role)}:${minuteStamp(params.occurredAt)}`,
  );
}

export function roleChangedKey(params: {
  userId: string;
  role: string;
  occurredAt: Date;
}): string {
  return userKey(
    "club_role_changed",
    params.userId,
    `:role:${slug(params.role)}:${minuteStamp(params.occurredAt)}`,
  );
}

export function passwordUpdatedKey(params: {
  userId: string;
  occurredAt: Date;
}): string {
  return userKey(
    "password_updated",
    params.userId,
    `:${minuteStamp(params.occurredAt)}`,
  );
}

export function duesRequestSubmittedKey(params: {
  requestId: string;
  officerEmail: string;
}): string {
  return finalize(
    `dues_request_submitted:req:${normalizedId(params.requestId)}:officer:${slug(params.officerEmail)}`,
  );
}

export function memberSignupAlertKey(params: {
  signupId: string;
  officerEmail: string;
}): string {
  return finalize(
    `member_signup_alert:signup:${slug(params.signupId)}:officer:${slug(params.officerEmail)}`,
  );
}

export function accountSuspendedKey(params: {
  userId: string;
  auditId: string;
}): string {
  return userKey(
    "account_suspended",
    params.userId,
    `:audit:${normalizedId(params.auditId)}`,
  );
}

export function accountReactivatedKey(params: {
  userId: string;
  auditId: string;
}): string {
  return userKey(
    "account_reactivated",
    params.userId,
    `:audit:${normalizedId(params.auditId)}`,
  );
}

export function paymentReceiptSubmittedKey(params: {
  requestId: string;
  userId: string;
}): string {
  return finalize(
    `payment_receipt_submitted:req:${normalizedId(params.requestId)}:user:${normalizedId(params.userId)}`,
  );
}

export function paymentApprovedKey(params: {
  requestId: string;
  userId: string;
}): string {
  return finalize(
    `payment_approved:req:${normalizedId(params.requestId)}:user:${normalizedId(params.userId)}`,
  );
}

export function paymentRejectedKey(params: {
  requestId: string;
  userId: string;
}): string {
  return finalize(
    `payment_rejected:req:${normalizedId(params.requestId)}:user:${normalizedId(params.userId)}`,
  );
}

export function governanceDecisionKey(params: {
  requestId: string;
  status: string;
  userId: string;
}): string {
  return finalize(
    `governance_decision:req:${normalizedId(params.requestId)}:status:${slug(params.status)}:user:${normalizedId(params.userId)}`,
  );
}

const MAX_CHANGE_HASH_LENGTH = 32;

function changeHash(value: string): string {
  return normalizedId(value).slice(0, MAX_CHANGE_HASH_LENGTH);
}

export function meetingCreatedKey(meetingId: string): string {
  return idKey("meeting_created", "meeting", meetingId);
}

export function meetingChangedKey(
  meetingId: string,
  revisionHash: string,
): string {
  return finalize(
    `${meetingCreatedKey(meetingId).replace("_created", "_changed")}:rev:${changeHash(revisionHash)}`,
  );
}

export function meetingCancelledKey(meetingId: string): string {
  return idKey("meeting_cancelled", "meeting", meetingId);
}

export function eventPublishedKey(eventId: string): string {
  return idKey("event_published", "event", eventId);
}

export function eventChangedKey(eventId: string, revisionHash: string): string {
  return finalize(
    `${eventPublishedKey(eventId).replace("_published", "_changed")}:rev:${changeHash(revisionHash)}`,
  );
}

export function eventCancelledKey(eventId: string): string {
  return idKey("event_cancelled", "event", eventId);
}

export function announcementPublishedKey(announcementId: string): string {
  return idKey("announcement_published", "ann", announcementId);
}

export function pollCreatedKey(pollId: string): string {
  return idKey("poll_created", "poll", pollId);
}

export function eventRoleAssignedKey(params: {
  eventId: string;
  userId: string;
  role: string;
}): string {
  return finalize(
    `event_role_assigned:event:${normalizedId(params.eventId)}:user:${normalizedId(params.userId)}:role:${slug(params.role)}`,
  );
}

export function attendanceOpenedKey(eventId: string): string {
  return idKey("event_attendance_opened", "event", eventId);
}

export function broadcastRecipientKey(
  batchGroupKey: string,
  userId: string,
): string {
  return finalize(
    `${normalizedId(batchGroupKey)}:recipient:${normalizedId(userId)}`,
  );
}
