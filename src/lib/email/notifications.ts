import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCoveredMonthsDisplay } from "@/lib/dues-governance.mjs";
import type { NotificationCategory } from "@/lib/email/templates/club-notification-email";
import {
  accountReactivatedKey,
  accountSuspendedKey,
  announcementPublishedKey,
  attendanceOpenedKey,
  duesRequestSubmittedKey,
  eventCancelledKey,
  eventChangedKey,
  eventPublishedKey,
  eventRoleAssignedKey,
  governanceDecisionKey,
  meetingCancelledKey,
  meetingChangedKey,
  meetingCreatedKey,
  memberSignupAlertKey,
  passwordUpdatedKey,
  paymentApprovedKey,
  paymentReceiptSubmittedKey,
  paymentRejectedKey,
  pollCreatedKey,
  roleChangedKey,
  roleUpgradeKey,
  signupReceiptKey,
  welcomeKey,
} from "@/lib/notifications/idempotency";
import {
  type EnqueueBroadcastInput,
  enqueueNotificationBroadcast,
  enqueueNotificationEmail,
  type NotificationContact,
  resolveMemberContact,
  resolveOfficerContacts,
} from "@/lib/notifications/outbox-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatNgn(amount: number): string {
  return nairaFormatter.format(amount);
}

function formatSchedule(isoString: string, timezone = "Africa/Lagos"): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  try {
    return `${new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)} WAT`;
  } catch {
    return isoString;
  }
}

function formatPaymentMethod(method: string): string {
  const labels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    paystack: "Paystack",
    pos: "POS Terminal",
    cash: "Cash",
    other: "Other",
  };
  return labels[method] ?? method;
}

function formatRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Admin",
    backup_admin: "Backup Admin",
    executive: "Executive",
    member: "Member",
    lead: "Event Lead",
    assistant: "Event Assistant",
    committee: "Committee Member",
  };
  return labels[role] ?? role;
}

function portalPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

interface NotificationCopy {
  previewText: string;
  greeting?: string;
  intro: string;
  detailsTitle?: string;
  details?: { label: string; value: string }[];
  bodyLabel?: string;
  bodyText?: string | null;
  footerNote?: string;
  category: NotificationCategory;
}

function templatePayload(copy: NotificationCopy): Record<string, unknown> {
  return {
    previewText: copy.previewText,
    ...(copy.greeting ? { greeting: copy.greeting } : {}),
    intro: copy.intro,
    ...(copy.detailsTitle ? { detailsTitle: copy.detailsTitle } : {}),
    ...(copy.details?.length ? { details: copy.details } : {}),
    ...(copy.bodyLabel ? { bodyLabel: copy.bodyLabel } : {}),
    ...(copy.bodyText ? { bodyText: copy.bodyText } : {}),
    ...(copy.footerNote ? { footerNote: copy.footerNote } : {}),
    category: copy.category,
  };
}

async function queueSingle(params: {
  idempotencyKey: string;
  triggerType: string;
  contact: NotificationContact;
  subject: string;
  heading: string;
  copy: NotificationCopy;
  ctaLabel?: string;
  ctaPath?: string;
  batchGroupKey?: string;
}): Promise<void> {
  await enqueueNotificationEmail({
    idempotencyKey: params.idempotencyKey,
    triggerType: params.triggerType,
    recipientUserId: params.contact.userId,
    recipientEmail: params.contact.email,
    recipientName: params.contact.name,
    subject: params.subject,
    heading: params.heading,
    bodyText: params.copy.intro,
    ctaLabel: params.ctaLabel ?? null,
    ctaUrl: params.ctaPath ? portalPath(params.ctaPath) : null,
    batchGroupKey: params.batchGroupKey ?? null,
    templatePayload: templatePayload(params.copy),
  });
}

