import {
  buildClubOverviewFacts,
  type ClubOverviewRpcInput,
  factsFingerprint,
} from "@/lib/ai/facts";
import {
  type AiNarrativeContent,
  validateNarrativeContent,
} from "@/lib/ai/grounding";
import { buildNarrativePrompt } from "@/lib/ai/prompts";
import { previousMonthPeriodWAT } from "./period";

export interface MonthlyOverviewOfficerContact {
  email: string;
  userId: string | null;
  name: string;
}

export interface MonthlyOverviewEmailInput {
  idempotencyKey: string;
  recipientUserId: string | null;
  recipientEmail: string;
  recipientName: string;
  periodLabel: string;
  ctaPath: string;
  headline: string;
  aiStatusNote: string | null;
  details: Array<{ label: string; value: string }>;
}

export interface MonthlyOverviewDeps {
  loadOverviewData: (
    periodStart: string,
    periodEnd: string,
  ) => Promise<ClubOverviewRpcInput>;
  generateNarrative: (req: {
    system: string;
    facts: unknown;
    schema: Record<string, unknown>;
  }) => Promise<{ provider: string; model: string; data: unknown }>;
  publishMonthlyOverview: (args: {
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    fingerprint: string;
    provider: string;
    model: string;
    content: AiNarrativeContent | null;
  }) => Promise<string | null>;
  resolveOfficers: () => Promise<MonthlyOverviewOfficerContact[]>;
  enqueueEmail: (input: MonthlyOverviewEmailInput) => Promise<string>;
}

function formatNgnText(amount: number): string {
  const abs = Math.trunc(Math.abs(amount)).toLocaleString("en-US");
  return amount < 0 ? `-NGN ${abs}` : `NGN ${abs}`;
}

function slugEmail(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function runMonthlyOverviewJob(
  deps: MonthlyOverviewDeps,
  now = new Date(),
) {
  const period = previousMonthPeriodWAT(now);
  const rawOverview = await deps.loadOverviewData(
    period.periodStart,
    period.periodEnd,
  );
  const facts = buildClubOverviewFacts(rawOverview);
  const fingerprint = factsFingerprint(facts);

  let content: AiNarrativeContent | null = null;
  let provider = "system";
  let model = "system";

  for (const strictRetry of [false, true]) {
    try {
      const prompt = buildNarrativePrompt("club_overview", strictRetry);
      const generated = await deps.generateNarrative({
        system: prompt.system,
        facts,
        schema: prompt.schema,
      });
      const validated = validateNarrativeContent(generated.data, facts);
      if (validated.ok) {
        content = validated.content;
        provider = generated.provider;
        model = generated.model;
        break;
      }
    } catch {
      break;
    }
  }

  const narrativeId = await deps.publishMonthlyOverview({
    periodLabel: period.periodLabel,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    fingerprint,
    provider,
    model,
    content,
  });

  const officers = await deps.resolveOfficers();
  const ctaPath = `/officers/reports?period=${period.periodParam}`;
  const details = [
    {
      label: "Period",
      value: `${period.periodStart} to ${period.periodEnd}`,
    },
    {
      label: "Club Balance",
      value: formatNgnText(facts.club_finance.current_club_balance_ngn),
    },
    {
      label: "Period Dues Collected",
      value: formatNgnText(facts.club_finance.period_dues_collected_ngn),
    },
    {
      label: "Period Operating Expenses",
      value: formatNgnText(facts.club_finance.period_expenses_ngn),
    },
    {
      label: "Dues Collection Rate",
      value: `${facts.dues.collection_rate_pct}% (${facts.dues.overdue_three_plus_members} members 3+ mos overdue)`,
    },
    {
      label: "Net Event Cash",
      value: formatNgnText(facts.events.net_event_cash_ngn),
    },
  ];

  const headline = content
    ? content.headline
    : `Deterministic totals for ${period.periodLabel} are ready to review.`;
  const aiStatusNote = content
    ? null
    : "AI summary unavailable — generate it manually in the portal.";

  let emailsQueued = 0;
  for (const officer of officers) {
    const idempotencyKey =
      `monthly_overview:${period.periodLabel}:officer:${slugEmail(officer.email)}`.slice(
        0,
        255,
      );
    await deps.enqueueEmail({
      idempotencyKey,
      recipientUserId: officer.userId,
      recipientEmail: officer.email,
      recipientName: officer.name,
      periodLabel: period.periodLabel,
      ctaPath,
      headline,
      aiStatusNote,
      details,
    });
    emailsQueued += 1;
  }

  return {
    periodLabel: period.periodLabel,
    narrativeId,
    aiIncluded: Boolean(content),
    provider,
    officersNotified: officers.length,
    emailsQueued,
  };
}
