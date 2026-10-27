import "server-only";

import { render, toPlainText } from "@react-email/components";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PreparedEmail,
  sendPreparedEmail,
  sendPreparedEmailBatch,
} from "@/lib/email/client";
import { getEmailConfig } from "@/lib/email/config";
import {
  ClubNotificationEmail,
  type EmailDetailRow,
  NOTIFICATION_CATEGORY_COPY,
  type NotificationCategory,
} from "@/lib/email/templates/club-notification-email";
import {
  NotificationEnqueueError,
  withNotificationEnqueueRetry,
} from "@/lib/notifications/enqueue-retry";
import {
  type OutboxJob,
  PACE_MS,
  type ProcessOutboxSummary,
  processOutboxTick,
} from "@/lib/notifications/outbox-worker";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface OutboxRow {
  id: string;
  idempotency_key: string;
  trigger_type: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  heading: string;
  body_text: string;
  cta_label: string | null;
  cta_url: string | null;
  batch_group_key: string | null;
  template_payload: Record<string, unknown> | null;
}

export interface NotificationContact {
  email: string;
  userId: string | null;
  name: string;
}

export interface EnqueueEmailInput {
  idempotencyKey: string;
  triggerType: string;
  recipientUserId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  heading: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  batchGroupKey?: string | null;
  templatePayload?: Record<string, unknown>;
}

export interface EnqueueBroadcastInput {
  batchGroupKey: string;
  triggerType: string;
  subject: string;
  heading: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  templatePayload?: Record<string, unknown>;
}

export interface OutboxDispatchResult extends ProcessOutboxSummary {
  error?: string;
}

const MAX_BODY_LENGTH = 5000;

function clampBody(value: string): string {
  return value.trim().slice(0, MAX_BODY_LENGTH);
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

export async function enqueueNotificationEmail(
  input: EnqueueEmailInput,
): Promise<string> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    const error = new Error("SUPABASE_SECRET_KEY is not configured.");
    console.error(
      "[Notification Outbox] SUPABASE_SECRET_KEY is not configured; email was not queued.",
    );
    throw new NotificationEnqueueError("email", input.idempotencyKey, 0, error);
  }

  try {
    return await withNotificationEnqueueRetry(
      async () => {
        const { data, error } = await admin.rpc("enqueue_notification_email", {
          p_idempotency_key: input.idempotencyKey,
          p_trigger_type: input.triggerType,
          p_recipient_user_id: input.recipientUserId ?? null,
          p_recipient_email: input.recipientEmail,
          p_recipient_name: input.recipientName ?? null,
          p_subject: input.subject,
          p_heading: input.heading,
          p_body_text: clampBody(input.bodyText),
          p_cta_label: input.ctaLabel ?? null,
          p_cta_url: input.ctaUrl ?? null,
          p_batch_group_key: input.batchGroupKey ?? null,
          p_template_payload: input.templatePayload ?? {},
        });

        if (error) throw error;
        if (typeof data !== "string" || !data) {
          throw new Error("Email enqueue RPC returned no outbox job id.");
        }
        return data;
      },
      { operation: "email", idempotencyKey: input.idempotencyKey },
    );
  } catch (error) {
    console.error("[Notification Outbox] Failed to enqueue email:", error);
    throw error;
  }
}

export async function enqueueNotificationBroadcast(
  input: EnqueueBroadcastInput,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    const error = new Error("SUPABASE_SECRET_KEY is not configured.");
    console.error(
      "[Notification Outbox] SUPABASE_SECRET_KEY is not configured; broadcast was not queued.",
    );
    throw new NotificationEnqueueError(
      "broadcast",
      input.batchGroupKey,
      0,
      error,
    );
  }

  try {
    return await withNotificationEnqueueRetry(
      async () => {
        const { data, error } = await admin.rpc(
          "enqueue_notification_broadcast",
          {
            p_batch_group_key: input.batchGroupKey,
            p_trigger_type: input.triggerType,
            p_subject: input.subject,
            p_heading: input.heading,
            p_body_text: clampBody(input.bodyText),
            p_cta_label: input.ctaLabel ?? null,
            p_cta_url: input.ctaUrl ?? null,
            p_template_payload: input.templatePayload ?? {},
          },
        );

        if (error) throw error;
        if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
          throw new Error("Broadcast enqueue RPC returned an invalid count.");
        }
        return data;
      },
      { operation: "broadcast", idempotencyKey: input.batchGroupKey },
    );
  } catch (error) {
    console.error("[Notification Outbox] Failed to enqueue broadcast:", error);
    throw error;
  }
}

