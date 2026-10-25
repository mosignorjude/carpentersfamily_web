import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCoveredMonthsDisplay } from "@/lib/dues-governance.mjs";
import { sendEmail, sendEmailBatch } from "@/lib/email/client";
import { getEmailConfig } from "@/lib/email/config";
import { ClubNotificationEmail } from "@/lib/email/templates/club-notification-email";
import { createReceiptStorageClient } from "@/lib/finance-receipts";

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const watDateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatNgn(amount: number): string {
  return nairaFormatter.format(amount);
}

function formatWatDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return `${watDateTimeFormatter.format(date)} WAT`;
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

function buildPortalUrl(path: string): string {
  const { siteUrl } = getEmailConfig();
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return siteUrl;
  }
}

function isDeliverableEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  if (
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith("@example.com")
  ) {
    return false;
  }
  return true;
}

async function resolveMemberContact(
  supabase: SupabaseClient,
  memberId: string,
): Promise<{ email: string | null; fullName: string }> {
  let fullName = "Club Member";
  try {
    const { data: profile } = await supabase
      .from("member_profiles")
      .select("full_name")
      .eq("id", memberId)
      .maybeSingle();
    if (profile?.full_name) {
      fullName = profile.full_name;
    }
  } catch {
    // Fallback to auth metadata or generic greeting
  }

  const adminClient = createReceiptStorageClient();
  if (!adminClient) return { email: null, fullName };

  try {
    const { data, error } = await adminClient.auth.admin.getUserById(memberId);
    if (error || !data?.user) return { email: null, fullName };
    const metaName =
      typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name.trim()
        : "";
    if (fullName === "Club Member" && metaName) {
      fullName = metaName;
    }
    const candidateEmail = data.user.email ?? null;
    return {
      email: isDeliverableEmail(candidateEmail) ? candidateEmail : null,
      fullName,
    };
  } catch {
    return { email: null, fullName };
  }
}

async function resolveActiveMemberEmails(
  supabase: SupabaseClient,
  excludeMemberId?: string,
): Promise<string[]> {
  const { forwardToEmail } = getEmailConfig();
  const recipients = new Set<string>();
  if (isDeliverableEmail(forwardToEmail)) {
    recipients.add(forwardToEmail.toLowerCase());
  }

  try {
    const { data: activeProfiles } = await supabase
      .from("member_profiles")
      .select("id")
      .eq("status", "active");

    const activeIds = new Set(
      (activeProfiles ?? [])
        .map((row) => row.id)
        .filter((id) => id !== excludeMemberId),
    );
    if (activeIds.size === 0) return Array.from(recipients);

    const adminClient = createReceiptStorageClient();
    if (!adminClient) return Array.from(recipients);

    const { data, error } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error || !data?.users) return Array.from(recipients);

    for (const user of data.users) {
      if (activeIds.has(user.id) && isDeliverableEmail(user.email)) {
        recipients.add(user.email.toLowerCase());
      }
    }
    return Array.from(recipients);
  } catch {
    return Array.from(recipients);
  }
}

async function resolveOfficerAlertEmails(
  supabase?: SupabaseClient,
  excludeMemberId?: string,
): Promise<string[]> {
  const { forwardToEmail } = getEmailConfig();
  const recipients = new Set<string>();
  if (isDeliverableEmail(forwardToEmail)) {
    recipients.add(forwardToEmail.toLowerCase());
  }

  if (!supabase) {
    return Array.from(recipients);
  }

  try {
    const { data: roleRows } = await supabase
      .from("member_role_assignments")
      .select("member_id, role")
      .in("role", ["admin", "backup_admin", "executive"])
      .is("revoked_at", null);

    const officerIds = new Set(
      (roleRows ?? [])
        .map((row) => row.member_id)
        .filter((id) => id !== excludeMemberId),
    );

    if (officerIds.size > 0) {
      const adminClient = createReceiptStorageClient();
      if (adminClient) {
        const { data } = await adminClient.auth.admin.listUsers({
          perPage: 1000,
        });
        for (const user of data?.users ?? []) {
          if (officerIds.has(user.id) && isDeliverableEmail(user.email)) {
            recipients.add(user.email.toLowerCase());
          }
        }
      }
    }
  } catch {
    // Ordinary or pending members cannot query member_role_assignments directly;
    // leadership inbox (forwardToEmail) remains guaranteed.
  }

  return Array.from(recipients);
}

// ============================================================================
// 1. ACCOUNT & MEMBER LIFECYCLE (1A, 1B, 1C, 1D)
// ============================================================================