async function queueBroadcast(params: {
  batchGroupKey: string;
  triggerType: string;
  subject: string;
  heading: string;
  copy: NotificationCopy;
  ctaLabel?: string;
  ctaPath?: string;
}): Promise<void> {
  const input: EnqueueBroadcastInput = {
    batchGroupKey: params.batchGroupKey,
    triggerType: params.triggerType,
    subject: params.subject,
    heading: params.heading,
    bodyText: params.copy.intro,
    ctaLabel: params.ctaLabel ?? null,
    ctaUrl: params.ctaPath ? portalPath(params.ctaPath) : null,
    templatePayload: templatePayload(params.copy),
  };
  await enqueueNotificationBroadcast(input);
}

async function resolveLatestAuditId(
  memberId: string,
  action: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data } = await admin
      .from("audit_log")
      .select("id")
      .eq("target_member_id", memberId)
      .eq("action", action)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return typeof data?.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}

function fallbackAuditStamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

async function queueWelcome(params: {
  contact: NotificationContact;
  memberId: string;
}): Promise<void> {
  await queueSingle({
    idempotencyKey: welcomeKey(params.memberId),
    triggerType: "welcome",
    contact: params.contact,
    subject: "Welcome to Carpenters Family — Membership Approved",
    heading: "Membership Approved",
    ctaLabel: "Open Member Portal",
    ctaPath: "/",
    copy: {
      previewText: "Your Carpenters Family membership has been approved.",
      greeting: `Hello ${params.contact.name},`,
      intro:
        "Welcome aboard! Your Carpenters Family Social Club membership has been approved. You now have full access to the member portal, events, announcements, and dues records.",
      detailsTitle: "Membership",
      details: [{ label: "Current Status", value: "Active Member" }],
      category: "membership",
    },
  });
}

// ============================================================================
// 1. ACCOUNT & MEMBER LIFECYCLE
// ============================================================================

export async function notifyNewMemberSignUp(params: {
  email: string;
  fullName: string;
  username: string;
  userId?: string | null;
}): Promise<void> {
  try {
    const officers = await resolveOfficerContacts();

    await Promise.allSettled(
      officers.map((officer) =>
        queueSingle({
          idempotencyKey: memberSignupAlertKey({
            signupId: params.userId ?? params.email,
            officerEmail: officer.email,
          }),
          triggerType: "member_signup_alert",
          contact: officer,
          subject: `New Member Sign-Up Request — ${params.fullName}`,
          heading: "New Membership Request Pending Review",
          ctaLabel: "Review Member Requests",
          ctaPath: "/admin/members",
          copy: {
            previewText: `${params.fullName} (@${params.username}) requested a Carpenters Family account.`,
            intro:
              "A new prospective member has registered on the Carpenters Family portal and is awaiting officer verification and approval.",
            detailsTitle: "Applicant Details",
            details: [
              { label: "Full Name", value: params.fullName },
              { label: "Username", value: `@${params.username}` },
              { label: "Email Address", value: params.email },
              { label: "Initial Status", value: "Pending Officer Approval" },
            ],
            category: "membership",
          },
        }),
      ),
    );

    if (params.userId) {
      await queueSingle({
        idempotencyKey: signupReceiptKey(params.userId),
        triggerType: "signup_receipt",
        contact: {
          email: params.email.toLowerCase(),
          userId: params.userId,
          name: params.fullName,
        },
        subject: "Welcome to Carpenters Family — Registration Received",
        heading: "Your Registration Request Was Received",
        ctaLabel: "Visit Member Portal",
        ctaPath: "/",
        copy: {
          previewText:
            "We received your Carpenters Family registration request.",
          greeting: `Hello ${params.fullName},`,
          intro:
            "Thank you for registering with the Carpenters Family Social Club portal. Once you confirm your email address, our club executives will review and activate your membership.",
          detailsTitle: "Registration Summary",
          details: [
            { label: "Full Name", value: params.fullName },
            { label: "Username", value: `@${params.username}` },
            { label: "Status", value: "Pending Approval" },
          ],
          category: "membership",
        },
      });
    }
  } catch (err) {
    console.error("[Email Service] notifyNewMemberSignUp failed:", err);
  }
}

