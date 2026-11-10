import "server-only";

import type { ClubOverviewRpcInput } from "@/lib/ai/facts";
import { generateNarrativeJson } from "@/lib/ai/provider.server";
import { monthlyOverviewEmailKey } from "@/lib/notifications/idempotency";
import {
  enqueueNotificationEmail,
  resolveOfficerContacts,
} from "@/lib/notifications/outbox-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runMonthlyOverviewJob } from "./monthly-overview-core";

export async function generateAndNotifyMonthlyOverview(now = new Date()) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SECRET_KEY is not configured.");
  }

  return runMonthlyOverviewJob(
    {
      loadOverviewData: async (periodStart, periodEnd) => {
        const { data, error } = await admin.rpc(
          "cron_club_overview_report_data",
          {
            p_start: periodStart,
            p_end: periodEnd,
          },
        );
        if (error || !data) {
          throw new Error(
            error?.message || "Failed to load monthly overview report data.",
          );
        }
        return data as ClubOverviewRpcInput;
      },
      generateNarrative: (req) => generateNarrativeJson(req),
      publishMonthlyOverview: async (args) => {
        const { data, error } = await admin.rpc(
          "cron_publish_monthly_overview",
          {
            p_period_label: args.periodLabel,
            p_period_start: args.periodStart,
            p_period_end: args.periodEnd,
            p_fingerprint: args.fingerprint,
            p_provider: args.provider,
            p_model: args.model,
            p_content: args.content,
          },
        );
        if (error) {
          throw new Error(error.message);
        }
        return typeof data === "string" ? data : null;
      },
      resolveOfficers: () => resolveOfficerContacts(admin),
      enqueueEmail: async (input) =>
        enqueueNotificationEmail({
          idempotencyKey: monthlyOverviewEmailKey({
            periodLabel: input.periodLabel,
            officerEmail: input.recipientEmail,
          }),
          triggerType: "monthly_overview",
          recipientUserId: input.recipientUserId,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          subject: `Monthly Club Overview (${input.periodLabel}) Ready to Review`,
          heading: `Monthly Overview — ${input.periodLabel}`,
          bodyText: input.headline,
          ctaLabel: "Review & approve",
          ctaUrl: input.ctaPath,
          batchGroupKey: `monthly-overview:${input.periodLabel}`,
          templatePayload: {
            previewText: `Monthly overview for ${input.periodLabel} is ready for officer review.`,
            greeting: `Hello ${input.recipientName},`,
            periodLabel: input.periodLabel,
            headline: input.headline,
            aiStatusNote: input.aiStatusNote,
            details: input.details,
          },
        }),
    },
    now,
  );
}
