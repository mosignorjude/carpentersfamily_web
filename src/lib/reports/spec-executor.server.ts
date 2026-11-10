import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeLabel } from "@/lib/ai/facts";
import { generateNarrativeJson } from "@/lib/ai/provider.server";
import {
  buildSpecTranslatorPrompt,
  buildUnderstoodSummary,
  type CustomReportEventOption,
  type CustomReportMetadata,
  parseAndNormalizeReportSpec,
  type ReportDataset,
  type ReportSpec,
  sanitizeQuestionInput,
} from "@/lib/ai/report-spec";
import { getWATDate, MAX_REPORT_ROWS } from "@/lib/report-export";
import {
  aggregateCustomReport,
  type CustomReportResult,
} from "./spec-executor-core";

function watDateBoundary(value: string, addDay = false): string {
  const timestamp = new Date(`${value}T00:00:00+01:00`).getTime();
  return new Date(timestamp + (addDay ? 86_400_000 : 0)).toISOString();
}

export async function loadCustomReportMetadata(
  supabase: SupabaseClient,
): Promise<CustomReportMetadata> {
  const [clubCatsRes, eventCatsRes, eventsRes] = await Promise.all([
    supabase
      .from("finance_categories")
      .select("name")
      .is("retired_at", null)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("event_finance_categories")
      .select("name")
      .is("retired_at", null)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("events")
      .select("id, title, event_type, starts_at")
      .is("archived_at", null)
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);

  const clubCategories = [
    ...new Set(
      (clubCatsRes.data ?? [])
        .map((r) => sanitizeLabel((r as { name?: string }).name, "", 80))
        .filter(Boolean),
    ),
  ];

  const eventCategories = [
    ...new Set(
      (eventCatsRes.data ?? [])
        .map((r) => sanitizeLabel((r as { name?: string }).name, "", 80))
        .filter(Boolean),
    ),
  ];

  const events: CustomReportEventOption[] = (eventsRes.data ?? []).map((ev) => {
    const row = ev as {
      id: string;
      title: string;
      event_type: string;
      starts_at: string;
    };
    return {
      id: row.id,
      title: sanitizeLabel(row.title, "Event", 100),
      eventType: row.event_type,
      startsAt: row.starts_at,
    };
  });

  return { clubCategories, eventCategories, events };
}

export async function translateQuestionToSpec(
  supabase: SupabaseClient,
  rawQuestion: unknown,
): Promise<
  | {
      ok: true;
      spec: ReportSpec;
      understood: Array<{ label: string; value: string }>;
      metadata: CustomReportMetadata;
      provider: string;
      model: string;
    }
  | { ok: false; status: 400 | 422 | 503; error: string }
> {
  const qCheck = sanitizeQuestionInput(rawQuestion);
  if (!qCheck.ok) {
    return { ok: false, status: 400, error: qCheck.error };
  }

  const metadata = await loadCustomReportMetadata(supabase);
  const prompt = buildSpecTranslatorPrompt(
    qCheck.question,
    metadata,
    getWATDate(),
  );

  let aiResult: Awaited<ReturnType<typeof generateNarrativeJson>>;
  try {
    aiResult = await generateNarrativeJson({
      system: `${prompt.system}\n${prompt.user}`,
      facts: { question: qCheck.question },
      schema: prompt.schema,
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error:
        "AI translation is unavailable right now. Choose filters manually below.",
    };
  }

  const validated = parseAndNormalizeReportSpec(aiResult.data, metadata);
  if (!validated.ok) {
    return {
      ok: false,
      status: 422,
      error: validated.error,
    };
  }

  return {
    ok: true,
    spec: validated.spec,
    understood: buildUnderstoodSummary(validated.spec, metadata),
    metadata,
    provider: aiResult.provider,
    model: aiResult.model,
  };
}

type DatasetFetcher = (
  supabase: SupabaseClient,
  spec: ReportSpec,
) => Promise<{
  error: unknown;
  rows: Array<Record<string, unknown>>;
}>;

const DATASET_FETCHERS: Record<ReportDataset, DatasetFetcher> = {
  async club_transactions(supabase, spec) {
    let query = supabase
      .from("club_financial_transactions")
      .select(
        "kind, amount_ngn, transaction_date, category_name_snapshot, payment_method, is_opening_balance",
      )
      .is("voided_at", null)
      .eq("is_opening_balance", false)
      .gte("transaction_date", spec.period.from)
      .lte("transaction_date", spec.period.to)
      .order("transaction_date", { ascending: true })
      .limit(MAX_REPORT_ROWS);

    if (spec.filters.kind) {
      query = query.eq("kind", spec.filters.kind);
    }

    const { data, error } = await query;
    return {
      error,
      rows: (data ?? []) as Array<Record<string, unknown>>,
    };
  },

  async event_transactions(supabase, spec) {
    let query = supabase
      .from("event_financial_transactions")
      .select(
        "event_id, kind, amount_ngn, transaction_date, category_name_snapshot, payment_method, payment_status, verification_status",
      )
      .is("voided_at", null)
      .neq("verification_status", "rejected")
      .gte("transaction_date", spec.period.from)
      .lte("transaction_date", spec.period.to)
      .order("transaction_date", { ascending: true })
      .limit(MAX_REPORT_ROWS);

    if (spec.eventId) {
      query = query.eq("event_id", spec.eventId);
    }
    if (spec.filters.kind) {
      query = query.eq("kind", spec.filters.kind);
    }
    if (spec.filters.status) {
      query = query.eq("payment_status", spec.filters.status);
    }

    const { data, error } = await query;
    return {
      error,
      rows: (data ?? []) as Array<Record<string, unknown>>,
    };
  },

  async ticket_sales(supabase, spec) {
    const fromIso = watDateBoundary(spec.period.from, false);
    const toIso = watDateBoundary(spec.period.to, true);
    let query = supabase
      .from("event_ticket_sales")
      .select(
        "event_id, quantity, amount_ngn, payment_method, verification_status, created_at",
      )
      .is("refunded_at", null)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(MAX_REPORT_ROWS);

    if (spec.eventId) {
      query = query.eq("event_id", spec.eventId);
    }
    if (spec.filters.status) {
      query = query.eq("verification_status", spec.filters.status);
    } else if (spec.groupBy !== "status") {
      query = query.eq("verification_status", "approved");
    }

    const { data, error } = await query;
    return {
      error,
      rows: (data ?? []) as Array<Record<string, unknown>>,
    };
  },

  async dues(supabase, spec) {
    const fromMonth = `${spec.period.from.slice(0, 7)}-01`;
    const toMonth = `${spec.period.to.slice(0, 7)}-01`;

    // Strictly select aggregate/status columns only; never member_id or names.
    const { data, error } = await supabase
      .from("dues_month_status")
      .select("covered_month, amount_ngn, status, due_date, is_overdue")
      .gte("covered_month", fromMonth)
      .lte("covered_month", toMonth)
      .order("covered_month", { ascending: true })
      .limit(MAX_REPORT_ROWS);

    return {
      error,
      rows: (data ?? []) as Array<Record<string, unknown>>,
    };
  },

  async attendance(supabase, spec) {
    const fromIso = watDateBoundary(spec.period.from, false);
    const toIso = watDateBoundary(spec.period.to, true);

    // Strictly select counts/status columns only; never member_id.
    let query = supabase
      .from("event_attendance")
      .select("event_id, attendance_status, checked_in_at, recorded_at")
      .gte("recorded_at", fromIso)
      .lt("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .limit(MAX_REPORT_ROWS);

    if (spec.eventId) {
      query = query.eq("event_id", spec.eventId);
    }
    if (spec.filters.status) {
      query = query.eq("attendance_status", spec.filters.status);
    }

    const { data, error } = await query;
    return {
      error,
      rows: (data ?? []) as Array<Record<string, unknown>>,
    };
  },
};

export type ExecuteCustomReportOutcome =
  | {
      kind: "ok";
      result: CustomReportResult;
      understood: Array<{ label: string; value: string }>;
      metadata: CustomReportMetadata;
    }
  | { kind: "invalid"; error: string }
  | { kind: "too-large" }
  | { kind: "unavailable" };

export async function executeCustomReportSpec(
  supabase: SupabaseClient,
  rawSpec: unknown,
): Promise<ExecuteCustomReportOutcome> {
  const metadata = await loadCustomReportMetadata(supabase);
  const parsed = parseAndNormalizeReportSpec(rawSpec, metadata);
  if (!parsed.ok) {
    return { kind: "invalid", error: parsed.error };
  }

  const spec = parsed.spec;
  const fetcher = DATASET_FETCHERS[spec.dataset];
  const { error, rows } = await fetcher(supabase, spec);
  if (error) {
    return { kind: "unavailable" };
  }
  if (rows.length >= MAX_REPORT_ROWS) {
    return { kind: "too-large" };
  }

  const eventTitlesById: Record<string, string> = {};
  for (const ev of metadata.events) {
    eventTitlesById[ev.id] = ev.title;
  }

  const result = aggregateCustomReport(spec, rows, { eventTitlesById });
  return {
    kind: "ok",
    result,
    understood: buildUnderstoodSummary(spec, metadata),
    metadata,
  };
}
