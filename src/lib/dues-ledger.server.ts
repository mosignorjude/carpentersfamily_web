import "server-only";

import type { DuesPaymentRequestItem } from "@/components/dues/officer-dues-approvals-card";
import type { ReceiptInfo } from "@/components/finances/receipt-cell";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type DuesStatusRow = {
  member_id: string;
  covered_month: string;
  amount_ngn: number | string | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
};

export type DuesLedgerPaymentRow = {
  id: string;
  member_id: string;
  amount_ngn: number | string;
  payment_date: string;
  payment_method: string | null;
  request_id: string | null;
  recorded_by: string;
  recorded_at: string;
  corrected_at: string | null;
  receipts: ReceiptInfo[];
  receiptUnavailable?: boolean;
};

export type DuesDispositionRow = {
  payment_id: string | null;
  covered_month: string;
  amount_ngn: number | string;
  is_current: boolean;
};

export type DuesLedgerAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  target_member_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

const DUES_AUDIT_ACTIONS = [
  "dues_payment_recorded",
  "dues_payment_corrected",
  "dues_month_written_off",
  "dues_rate_changed",
  "dues_payment_request_submitted",
  "dues_payment_request_approved",
  "dues_payment_request_rejected",
  "finance_receipt_attached",
] as const;

type FinanceReceiptQueryRow = {
  id: string;
  dues_payment_id: string | null;
  dues_request_id: string | null;
  original_filename: string;
  content_type: string;
  size_bytes: number;
};

function toReceiptInfo(row: FinanceReceiptQueryRow): ReceiptInfo {
  return {
    id: row.id,
    filename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
  };
}