export async function notifyWelcomeIfActive(userId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return;
    const { data: profile } = await admin
      .from("member_profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.status !== "active") return;

    const contact = await resolveMemberContact(admin, userId);
    if (!contact) return;
    await queueWelcome({ contact, memberId: userId });
  } catch (err) {
    console.error("[Email Service] notifyWelcomeIfActive failed:", err);
  }
}

export async function notifyMemberLifecycleChanged(params: {
  supabase: SupabaseClient;
  memberId: string;
  operation: "approve" | "reject" | "deactivate" | "reactivate";
  reason: string;
}): Promise<void> {
  try {
    const contact = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!contact) return;

    if (params.operation === "approve") {
      await queueWelcome({ contact, memberId: params.memberId });
      return;
    }

    if (params.operation === "reject") {
      await queueSingle({
        idempotencyKey: governanceDecisionKey({
          requestId: params.memberId,
          status: "rejected",
          userId: params.memberId,
        }),
        triggerType: "governance_decision",
        contact,
        subject: "Update on Your Carpenters Family Membership Request",
        heading: "Membership Request Not Approved",
        ctaLabel: "Open Member Portal",
        ctaPath: "/",
        copy: {
          previewText:
            "Club leadership reviewed your Carpenters Family membership request.",
          greeting: `Hello ${contact.name},`,
          intro:
            "Your membership request for the Carpenters Family Social Club portal was reviewed by club leadership and could not be approved at this time.",
          detailsTitle: "Status Details",
          details: [{ label: "Current Status", value: "Request Declined" }],
          bodyLabel: "Leadership Note",
          bodyText: params.reason,
          category: "membership",
        },
      });
      return;
    }

    const suspended = params.operation === "deactivate";
    const auditId =
      (await resolveLatestAuditId(
        params.memberId,
        suspended ? "member_deactivated" : "member_reactivated",
      )) ?? fallbackAuditStamp();

    await queueSingle({
      idempotencyKey: suspended
        ? accountSuspendedKey({ userId: params.memberId, auditId })
        : accountReactivatedKey({ userId: params.memberId, auditId }),
      triggerType: suspended ? "account_suspended" : "account_reactivated",
      contact,
      subject: suspended
        ? "Carpenters Family Account Status Update"
        : "Your Carpenters Family Account Has Been Reactivated",
      heading: suspended
        ? "Membership Account Deactivated"
        : "Membership Account Reactivated",
      ctaLabel: "Open Member Portal",
      ctaPath: "/",
      copy: {
        previewText: suspended
          ? "Your Carpenters Family portal account has been deactivated."
          : "Your Carpenters Family portal account has been reactivated.",
        greeting: `Hello ${contact.name},`,
        intro: suspended
          ? "Your Carpenters Family Social Club portal account has been deactivated by club administration. Contact club leadership if you believe this is an error."
          : "Your Carpenters Family Social Club portal account has been reactivated. You can now sign in and access club resources again.",
        detailsTitle: "Status Details",
        details: [
          {
            label: "Current Status",
            value: suspended ? "Deactivated" : "Active Member",
          },
        ],
        bodyLabel: "Leadership Note",
        bodyText: params.reason,
        category: "account_security",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyMemberLifecycleChanged failed:", err);
  }
}

export async function notifyClubRoleChanged(params: {
  supabase: SupabaseClient;
  memberId: string;
  role: string;
  operation: "grant" | "revoke" | "set";
  reason: string;
  upgraded?: boolean;
}): Promise<void> {
  try {
    const contact = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!contact) return;

    const roleLabel = formatRoleLabel(params.role);
    const upgraded =
      params.upgraded ??
      (params.operation === "grant" ||
        (params.operation === "set" && params.role !== "member"));
    const occurredAt = new Date();
    const actionDescription =
      params.operation === "revoke"
        ? `Your ${roleLabel} role assignment has been revoked.`
        : `Your club governance role has been updated to ${roleLabel}.`;

    await queueSingle({
      idempotencyKey: upgraded
        ? roleUpgradeKey({
            userId: params.memberId,
            role: params.role,
            occurredAt,
          })
        : roleChangedKey({
            userId: params.memberId,
            role: params.role,
            occurredAt,
          }),
      triggerType: upgraded ? "role_upgrade" : "club_role_changed",
      contact,
      subject: `Carpenters Family — Club Role Updated (${roleLabel})`,
      heading: "Your Club Role Was Updated",
      ctaLabel: "Open Member Portal",
      ctaPath: "/",
      copy: {
        previewText: actionDescription,
        greeting: `Hello ${contact.name},`,
        intro: actionDescription,
        detailsTitle: "Role Assignment",
        details: [
          {
            label: "Updated Role",
            value: params.operation === "revoke" ? "Member" : roleLabel,
          },
        ],
        bodyLabel: "Recorded Reason",
        bodyText: params.reason,
        category: "governance",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyClubRoleChanged failed:", err);
  }
}

export async function notifyPasswordUpdated(params: {
  email?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    if (!params.email?.includes("@") || !params.userId) return;

    await queueSingle({
      idempotencyKey: passwordUpdatedKey({
        userId: params.userId,
        occurredAt: new Date(),
      }),
      triggerType: "password_updated",
      contact: {
        email: params.email.toLowerCase(),
        userId: params.userId,
        name: "Club Member",
      },
      subject: "Carpenters Family — Password Updated",
      heading: "Your Password Was Updated",
      ctaLabel: "Sign In to Portal",
      ctaPath: "/",
      copy: {
        previewText:
          "Your Carpenters Family portal password was recently updated.",
        intro:
          "This is a security confirmation that the password for your Carpenters Family Social Club account was just changed. If you did not make this change, please contact club leadership immediately.",
        detailsTitle: "Security Event",
        details: [
          { label: "Account", value: params.email },
          { label: "Time", value: formatSchedule(new Date().toISOString()) },
        ],
        category: "account_security",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyPasswordUpdated failed:", err);
  }
}

// ============================================================================
// 2. DUES & CLUB FINANCES
// ============================================================================

export async function notifyDuesPaymentRequestSubmitted(params: {
  supabase: SupabaseClient;
  actorId: string;
  requestId: string;
  amountNgn: number;
  coveredMonths: string[];
  paymentMethod: string;
  notes?: string | null;
}): Promise<void> {
  try {
    const [member, officers] = await Promise.all([
      resolveMemberContact(params.supabase, params.actorId),
      resolveOfficerContacts(params.supabase),
    ]);

    if (member) {
      await queueSingle({
        idempotencyKey: paymentReceiptSubmittedKey({
          requestId: params.requestId,
          userId: params.actorId,
        }),
        triggerType: "payment_receipt_submitted",
        contact: member,
        subject: `Dues Payment Request Received (${formatNgn(params.amountNgn)})`,
        heading: "Your Dues Payment Request Was Received",
        ctaLabel: "View Your Dues Ledger",
        ctaPath: "/dues",
        copy: {
          previewText:
            "Your dues payment receipt was uploaded and is awaiting officer verification.",
          greeting: `Hello ${member.name},`,
          intro:
            "Your submitted dues payment request and receipt have been received. A finance officer will verify the payment and update your membership ledger.",
          detailsTitle: "Submission Summary",
          details: [
            { label: "Amount", value: formatNgn(params.amountNgn) },
            {
              label: "Covered Months",
              value: formatCoveredMonthsDisplay(params.coveredMonths),
            },
            {
              label: "Payment Channel",
              value: formatPaymentMethod(params.paymentMethod),
            },
          ],
          category: "dues",
        },
      });
    }

    await Promise.allSettled(
      officers
        .filter((officer) => officer.userId !== params.actorId)
        .map((officer) =>
          queueSingle({
            idempotencyKey: duesRequestSubmittedKey({
              requestId: params.requestId,
              officerEmail: officer.email,
            }),
            triggerType: "dues_request_submitted",
            contact: officer,
            subject: `Dues Payment Request — ${member?.name ?? "Member"} (${formatNgn(params.amountNgn)})`,
            heading: "New Dues Payment Request Submitted",
            ctaLabel: "Review Dues Requests",
            ctaPath: "/dues",
            copy: {
              previewText: `${member?.name ?? "A member"} submitted a dues payment request of ${formatNgn(params.amountNgn)}.`,
              intro: `${member?.name ?? "A member"} has submitted a statutory dues payment request for officer verification.`,
              detailsTitle: "Payment Submission Details",
              details: [
                { label: "Member", value: member?.name ?? "Club Member" },
                { label: "Amount", value: formatNgn(params.amountNgn) },
                {
                  label: "Covered Months",
                  value: formatCoveredMonthsDisplay(params.coveredMonths),
                },
                {
                  label: "Payment Channel",
                  value: formatPaymentMethod(params.paymentMethod),
                },
              ],
              bodyLabel: params.notes ? "Member Notes" : undefined,
              bodyText: params.notes ?? null,
              category: "dues",
            },
          }),
        ),
    );
  } catch (err) {
    console.error(
      "[Email Service] notifyDuesPaymentRequestSubmitted failed:",
      err,
    );
  }
}

export async function notifyDuesPaymentConfirmed(params: {
  supabase: SupabaseClient;
  memberId: string;
  requestId: string;
  amountNgn: number;
  coveredMonths: string[];
  paymentDate?: string;
  paymentMethod?: string;
  paymentReference?: string;
}): Promise<void> {
  try {
    const contact = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!contact) return;

    const details = [
      { label: "Amount Confirmed", value: formatNgn(params.amountNgn) },
      {
        label: "Covered Months",
        value: formatCoveredMonthsDisplay(params.coveredMonths),
      },
    ];
    if (params.paymentDate) {
      details.push({ label: "Payment Date", value: params.paymentDate });
    }
    if (params.paymentMethod) {
      details.push({
        label: "Payment Channel",
        value: formatPaymentMethod(params.paymentMethod),
      });
    }
    if (params.paymentReference) {
      details.push({ label: "Reference", value: params.paymentReference });
    }

    await queueSingle({
      idempotencyKey: paymentApprovedKey({
        requestId: params.requestId,
        userId: params.memberId,
      }),
      triggerType: "payment_approved",
      contact,
      subject: `Carpenters Family — Dues Payment Confirmed (${formatNgn(params.amountNgn)})`,
      heading: "Your Dues Payment Has Been Recorded",
      ctaLabel: "View Your Dues Ledger",
      ctaPath: "/dues",
      copy: {
        previewText: `Your dues payment of ${formatNgn(params.amountNgn)} has been confirmed.`,
        greeting: `Hello ${contact.name},`,
        intro:
          "Your statutory club dues payment has been verified and recorded on your Carpenters Family membership ledger.",
        detailsTitle: "Payment Receipt Summary",
        details,
        category: "dues",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyDuesPaymentConfirmed failed:", err);
  }
}

export async function notifyDuesPaymentRequestRejected(params: {
  supabase: SupabaseClient;
  memberId: string;
  requestId: string;
  amountNgn: number;
  coveredMonths: string[];
  paymentMethod?: string;
  paymentReference?: string | null;
  reason: string;
}): Promise<void> {
  try {
    const contact = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!contact) return;

    const details = [
      { label: "Amount", value: formatNgn(params.amountNgn) },
      {
        label: "Covered Months",
        value: formatCoveredMonthsDisplay(params.coveredMonths),
      },
    ];
    if (params.paymentMethod) {
      details.push({
        label: "Payment Channel",
        value: formatPaymentMethod(params.paymentMethod),
      });
    }
    if (params.paymentReference) {
      details.push({ label: "Reference", value: params.paymentReference });
    }

    await queueSingle({
      idempotencyKey: paymentRejectedKey({
        requestId: params.requestId,
        userId: params.memberId,
      }),
      triggerType: "payment_rejected",
      contact,
      subject: "Carpenters Family — Update on Your Dues Payment Request",
      heading: "Dues Payment Request Declined",
      ctaLabel: "Open Dues Page",
      ctaPath: "/dues",
      copy: {
        previewText:
          "Your dues payment submission requires attention before it can be approved.",
        greeting: `Hello ${contact.name},`,
        intro:
          "Your submitted dues payment request could not be verified as submitted. Please review the officer note below and submit a corrected request if needed.",
        detailsTitle: "Submission Details",
        details,
        bodyLabel: "Reason from Finance Officer",
        bodyText: params.reason,
        category: "dues",
      },
    });
  } catch (err) {
    console.error(
      "[Email Service] notifyDuesPaymentRequestRejected failed:",
      err,
    );
  }
}

// ============================================================================
// 3. EVENTS, MEETINGS, COMMITTEE ROLES & ATTENDANCE
// ============================================================================

function isMeetingType(eventType: string): boolean {
  return eventType === "meeting";
}

export async function notifyNewEventScheduled(params: {
  eventId: string;
  title: string;
  eventType: string;
  startsAt: string;
  location: string;
  description?: string | null;
  timezone?: string;
}): Promise<void> {
  try {
    const meeting = isMeetingType(params.eventType);
    const groupKey = meeting
      ? meetingCreatedKey(params.eventId)
      : eventPublishedKey(params.eventId);
    const typeLabel =
      params.eventType.charAt(0).toUpperCase() + params.eventType.slice(1);
    const schedule = formatSchedule(
      params.startsAt,
      params.timezone ?? "Africa/Lagos",
    );

    await queueBroadcast({
      batchGroupKey: groupKey,
      triggerType: meeting ? "meeting_created" : "event_published",
      subject: meeting
        ? `Club Meeting: ${params.title}`
        : `New Club Event: ${params.title}`,
      heading: params.title,
      ctaLabel: "View Club Events",
      ctaPath: "/events",
      copy: {
        previewText: `${params.title} has been scheduled for ${schedule}.`,
        intro: meeting
          ? "A new Carpenters Family club meeting has been scheduled. Please review the details and plan to attend."
          : "A new Carpenters Family Social Club event has been scheduled. Mark your calendar and review the event details below.",
        detailsTitle: meeting ? "Meeting Details" : "Event Details",
        details: [
          { label: "Type", value: meeting ? "Club Meeting" : typeLabel },
          { label: "Date & Time", value: schedule },
          { label: "Location", value: params.location },
        ],
        bodyLabel: params.description
          ? meeting
            ? "Agenda"
            : "Description"
          : undefined,
        bodyText: params.description ?? null,
        category: meeting ? "meeting" : "event",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyNewEventScheduled failed:", err);
  }
}

export async function notifyEventChanged(params: {
  eventId: string;
  title: string;
  eventType: string;
  startsAt: string;
  location: string;
  timezone?: string;
  changeHash: string;
  changeSummary: string;
}): Promise<void> {
  try {
    const meeting = isMeetingType(params.eventType);
    const groupKey = meeting
      ? meetingChangedKey(params.eventId, params.changeHash)
      : eventChangedKey(params.eventId, params.changeHash);
    const schedule = formatSchedule(
      params.startsAt,
      params.timezone ?? "Africa/Lagos",
    );

    await queueBroadcast({
      batchGroupKey: groupKey,
      triggerType: meeting ? "meeting_changed" : "event_changed",
      subject: meeting
        ? `Meeting Updated: ${params.title}`
        : `Event Updated: ${params.title}`,
      heading: meeting
        ? `${params.title} — Meeting Updated`
        : `${params.title} — Event Updated`,
      ctaLabel: "View Updated Schedule",
      ctaPath: "/events",
      copy: {
        previewText: `${params.title} has been updated. ${params.changeSummary}`,
        intro: meeting
          ? "The schedule for this Carpenters Family club meeting has changed. Please review the updated details below."
          : "The schedule for this Carpenters Family event has changed. Please review the updated details below.",
        detailsTitle: "Updated Details",
        details: [
          { label: "Date & Time", value: schedule },
          { label: "Location", value: params.location },
        ],
        bodyLabel: "What Changed",
        bodyText: params.changeSummary,
        category: meeting ? "meeting" : "event",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyEventChanged failed:", err);
  }
}

export async function notifyEventCancelled(params: {
  eventId: string;
  title: string;
  eventType: string;
  startsAt: string;
  location: string;
  reason: string;
}): Promise<void> {
  try {
    const meeting = isMeetingType(params.eventType);
    const groupKey = meeting
      ? meetingCancelledKey(params.eventId)
      : eventCancelledKey(params.eventId);

    await queueBroadcast({
      batchGroupKey: groupKey,
      triggerType: meeting ? "meeting_cancelled" : "event_cancelled",
      subject: meeting
        ? `Meeting Cancelled: ${params.title}`
        : `Event Cancelled: ${params.title}`,
      heading: meeting
        ? `${params.title} — Meeting Cancelled`
        : `${params.title} — Event Cancelled`,
      ctaLabel: "View Club Events",
      ctaPath: "/events",
      copy: {
        previewText: `${params.title} has been cancelled.`,
        intro: meeting
          ? "This Carpenters Family club meeting has been cancelled. Any remaining reminders have been stopped."
          : "This Carpenters Family event has been cancelled. Any remaining reminders have been stopped.",
        detailsTitle: "Cancelled Schedule",
        details: [
          {
            label: "Original Date",
            value: formatSchedule(params.startsAt),
          },
          { label: "Location", value: params.location },
        ],
        bodyLabel: "Reason",
        bodyText: params.reason,
        category: meeting ? "meeting" : "event",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyEventCancelled failed:", err);
  }
}

export async function notifyEventRoleAssigned(params: {
  supabase: SupabaseClient;
  eventId: string;
  memberId: string;
  role: string;
  reason: string;
}): Promise<void> {
  try {
    const [contact, { data: eventRow }] = await Promise.all([
      resolveMemberContact(params.supabase, params.memberId),
      params.supabase
        .from("events")
        .select("title, starts_at, location")
        .eq("id", params.eventId)
        .maybeSingle(),
    ]);
    if (!contact) return;

    const eventTitle = eventRow?.title ?? "Club Event";
    const roleLabel = formatRoleLabel(params.role);
    const details = [
      { label: "Event", value: eventTitle },
      { label: "Assigned Role", value: roleLabel },
    ];
    if (eventRow?.starts_at) {
      details.push({
        label: "Event Date",
        value: formatSchedule(eventRow.starts_at),
      });
    }
    if (eventRow?.location) {
      details.push({ label: "Location", value: eventRow.location });
    }

    await queueSingle({
      idempotencyKey: eventRoleAssignedKey({
        eventId: params.eventId,
        userId: params.memberId,
        role: params.role,
      }),
      triggerType: "event_role_assigned",
      contact,
      subject: `Event Role Assigned: ${roleLabel} — ${eventTitle}`,
      heading: `You Are Assigned as ${roleLabel}`,
      ctaLabel: "Open Event Dashboard",
      ctaPath: `/events/${params.eventId}/dashboard`,
      copy: {
        previewText: `You have been assigned as ${roleLabel} for ${eventTitle}.`,
        greeting: `Hello ${contact.name},`,
        intro: `You have been appointed as ${roleLabel} for the upcoming club event "${eventTitle}".`,
        detailsTitle: "Assignment Details",
        details,
        bodyLabel: "Assignment Note",
        bodyText: params.reason,
        category: "governance",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyEventRoleAssigned failed:", err);
  }
}

export async function notifyEventAttendanceOpened(params: {
  supabase: SupabaseClient;
  eventId: string;
  cutoffMinutes?: number | null;
}): Promise<void> {
  try {
    const { data: eventRow } = await params.supabase
      .from("events")
      .select("title, location")
      .eq("id", params.eventId)
      .maybeSingle();

    const eventTitle = eventRow?.title ?? "Club Event";
    const details = [{ label: "Event", value: eventTitle }];
    if (eventRow?.location) {
      details.push({ label: "Location", value: eventRow.location });
    }
    if (typeof params.cutoffMinutes === "number") {
      details.push({
        label: "On-Time Window",
        value: `${params.cutoffMinutes} minutes`,
      });
    }

    await queueBroadcast({
      batchGroupKey: attendanceOpenedKey(params.eventId),
      triggerType: "event_attendance_opened",
      subject: `Attendance Is Open — ${eventTitle}`,
      heading: `Attendance Is Now Open for ${eventTitle}`,
      ctaLabel: "Check In Now",
      ctaPath: `/attendance?event=${encodeURIComponent(params.eventId)}`,
      copy: {
        previewText: `Check in now for ${eventTitle}.`,
        intro:
          "The attendance check-in session is now open. Please open the portal and record your attendance while the session is active.",
        detailsTitle: "Session Details",
        details,
        category: "attendance",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyEventAttendanceOpened failed:", err);
  }
}

// ============================================================================
// 4. ANNOUNCEMENTS & POLLS
// ============================================================================

export async function notifyAnnouncementPublished(params: {
  announcementId: string;
  title: string;
  message: string;
  priority: "standard" | "important" | "urgent";
}): Promise<void> {
  try {
    const priorityLabel =
      params.priority.charAt(0).toUpperCase() + params.priority.slice(1);
    const subjectPrefix =
      params.priority === "urgent"
        ? "[URGENT] "
        : params.priority === "important"
          ? "[Important] "
          : "";

    await queueBroadcast({
      batchGroupKey: announcementPublishedKey(params.announcementId),
      triggerType: "announcement_published",
      subject: `${subjectPrefix}Club Announcement: ${params.title}`,
      heading: params.title,
      ctaLabel: "Read on Portal",
      ctaPath: "/announcements",
      copy: {
        previewText: params.title,
        intro:
          "A new announcement has been published to the Carpenters Family Social Club board.",
        detailsTitle: "Announcement Info",
        details: [{ label: "Priority", value: priorityLabel }],
        bodyLabel: "Message",
        bodyText: params.message,
        category: "announcement",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyAnnouncementPublished failed:", err);
  }
}

export async function notifyPollCreated(params: {
  pollId: string;
  question: string;
  pollType: "yes_no" | "multiple_choice";
  options: string[];
  durationMinutes: number;
}): Promise<void> {
  try {
    const closesAtIso = new Date(
      Date.now() + params.durationMinutes * 60_000,
    ).toISOString();

    await queueBroadcast({
      batchGroupKey: pollCreatedKey(params.pollId),
      triggerType: "poll_created",
      subject: `New Club Poll: ${params.question}`,
      heading: params.question,
      ctaLabel: "Cast Your Vote",
      ctaPath: "/polls",
      copy: {
        previewText: `Cast your vote: ${params.question}`,
        intro:
          "A new club poll is now open for voting. Please review the options below and cast your ballot before the poll closes.",
        detailsTitle: "Poll Details",
        details: [
          {
            label: "Poll Format",
            value:
              params.pollType === "yes_no" ? "Yes / No" : "Multiple Choice",
          },
          { label: "Options", value: params.options.join(" · ") },
          { label: "Closes At", value: formatSchedule(closesAtIso) },
        ],
        category: "poll",
      },
    });
  } catch (err) {
    console.error("[Email Service] notifyPollCreated failed:", err);
  }
}