export async function resolveMemberContact(
  supabase: SupabaseClient,
  memberId: string,
): Promise<NotificationContact | null> {
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
    // Fall back to Auth metadata below.
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  try {
    const { data, error } = await admin.auth.admin.getUserById(memberId);
    if (error || !data?.user) return null;
    const metaName =
      typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name.trim()
        : "";
    if (fullName === "Club Member" && metaName) {
      fullName = metaName;
    }
    const candidateEmail = data.user.email ?? null;
    if (!isDeliverableEmail(candidateEmail)) return null;

    return {
      email: candidateEmail.toLowerCase(),
      userId: memberId,
      name: fullName,
    };
  } catch {
    return null;
  }
}

export async function resolveOfficerContacts(
  supabase?: SupabaseClient,
): Promise<NotificationContact[]> {
  const contacts = new Map<string, NotificationContact>();
  const { forwardToEmail } = getEmailConfig();
  const admin = createSupabaseAdminClient() ?? supabase ?? null;

  if (!admin) {
    if (isDeliverableEmail(forwardToEmail)) {
      contacts.set(forwardToEmail.toLowerCase(), {
        email: forwardToEmail.toLowerCase(),
        userId: null,
        name: "Club Leadership",
      });
    }
    return Array.from(contacts.values());
  }

  try {
    const { data: assignments } = await admin
      .from("member_role_assignments")
      .select("member_id, role")
      .in("role", ["admin", "backup_admin", "executive"])
      .is("revoked_at", null);

    const officerIds = new Set(
      (assignments ?? []).map((row) => row.member_id as string),
    );

    if (officerIds.size > 0) {
      const [{ data: profiles }, { data: users }] = await Promise.all([
        admin
          .from("member_profiles")
          .select("id, full_name, status")
          .in("id", [...officerIds]),
        admin.auth.admin.listUsers({ perPage: 1000 }),
      ]);

      const profileNames = new Map(
        (profiles ?? [])
          .filter((profile) => profile.status === "active")
          .map((profile) => [
            profile.id as string,
            profile.full_name as string,
          ]),
      );

      for (const user of users?.users ?? []) {
        if (!officerIds.has(user.id) || !profileNames.has(user.id)) continue;
        if (!isDeliverableEmail(user.email)) continue;
        const email = user.email.toLowerCase();
        contacts.set(email, {
          email,
          userId: user.id,
          name: profileNames.get(user.id) ?? "Club Officer",
        });
      }
    }
  } catch {
    // Leadership inbox below remains the guaranteed fallback.
  }

  if (isDeliverableEmail(forwardToEmail)) {
    const email = forwardToEmail.toLowerCase();
    if (!contacts.has(email)) {
      contacts.set(email, {
        email,
        userId: null,
        name: "Club Leadership",
      });
    }
  }

  return Array.from(contacts.values());
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readCategory(value: unknown): NotificationCategory | undefined {
  if (typeof value !== "string") return undefined;
  return Object.hasOwn(NOTIFICATION_CATEGORY_COPY, value)
    ? (value as NotificationCategory)
    : undefined;
}

function readDetails(value: unknown): EmailDetailRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const label = readString(row.label);
    const detailValue = readString(row.value);
    return label && detailValue ? [{ label, value: detailValue }] : [];
  });
}

function absolutePortalUrl(path: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const { siteUrl } = getEmailConfig();
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return undefined;
  }
}