export async function notifyNewMemberSignUp(params: {
  email: string;
  fullName: string;
  username: string;
}): Promise<void> {
  try {
    const officerEmails = await resolveOfficerAlertEmails();
    const tasks: Promise<unknown>[] = [
      // 1A: Alert Club Leadership
      sendEmailBatch(officerEmails, {
        subject: `New Member Sign-Up Request — ${params.fullName}`,
        react: ClubNotificationEmail({
          previewText: `${params.fullName} (@${params.username}) requested a Carpenters Family account.`,
          eyebrow: "Membership Alert",
          heading: "New Membership Request Pending Review",
          intro:
            "A new prospective member has registered on the Carpenters Family portal and is awaiting officer verification and approval.",
          detailsTitle: "Applicant Details",
          details: [
            { label: "Full Name", value: params.fullName },
            { label: "Username", value: `@${params.username}` },
            { label: "Email Address", value: params.email },
            { label: "Initial Status", value: "Pending Officer Approval" },
          ],
          ctaLabel: "Review Member Requests",
          ctaUrl: buildPortalUrl("/admin/members"),
        }),
        tags: [{ name: "category", value: "member_signup_alert" }],
      }),
    ];

    if (isDeliverableEmail(params.email)) {
      // 1A/1D: Welcome & Pending Approval Notice to the Applicant
      tasks.push(
        sendEmail({
          to: params.email,
          subject: "Welcome to Carpenters Family — Registration Received",
          react: ClubNotificationEmail({
            previewText:
              "We received your Carpenters Family registration request.",
            eyebrow: "Membership",
            heading: "Your Registration Request Was Received",
            greeting: `Hello ${params.fullName},`,
            intro:
              "Thank you for registering with the Carpenters Family Social Club portal. Once you confirm your email address, our club executives will review and activate your membership.",
            detailsTitle: "Registration Summary",
            details: [
              { label: "Full Name", value: params.fullName },
              { label: "Username", value: `@${params.username}` },
              { label: "Status", value: "Pending Approval" },
            ],
            ctaLabel: "Visit Member Portal",
            ctaUrl: buildPortalUrl("/"),
          }),
          tags: [{ name: "category", value: "member_signup_welcome" }],
        }),
      );
    }

    await Promise.allSettled(tasks);
  } catch {
    // Non-blocking notification
  }
}

export async function notifyMemberLifecycleChanged(params: {
  supabase: SupabaseClient;
  memberId: string;
  operation: "approve" | "reject" | "deactivate" | "reactivate";
  reason: string;
}): Promise<void> {
  try {
    const { email, fullName } = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!email) return;

    const meta = {
      approve: {
        subject: "Your Carpenters Family Membership Has Been Approved",
        heading: "Membership Approved",
        statusLabel: "Active Member",
        intro:
          "Welcome aboard! Your Carpenters Family Social Club membership has been approved. You now have full access to the member portal, events, announcements, and dues records.",
      },
      reject: {
        subject: "Update on Your Carpenters Family Membership Request",
        heading: "Membership Request Not Approved",
        statusLabel: "Request Declined",
        intro:
          "Your membership request for the Carpenters Family Social Club portal was reviewed by club leadership and could not be approved at this time.",
      },
      deactivate: {
        subject: "Carpenters Family Account Status Update",
        heading: "Membership Account Deactivated",
        statusLabel: "Deactivated",
        intro:
          "Your Carpenters Family Social Club portal account has been deactivated by club administration.",
      },
      reactivate: {
        subject: "Your Carpenters Family Account Has Been Reactivated",
        heading: "Membership Account Reactivated",
        statusLabel: "Active Member",
        intro:
          "Your Carpenters Family Social Club portal account has been reactivated. You can now sign in and access club resources again.",
      },
    }[params.operation];

    await sendEmail({
      to: email,
      subject: meta.subject,
      react: ClubNotificationEmail({
        previewText: meta.heading,
        eyebrow: "Membership Status",
        heading: meta.heading,
        greeting: `Hello ${fullName},`,
        intro: meta.intro,
        detailsTitle: "Status Details",
        details: [{ label: "Current Status", value: meta.statusLabel }],
        bodyLabel: "Leadership Note",
        bodyText: params.reason,
        ctaLabel: "Open Member Portal",
        ctaUrl: buildPortalUrl("/"),
      }),
      tags: [{ name: "category", value: "member_lifecycle" }],
    });
  } catch {
    // Non-blocking notification
  }
}

