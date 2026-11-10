import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ActivityLogItem,
  DashboardClubMember,
  DashboardCostCenter,
  DashboardEventInfo,
  DashboardRevenueStream,
  DashboardTab,
  DashboardTeamMember,
  DashboardTicketTier,
  DashboardTransaction,
  EventFinanceCategoryItem,
  ExpenseCategory,
  RevenueCategory,
} from "@/components/events/dashboard/dashboard-types";
import { EventDashboardView } from "@/components/events/dashboard/event-dashboard-view";
import type { EventRow } from "@/components/events/event-types";
import { isAiReportsEnabled } from "@/lib/ai/provider.server";
import { getEventCardAccess } from "@/lib/event-card-access.mjs";
import { partitionExpensesByAllocation } from "@/lib/event-cost-centers.mjs";
import {
  formatEventDateSpan,
  formatEventDurationLabel,
  formatEventTime,
} from "@/lib/event-times.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dashboardNoticeMap: Record<
  string,
  { message: string; isError?: boolean }
> = {
  "category-created": {
    message: "Category created.",
  },
  "category-renamed": {
    message: "Category renamed.",
  },
  "category-retired": {
    message: "Category retired.",
  },
  "budget-saved": {
    message: "Budget saved.",
  },
  "transaction-recorded": {
    message: "Transaction recorded.",
  },
  "transaction-corrected": {
    message: "Transaction updated.",
  },
  "transaction-voided": {
    message: "Transaction voided.",
  },
  "tier-saved": {
    message: "Ticket tier saved.",
  },
  "tier-retired": {
    message: "Ticket tier retired.",
  },
  "ticket-recorded": {
    message: "Ticket sale recorded.",
  },
  "ticket-refunded": {
    message: "Ticket sale refunded.",
  },
  saved: {
    message: "Transaction recorded.",
  },
  corrected: {
    message: "Transaction updated.",
  },
  voided: {
    message: "Transaction voided.",
  },
  "sale-saved": {
    message: "Ticket sale recorded.",
  },
  "sale-edited": {
    message: "Ticket sale updated.",
  },
  refunded: {
    message: "Ticket sale refunded.",
  },
  updated: {
    message: "Event details updated.",
  },
  completed: {
    message: "Event marked as completed.",
  },
  cancelled: {
    message: "Event cancelled.",
  },
  reopened: {
    message: "Event reopened for planning.",
  },
  archived: {
    message: "Event archived.",
  },
  "event-role-assigned": {
    message: "Committee role assigned.",
  },
  "event-role-revoked": {
    message: "Committee role removed.",
  },
  denied: {
    message: "You are not authorized to perform that action.",
    isError: true,
  },
  "invalid-request": {
    message: "Check the submitted fields and try again.",
    isError: true,
  },
  "operation-failed": {
    message: "The requested change could not be saved.",
    isError: true,
  },
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash Voucher",
  bank_transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  card: "POS / Card Terminal",
  cheque: "Cheque / Draft",
  other: "Other Channel",
};

