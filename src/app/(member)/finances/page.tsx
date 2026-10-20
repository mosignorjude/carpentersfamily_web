import { redirect } from "next/navigation";
import { FinancesPageView } from "@/components/finances/finances-page-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FinanceCategory, FinanceTransaction } from "./finance-forms";

const PAGE_SIZE = 50;

type FinanceAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

type FinanceReceipt = {
  id: string;
  transaction_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

type EventLedgerEntry = {
  id: string;
  event_id: string;
  generation: number;
  entry_kind: string;
  event_status: string;
  signed_amount_ngn: number | string;
  created_at: string;
};

function todayInWAT() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function pageNumber(value?: string) {
  if (!value || !/^\d{1,6}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    page?: string;
    audit_page?: string;
  }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="p-6 max-w-xl mx-auto my-12 bg-white rounded-2xl border border-[#E5DDD3] shadow-xs text-center space-y-3">
        <h1 className="text-xl font-extrabold text-[#3D291F]">
          Club finances unavailable
        </h1>
        <p className="text-xs text-[#54433A]">
          No financial data was displayed because membership could not be
          verified.
        </p>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    return (
      <main className="p-6 max-w-xl mx-auto my-12 bg-white rounded-2xl border border-[#E5DDD3] shadow-xs text-center space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-[#BA3C2A]">
          Member privacy
        </p>
        <h1 className="text-xl font-extrabold text-[#3D291F]">Access denied</h1>
        <p className="text-xs text-[#54433A]">
          This account cannot access club financial records.
        </p>
      </main>
    );
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  const roles = new Set(
    roleError ? [] : (roleRows ?? []).map((row) => row.role),
  );
  const isOfficer =
    !roleError &&
    ["executive", "admin", "backup_admin"].some((role) => roles.has(role));
  const canCorrect =
    !roleError && (roles.has("admin") || roles.has("backup_admin"));

  const requestedPage = pageNumber(params.page);
  const requestedAuditPage = pageNumber(params.audit_page);
  const [transactionCountResult, categoryResult, summaryResult] =
    await Promise.all([
      supabase
        .from("club_financial_transactions")
        .select(
          "id, kind, amount_ngn, transaction_date, description, category_id, category_name_snapshot, payer_payee, source_note, created_at, updated_at, voided_at, void_reason",
          { count: "exact", head: true },
        ),
      supabase
        .from("finance_categories")
        .select("id, name, retired_at")
        .order("name", { ascending: true })
        .limit(200),
      supabase.rpc("club_finance_summary"),
    ]);
  const transactionCount = transactionCountResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(transactionCount / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const [transactionResult, auditCountResult] = await Promise.all([
    supabase
      .from("club_financial_transactions")
      .select(
        "id, kind, amount_ngn, transaction_date, description, category_id, category_name_snapshot, payer_payee, source_note, created_at, updated_at, voided_at, void_reason",
      )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    isOfficer
      ? supabase
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .in("action", [
            "club_finance_recorded",
            "club_finance_corrected",
            "club_finance_voided",
            "club_finance_receipt_attached",
            "finance_category_created",
            "finance_category_retired",
            "event_finance_category_created",
            "event_finance_category_renamed",
            "event_finance_category_retired",
          ])
      : Promise.resolve({ count: 0, error: null }),
  ]);
  const auditCount = auditCountResult.count ?? 0;
  const auditPageCount = Math.max(1, Math.ceil(auditCount / PAGE_SIZE));
  const auditPage = Math.min(requestedAuditPage, auditPageCount - 1);
  const auditResult = isOfficer
    ? await supabase
        .from("audit_log")
        .select(
          "id, actor_id, action, entity_id, before_data, after_data, reason, occurred_at",
        )
        .in("action", [
          "club_finance_recorded",
          "club_finance_corrected",
          "club_finance_voided",
          "club_finance_receipt_attached",
          "finance_category_created",
          "finance_category_retired",
          "event_finance_category_created",
          "event_finance_category_renamed",
          "event_finance_category_retired",
        ])
        .order("occurred_at", { ascending: false })
        .range(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE - 1)
    : null;

  const categories = (categoryResult.data ?? []) as FinanceCategory[];
  const transactions = (transactionResult.data ?? []) as FinanceTransaction[];
  const receiptResult = transactions.length
    ? await supabase
        .from("club_financial_receipts")
        .select(
          "id, transaction_id, original_filename, content_type, size_bytes, uploaded_at",
        )
        .in(
          "transaction_id",
          transactions.map((transaction) => transaction.id),
        )
        .order("uploaded_at", { ascending: true })
        .limit(1000)
    : null;
  const receipts = (receiptResult?.data ?? []) as FinanceReceipt[];
  const receiptsByTransaction = new Map<string, FinanceReceipt[]>();
  for (const receipt of receipts) {
    const linkedReceipts = receiptsByTransaction.get(receipt.transaction_id);
    if (linkedReceipts) linkedReceipts.push(receipt);
    else receiptsByTransaction.set(receipt.transaction_id, [receipt]);
  }
  const receiptUnavailable = Boolean(receiptResult?.error);
  const eventLedgerResult = await supabase
    .from("event_ledger_entries")
    .select(
      "id, event_id, generation, entry_kind, event_status, signed_amount_ngn, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const eventLedgerEntries = (eventLedgerResult.data ??
    []) as EventLedgerEntry[];
  const eventLedgerEventsResult = eventLedgerEntries.length
    ? await supabase
        .from("events")
        .select("id, title")
        .in("id", [
          ...new Set(eventLedgerEntries.map((entry) => entry.event_id)),
        ])
    : { data: [], error: null };
  const eventTitles = new Map(
    (eventLedgerEventsResult.data ?? []).map((event) => [
      event.id,
      event.title,
    ]),
  );
  const financeUnavailable = Boolean(
    transactionCountResult.error ||
      transactionResult.error ||
      summaryResult.error,
  );
  const categoryUnavailable = Boolean(categoryResult.error);
  const summary = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  const auditError = Boolean(auditResult?.error);
  const auditRows = (auditResult?.data ?? []) as FinanceAuditRow[];
  let actorNames = new Map<string, string>();
  if (isOfficer && auditRows.length > 0) {
    const actorIds = [...new Set(auditRows.map((entry) => entry.actor_id))];
    const { data } = await supabase
      .from("member_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    actorNames = new Map((data ?? []).map((item) => [item.id, item.full_name]));
  }

  const today = todayInWAT();

  return (
    <FinancesPageView
      actorNames={actorNames}
      auditCount={auditCount}
      auditError={auditError}
      auditPage={auditPage}
      auditPageCount={auditPageCount}
      auditRows={auditRows}
      canCorrect={canCorrect}
      categories={categories}
      categoryUnavailable={categoryUnavailable}
      eventLedgerEntries={eventLedgerEntries}
      eventTitles={eventTitles}
      financeUnavailable={financeUnavailable}
      isOfficer={isOfficer}
      notice={params.notice}
      page={page}
      pageCount={pageCount}
      pageSize={PAGE_SIZE}
      receiptUnavailable={receiptUnavailable}
      receiptsByTransaction={receiptsByTransaction}
      roleError={Boolean(roleError)}
      summary={summary}
      today={today}
      transactionCount={transactionCount}
      transactions={transactions}
    />
  );
}