export async function notifyClubRoleChanged(params: {
  supabase: SupabaseClient;
  memberId: string;
  role: string;
  operation: "grant" | "revoke" | "set";
  reason: string;
}): Promise<void> {
  try {
    const { email, fullName } = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!email) return;

    const roleLabel = formatRoleLabel(params.role);
    const actionDescription =
      params.operation === "revoke"
        ? `Your ${roleLabel} role assignment has been revoked.`
        : `Your club governance role has been updated to ${roleLabel}.`;

    await sendEmail({
      to: email,
      subject: `Carpenters Family — Club Role Updated (${roleLabel})`,
      react: ClubNotificationEmail({
        previewText: actionDescription,
        eyebrow: "Governance & Roles",
        heading: "Your Club Role Was Updated",
        greeting: `Hello ${fullName},`,
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
        ctaLabel: "Open Member Portal",
        ctaUrl: buildPortalUrl("/"),
      }),
      tags: [{ name: "category", value: "club_role_change" }],
    });
  } catch {
    // Non-blocking notification
  }
}

export async function notifyPasswordUpdated(params: {
  email?: string | null;
}): Promise<void> {
  try {
    if (!isDeliverableEmail(params.email)) return;
    await sendEmail({
      to: params.email,
      subject: "Carpenters Family — Password Updated",
      react: ClubNotificationEmail({
        previewText:
          "Your Carpenters Family portal password was recently updated.",
        eyebrow: "Account Security",
        heading: "Your Password Was Updated",
        intro:
          "This is a security confirmation that the password for your Carpenters Family Social Club account was just changed. If you did not make this change, please contact club leadership immediately.",
        detailsTitle: "Security Event",
        details: [
          { label: "Account", value: params.email },
          {
            label: "Time",
            value: formatWatDateTime(new Date().toISOString()),
          },
        ],
        ctaLabel: "Sign In to Portal",
        ctaUrl: buildPortalUrl("/"),
      }),
      tags: [{ name: "category", value: "password_updated" }],
    });
  } catch {
    // Non-blocking notification
  }
}

// ============================================================================
// 2. DUES & CLUB FINANCES (2A, 2B, 2C)
// ============================================================================

export async function notifyDuesPaymentRequestSubmitted(params: {
  supabase: SupabaseClient;
  actorId: string;
  amountNgn: number;
  coveredMonths: string[];
  paymentMethod: string;
  paymentReference: string;
  notes?: string | null;
}): Promise<void> {
  try {
    const [{ fullName }, officerEmails] = await Promise.all([
      resolveMemberContact(params.supabase, params.actorId),
      resolveOfficerAlertEmails(params.supabase, params.actorId),
    ]);

    await sendEmailBatch(officerEmails, {
      subject: `Dues Payment Request — ${fullName} (${formatNgn(params.amountNgn)})`,
      react: ClubNotificationEmail({
        previewText: `${fullName} submitted a dues payment request of ${formatNgn(params.amountNgn)}.`,
        eyebrow: "Dues & Finance",
        heading: "New Dues Payment Request Submitted",
        intro: `${fullName} has submitted a statutory dues payment request for officer verification.`,
        detailsTitle: "Payment Submission Details",
        details: [
          { label: "Member", value: fullName },
          { label: "Amount", value: formatNgn(params.amountNgn) },
          {
            label: "Covered Months",
            value: formatCoveredMonthsDisplay(params.coveredMonths),
          },
          {
            label: "Payment Method",
            value: formatPaymentMethod(params.paymentMethod),
          },
          { label: "Reference", value: params.paymentReference },
        ],
        bodyLabel: params.notes ? "Member Notes" : undefined,
        bodyText: params.notes ?? null,
        ctaLabel: "Review Dues Requests",
        ctaUrl: buildPortalUrl("/dues"),
      }),
      tags: [{ name: "category", value: "dues_request_submitted" }],
    });
  } catch {
    // Non-blocking notification
  }
}

export async function notifyDuesPaymentConfirmed(params: {
  supabase: SupabaseClient;
  memberId: string;
  amountNgn: number;
  coveredMonths: string[];
  paymentDate?: string;
  paymentReference?: string;
}): Promise<void> {
  try {
    const { email, fullName } = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!email) return;

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
    if (params.paymentReference) {
      details.push({ label: "Reference", value: params.paymentReference });
    }

    await sendEmail({
      to: email,
      subject: `Carpenters Family — Dues Payment Confirmed (${formatNgn(params.amountNgn)})`,
      react: ClubNotificationEmail({
        previewText: `Your dues payment of ${formatNgn(params.amountNgn)} has been confirmed.`,
        eyebrow: "Dues Receipt",
        heading: "Your Dues Payment Has Been Recorded",
        greeting: `Hello ${fullName},`,
        intro:
          "Your statutory club dues payment has been verified and recorded on your Carpenters Family membership ledger.",
        detailsTitle: "Payment Receipt Summary",
        details,
        ctaLabel: "View Your Dues Ledger",
        ctaUrl: buildPortalUrl("/dues"),
      }),
      tags: [{ name: "category", value: "dues_payment_confirmed" }],
    });
  } catch {
    // Non-blocking notification
  }
}

