import { createHash } from "node:crypto";

export type AiReportType =
  | "club_finance"
  | "dues"
  | "event_finance"
  | "club_overview"
  | "custom";

export interface ClubFinanceSummaryInput {
  dues_income: string | number;
  other_income: string | number;
  expenses: string | number;
  event_inflow: string | number;
  event_outflow: string | number;
  balance: string | number;
}

export interface ClubFinanceTxnInput {
  kind: string;
  is_opening_balance: boolean;
  amount_ngn: string | number;
  transaction_date: string;
  category_name_snapshot: string | null;
  voided_at: string | null;
}

export interface DuesRowInput {
  member_id: string;
  covered_month: string;
  amount_ngn: string | number | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
}

export interface EventFinanceSummaryInput {
  paid_income_ngn: string | number;
  pending_income_ngn: string | number;
  unpaid_income_ngn: string | number;
  actual_expense_ngn: string | number;
  committed_expense_ngn: string | number;
  ticket_income_ngn: string | number;
  tickets_sold: string | number;
  net_result_ngn: string | number;
}

export interface EventTxnInput {
  kind: "income" | "expense" | string;
  amount_ngn: string | number;
  transaction_date: string;
  category_name_snapshot: string | null;
  payment_status: string;
}

export interface EventSaleInput {
  tier_name?: string | null;
  quantity: number;
  amount_ngn: string | number;
  refunded_at: string | null;
  verification_status: string;
}

export interface ClubOverviewRpcInput {
  period_label: string;
  period_start: string;
  period_end: string;
  club_finance: {
    period_dues_collected_ngn: string | number;
    period_other_income_ngn: string | number;
    period_expenses_ngn: string | number;
    current_club_balance_ngn: string | number;
    expense_by_category: Array<{ category: string; amount: string | number }>;
  };
  dues: {
    active_members: string | number;
    paid_rows_in_period: string | number;
    unpaid_rows_in_period: string | number;
    overdue_rows_as_of_end: string | number;
    overdue_three_plus_members: string | number;
    paid_amount_ngn: string | number;
    owed_through_end_ngn: string | number;
  };
  events: {
    events_count: string | number;
    completed_count: string | number;
    scheduled_count: string | number;
    cancelled_count: string | number;
    event_cash_in_ngn: string | number;
    event_cash_out_ngn: string | number;
    ticket_revenue_ngn: string | number;
    tickets_sold: string | number;
    top_events: Array<{ title: string; net_result_ngn: string | number }>;
  };
  attendance: {
    sessions_count: string | number;
    total_checkins: string | number;
  };
}

function toWholeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

/**
 * Strip control chars, angle brackets, and cap length on category/event labels
 * so untrusted names cannot inject prompts or markup.
 */
export function sanitizeLabel(
  value: string | null | undefined,
  fallback: string,
  maxLength = 80,
): string {
  if (!value) return fallback;
  let withoutControls = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || ch === "<" || ch === ">") {
      withoutControls += " ";
    } else {
      withoutControls += ch;
    }
  }
  const cleaned = withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : fallback;
}

function roundPct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    const out: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      out[key] = sortCanonical(val);
    }
    return out;
  }
  return value;
}