export async function loadMemberDuesLedger({
  supabase,
  targetMemberId,
  paymentPage,
  auditPage,
  pageSize,
  includeAudit,
}: {
  supabase: ServerSupabaseClient;
  targetMemberId: string;
  paymentPage: number;
  auditPage: number;
  pageSize: number;
  includeAudit: boolean;
}) {
  const [
    statusResult,
    paymentResult,
    rateResult,
    memberRequestsResult,
    targetRolesResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("dues_month_status")
      .select(
        "member_id, covered_month, amount_ngn, status, due_date, is_overdue",
      )
      .eq("member_id", targetMemberId)
      .order("covered_month", { ascending: true })
      .limit(1200),
    supabase
      .from("dues_payments")
      .select(
        "id, member_id, amount_ngn, payment_date, payment_method, request_id, recorded_by, recorded_at, corrected_at",
        { count: "exact" },
      )
      .eq("member_id", targetMemberId)
      .order("payment_date", { ascending: false })
      .order("recorded_at", { ascending: false })
      .range(paymentPage * pageSize, (paymentPage + 1) * pageSize - 1),
    supabase
      .from("dues_rates")
      .select(
        "id, effective_month, monthly_amount_ngn, changed_by, changed_at, reason",
      )
      .order("effective_month", { ascending: true })
      .limit(1200),
    supabase
      .from("dues_payment_requests")
      .select(
        "id, member_id, amount_ngn, covered_months, payment_method, notes, status, created_at, reviewed_by, reviewed_at, review_reason",
      )
      .eq("member_id", targetMemberId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", targetMemberId)
      .is("revoked_at", null),
    includeAudit
      ? supabase
          .from("audit_log")
          .select(
            "id, actor_id, action, entity_type, entity_id, target_member_id, before_data, after_data, reason, occurred_at",
            { count: "exact" },
          )
          .in("action", [...DUES_AUDIT_ACTIONS])
          .or(
            `target_member_id.eq.${targetMemberId},action.eq.dues_rate_changed`,
          )
          .order("occurred_at", { ascending: false })
          .range(auditPage * pageSize, (auditPage + 1) * pageSize - 1)
      : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);

  const duesRows = (statusResult.data ?? []) as DuesStatusRow[];
  const rawPayments = (paymentResult.data ?? []) as Array<
    Omit<DuesLedgerPaymentRow, "receipts" | "receiptUnavailable">
  >;
  const rates = rateResult.data ?? [];
  const memberRequests = (memberRequestsResult.data ??
    []) as DuesPaymentRequestItem[];
  const targetRoles = (targetRolesResult.data ?? []).map((row) => row.role);
  const targetIsDuesExempt = targetRoles.includes("admin");

  const paymentIds = rawPayments.map((payment) => payment.id);
  const requestIdsForReceipts = [
    ...new Set([
      ...memberRequests.map((req) => req.id),
      ...rawPayments
        .map((payment) => payment.request_id)
        .filter((id): id is string => Boolean(id)),
    ]),
  ];

  const [coverageRes, directReceiptsRes, requestReceiptsRes] =
    await Promise.all([
      paymentIds.length > 0
        ? supabase
            .from("dues_month_dispositions")
            .select("payment_id, covered_month, amount_ngn, is_current")
            .in("payment_id", paymentIds)
            .eq("is_current", true)
            .order("covered_month", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      paymentIds.length > 0
        ? supabase
            .from("finance_receipts")
            .select(
              "id, dues_payment_id, dues_request_id, original_filename, content_type, size_bytes",
            )
            .in("dues_payment_id", paymentIds)
        : Promise.resolve({ data: [], error: null }),
      requestIdsForReceipts.length > 0
        ? supabase
            .from("finance_receipts")
            .select(
              "id, dues_payment_id, dues_request_id, original_filename, content_type, size_bytes",
            )
            .in("dues_request_id", requestIdsForReceipts)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const coverageError = Boolean(coverageRes.error);
  const coverageRows = (coverageRes.data ?? []) as DuesDispositionRow[];

  const directReceiptsUnavailable = Boolean(directReceiptsRes.error);
  const requestReceiptsUnavailable = Boolean(requestReceiptsRes.error);

  const receiptsByPaymentId = new Map<string, ReceiptInfo[]>();
  for (const row of (directReceiptsRes.data ??
    []) as FinanceReceiptQueryRow[]) {
    if (!row.dues_payment_id) continue;
    const list = receiptsByPaymentId.get(row.dues_payment_id) ?? [];
    list.push(toReceiptInfo(row));
    receiptsByPaymentId.set(row.dues_payment_id, list);
  }

  const receiptByRequestId = new Map<string, ReceiptInfo>();
  for (const row of (requestReceiptsRes.data ??
    []) as FinanceReceiptQueryRow[]) {
    if (!row.dues_request_id) continue;
    receiptByRequestId.set(row.dues_request_id, toReceiptInfo(row));
  }

  const payments: DuesLedgerPaymentRow[] = rawPayments.map((payment) => {
    const direct = receiptsByPaymentId.get(payment.id) ?? [];
    const reqReceipt = payment.request_id
      ? receiptByRequestId.get(payment.request_id)
      : undefined;
    const merged = [...direct];
    if (reqReceipt && !merged.some((item) => item.id === reqReceipt.id)) {
      merged.push(reqReceipt);
    }
    return {
      ...payment,
      receipts: merged,
      receiptUnavailable:
        merged.length === 0 &&
        (directReceiptsUnavailable ||
          (Boolean(payment.request_id) && requestReceiptsUnavailable)),
    };
  });

  for (const req of memberRequests) {
    req.receipt = receiptByRequestId.get(req.id) ?? null;
    if (requestReceiptsUnavailable && !req.receipt) {
      req.receiptUnavailable = true;
    }
  }

  const duesAudit = (auditResult.data ?? []) as DuesLedgerAuditRow[];
  const auditError = Boolean(auditResult.error);
  const auditCount = auditResult.count ?? 0;

  const actorIds = [...new Set(duesAudit.map((entry) => entry.actor_id))];
  let actorNames = new Map<string, string>();
  if (includeAudit && actorIds.length > 0) {
    const { data } = await supabase
      .from("member_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    actorNames = new Map(
      (data ?? []).map((entry) => [entry.id, entry.full_name]),
    );
  }

  const coverageByPayment = new Map<string, string[]>();
  for (const coverage of coverageRows) {
    if (!coverage.payment_id) continue;
    const months = coverageByPayment.get(coverage.payment_id) ?? [];
    months.push(coverage.covered_month);
    coverageByPayment.set(coverage.payment_id, months);
  }

  const detailedDataError = Boolean(
    statusResult.error || paymentResult.error || coverageError,
  );

  return {
    duesRows,
    payments,
    totalPaymentsCount: paymentResult.count ?? 0,
    rates,
    coverageByPayment,
    memberRequests,
    targetRoles,
    targetIsDuesExempt,
    duesAudit,
    auditError,
    auditCount,
    actorNames,
    detailedDataError,
  };
}