export async function notifyDuesPaymentRequestRejected(params: {
  supabase: SupabaseClient;
  memberId: string;
  amountNgn: number;
  coveredMonths: string[];
  paymentReference: string;
  reason: string;
}): Promise<void> {
  try {
    const { email, fullName } = await resolveMemberContact(
      params.supabase,
      params.memberId,
    );
    if (!email) return;

    await sendEmail({
      to: email,
      subject: "Carpenters Family — Update on Your Dues Payment Request",
      react: ClubNotificationEmail({
        previewText:
          "Your dues payment submission requires attention before it can be approved.",
        eyebrow: "Dues & Finance",
        heading: "Dues Payment Request Declined",
        greeting: `Hello ${fullName},`,
        intro:
          "Your submitted dues payment request could not be verified as submitted. Please review the officer note below and submit a corrected request if needed.",
        detailsTitle: "Submission Details",
        details: [
          { label: "Amount", value: formatNgn(params.amountNgn) },
          {
            label: "Covered Months",
            value: formatCoveredMonthsDisplay(params.coveredMonths),
          },
          { label: "Reference", value: params.paymentReference },
        ],
        bodyLabel: "Reason from Finance Officer",
        bodyText: params.reason,
        ctaLabel: "Open Dues Page",
        ctaUrl: buildPortalUrl("/dues"),
      }),
      tags: [{ name: "category", value: "dues_request_rejected" }],
    });
  } catch {
    // Non-blocking notification
  }
}

// ============================================================================
// 3. EVENTS, COMMITTEE ROLES & ATTENDANCE (3A, 3B, 3C)
// ============================================================================

export async function notifyNewEventScheduled(params: {
  supabase: SupabaseClient;
  actorId: string;
  title: string;
  eventType: string;
  startsAt: string;
  location: string;
  description?: string | null;
}): Promise<void> {
  try {
    const memberEmails = await resolveActiveMemberEmails(
      params.supabase,
      params.actorId,
    );
    if (memberEmails.length === 0) return;

    const typeLabel =
      params.eventType.charAt(0).toUpperCase() + params.eventType.slice(1);

    await sendEmailBatch(memberEmails, {
      subject: `New Club Event: ${params.title}`,
      react: ClubNotificationEmail({
        previewText: `${params.title} has been scheduled for ${formatWatDateTime(params.startsAt)}.`,
        eyebrow: "Club Events",
        heading: params.title,
        intro:
          "A new Carpenters Family Social Club event has been scheduled. Mark your calendar and review the event details below.",
        detailsTitle: "Event Details",
        details: [
          { label: "Event Type", value: typeLabel },
          { label: "Date & Time", value: formatWatDateTime(params.startsAt) },
          { label: "Location", value: params.location },
        ],
        bodyLabel: params.description ? "Description" : undefined,
        bodyText: params.description ?? null,
        ctaLabel: "View Club Events",
        ctaUrl: buildPortalUrl("/events"),
      }),
      tags: [{ name: "category", value: "event_scheduled" }],
    });
  } catch {
    // Non-blocking notification
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
    const [{ email, fullName }, { data: eventRow }] = await Promise.all([
      resolveMemberContact(params.supabase, params.memberId),
      params.supabase
        .from("events")
        .select("title, starts_at, location")
        .eq("id", params.eventId)
        .maybeSingle(),
    ]);

    if (!email) return;

    const eventTitle = eventRow?.title ?? "Club Event";
    const roleLabel = formatRoleLabel(params.role);

    const details = [
      { label: "Event", value: eventTitle },
      { label: "Assigned Role", value: roleLabel },
    ];
    if (eventRow?.starts_at) {
      details.push({
        label: "Event Date",
        value: formatWatDateTime(eventRow.starts_at),
      });
    }
    if (eventRow?.location) {
      details.push({ label: "Location", value: eventRow.location });
    }

    await sendEmail({
      to: email,
      subject: `Event Role Assigned: ${roleLabel} — ${eventTitle}`,
      react: ClubNotificationEmail({
        previewText: `You have been assigned as ${roleLabel} for ${eventTitle}.`,
        eyebrow: "Event Committee",
        heading: `You Are Assigned as ${roleLabel}`,
        greeting: `Hello ${fullName},`,
        intro: `You have been appointed as ${roleLabel} for the upcoming club event "${eventTitle}".`,
        detailsTitle: "Assignment Details",
        details,
        bodyLabel: "Assignment Note",
        bodyText: params.reason,
        ctaLabel: "Open Event Dashboard",
        ctaUrl: buildPortalUrl(`/events/${params.eventId}/dashboard`),
      }),
      tags: [{ name: "category", value: "event_role_assigned" }],
    });
  } catch {
    // Non-blocking notification
  }
}

