import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ActivityLogItem,
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
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dashboardNoticeMap: Record<
  string,
  { message: string; isError?: boolean }
> = {
  "category-created": {
    message: "The event finance category was created and logged.",
  },
  "category-renamed": {
    message: "The event finance category was renamed and logged.",
  },
  "category-retired": {
    message: "The event finance category was retired and logged.",
  },
  "budget-saved": {
    message: "The event budget and allocations were saved.",
  },
  "transaction-recorded": {
    message: "The event financial transaction was recorded.",
  },
  "transaction-corrected": {
    message: "The event financial transaction was corrected.",
  },
  "transaction-voided": {
    message: "The event financial transaction was voided and retained.",
  },
  "tier-saved": {
    message: "The ticket tier was saved.",
  },
  "tier-retired": {
    message: "The ticket tier was retired.",
  },
  "ticket-recorded": {
    message: "The ticket sale was recorded.",
  },
  "ticket-refunded": {
    message: "The ticket sale was marked refunded.",
  },
  saved: {
    message: "The event financial transaction was recorded.",
  },
  corrected: {
    message: "The event financial transaction was corrected.",
  },
  voided: {
    message: "The event financial transaction was voided and retained.",
  },
  "sale-saved": {
    message: "The ticket sale was recorded.",
  },
  "sale-edited": {
    message: "The ticket sale was updated.",
  },
  refunded: {
    message: "The ticket sale was marked refunded.",
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
  bank_transfer: "Bank Transfer (NIBSS)",
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
        "id, title, event_type, starts_at, location, status, archived_at, description, minutes_enabled, attendance_enabled, income_enabled, expenses_enabled, ticketing_enabled, budget_enabled",
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
      .is("retired_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_ticket_sales")
      .select(
        "id, tier_id, quantity, amount_ngn, buyer_name, payment_method, created_at, refunded_at, refund_reason",
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
        "id, kind, amount_ngn, transaction_date, description, payer_payee, source_note, payment_method, category_id, category_name_snapshot, budget_allocation_category_id, budget_allocation_name_snapshot, payment_status, voided_at, void_reason",
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
    clubRoles.includes("admin") || clubRoles.includes("backup_admin");
  const isExecutive = clubRoles.includes("executive");
  const isEventLead =
    eventRoles.includes("lead") || eventRoles.includes("event_lead");

  let computedRole = "member";
  if (isAdmin) computedRole = "admin";
  else if (isExecutive) computedRole = "executive";
  else if (isEventLead) computedRole = "event_lead";

  const isMutableEvent =
    rawEvent.status === "scheduled" && rawEvent.archived_at === null;
  const canManageCategories = (isAdmin || isEventLead) && isMutableEvent;
  const canDeleteCategories = isAdmin && isMutableEvent;

  // Format Dates in Africa/Lagos WAT
  const startDate = new Date(rawEvent.starts_at);
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  });

  const eventInfo: DashboardEventInfo = {
    id: rawEvent.id,
    title: rawEvent.title,
    type: rawEvent.event_type,
    status: rawEvent.status,
    startsAt: rawEvent.starts_at,
    dateFormatted: dateFormatter.format(startDate),
    timeWAT: timeFormatter.format(startDate),
    location: rawEvent.location,
    details: rawEvent.description ?? undefined,
    budgetCeiling: budgetResult.data?.total_ngn ?? 0,
    archivedAt: rawEvent.archived_at,
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
        name:
          profileData?.full_name || profileData?.username || "Assigned Officer",
        role: roleMap[row.role] || row.role,
        chapter: "",
      };
    },
  );

  // Ticket Tiers (strictly from real database tiers & unrefunded sales)
  const allSales = salesResult.data ?? [];
  const activeSales = allSales.filter((s) => !s.refunded_at);
  const tierNameById = new Map<string, string>();
  const ticketTiers: DashboardTicketTier[] = (tiersResult.data ?? []).map(
    (t) => {
      tierNameById.set(t.id, t.name);
      const soldCount = activeSales
        .filter((s) => s.tier_id === t.id)
        .reduce((sum, s) => sum + s.quantity, 0);

      const status =
        soldCount >= t.capacity
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
      };
    },
  );

  // Raw financial transactions
  const rawTxns = transactionsResult.data ?? [];
  const unvoidedExpenses = rawTxns.filter(
    (t) => t.kind === "expense" && !t.voided_at,
  );
  const unvoidedIncomes = rawTxns.filter(
    (t) => t.kind === "income" && !t.voided_at,
  );

  // Cost Centers / Budget Allocations (strictly from real database allocations & expenses)
  const categoryNameById = new Map<string, string>();
  for (const c of categoriesResult.data ?? []) {
    categoryNameById.set(c.id, c.name);
  }

  function matchesCategoryOrAlias(
    expenseCatName: string,
    allocName: string,
  ): boolean {
    const cleanExp = expenseCatName.trim().toLowerCase();
    const cleanAlloc = allocName.trim().toLowerCase();
    if (cleanExp === cleanAlloc) return true;
    if (cleanAlloc === "venue" && cleanExp.startsWith("venue")) return true;
    if (cleanExp === "venue" && cleanAlloc.startsWith("venue")) return true;
    return false;
  }

  const costCenters: DashboardCostCenter[] = [];
  const matchedExpenseIds = new Set<string>();

  for (const a of allocationsResult.data ?? []) {
    if (a.allocation_name.toLowerCase().includes("unallocated")) {
      continue;
    }
    const centerKey = (a.category_id ||
      a.allocation_name.toLowerCase().replace(/\s+/g, "_")) as ExpenseCategory;
    const matchingExpenses = unvoidedExpenses.filter((e) => {
      if (
        a.category_id &&
        (e.budget_allocation_category_id === a.category_id ||
          e.category_id === a.category_id)
      ) {
        return true;
      }
      if (e.budget_allocation_name_snapshot === a.allocation_name) {
        return true;
      }
      if (e.category_name_snapshot === a.allocation_name) {
        return true;
      }
      const liveCatName = e.category_id
        ? categoryNameById.get(e.category_id)
        : null;
      if (liveCatName && liveCatName === a.allocation_name) {
        return true;
      }
      if (
        e.category_name_snapshot &&
        matchesCategoryOrAlias(e.category_name_snapshot, a.allocation_name)
      ) {
        return true;
      }
      if (
        liveCatName &&
        matchesCategoryOrAlias(liveCatName, a.allocation_name)
      ) {
        return true;
      }
      return false;
    });
    for (const e of matchingExpenses) {
      matchedExpenseIds.add(e.id);
    }
    const spent = matchingExpenses
      .filter(
        (e) => e.payment_status === "paid" || e.payment_status === "deposit",
      )
      .reduce((sum, e) => sum + e.amount_ngn, 0);
    const committed = matchingExpenses
      .filter(
        (e) => e.payment_status === "pending" || e.payment_status === "unpaid",
      )
      .reduce((sum, e) => sum + e.amount_ngn, 0);

    const percentage =
      eventInfo.budgetCeiling > 0
        ? (a.amount_ngn / eventInfo.budgetCeiling) * 100
        : 0;

    costCenters.push({
      id: centerKey,
      name: a.allocation_name,
      allocated: a.amount_ngn,
      percentage,
      categoryId: a.category_id ?? undefined,
      spent,
      committed,
      items: matchingExpenses.map((e) => ({
        name: e.description || a.allocation_name,
        allocated: a.amount_ngn,
        spent: e.amount_ngn,
        vendor: e.payer_payee || "Club Vendor",
      })),
    });
  }

  // Group any unvoided expenses that didn't match an allocation
  const unmatchedByCategory = new Map<string, typeof unvoidedExpenses>();
  for (const e of unvoidedExpenses) {
    if (matchedExpenseIds.has(e.id)) continue;
    const liveCatName = e.category_id
      ? categoryNameById.get(e.category_id)
      : null;
    const catName =
      liveCatName || e.category_name_snapshot || "General Expenses";
    const list = unmatchedByCategory.get(catName) ?? [];
    list.push(e);
    unmatchedByCategory.set(catName, list);
  }
  for (const [catName, list] of unmatchedByCategory.entries()) {
    const spent = list
      .filter(
        (e) => e.payment_status === "paid" || e.payment_status === "deposit",
      )
      .reduce((sum, e) => sum + e.amount_ngn, 0);
    const committed = list
      .filter(
        (e) => e.payment_status === "pending" || e.payment_status === "unpaid",
      )
      .reduce((sum, e) => sum + e.amount_ngn, 0);
    const allocated = spent + committed;
    const percentage =
      eventInfo.budgetCeiling > 0
        ? (allocated / eventInfo.budgetCeiling) * 100
        : 0;
    costCenters.push({
      id: catName.toLowerCase().replace(/\s+/g, "_") as ExpenseCategory,
      name: catName,
      allocated,
      percentage,
      spent,
      committed,
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
      .filter((i) => i.payment_status === "paid")
      .reduce((sum, i) => sum + i.amount_ngn, 0);
    const pending = list
      .filter((i) => i.payment_status !== "paid")
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

  // Transactions Ledger (combine manual financial transactions + recorded ticket sales)
  const manualTransactions: DashboardTransaction[] = rawTxns.map((t) => ({
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
      : "Bank Transfer (NIBSS)",
    paymentRef: t.id.slice(0, 8).toUpperCase(),
    authorizedBy: "Verified Officer",
    authorizerRole: "Executive / Admin",
    status: t.voided_at ? "voided" : "posted",
    voidReason: t.void_reason || undefined,
  }));

  const saleTransactions: DashboardTransaction[] = allSales.map((s) => {
    const tierName = tierNameById.get(s.tier_id) || "Admission Tier";
    return {
      id: s.id,
      date: s.created_at
        ? s.created_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      type: "revenue",
      category: "ticket_sales",
      categoryLabel: "Ticket Sales",
      description: `${s.quantity}x ${tierName} Pass${s.quantity === 1 ? "" : "es"}`,
      amount: s.amount_ngn,
      payerPayee: s.buyer_name || "Member Ticket Buyer",
      paymentMethod: paymentMethodLabels[s.payment_method] || s.payment_method,
      paymentRef: s.id.slice(0, 8).toUpperCase(),
      authorizedBy: "Verified Officer",
      authorizerRole: "Ticketing Desk",
      status: s.refunded_at ? "voided" : "posted",
      voidReason: s.refund_reason || undefined,
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

  // Validate requested tab
  const validTabs: DashboardTab[] = [
    "overview",
    "tickets",
    "expenses",
    "budget",
    "revenue",
    "reports",
    "team_roles",
    "audit_log",
  ];
  const initialTab: DashboardTab = validTabs.includes(
    query.tab?.toLowerCase() as DashboardTab,
  )
    ? (query.tab?.toLowerCase() as DashboardTab)
    : "overview";

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <EventDashboardView
        canDeleteCategories={canDeleteCategories}
        canManageCategories={canManageCategories}
        categories={categories}
        event={eventInfo}
        initialActivityLogs={activityLogs}
        initialCostCenters={costCenters}
        initialNotifications={[]}
        initialRevenueStreams={revenueStreams}
        initialTab={initialTab}
        initialTicketTiers={ticketTiers}
        initialTransactions={transactions}
        notice={notice}
        teamMembers={teamMembers}
        userRole={computedRole}
      />
    </div>
  );
}