function renderOutboxJob(job: OutboxJob): Promise<PreparedEmail> {
  const payload = asRecord(job.templatePayload);
  const details = readDetails(payload.details);

  return render(
    ClubNotificationEmail({
      previewText: readString(payload.previewText) ?? job.heading,
      heading: job.heading,
      greeting: readString(payload.greeting) ?? undefined,
      intro: readString(payload.intro) ?? job.bodyText,
      detailsTitle: readString(payload.detailsTitle) ?? undefined,
      details,
      bodyLabel: readString(payload.bodyLabel) ?? undefined,
      bodyText: typeof payload.bodyText === "string" ? payload.bodyText : null,
      ctaLabel: job.ctaLabel ?? undefined,
      ctaUrl: absolutePortalUrl(job.ctaUrl),
      footerNote: readString(payload.footerNote) ?? undefined,
      category: readCategory(payload.category),
    }),
  ).then((html) => ({
    to: job.recipientEmail,
    subject: job.subject,
    html,
    text: toPlainText(html),
    tags: [{ name: "category", value: job.triggerType }],
  }));
}

function rowToJob(row: OutboxRow): OutboxJob {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    triggerType: row.trigger_type,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    subject: row.subject,
    heading: row.heading,
    bodyText: row.body_text,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    batchGroupKey: row.batch_group_key,
    templatePayload: row.template_payload ?? {},
  };
}

function providerError(
  error: string,
  statusCode: number | null,
  name: string | null,
  rateLimit: string | null,
): Error {
  const failure = new Error(error);
  Object.assign(failure, {
    statusCode: rateLimit && statusCode === null ? 429 : statusCode,
    name: name ?? rateLimit ?? undefined,
  });
  return failure;
}

export async function processOutboxBatch(
  limit = 200,
): Promise<OutboxDispatchResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      pausedForRateLimit: false,
      providerCalls: 0,
      error: "SUPABASE_SECRET_KEY is not configured.",
    };
  }

  return processOutboxTick(
    {
      claimJobs: async (claimLimit) => {
        const { data, error } = await admin.rpc(
          "claim_notification_outbox_jobs",
          { p_limit: claimLimit, p_lock_seconds: 300 },
        );
        if (error) throw new Error(error.message);
        return ((data ?? []) as OutboxRow[]).map(rowToJob);
      },
      sendEmail: async (job, options) => {
        const prepared = await renderOutboxJob(job);
        const result = await sendPreparedEmail(prepared, options);
        if (!result.ok) {
          throw providerError(
            result.error,
            result.statusCode ?? null,
            result.name ?? null,
            result.rateLimit ?? null,
          );
        }
        return { id: result.id };
      },
      sendEmailBatch: async (jobs, options) => {
        const prepared = await Promise.all(jobs.map(renderOutboxJob));
        const result = await sendPreparedEmailBatch(prepared, options);
        if (!result.ok) {
          throw providerError(
            result.error,
            result.statusCode,
            result.name,
            result.rateLimit,
          );
        }
        return { data: result.data, errors: result.errors };
      },
      completeJobs: async (jobs, providerIds) => {
        const { error } = await admin.rpc("complete_notification_outbox_jobs", {
          p_job_ids: jobs.map((job) => job.id),
          p_resend_email_ids: providerIds,
        });
        if (error) throw new Error(error.message);
      },
      rescheduleJobs: async (jobs, reason, delaySeconds, paused) => {
        const { error } = await admin.rpc(
          "reschedule_notification_outbox_jobs",
          {
            p_job_ids: jobs.map((job) => job.id),
            p_reason: reason,
            p_delay_seconds: delaySeconds,
            p_paused: paused,
          },
        );
        if (error) throw new Error(error.message);
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => new Date(),
    },
    { limit },
  );
}

export async function evaluateNotificationReminders(): Promise<unknown> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SECRET_KEY is not configured.");
  }

  const { data, error } = await admin.rpc("evaluate_notification_reminders", {
    p_now: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function applyResendWebhookEvent(params: {
  resendEmailId: string;
  eventType: string;
  eventCreatedAt: string;
}): Promise<number> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not configured.");

  const { data, error } = await admin.rpc("apply_resend_webhook_event", {
    p_resend_email_id: params.resendEmailId,
    p_event_type: params.eventType,
    p_event_created_at: params.eventCreatedAt,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

export { PACE_MS };