export function factsFingerprint(facts: unknown): string {
  const canonical = JSON.stringify(sortCanonical(facts));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildClubFinanceFacts(input: {
  year: number;
  asOf: string;
  summary: ClubFinanceSummaryInput;
  transactions: ClubFinanceTxnInput[];
}) {
  const monthlyMap = new Map<string, { income: number; expenses: number }>();
  const expenseCatMap = new Map<string, number>();
  const incomeCatMap = new Map<string, number>();

  let postedIncomeTxns = 0;
  let postedExpenseTxns = 0;
  let voidedCount = 0;
  let openingBalanceTotal = 0;
  let totalOperatingExpenses = 0;
  let totalOperatingIncome = 0;

  for (const txn of input.transactions) {
    if (txn.voided_at) {
      voidedCount += 1;
      continue;
    }
    const amt = toWholeNumber(txn.amount_ngn);
    const month = txn.transaction_date.slice(0, 7);
    const category = sanitizeLabel(txn.category_name_snapshot, "Uncategorized");

    if (txn.is_opening_balance && txn.kind === "income") {
      openingBalanceTotal += amt;
      continue;
    }

    const monthBucket = monthlyMap.get(month) ?? { income: 0, expenses: 0 };
    if (txn.kind === "income") {
      monthBucket.income += amt;
      postedIncomeTxns += 1;
      totalOperatingIncome += amt;
      incomeCatMap.set(category, (incomeCatMap.get(category) ?? 0) + amt);
    } else if (txn.kind === "expense") {
      monthBucket.expenses += amt;
      postedExpenseTxns += 1;
      totalOperatingExpenses += amt;
      expenseCatMap.set(category, (expenseCatMap.get(category) ?? 0) + amt);
    }
    monthlyMap.set(month, monthBucket);
  }

  return {
    report: "club_finance" as const,
    period: `${input.year}-01-01..${input.asOf}`,
    currency: "NGN" as const,
    totals: {
      dues_income: toWholeNumber(input.summary.dues_income),
      other_income: toWholeNumber(input.summary.other_income),
      expenses: toWholeNumber(input.summary.expenses),
      event_inflow: toWholeNumber(input.summary.event_inflow),
      event_outflow: toWholeNumber(input.summary.event_outflow),
      balance: toWholeNumber(input.summary.balance),
      opening_balance_total: openingBalanceTotal,
      posted_income_txns: postedIncomeTxns,
      posted_expense_txns: postedExpenseTxns,
      voided_count: voidedCount,
    },
    monthly: [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({
        month,
        income: bucket.income,
        expenses: bucket.expenses,
      })),
    expense_by_category: [...expenseCatMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([category, amount]) => ({
        category,
        amount,
        share_pct: roundPct(amount, totalOperatingExpenses),
      })),
    income_by_category: [...incomeCatMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([category, amount]) => ({
        category,
        amount,
        share_pct: roundPct(amount, totalOperatingIncome),
      })),
  };
}

export function buildDuesFacts(input: {
  year: number;
  asOf: string;
  rows: DuesRowInput[];
}) {
  const currentMonth = input.asOf.slice(0, 7);
  const memberOverdueCount = new Map<string, number>();
  const monthlyMap = new Map<
    string,
    {
      paid_count: number;
      unpaid_count: number;
      overdue_count: number;
      written_off_count: number;
      paid_ngn: number;
      unpaid_ngn: number;
    }
  >();

  let paidRows = 0;
  let unpaidRows = 0;
  let overdueRows = 0;
  let writtenOffRows = 0;
  let upcomingRows = 0;
  let paidAmountNgn = 0;
  let owedThroughAsOfNgn = 0;

  for (const row of input.rows) {
    if (!memberOverdueCount.has(row.member_id)) {
      memberOverdueCount.set(row.member_id, 0);
    }
    const amt = toWholeNumber(row.amount_ngn);
    const month = row.covered_month.slice(0, 7);
    const bucket = monthlyMap.get(month) ?? {
      paid_count: 0,
      unpaid_count: 0,
      overdue_count: 0,
      written_off_count: 0,
      paid_ngn: 0,
      unpaid_ngn: 0,
    };

    if (row.status === "paid") {
      paidRows += 1;
      paidAmountNgn += amt;
      bucket.paid_count += 1;
      bucket.paid_ngn += amt;
    } else if (row.status === "written_off") {
      writtenOffRows += 1;
      bucket.written_off_count += 1;
    } else if (row.status === "unpaid") {
      if (row.due_date <= input.asOf) {
        owedThroughAsOfNgn += amt;
      }
      if (row.is_overdue) {
        overdueRows += 1;
        bucket.overdue_count += 1;
        bucket.unpaid_ngn += amt;
        memberOverdueCount.set(
          row.member_id,
          (memberOverdueCount.get(row.member_id) ?? 0) + 1,
        );
      } else if (month > currentMonth) {
        upcomingRows += 1;
        bucket.unpaid_count += 1;
        bucket.unpaid_ngn += amt;
      } else {
        unpaidRows += 1;
        bucket.unpaid_count += 1;
        bucket.unpaid_ngn += amt;
      }
    }

    monthlyMap.set(month, bucket);
  }

  let zeroMonths = 0;
  let oneMonth = 0;
  let twoMonths = 0;
  let threePlusMonths = 0;
  for (const overdueCount of memberOverdueCount.values()) {
    if (overdueCount === 0) zeroMonths += 1;
    else if (overdueCount === 1) oneMonth += 1;
    else if (overdueCount === 2) twoMonths += 1;
    else threePlusMonths += 1;
  }

  return {
    report: "dues" as const,
    period: `${input.year}-01-01..${input.asOf}`,
    currency: "NGN" as const,
    totals: {
      distinct_members: memberOverdueCount.size,
      total_months_due_rows: input.rows.length,
      paid_rows: paidRows,
      unpaid_rows: unpaidRows,
      overdue_rows: overdueRows,
      written_off_rows: writtenOffRows,
      upcoming_rows: upcomingRows,
      paid_amount_ngn: paidAmountNgn,
      owed_through_as_of_ngn: owedThroughAsOfNgn,
      collection_rate_pct: roundPct(
        paidAmountNgn,
        paidAmountNgn + owedThroughAsOfNgn,
      ),
    },
    overdue_member_buckets: {
      zero_months: zeroMonths,
      one_month: oneMonth,
      two_months: twoMonths,
      three_plus_months: threePlusMonths,
    },
    monthly: [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({
        month,
        ...bucket,
      })),
  };
}

export function buildEventFinanceFacts(input: {
  eventTitle: string;
  from: string | null;
  to: string | null;
  summary: EventFinanceSummaryInput;
  transactions: EventTxnInput[];
  sales: EventSaleInput[];
}) {
  const expenseCatMap = new Map<string, { paid: number; committed: number }>();
  const incomeCatMap = new Map<string, { paid: number; pending: number }>();
  let totalPaidExpense = 0;

  for (const txn of input.transactions) {
    const amt = toWholeNumber(txn.amount_ngn);
    const category = sanitizeLabel(txn.category_name_snapshot, "Uncategorized");
    if (txn.kind === "expense") {
      const bucket = expenseCatMap.get(category) ?? { paid: 0, committed: 0 };
      if (txn.payment_status === "paid" || txn.payment_status === "deposit") {
        bucket.paid += amt;
        totalPaidExpense += amt;
      } else {
        bucket.committed += amt;
      }
      expenseCatMap.set(category, bucket);
    } else if (txn.kind === "income") {
      const bucket = incomeCatMap.get(category) ?? { paid: 0, pending: 0 };
      if (txn.payment_status === "paid") bucket.paid += amt;
      else bucket.pending += amt;
      incomeCatMap.set(category, bucket);
    }
  }

  const tierMap = new Map<
    string,
    { approved_qty: number; approved_amount: number; refunded_qty: number }
  >();
  let pendingTicketOrdersCount = 0;

  for (const sale of input.sales) {
    if (sale.verification_status === "recorded") {
      pendingTicketOrdersCount += 1;
      continue;
    }
    if (sale.verification_status !== "approved") continue;

    const tier = sanitizeLabel(sale.tier_name, "Ticket Tier");
    const bucket = tierMap.get(tier) ?? {
      approved_qty: 0,
      approved_amount: 0,
      refunded_qty: 0,
    };
    if (sale.refunded_at) {
      bucket.refunded_qty += sale.quantity;
    } else {
      bucket.approved_qty += sale.quantity;
      bucket.approved_amount += toWholeNumber(sale.amount_ngn);
    }
    tierMap.set(tier, bucket);
  }

  return {
    report: "event_finance" as const,
    event_title: sanitizeLabel(input.eventTitle, "Club Event", 120),
    period: `${input.from ?? "all"}..${input.to ?? "all"}`,
    currency: "NGN" as const,
    summary: {
      paid_income_ngn: toWholeNumber(input.summary.paid_income_ngn),
      pending_income_ngn: toWholeNumber(input.summary.pending_income_ngn),
      unpaid_income_ngn: toWholeNumber(input.summary.unpaid_income_ngn),
      actual_expense_ngn: toWholeNumber(input.summary.actual_expense_ngn),
      committed_expense_ngn: toWholeNumber(input.summary.committed_expense_ngn),
      ticket_income_ngn: toWholeNumber(input.summary.ticket_income_ngn),
      tickets_sold: toWholeNumber(input.summary.tickets_sold),
      net_result_ngn: toWholeNumber(input.summary.net_result_ngn),
    },
    posted_transactions_count: input.transactions.length,
    pending_ticket_orders_count: pendingTicketOrdersCount,
    expense_by_category: [...expenseCatMap.entries()]
      .sort((a, b) => b[1].paid - a[1].paid || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([category, bucket]) => ({
        category,
        paid_amount: bucket.paid,
        committed_amount: bucket.committed,
        share_pct: roundPct(bucket.paid, totalPaidExpense),
      })),
    income_by_category: [...incomeCatMap.entries()]
      .sort((a, b) => b[1].paid - a[1].paid || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([category, bucket]) => ({
        category,
        paid_amount: bucket.paid,
        pending_amount: bucket.pending,
      })),
    ticket_tiers: [...tierMap.entries()]
      .sort(
        (a, b) =>
          b[1].approved_amount - a[1].approved_amount ||
          a[0].localeCompare(b[0]),
      )
      .slice(0, 12)
      .map(([tier, bucket]) => ({
        tier,
        ...bucket,
      })),
  };
}

export function buildClubOverviewFacts(raw: ClubOverviewRpcInput) {
  const periodExpenses = toWholeNumber(raw.club_finance.period_expenses_ngn);
  const paidDues = toWholeNumber(raw.dues.paid_amount_ngn);
  const owedDues = toWholeNumber(raw.dues.owed_through_end_ngn);
  const eventCashIn = toWholeNumber(raw.events.event_cash_in_ngn);
  const eventCashOut = toWholeNumber(raw.events.event_cash_out_ngn);

  return {
    report: "club_overview" as const,
    period_label: sanitizeLabel(raw.period_label, raw.period_start, 40),
    period: `${raw.period_start}..${raw.period_end}`,
    currency: "NGN" as const,
    club_finance: {
      period_dues_collected_ngn: toWholeNumber(
        raw.club_finance.period_dues_collected_ngn,
      ),
      period_other_income_ngn: toWholeNumber(
        raw.club_finance.period_other_income_ngn,
      ),
      period_expenses_ngn: periodExpenses,
      current_club_balance_ngn: toWholeNumber(
        raw.club_finance.current_club_balance_ngn,
      ),
      expense_by_category: raw.club_finance.expense_by_category
        .slice(0, 10)
        .map((item) => {
          const amount = toWholeNumber(item.amount);
          return {
            category: sanitizeLabel(item.category, "Uncategorized"),
            amount,
            share_pct: roundPct(amount, periodExpenses),
          };
        }),
    },
    dues: {
      active_members: toWholeNumber(raw.dues.active_members),
      paid_rows_in_period: toWholeNumber(raw.dues.paid_rows_in_period),
      unpaid_rows_in_period: toWholeNumber(raw.dues.unpaid_rows_in_period),
      overdue_rows_as_of_end: toWholeNumber(raw.dues.overdue_rows_as_of_end),
      overdue_three_plus_members: toWholeNumber(
        raw.dues.overdue_three_plus_members,
      ),
      paid_amount_ngn: paidDues,
      owed_through_end_ngn: owedDues,
      collection_rate_pct: roundPct(paidDues, paidDues + owedDues),
    },
    events: {
      events_count: toWholeNumber(raw.events.events_count),
      completed_count: toWholeNumber(raw.events.completed_count),
      scheduled_count: toWholeNumber(raw.events.scheduled_count),
      cancelled_count: toWholeNumber(raw.events.cancelled_count),
      event_cash_in_ngn: eventCashIn,
      event_cash_out_ngn: eventCashOut,
      net_event_cash_ngn: eventCashIn - eventCashOut,
      ticket_revenue_ngn: toWholeNumber(raw.events.ticket_revenue_ngn),
      tickets_sold: toWholeNumber(raw.events.tickets_sold),
      top_events: raw.events.top_events.slice(0, 5).map((ev) => ({
        title: sanitizeLabel(ev.title, "Club Event", 100),
        net_result_ngn: toWholeNumber(ev.net_result_ngn),
      })),
    },
    attendance: {
      sessions_count: toWholeNumber(raw.attendance.sessions_count),
      total_checkins: toWholeNumber(raw.attendance.total_checkins),
    },
  };
}