export async function notifyEventAttendanceOpened(params: {
  supabase: SupabaseClient;
  actorId: string;
  eventId: string;
  cutoffMinutes?: number | null;
}): Promise<void> {
  try {
    const [memberEmails, { data: eventRow }] = await Promise.all([
      resolveActiveMemberEmails(params.supabase, params.actorId),
      params.supabase
        .from("events")
        .select("title, starts_at, location")
        .eq("id", params.eventId)
        .maybeSingle(),
    ]);

    if (memberEmails.length === 0) return;

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

    await sendEmailBatch(memberEmails, {
      subject: `Attendance Is Open — ${eventTitle}`,
      react: ClubNotificationEmail({
        previewText: `Check in now for ${eventTitle}.`,
        eyebrow: "Event Attendance",
        heading: `Attendance Is Now Open for ${eventTitle}`,
        intro:
          "The attendance check-in session is now open. Please open the portal and record your attendance while the session is active.",
        detailsTitle: "Session Details",
        details,
        ctaLabel: "Check In Now",
        ctaUrl: buildPortalUrl(
          `/attendance?event=${encodeURIComponent(params.eventId)}`,
        ),
      }),
      tags: [{ name: "category", value: "attendance_opened" }],
    });
  } catch {
    // Non-blocking notification
  }
}

// ============================================================================
// 4. ANNOUNCEMENTS & POLLS (4A, 4B)
// ============================================================================

export async function notifyAnnouncementPublished(params: {
  supabase: SupabaseClient;
  actorId?: string;
  title: string;
  message: string;
  priority: "standard" | "important" | "urgent";
}): Promise<void> {
  try {
    const memberEmails = await resolveActiveMemberEmails(
      params.supabase,
      params.actorId,
    );
    if (memberEmails.length === 0) return;

    const priorityLabel =
      params.priority.charAt(0).toUpperCase() + params.priority.slice(1);
    const subjectPrefix =
      params.priority === "urgent"
        ? "[URGENT] "
        : params.priority === "important"
          ? "[Important] "
          : "";

    await sendEmailBatch(memberEmails, {
      subject: `${subjectPrefix}Club Announcement: ${params.title}`,
      react: ClubNotificationEmail({
        previewText: params.title,
        eyebrow: `${priorityLabel} Announcement`,
        heading: params.title,
        intro:
          "A new announcement has been published to the Carpenters Family Social Club board.",
        detailsTitle: "Announcement Info",
        details: [{ label: "Priority", value: priorityLabel }],
        bodyLabel: "Message",
        bodyText: params.message,
        ctaLabel: "Read on Portal",
        ctaUrl: buildPortalUrl("/announcements"),
      }),
      tags: [{ name: "category", value: "announcement_published" }],
    });
  } catch {
    // Non-blocking notification
  }
}

export async function notifyPollCreated(params: {
  supabase: SupabaseClient;
  actorId?: string;
  question: string;
  pollType: "yes_no" | "multiple_choice";
  options: string[];
  durationMinutes: number;
}): Promise<void> {
  try {
    const memberEmails = await resolveActiveMemberEmails(
      params.supabase,
      params.actorId,
    );
    if (memberEmails.length === 0) return;

    const closesAtIso = new Date(
      Date.now() + params.durationMinutes * 60_000,
    ).toISOString();

    await sendEmailBatch(memberEmails, {
      subject: `New Club Poll: ${params.question}`,
      react: ClubNotificationEmail({
        previewText: `Cast your vote: ${params.question}`,
        eyebrow: "Club Poll",
        heading: params.question,
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
          { label: "Closes At", value: formatWatDateTime(closesAtIso) },
        ],
        ctaLabel: "Cast Your Vote",
        ctaUrl: buildPortalUrl("/polls"),
      }),
      tags: [{ name: "category", value: "poll_created" }],
    });
  } catch {
    // Non-blocking notification
  }
}