export default async function EventDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string; notice?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  ) {
    redirect("/events?notice=invalid-request");
  }

  const notice =
    typeof query.notice === "string" &&
    Object.hasOwn(dashboardNoticeMap, query.notice)
      ? dashboardNoticeMap[query.notice]
      : undefined;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        <section className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-[#3D291F]">
            Event Dashboard Unavailable
          </h1>
          <p className="text-xs text-[#7A685D]">
            Database connection could not be established. Please retry shortly.
          </p>
          <Link
            className="inline-flex items-center text-xs font-semibold text-[#174C37] hover:underline"
            href="/events"
          >
            ← Back to events
          </Link>
        </section>
      </div>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/?notice=sign-in");
  }

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status,full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || profile?.status !== "active") {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        <section className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-[#BA3C2A]">Access Denied</h1>
          <p className="text-xs text-[#7A685D]">
            Your membership account is not authorized to access event
            dashboards.
          </p>
          <Link
            className="inline-flex items-center text-xs font-semibold text-[#174C37] hover:underline"
            href="/events"
          >
            ← Back to events
          </Link>
        </section>
      </div>
    );
  }

  const [
    eventResult,
    clubRolesResult,
    eventRolesResult,
    teamResult,
    tiersResult,
    salesResult,
    budgetResult,
    allocationsResult,
    transactionsResult,
    categoriesResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, event_type, starts_at, duration_days, ends_at, location, status, status_changed_at, archived_at, created_at, updated_at, description, minutes_enabled, attendance_enabled, income_enabled, expenses_enabled, ticketing_enabled, budget_enabled",
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select("role")
      .eq("event_id", eventId)
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select(
        "id, role, member_id, member_profiles:member_id (full_name, username)",
      )
      .eq("event_id", eventId)
      .is("revoked_at", null)
      .order("assigned_at", { ascending: true }),
    supabase
      .from("event_ticket_tiers")
      .select("id, name, price_ngn, capacity, retired_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_ticket_sales")
      .select(
        "id, tier_id, quantity, amount_ngn, buyer_name, payment_method, created_at, refunded_at, refund_reason, seller_id, verification_status, verified_by, verified_at, rejection_reason, public_reference, source",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_budgets")
      .select("total_ngn")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("event_budget_allocations")
      .select(
        "position, category_id, allocation_name, amount_ngn, allocation_percent",
      )
      .eq("event_id", eventId)
      .order("position", { ascending: true }),
    supabase
      .from("event_financial_transactions")
      .select(
        "id, kind, amount_ngn, transaction_date, created_at, updated_at, description, payer_payee, source_note, payment_method, category_id, category_name_snapshot, budget_allocation_category_id, budget_allocation_name_snapshot, payment_status, voided_at, void_reason, created_by, verification_status, verified_by, verified_at, rejection_reason",
      )
      .eq("event_id", eventId)
      .order("transaction_date", { ascending: false }),
    supabase
      .from("event_finance_categories")
      .select("id, category_type, name, created_at, retired_at")
      .order("name", { ascending: true }),
    supabase
      .from("audit_log")
      .select("id, action, entity_type, reason, occurred_at, after_data")
      .eq("event_id", eventId)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  if (eventResult.error || !eventResult.data) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        <section className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-[#3D291F]">Event Not Found</h1>
          <p className="text-xs text-[#7A685D]">
            The requested event does not exist or has been removed.
          </p>
          <Link
            className="inline-flex items-center text-xs font-semibold text-[#174C37] hover:underline"
            href="/events"
          >
            ← Back to events
          </Link>
        </section>
      </div>
    );
  }

  const rawEvent = eventResult.data;
  const clubRoles = (clubRolesResult.data ?? []).map((r) => r.role);
  const eventRoles = (eventRolesResult.data ?? []).map((r) => r.role);

  const isAdmin =
    clubRoles.includes("admin") || clubRoles.includes("president");
  const isExecutive = clubRoles.includes("executive");
  const isEventLead =
    eventRoles.includes("lead") ||
    eventRoles.includes("event_lead") ||
    eventRoles.includes("assistant");

  const cardAccess = getEventCardAccess({
    roles: new Set(clubRoles),
    eventRoles: new Set(eventRoles),
    status: rawEvent.status,
    archivedAt: rawEvent.archived_at,
  });

  let computedRole = "member";
  if (isAdmin) computedRole = "admin";
  else if (isExecutive) computedRole = "executive";
  else if (isEventLead) computedRole = "event_lead";

  const isMutableEvent = cardAccess.mutable;
  const canManageCategories = (isAdmin || isEventLead) && isMutableEvent;
  const canDeleteCategories = isAdmin && isMutableEvent;
  const canManageTeamRoles = (isAdmin || isExecutive) && isMutableEvent;
  const canEditEvent = cardAccess.canEdit && isMutableEvent;
  const canManageLifecycle =
    (cardAccess.canSetStatus && isMutableEvent) ||
    (cardAccess.isManager &&
      !rawEvent.archived_at &&
      (rawEvent.status === "completed" || rawEvent.status === "cancelled"));

  const clubMembers: DashboardClubMember[] = canManageTeamRoles
    ? await supabase
        .from("member_profiles")
        .select("id, full_name, username")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(500)
        .then(({ data }) =>
          (data ?? []).map((m) => ({
            id: m.id,
            fullName: m.full_name || m.username || "Club Member",
            username: m.username ?? null,
          })),
        )
    : [];

  const eventInfo: DashboardEventInfo = {
    id: rawEvent.id,
    title: rawEvent.title,
    type: rawEvent.event_type,
    status: rawEvent.status,
    startsAt: rawEvent.starts_at,
    dateFormatted: formatEventDateSpan(
      rawEvent.starts_at,
      rawEvent.duration_days,
    ),
    timeWAT: formatEventTime(rawEvent.starts_at),
    durationLabel: formatEventDurationLabel(rawEvent.duration_days),
    durationDays: rawEvent.duration_days ?? 1,
    location: rawEvent.location,
    details: rawEvent.description ?? undefined,
    budgetCeiling: budgetResult.data?.total_ngn ?? 0,
    archivedAt: rawEvent.archived_at,
    ticketingEnabled: rawEvent.ticketing_enabled,
    attendanceEnabled: rawEvent.attendance_enabled,
    minutesEnabled: rawEvent.minutes_enabled,
  };

  // Team Members (strictly from real database assignments)
  const roleMap: Record<string, string> = {
    lead: "Event Lead",
    assistant: "Event Assistant",
    committee: "Committee Member",
    event_lead: "Event Lead",
    event_assistant: "Event Assistant",
    committee_member: "Committee Member",
  };
  const teamMembers: DashboardTeamMember[] = (teamResult.data ?? []).map(
    (row, idx) => {
      const profileData = Array.isArray(row.member_profiles)
        ? row.member_profiles[0]
        : (row.member_profiles as
            | { full_name?: string; username?: string }
            | null
            | undefined);
      return {
        id: row.id || `team-${idx + 1}`,
        memberId: row.member_id ?? undefined,
        name:
          profileData?.full_name || profileData?.username || "Assigned Officer",
        username: profileData?.username ?? null,
        role: roleMap[row.role] || row.role,
        roleKey: row.role,
        chapter: "",
      };
    },
  );

  // Ticket Tiers (strictly from real database tiers & unrefunded sales)
  const allSales = salesResult.data ?? [];
  const activeSales = allSales.filter(
    (s) => !s.refunded_at && s.verification_status === "approved",
  );
  const tierNameById = new Map<string, string>();
  const ticketTiers: DashboardTicketTier[] = (tiersResult.data ?? []).map(
    (t) => {
      tierNameById.set(t.id, t.name);
      const soldCount = activeSales
        .filter((s) => s.tier_id === t.id)
        .reduce((sum, s) => sum + s.quantity, 0);

      const status = t.retired_at
        ? "retired"
        : soldCount >= t.capacity
          ? "sold_out"
          : t.capacity - soldCount <= 10
            ? "limited"
            : "active";

      return {
        id: t.id,
        name: t.name,
        price: t.price_ngn,
        sold: soldCount,
        capacity: t.capacity,
        description: `Official admission pass for ${t.name}`,
        benefits: ["Verified event admission", "Club secretariat registry"],
        status,
        retiredAt: t.retired_at ?? null,
      };
    },
  );

  // Raw financial transactions
  const rawTxns = transactionsResult.data ?? [];
  const unvoidedExpenses = rawTxns.filter(
    (t) =>
      t.kind === "expense" &&
      !t.voided_at &&
      t.verification_status !== "rejected",
  );
  const unvoidedIncomes = rawTxns.filter(
    (t) =>
      t.kind === "income" &&
      !t.voided_at &&
      t.verification_status !== "rejected",
  );
  const isTxnApproved = (t: (typeof rawTxns)[number]) =>
    (t.verification_status ?? "approved") === "approved";
  const isExpenseSettled = (e: (typeof unvoidedExpenses)[number]) =>
    isTxnApproved(e) &&
    (e.payment_status === "paid" ||
      e.payment_status === "deposit" ||
      !e.payment_status);

  // Cost Centers / Budget Allocations (strictly from real database allocations & expenses)
  const categoryNameById = new Map<string, string>();
  const categoryCreatedAtById = new Map<string, string>();
  const categoryCreatedAtByName = new Map<string, string>();
  for (const c of categoriesResult.data ?? []) {
    categoryNameById.set(c.id, c.name);
    if (c.created_at) {
      categoryCreatedAtById.set(c.id, c.created_at);
      categoryCreatedAtByName.set(c.name.trim().toLowerCase(), c.created_at);
    }
  }

  function resolveLatestExpenseTimestamp(
    expenses: typeof unvoidedExpenses,
    fallbackCategoryCreatedAt?: string,
  ): string | undefined {
    let latestMs = fallbackCategoryCreatedAt
      ? Date.parse(fallbackCategoryCreatedAt)
      : Number.NaN;
    let latestIso = Number.isNaN(latestMs)
      ? undefined
      : fallbackCategoryCreatedAt;

    for (const exp of expenses) {
      const candidate =
        exp.updated_at || exp.created_at || exp.transaction_date;
      if (!candidate) continue;
      const ms = Date.parse(candidate);
      if (!Number.isNaN(ms) && (Number.isNaN(latestMs) || ms > latestMs)) {
        latestMs = ms;
        latestIso = candidate;
      }
    }
    return latestIso;
  }

  const costCenterPartition = partitionExpensesByAllocation({
    allocations: allocationsResult.data ?? [],
    expenses: unvoidedExpenses,
    categoryNameById,
  });

  const costCenters: DashboardCostCenter[] = [];

  for (const {
    allocation: a,
    expenses: matchingExpenses,
  } of costCenterPartition.centers) {
    const centerKey = (a.category_id ||
      a.allocation_name.toLowerCase().replace(/\s+/g, "_")) as ExpenseCategory;
    const spent = matchingExpenses
      .filter((e) => isExpenseSettled(e))
      .reduce((sum, e) => sum + e.amount_ngn, 0);
    const committed = matchingExpenses
      .filter((e) => !isExpenseSettled(e))
      .reduce((sum, e) => sum + e.amount_ngn, 0);

    const percentage =
      eventInfo.budgetCeiling > 0
        ? (a.amount_ngn / eventInfo.budgetCeiling) * 100
        : 0;

    const fallbackCreatedAt =
      (a.category_id ? categoryCreatedAtById.get(a.category_id) : undefined) ??
      categoryCreatedAtByName.get(a.allocation_name.trim().toLowerCase());

    costCenters.push({
      id: centerKey,
      name: a.allocation_name,
      allocated: a.amount_ngn,
      percentage,
      categoryId: a.category_id ?? undefined,
      spent,
      committed,
      latestInputAt: resolveLatestExpenseTimestamp(
        matchingExpenses,
        fallbackCreatedAt,
      ),
      inputOrder: costCenters.length + 1,
      items: matchingExpenses.map((e) => ({
        name: e.description || a.allocation_name,
        allocated: a.amount_ngn,
        spent: e.amount_ngn,
        vendor: e.payer_payee || "Club Vendor",
      })),
    });
  }

  for (const {
    categoryName: catName,
    expenses: list,
  } of costCenterPartition.unmatched) {
    const spent = list
      .filter((e) => isExpenseSettled(e))
      .reduce((sum, e) => sum + e.amount_ngn, 0);
    const committed = list
      .filter((e) => !isExpenseSettled(e))
      .reduce((sum, e) => sum + e.amount_ngn, 0);
    const allocated = spent + committed;
    const percentage =
      eventInfo.budgetCeiling > 0
        ? (allocated / eventInfo.budgetCeiling) * 100
        : 0;
    const fallbackCreatedAt = categoryCreatedAtByName.get(
      catName.trim().toLowerCase(),
    );
    costCenters.push({
      id: catName.toLowerCase().replace(/\s+/g, "_") as ExpenseCategory,
      name: catName,
      allocated,
      percentage,
      spent,
      committed,
      latestInputAt: resolveLatestExpenseTimestamp(list, fallbackCreatedAt),
      inputOrder: costCenters.length + 1,
      items: list.map((e) => ({
        name: e.description || catName,
        allocated: e.amount_ngn,
        spent: e.amount_ngn,
        vendor: e.payer_payee || "Club Vendor",
      })),
    });
  }

  // Revenue Streams (strictly from real ticket sales & real income transactions)
  const revenueStreams: DashboardRevenueStream[] = [];
  if (rawEvent.ticketing_enabled || ticketTiers.length > 0) {
    const ticketTarget = ticketTiers.reduce(
      (sum, t) => sum + t.price * t.capacity,
      0,
    );
    const ticketActual = ticketTiers.reduce(
      (sum, t) => sum + t.price * t.sold,
      0,
    );
    revenueStreams.push({
      id: "ticket_sales",
      name: "Ticket Sales",
      target: ticketTarget,
      actual: ticketActual,
      pending: 0,
      description: "Official event admission pass sales across active tiers.",
      breakdown: ticketTiers.map((t) => ({
        source: `${t.name} (${t.sold} / ${t.capacity} sold)`,
        amount: t.sold * t.price,
        status: t.sold > 0 ? "received" : "projected",
      })),
    });
  }

  const incomeByCategory = new Map<string, typeof unvoidedIncomes>();
  for (const inc of unvoidedIncomes) {
    const catName = inc.category_name_snapshot || "General Revenue";
    const list = incomeByCategory.get(catName) ?? [];
    list.push(inc);
    incomeByCategory.set(catName, list);
  }
  for (const [catName, list] of incomeByCategory.entries()) {
    const actual = list
      .filter(
        (i) => isTxnApproved(i) && (i.payment_status ?? "paid") === "paid",
      )
      .reduce((sum, i) => sum + i.amount_ngn, 0);
    const pending = list
      .filter(
        (i) => !isTxnApproved(i) || (i.payment_status ?? "paid") !== "paid",
      )
      .reduce((sum, i) => sum + i.amount_ngn, 0);
    revenueStreams.push({
      id: catName.toLowerCase().replace(/\s+/g, "_") as RevenueCategory,
      name: catName,
      target: actual + pending,
      actual,
      pending,
      description: `Recorded receipts under ${catName}.`,
      breakdown: list.map((i) => ({
        source: i.source_note || i.description || i.payer_payee || catName,
        amount: i.amount_ngn,
        status:
          i.payment_status === "paid"
            ? "received"
            : i.payment_status === "pending"
              ? "invoiced"
              : "projected",
      })),
    });
  }

  // Fetch linked receipts for manual transactions and ticket sales
  const rawSaleIds = allSales.map((s) => s.id);
  const rawTxnIds = rawTxns.map((t) => t.id);

  const [txnReceiptsResult, saleReceiptsResult] = await Promise.all([
    rawTxnIds.length > 0
      ? supabase
          .from("finance_receipts")
          .select(
            "id, event_transaction_id, original_filename, content_type, size_bytes, sha256",
          )
          .in("event_transaction_id", rawTxnIds)
      : Promise.resolve({ data: [] }),
    rawSaleIds.length > 0
      ? supabase
          .from("finance_receipts")
          .select(
            "id, event_ticket_sale_id, original_filename, content_type, size_bytes, sha256",
          )
          .in("event_ticket_sale_id", rawSaleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const receiptByTxnId = new Map(
    (txnReceiptsResult.data ?? []).map((r) => [
      r.event_transaction_id,
      {
        id: r.id,
        filename: r.original_filename,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        sha256: r.sha256 ?? null,
      },
    ]),
  );

  const receiptBySaleId = new Map(
    (saleReceiptsResult.data ?? []).map((r) => [
      r.event_ticket_sale_id,
      {
        id: r.id,
        filename: r.original_filename,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        sha256: r.sha256 ?? null,
      },
    ]),
  );

  function formatReceiptSize(bytes?: number): string | undefined {
    if (!bytes || bytes <= 0) return undefined;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  // Fetch actor usernames for recording attribution
  const actorIds = Array.from(
    new Set([
      ...rawTxns.map((t) => t.created_by).filter(Boolean),
      ...allSales
        .map((s) => (s as { seller_id?: string }).seller_id)
        .filter(Boolean),
    ]),
  ) as string[];

  const { data: actorProfiles } =
    actorIds.length > 0
      ? await supabase
          .from("member_profiles")
          .select("id, username")
          .in("id", actorIds)
      : { data: [] };

  const usernameByActorId = new Map<string, string>(
    (actorProfiles ?? [])
      .filter((p) => p.username)
      .map((p) => [p.id, p.username as string]),
  );

  // Transactions Ledger (combine manual financial transactions + recorded ticket sales)
  const manualTransactions: DashboardTransaction[] = rawTxns.map((t) => {
    const rc = receiptByTxnId.get(t.id);
    const creatorHandle = t.created_by
      ? usernameByActorId.get(t.created_by)
      : null;
    const actorDisplay = creatorHandle ? `@${creatorHandle}` : "@secretariat";

    return {
      id: t.id,
      date: t.transaction_date,
      type: t.kind === "income" ? "revenue" : "expense",
      category: (t.category_name_snapshot || "general")
        .toLowerCase()
        .replace(/\s+/g, "_"),
      categoryLabel: t.category_name_snapshot || "General",
      description:
        t.description ||
        t.source_note ||
        t.category_name_snapshot ||
        "Ledger Entry",
      amount: t.amount_ngn,
      payerPayee: t.payer_payee || t.source_note || "Club Account",
      paymentMethod: t.payment_method
        ? paymentMethodLabels[t.payment_method] || t.payment_method
        : "Bank Transfer",
      paymentRef: t.id.slice(0, 8).toUpperCase(),
      paymentStatus: t.payment_status || "paid",
      receipt: rc ?? null,
      receiptFileName: rc?.filename,
      receiptSize: formatReceiptSize(rc?.sizeBytes),
      authorizedBy: actorDisplay,
      authorizerRole: "Recorded",
      status: t.voided_at ? "voided" : "posted",
      voidReason: t.void_reason || undefined,
      verificationStatus: t.voided_at
        ? "rejected"
        : (t.verification_status as "recorded" | "approved" | "rejected") ||
          "approved",
      verifiedBy: t.verified_by ?? undefined,
      verifiedAt: t.verified_at ?? undefined,
      rejectionReason: t.rejection_reason || t.void_reason || undefined,
      createdBy: t.created_by ?? undefined,
    };
  });

  const saleTransactions: DashboardTransaction[] = allSales.map((s) => {
    const tierName = tierNameById.get(s.tier_id) || "Admission Tier";
    const rc = receiptBySaleId.get(s.id);
    const sellerId = (s as { seller_id?: string }).seller_id;
    const sellerHandle = sellerId ? usernameByActorId.get(sellerId) : null;
    const actorDisplay = sellerHandle ? `@${sellerHandle}` : "@secretariat";
    const isOnline = (s as { source?: string }).source === "online";
    const channelLabel = isOnline ? "Online Sales" : "Member Sales";

    return {
      id: s.id,
      date: s.created_at
        ? s.created_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      type: "revenue",
      category: "ticket_sales",
      categoryLabel: channelLabel,
      tierName,
      channel: isOnline ? "online" : "member",
      description: `${s.quantity}x ${tierName} Ticket${s.quantity === 1 ? "" : "s"}`,
      amount: s.amount_ngn,
      payerPayee: s.buyer_name || "Member Ticket Buyer",
      paymentMethod: paymentMethodLabels[s.payment_method] || s.payment_method,
      paymentRef:
        (s as { public_reference?: string | null }).public_reference ||
        s.id.slice(0, 8).toUpperCase(),
      paymentStatus: "paid",
      receipt: rc ?? null,
      receiptFileName: rc?.filename,
      receiptSize: formatReceiptSize(rc?.sizeBytes),
      authorizedBy: actorDisplay,
      authorizerRole: "Recorded",
      status: s.refunded_at ? "voided" : "posted",
      voidReason: s.refund_reason || undefined,
      verificationStatus:
        (s.verification_status as
          | "recorded"
          | "approved"
          | "rejected"
          | "cancelled") ?? "approved",
      verifiedBy: s.verified_by ?? undefined,
      verifiedAt: s.verified_at ?? undefined,
      rejectionReason: s.rejection_reason || s.refund_reason || undefined,
      createdBy: sellerId ?? undefined,
    };
  });

  const transactions: DashboardTransaction[] = [
    ...manualTransactions,
    ...saleTransactions,
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Activity Logs from real audit_log table
  const watAuditTime = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
  const activityLogs: ActivityLogItem[] = (auditResult.data ?? []).map((a) => ({
    id: a.id,
    action: a.action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase()),
    category: a.entity_type.replace(/_/g, " "),
    details: a.reason || `Recorded ${a.action.replace(/_/g, " ")}`,
    user: "Verified Club Officer",
    userRole: "Audited Action",
    timestamp: watAuditTime.format(new Date(a.occurred_at)),
  }));

  const categories: EventFinanceCategoryItem[] = (categoriesResult.data ??
    []) as EventFinanceCategoryItem[];

  // Validate requested tab and map legacy query parameters to unified 5 tabs
  const rawTab = (query.tab?.toLowerCase() || "overview") as DashboardTab;
  let initialTab: DashboardTab = "overview";
  if (rawTab === "tickets") {
    initialTab = "tickets";
  } else if (
    rawTab === "budget" ||
    rawTab === "expenses" ||
    rawTab === "revenue"
  ) {
    initialTab = "budget";
  } else if (rawTab === "ledger") {
    initialTab = "ledger";
  } else if (
    rawTab === "statement" ||
    rawTab === "reports" ||
    rawTab === "team_roles" ||
    rawTab === "audit_log"
  ) {
    initialTab = "statement";
  } else if (rawTab === "overview") {
    initialTab = "overview";
  }

  const eventRow: EventRow = {
    id: rawEvent.id,
    title: rawEvent.title,
    event_type: rawEvent.event_type,
    starts_at: rawEvent.starts_at,
    duration_days: rawEvent.duration_days ?? 1,
    ends_at: rawEvent.ends_at ?? null,
    location: rawEvent.location,
    description: rawEvent.description ?? null,
    minutes_enabled: rawEvent.minutes_enabled,
    attendance_enabled: rawEvent.attendance_enabled,
    budget_enabled: rawEvent.budget_enabled,
    income_enabled: rawEvent.income_enabled,
    expenses_enabled: rawEvent.expenses_enabled,
    ticketing_enabled: rawEvent.ticketing_enabled,
    status: rawEvent.status,
    status_changed_at: rawEvent.status_changed_at ?? rawEvent.starts_at,
    archived_at: rawEvent.archived_at,
    created_at: rawEvent.created_at ?? rawEvent.starts_at,
    updated_at: rawEvent.updated_at ?? rawEvent.starts_at,
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <EventDashboardView
        aiEnabled={isAiReportsEnabled()}
        canDeleteCategories={canDeleteCategories}
        canEditEvent={canEditEvent}
        canManageCategories={canManageCategories}
        canManageLifecycle={canManageLifecycle}
        canManageTeamRoles={canManageTeamRoles}
        canReopenEvent={cardAccess.canReopen}
        canSetEventStatus={cardAccess.canSetStatus}
        categories={categories}
        clubMembers={clubMembers}
        event={eventInfo}
        eventRow={eventRow}
        initialActivityLogs={activityLogs}
        initialCostCenters={costCenters}
        initialNotifications={[]}
        initialRevenueStreams={revenueStreams}
        initialTab={initialTab}
        initialTicketTiers={ticketTiers}
        initialTransactions={transactions}
        isClubOfficer={isAdmin || isExecutive}
        notice={notice}
        teamMembers={teamMembers}
        userRole={computedRole}
        currentUserId={authData.user.id}
      />
    </div>
  );
}
