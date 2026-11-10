"use client";

import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Lock,
  MapPin,
  PieChart,
  Plus,
  Receipt,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  recordEventFinancialTransactionAction,
  recordEventTicketSaleAction,
  voidRecordAction,
} from "@/app/actions";
import { VoidRecordModal } from "@/components/common/void-record-modal";
import { EventEditModal } from "@/components/events/event-edit-modal";
import {
  type EventLifecycleAction,
  EventLifecycleModal,
} from "@/components/events/event-lifecycle-modal";
import type { EventRow } from "@/components/events/event-types";
import { CfButton, CfFilterPill } from "@/components/ui";
import {
  dispatchActionStatusToast,
  dispatchFlashCard,
} from "@/components/ui/flash-card";
import { TableScroll } from "@/components/ui/table-scroll";
import { useSuccessNotice } from "@/components/ui/use-success-notice";
import { downloadLedgerCSV } from "@/lib/format";
import { getScrollBehavior } from "@/lib/tab-navigation.mjs";
import type {
  ActivityLogItem,
  DashboardClubMember,
  DashboardCostCenter,
  DashboardEventInfo,
  DashboardNotification,
  DashboardRevenueStream,
  DashboardTab,
  DashboardTeamMember,
  DashboardTicketTier,
  DashboardTransaction,
  EventFinanceCategoryItem,
  MobileTabItem,
  TransactionType,
  VoidableRecord,
} from "./dashboard-types";
import { EventDomainLedger } from "./event-domain-ledger";
import { DownloadReportModal } from "./modals/download-report-modal";
import { EventBudgetCeilingModal } from "./modals/event-budget-ceiling-modal";
import { EventCategoryManagementModal } from "./modals/event-category-management-modal";
import { EventTeamRoleModal } from "./modals/event-team-role-modal";
import { EventTicketTierModal } from "./modals/event-ticket-tier-modal";
import {
  type RecordedTransactionSubmission,
  RecordTransactionModal,
} from "./modals/record-transaction-modal";
import { TransactionDetailModal } from "./modals/transaction-detail-modal";
import { TabBudgetAllocations } from "./tab-budget-allocations";
import { TabOverview } from "./tab-overview";
import { TabReports } from "./tab-reports";
import { TabTickets } from "./tab-tickets";
import { VoucherInspectionDrawer } from "./voucher-inspection-drawer";

function mapDbPaymentMethod(label: string): string {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("transfer") ||
    normalized.includes("bank") ||
    normalized.includes("nibss")
  ) {
    return "bank_transfer";
  }
  if (
    normalized.includes("paystack") ||
    normalized.includes("pos") ||
    normalized.includes("card")
  ) {
    return "card";
  }
  if (normalized.includes("cash")) return "cash";
  if (normalized.includes("cheque") || normalized.includes("draft")) {
    return "cheque";
  }
  if (normalized.includes("mobile")) return "mobile_money";
  return "other";
}

function mapInitialTab(tab: DashboardTab): DashboardTab {
  if (tab === "expenses" || tab === "revenue") return "budget";
  if (tab === "reports" || tab === "team_roles" || tab === "audit_log") {
    return "statement";
  }
  return tab;
}

const historyDateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatHistoryDate(iso?: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return historyDateFormatter.format(new Date(parsed));
}

interface EventDashboardViewProps {
  event: DashboardEventInfo;
  eventRow?: EventRow;
  userRole: string;
  currentUserId?: string;
  initialTab?: DashboardTab;
  initialTicketTiers: DashboardTicketTier[];
  initialRevenueStreams: DashboardRevenueStream[];
  initialCostCenters: DashboardCostCenter[];
  initialTransactions: DashboardTransaction[];
  initialActivityLogs: ActivityLogItem[];
  initialNotifications?: DashboardNotification[];
  teamMembers: DashboardTeamMember[];
  clubMembers?: DashboardClubMember[];
  categories?: EventFinanceCategoryItem[];
  canManageCategories?: boolean;
  canDeleteCategories?: boolean;
  canEditEvent?: boolean;
  canManageLifecycle?: boolean;
  canSetEventStatus?: boolean;
  canReopenEvent?: boolean;
  canManageTeamRoles?: boolean;
  notice?: { message: string; isError?: boolean };
}

export function EventDashboardView({
  event,
  eventRow,
  userRole,
  currentUserId,
  initialTab = "overview",
  initialTicketTiers,
  initialRevenueStreams,
  initialCostCenters,
  initialTransactions,
  initialActivityLogs,
  teamMembers,
  clubMembers = [],
  categories = [],
  canManageCategories = false,
  canDeleteCategories = false,
  canEditEvent = false,
  canManageLifecycle = false,
  canSetEventStatus = false,
  canReopenEvent = false,
  canManageTeamRoles = false,
  notice: _notice,
}: EventDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(() =>
    mapInitialTab(initialTab),
  );
  const [budgetSubTab, setBudgetSubTab] = useState<
    "allocation" | "revenue_mix" | "cash_velocity"
  >(() => (initialTab === "revenue" ? "revenue_mix" : "allocation"));
  const [scrollRequest, setScrollRequest] = useState(0);
  const lastInitialTab = useRef(initialTab);
  const [isPending, startTransition] = useTransition();

  const ticketTiers = initialTicketTiers;
  const revenueStreams = initialRevenueStreams;
  const costCenters = initialCostCenters;
  const transactions = initialTransactions;
  const activityLogs = initialActivityLogs;

  // Modals state
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordInitialType, setRecordInitialType] =
    useState<TransactionType>("revenue");
  const [recordInitialCategory, setRecordInitialCategory] = useState<
    string | undefined
  >();

  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [recordToVoid, setRecordToVoid] = useState<VoidableRecord | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<DashboardTransaction | null>(null);

  // Category management modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryModalType, setCategoryModalType] = useState<
    "expense" | "budget_allocation" | "revenue"
  >("budget_allocation");

  // Budget ceiling modal state
  const [isBudgetCeilingModalOpen, setIsBudgetCeilingModalOpen] =
    useState(false);

  // Ticket tier modal state
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [tierModalMode, setTierModalMode] = useState<
    "create" | "edit" | "retire"
  >("create");
  const [selectedTierForEdit, setSelectedTierForEdit] =
    useState<DashboardTicketTier | null>(null);

  // Download report modal state
  const [isDownloadReportModalOpen, setIsDownloadReportModalOpen] =
    useState(false);

  // Event Edit & Lifecycle modals
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] =
    useState<EventLifecycleAction | null>(null);

  // Team Role modal state
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamModalMode, setTeamModalMode] = useState<"assign" | "revoke">(
    "assign",
  );
  const [selectedTeamMember, setSelectedTeamMember] =
    useState<DashboardTeamMember | null>(null);

  // Spotlight header metadata disclosure
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  // Voucher inspection drawer state
  const [selectedTxnForVoucher, setSelectedTxnForVoucher] =
    useState<DashboardTransaction | null>(null);

  // Deep-linking to ledger filter state
  const [ledgerInitialType, setLedgerInitialType] = useState<
    "all" | "tickets" | "revenue" | "expenses"
  >("all");
  const [ledgerInitialCategory, setLedgerInitialCategory] =
    useState<string>("");
  const [ledgerInitialStatus, setLedgerInitialStatus] = useState<
    "all" | "recorded" | "approved" | "rejected" | "cancelled"
  >("all");

  const jumpToLedger = (
    type: "all" | "tickets" | "revenue" | "expenses" = "all",
    category = "",
    status: "all" | "recorded" | "approved" | "rejected" | "cancelled" = "all",
  ) => {
    setLedgerInitialType(type);
    setLedgerInitialCategory(
      category === "All" || category === "all" ? "" : category,
    );
    setLedgerInitialStatus(status);
    selectTab("ledger");
  };

  useSuccessNotice(() => {
    setIsRecordModalOpen(false);
    setIsVoidModalOpen(false);
    setRecordToVoid(null);
    setIsBudgetCeilingModalOpen(false);
    setIsTierModalOpen(false);
    setSelectedTierForEdit(null);
    setIsEditEventModalOpen(false);
    setLifecycleAction(null);
    setIsTeamModalOpen(false);
    setSelectedTeamMember(null);
  });

  // Keep the active tab in sync when soft navigation changes only the query string.
  useEffect(() => {
    if (initialTab === lastInitialTab.current) return;
    lastInitialTab.current = initialTab;
    if (initialTab === "revenue") setBudgetSubTab("revenue_mix");
    else if (initialTab === "expenses") setBudgetSubTab("allocation");
    setActiveTab(mapInitialTab(initialTab));
    setScrollRequest((request) => request + 1);
  }, [initialTab]);

  // Synchronize hash with tab
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace("#", "").toLowerCase();
      const tabName = rawHash.startsWith("event-finance-")
        ? rawHash.replace("event-finance-", "")
        : rawHash;
      if (
        [
          "overview",
          "tickets",
          "budget",
          "ledger",
          "statement",
          "expenses",
          "revenue",
          "reports",
          "team_roles",
          "audit_log",
        ].includes(tabName)
      ) {
        if (tabName === "revenue") setBudgetSubTab("revenue_mix");
        else if (tabName === "expenses") setBudgetSubTab("allocation");
        setActiveTab(mapInitialTab(tabName as DashboardTab));
        setScrollRequest((request) => request + 1);
      }
    };

    if (window.location.hash) {
      handleHashChange();
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const selectTab = (tabId: DashboardTab) => {
    const target = mapInitialTab(tabId);
    if (tabId === "revenue") setBudgetSubTab("revenue_mix");
    else if (tabId === "expenses") setBudgetSubTab("allocation");
    setActiveTab(target);
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("tab", target);
    const newRelativePathQuery = `${window.location.pathname}?${searchParams.toString()}#event-finance-${target}`;
    window.history.replaceState(null, "", newRelativePathQuery);
    setScrollRequest((request) => request + 1);
  };

  // Scroll after the selected panel has committed to the DOM.
  useEffect(() => {
    if (scrollRequest === 0) return;
    const target =
      document.getElementById(`event-finance-${activeTab}`) ||
      document.getElementById("event-finance-panel");
    if (!target) return;
    target.scrollIntoView({
      behavior: getScrollBehavior(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      block: "start",
    });
    target.focus({ preventScroll: true });
  }, [activeTab, scrollRequest]);

  const isLocked =
    event.status.toLowerCase() === "completed" ||
    event.status.toLowerCase() === "cancelled" ||
    Boolean(event.archivedAt);

  const isAdminOrPresident = userRole === "admin" || userRole === "president";
  const isLeadOrExec =
    isAdminOrPresident || userRole === "executive" || userRole === "event_lead";
  const canRecord = isLeadOrExec && !isLocked;

  const activeTicketTiers = ticketTiers.filter(
    (t) => !t.retiredAt && t.status !== "retired",
  );

  // Auto-open Record Transaction Modal if triggered from Events card
  useEffect(() => {
    if (!canRecord) return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("action") === "record-transaction" ||
      window.location.hash === "#record-transaction"
    ) {
      setRecordInitialType("revenue");
      setRecordInitialCategory(
        activeTicketTiers.length > 0 ? "ticket_sales" : undefined,
      );
      setIsRecordModalOpen(true);
      params.delete("action");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
  }, [canRecord, activeTicketTiers.length]);

  // Verified realized totals vs pending isolation (consistent across Overview, Budget Cash Flow, and Statement)
  const totalTicketsSold = ticketTiers.reduce((acc, t) => acc + t.sold, 0);
  const totalTicketsCapacity = activeTicketTiers.reduce(
    (acc, t) => acc + t.capacity,
    0,
  );
  const verifiedTicketRevenue = transactions
    .filter(
      (t) =>
        t.category === "ticket_sales" &&
        t.status === "posted" &&
        (t.verificationStatus ?? "approved") === "approved",
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const verifiedRevenue = transactions
    .filter(
      (t) =>
        t.type === "revenue" &&
        t.status === "posted" &&
        (t.verificationStatus ?? "approved") === "approved" &&
        (t.category === "ticket_sales" ||
          (t.paymentStatus ?? "paid") === "paid"),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const verifiedExpenses = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.status === "posted" &&
        (t.verificationStatus ?? "approved") === "approved" &&
        (t.paymentStatus === "paid" ||
          t.paymentStatus === "deposit" ||
          !t.paymentStatus),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const pendingRevenue = transactions
    .filter(
      (t) =>
        t.type === "revenue" &&
        t.status === "posted" &&
        (t.verificationStatus === "recorded" ||
          t.paymentStatus === "pending" ||
          t.paymentStatus === "unpaid"),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const pendingExpenses = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.status === "posted" &&
        (t.verificationStatus === "recorded" ||
          t.paymentStatus === "pending" ||
          t.paymentStatus === "unpaid"),
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const committedExpenses = costCenters.reduce(
    (acc, c) => acc + c.committed,
    0,
  );

  const pendingTransactionsCount = transactions.filter(
    (t) =>
      t.status !== "voided" &&
      (t.verificationStatus === "recorded" ||
        (t.status as string) === "pending"),
  ).length;

  const isOverBudget =
    event.budgetCeiling > 0 && verifiedExpenses > event.budgetCeiling;

  const openContextualRecordModal = () => {
    if (activeTab === "tickets") {
      setRecordInitialType("revenue");
      setRecordInitialCategory("ticket_sales");
    } else if (activeTab === "budget" && budgetSubTab === "revenue_mix") {
      setRecordInitialType("revenue");
      setRecordInitialCategory(undefined);
    } else if (activeTab === "budget" || activeTab === "ledger") {
      setRecordInitialType("expense");
      setRecordInitialCategory(undefined);
    } else {
      setRecordInitialType("revenue");
      setRecordInitialCategory(undefined);
    }
    setIsRecordModalOpen(true);
  };

  // Handlers
  const handleSaveTransaction = (txnData: RecordedTransactionSubmission) => {
    const idempotencyKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "00000000-0000-4000-8000-000000000000";
    const dbMethod = mapDbPaymentMethod(txnData.paymentMethod);

    if (txnData.category === "ticket_sales" && txnData.tierId) {
      const fd = new FormData();
      fd.set("event_id", event.id);
      fd.set("return_tab", activeTab);
      fd.set("tier_id", txnData.tierId);
      fd.set("quantity", String(txnData.ticketQuantity ?? 1));
      fd.set("buyer_name", txnData.payerPayee.slice(0, 160));
      fd.set("payment_method", dbMethod);
      fd.set("idempotency_key", idempotencyKey);
      if (txnData.receiptFile) {
        fd.set("receipt_file", txnData.receiptFile);
      }
      dispatchActionStatusToast({
        title: "Recording Ticket Sale…",
        message: `Issuing ${txnData.ticketQuantity ?? 1} pass(es) for ${txnData.payerPayee}.`,
      });
      startTransition(() => {
        void recordEventTicketSaleAction(fd);
      });
      return;
    }

    const lagosToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const fd = new FormData();
    fd.set("event_id", event.id);
    fd.set("return_tab", activeTab);
    fd.set("kind", txnData.type === "revenue" ? "income" : "expense");
    fd.set("amount_ngn", String(Math.round(txnData.amount)));
    fd.set("transaction_date", lagosToday);
    fd.set("category_id", txnData.category);
    fd.set("category_name", txnData.categoryLabel);
    fd.set("payment_status", txnData.paymentStatus || "paid");
    fd.set("payment_method", dbMethod);
    fd.set("idempotency_key", idempotencyKey);
    if (txnData.receiptFile) {
      fd.set("receipt_file", txnData.receiptFile);
    }

    if (txnData.type === "revenue") {
      fd.set("source_note", txnData.description.slice(0, 500));
      fd.set("payer_payee", txnData.payerPayee.slice(0, 160));
    } else {
      if (txnData.budgetAllocationCategoryId) {
        fd.set(
          "budget_allocation_category_id",
          txnData.budgetAllocationCategoryId,
        );
      }
      fd.set("description", txnData.description.slice(0, 500));
      fd.set("payer_payee", txnData.payerPayee.slice(0, 160));
    }

    dispatchActionStatusToast({
      title:
        txnData.type === "revenue"
          ? "Recording Revenue…"
          : "Recording Disbursement…",
      message: `Posting ${txnData.categoryLabel} (${txnData.payerPayee}) to the event ledger.`,
    });
    startTransition(() => {
      void recordEventFinancialTransactionAction(fd);
    });
  };

  const handleConfirmVoid = async (record: VoidableRecord, reason: string) => {
    const fd = new FormData();
    fd.set("event_id", event.id);
    fd.set("return_tab", activeTab);
    fd.set("reason", reason);
    fd.set("entity_type", record.entityType);
    fd.set("record_id", record.id);

    if (
      record.entityType === "ticket_sale" &&
      record.verificationStatus === "approved"
    ) {
      dispatchActionStatusToast({
        title: "Refunding Ticket Sale…",
        message: `Voiding ticket sale ${record.id} and restoring tier capacity.`,
      });
    } else {
      dispatchActionStatusToast({
        title: "Voiding Ledger Record…",
        message: `Voiding ${record.title} with audit trail.`,
      });
    }

    const res = await voidRecordAction(fd);

    if (res && !res.success) {
      dispatchFlashCard({
        type: "error",
        title: "Void Failed",
        message: res.error || "Could not void record.",
      });
      return res;
    }

    dispatchFlashCard({
      type: "success",
      title: "Record Voided",
      message: `${record.title} has been voided and recorded in the audit log.`,
    });
    setIsVoidModalOpen(false);
    setRecordToVoid(null);
    return { success: true };
  };

  const tabs: MobileTabItem[] = [
    {
      id: "overview",
      label: "Overview",
      subtitle: "Financial summary, budget ceiling & variances",
      icon: PieChart,
    },
    {
      id: "tickets",
      label: "Tickets",
      subtitle: "Tier inventory, sales tallies & pass holders",
      icon: Ticket,
      badge: totalTicketsSold > 0 ? `${totalTicketsSold}` : undefined,
    },
    {
      id: "budget",
      label: "Budget & Streams",
      subtitle: "Departmental allocations, revenue streams & cash flow",
      icon: Layers,
      alert: isOverBudget,
    },
    {
      id: "ledger",
      label: "Ledger",
      subtitle: "Master transaction journal across all domains",
      icon: Receipt,
      badge: transactions.length > 0 ? `${transactions.length}` : undefined,
      pendingBadge: pendingTransactionsCount,
    },
    {
      id: "statement",
      label: "Statement & Team",
      subtitle: "Official P&L statement, committee leads & audit trail",
      icon: ClipboardCheck,
    },
  ];

  const statusBadgeClass = event.archivedAt
    ? "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]"
    : event.status === "scheduled"
      ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/25"
      : event.status === "completed"
        ? "text-[#5C4638] bg-[#FAF6F0] border-[#E5DDD3]"
        : "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/25";

  const dashboardReturnPath = `/events/${event.id}/dashboard`;
  const existingTeamMemberIds = teamMembers
    .map((m) => m.memberId)
    .filter((id): id is string => Boolean(id));

  const effectiveEventType = eventRow?.event_type ?? event.type;
  const activeEventFeatures: string[] = [];
  if (
    effectiveEventType !== "party" &&
    (eventRow?.minutes_enabled ?? event.minutesEnabled)
  ) {
    activeEventFeatures.push("Meeting Minutes");
  }
  if (
    effectiveEventType !== "party" &&
    (eventRow?.attendance_enabled ?? event.attendanceEnabled)
  ) {
    activeEventFeatures.push("Attendance Tracking");
  }
  if (eventRow?.ticketing_enabled ?? event.ticketingEnabled) {
    activeEventFeatures.push("Ticketing Passes");
  }
  if (eventRow?.budget_enabled) activeEventFeatures.push("Budget System");
  if (eventRow?.income_enabled) activeEventFeatures.push("Revenue Streams");
  if (eventRow?.expenses_enabled) activeEventFeatures.push("Disbursements");

  const createdAtLabel = formatHistoryDate(eventRow?.created_at);
  const updatedAtLabel = formatHistoryDate(
    eventRow?.status_changed_at || eventRow?.updated_at,
  );
  const archivedAtLabel = formatHistoryDate(eventRow?.archived_at);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Compact Spotlight Event Header Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xs relative">
        {/* Top Forest Green Accent Line */}
        <div className="h-1 bg-[#174C37] w-full rounded-t-2xl" />

        <div className="p-4 sm:px-5 sm:py-4 space-y-3">
          {/* Top Breadcrumb + Status + Details Toggle */}
          <div className="flex items-center justify-between gap-2">
            <Link
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#174C37] hover:underline min-h-[44px]"
              href="/events"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
              <span>Events</span>
            </Link>

            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize border ${statusBadgeClass}`}
              >
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-current"
                />
                <span>{event.archivedAt ? "Archived" : event.status}</span>
              </span>

              <CfFilterPill
                aria-controls="event-header-details"
                aria-expanded={isHeaderExpanded}
                onClick={() => setIsHeaderExpanded((prev) => !prev)}
                pillClassName={
                  isHeaderExpanded ? "border-[#174C37]/50 text-[#174C37]" : ""
                }
              >
                <span>{isHeaderExpanded ? "Hide info" : "Event info"}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${
                    isHeaderExpanded ? "rotate-180" : ""
                  }`}
                />
              </CfFilterPill>
            </div>
          </div>

          {/* Main Row: Title + Schedule/Venue + Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[#3D291F] leading-tight tracking-tight break-words">
                {event.title}
              </h1>
              <p className="text-xs text-[#5C4638] mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
                  <span>{event.dateFormatted}</span>
                </span>
                <span aria-hidden="true" className="text-[#E5DDD3]">
                  •
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
                  <strong className="text-[#3D291F] font-mono">
                    {event.timeWAT}
                  </strong>
                </span>
                <span aria-hidden="true" className="text-[#E5DDD3]">
                  •
                </span>
                <span className="inline-flex items-center gap-1 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-[#7A685D] shrink-0" />
                  <span className="truncate">{event.location}</span>
                </span>
              </p>
            </div>

            {/* Unified Action Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <CfButton
                className="flex-1 sm:flex-initial"
                id="btn-export-report"
                onClick={() => setIsDownloadReportModalOpen(true)}
                size="compact"
                variant="secondary"
              >
                <Download className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
                <span>Download Report</span>
              </CfButton>

              {canRecord && (
                <CfButton
                  className="flex-1 sm:flex-initial"
                  id="btn-record-transaction"
                  onClick={openContextualRecordModal}
                  size="default"
                  variant="primary"
                >
                  <Plus className="w-4 h-4 text-[#F0C768] shrink-0" />
                  <span>Record Entry</span>
                </CfButton>
              )}
            </div>
          </div>

          {/* Collapsible Event Info Drawer */}
          {isHeaderExpanded && (
            <div
              className="mt-2 pt-3 border-t border-[#E5DDD3] bg-[#FAF6F0]/80 rounded-xl p-3.5 text-xs space-y-3 animate-in fade-in duration-150"
              id="event-header-details"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* 1. Event History & Timeline */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D] block">
                    Event History &amp; Timeline
                  </span>
                  <div className="space-y-0.5 text-[#3D291F]">
                    <p className="font-medium">
                      Scheduled {event.dateFormatted} ·{" "}
                      <span className="font-mono">{event.timeWAT}</span> (
                      {event.durationLabel || "1 day"})
                    </p>
                    {createdAtLabel && (
                      <p className="text-[#5C4638]">Created {createdAtLabel}</p>
                    )}
                    {updatedAtLabel && (
                      <p className="text-[#7A685D]">
                        Last updated {updatedAtLabel}
                      </p>
                    )}
                    {archivedAtLabel && (
                      <p className="text-[#BA3C2A] font-semibold">
                        Archived {archivedAtLabel}
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Event Features */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D] block">
                    Event Features
                  </span>
                  {activeEventFeatures.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activeEventFeatures.map((feat) => (
                        <span
                          className="px-2 py-0.5 rounded-md bg-white border border-[#E5DDD3] text-[#174C37] font-semibold text-[11px]"
                          key={feat}
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#7A685D] italic">Standard Event</p>
                  )}

                  {(event.ticketingEnabled ||
                    (effectiveEventType !== "party" &&
                      (event.attendanceEnabled || event.minutesEnabled))) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                      {event.ticketingEnabled && (
                        <Link
                          className="text-[#174C37] font-semibold underline inline-flex items-center gap-1 min-h-[44px]"
                          href="/tickets?view=public"
                        >
                          <span>Open Ticket Storefront</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </Link>
                      )}
                      {effectiveEventType !== "party" &&
                        (event.attendanceEnabled || event.minutesEnabled) && (
                          <Link
                            className="text-[#174C37] font-semibold underline inline-flex items-center gap-1 min-h-[44px]"
                            href={`/meeting-hub?event=${encodeURIComponent(event.id)}`}
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>Minutes &amp; Attendance</span>
                          </Link>
                        )}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Event Description */}
              <div className="pt-2.5 border-t border-[#E5DDD3]/80">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D] block mb-1">
                  Event Description
                </span>
                {event.details ? (
                  <p className="text-[#5C4638] leading-relaxed whitespace-pre-wrap">
                    {event.details}
                  </p>
                ) : (
                  <p className="text-[#7A685D] italic">
                    No description recorded for this event.
                  </p>
                )}
              </div>

              {(canEditEvent || canManageLifecycle) && eventRow && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#E5DDD3]/80">
                  <div className="flex flex-wrap items-center gap-2">
                    {canSetEventStatus && !isLocked && (
                      <>
                        <CfButton
                          className="border-[#174C37]/30 bg-white text-[#174C37] hover:bg-[#174C37]/10"
                          onClick={() => setLifecycleAction("complete")}
                          size="compact"
                          variant="secondary"
                        >
                          Mark Completed
                        </CfButton>
                        <CfButton
                          className="border-[#BA3C2A]/30 bg-white text-[#BA3C2A] hover:bg-[#FDF0EE] hover:border-[#BA3C2A]/50"
                          onClick={() => setLifecycleAction("cancel")}
                          size="compact"
                          variant="secondary"
                        >
                          Cancel Event
                        </CfButton>
                      </>
                    )}
                    {canReopenEvent &&
                      !event.archivedAt &&
                      (event.status === "completed" ||
                        event.status === "cancelled") && (
                        <CfButton
                          className="border-[#174C37]/30 bg-white text-[#174C37] hover:bg-[#174C37]/10"
                          onClick={() => setLifecycleAction("reopen")}
                          size="compact"
                          variant="secondary"
                        >
                          Reopen Planning
                        </CfButton>
                      )}
                    {isAdminOrPresident &&
                      !event.archivedAt &&
                      (event.status === "completed" ||
                        event.status === "cancelled") && (
                        <CfButton
                          className="bg-white text-[#5C4638]"
                          onClick={() => setLifecycleAction("archive")}
                          size="compact"
                          variant="secondary"
                        >
                          Archive Record
                        </CfButton>
                      )}
                  </div>

                  {canEditEvent && (
                    <CfButton
                      className="bg-white border-[#174C37]/30 text-[#174C37] hover:bg-[#174C37]/10"
                      onClick={() => setIsEditEventModalOpen(true)}
                      size="compact"
                      variant="secondary"
                    >
                      Edit Event Details
                    </CfButton>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lock Notice if completed, cancelled, or archived */}
          {isLocked && (
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#7A685D] shrink-0" />
              <span>
                <strong className="text-[#3D291F]">
                  Planning is locked for this event.{" "}
                </strong>
                {event.archivedAt
                  ? "Retained permanently for audit reporting; records are read-only."
                  : "Only an Admin or President can reopen completed or cancelled records."}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Unified Sticky 5-Tab Bar */}
      <nav aria-label="Event Sections" className="space-y-1.5">
        <TableScroll label="Dashboard sections">
          <div
            className="flex w-max items-center gap-2 p-1.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]"
            role="tablist"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                activeTab === tab.id ||
                (tab.id === "budget" &&
                  (activeTab === "expenses" || activeTab === "revenue")) ||
                (tab.id === "statement" &&
                  (activeTab === "reports" ||
                    activeTab === "team_roles" ||
                    activeTab === "audit_log"));

              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  aria-selected={isActive}
                  id={`tab-btn-${tab.id}`}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  role="tab"
                  type="button"
                  className={`px-3.5 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 min-h-[48px] cursor-pointer border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1 ${
                    isActive
                      ? "bg-[#174C37] text-white shadow-xs"
                      : "bg-transparent text-[#5C4638] hover:text-[#3D291F] hover:bg-white/80"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? "text-[#F0C768]" : "text-[#7A685D]"
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-[#E5DDD3] text-[#3D291F]"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                  {tab.pendingBadge && tab.pendingBadge > 0 ? (
                    <span
                      className="w-2 h-2 rounded-full bg-[#8D5B0E]"
                      title={`${tab.pendingBadge} pending`}
                    />
                  ) : null}
                  {tab.alert && (
                    <>
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full bg-[#BA3C2A] animate-ping"
                        title="Over budget alert"
                      />
                      <span className="sr-only"> (Over budget alert)</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </TableScroll>

        <p className="text-xs font-medium text-[#7A685D] px-1 lg:hidden">
          Workspace Sections · Swipe right for more sections →
        </p>
      </nav>

      {/* Main Active Tab Content */}
      <div
        className="scroll-target tab-panel-focus event-finance-panel space-y-6 min-w-0 max-w-full"
        id={`event-finance-${activeTab}`}
        tabIndex={-1}
      >
        {activeTab === "overview" && (
          <TabOverview
            budgetCeiling={event.budgetCeiling}
            canManageCategories={canManageCategories}
            canRecord={canRecord}
            committedExpenses={committedExpenses}
            costCenters={costCenters}
            currentUserId={currentUserId}
            event={event}
            onInspectTransaction={(txn) => setSelectedTxnForVoucher(txn)}
            onJumpToLedger={jumpToLedger}
            onManageAllocations={() => {
              setCategoryModalType("budget_allocation");
              setIsCategoryModalOpen(true);
            }}
            onNavigateBudgetSubTab={(sub) => {
              setBudgetSubTab(sub);
              selectTab("budget");
            }}
            onNavigateTab={(tab) => selectTab(tab as DashboardTab)}
            onOpenBudgetCeilingModal={() => setIsBudgetCeilingModalOpen(true)}
            onOpenRecordModal={(type) => {
              if (type === "ticket") {
                setRecordInitialType("revenue");
                setRecordInitialCategory("ticket_sales");
              } else if (type === "expense") {
                setRecordInitialType("expense");
                setRecordInitialCategory(undefined);
              } else {
                setRecordInitialType("revenue");
                setRecordInitialCategory(undefined);
              }
              setIsRecordModalOpen(true);
            }}
            pendingExpenses={pendingExpenses}
            pendingRevenue={pendingRevenue}
            revenueStreamsCount={revenueStreams.length}
            teamMembersCount={teamMembers.length}
            ticketTiers={ticketTiers}
            totalExpenses={verifiedExpenses}
            totalRevenue={verifiedRevenue}
            totalTicketRevenue={verifiedTicketRevenue}
            totalTicketsCapacity={totalTicketsCapacity}
            totalTicketsSold={totalTicketsSold}
            transactions={transactions}
            userRole={userRole}
          />
        )}

        {activeTab === "tickets" && (
          <TabTickets
            canManage={canManageCategories}
            currentUserId={currentUserId}
            eventId={event.id}
            onInspectTransaction={(txn) => setSelectedTxnForVoucher(txn)}
            onOpenCreateTierModal={() => {
              setSelectedTierForEdit(null);
              setTierModalMode("create");
              setIsTierModalOpen(true);
            }}
            onOpenEditTierModal={(tier) => {
              setSelectedTierForEdit(tier);
              setTierModalMode("edit");
              setIsTierModalOpen(true);
            }}
            onOpenRecordTicketModal={
              canRecord
                ? () => {
                    setRecordInitialType("revenue");
                    setRecordInitialCategory("ticket_sales");
                    setIsRecordModalOpen(true);
                  }
                : undefined
            }
            onOpenRetireTierModal={(tier) => {
              setSelectedTierForEdit(tier);
              setTierModalMode("retire");
              setIsTierModalOpen(true);
            }}
            ticketSalesTransactions={transactions.filter(
              (t) => t.category === "ticket_sales",
            )}
            tiers={ticketTiers}
            userRole={userRole}
          />
        )}

        {activeTab === "budget" && (
          <TabBudgetAllocations
            budgetCeiling={event.budgetCeiling}
            canManageCategories={canManageCategories}
            canRecord={canRecord}
            committedExpenses={committedExpenses}
            costCenters={costCenters}
            initialSubTab={budgetSubTab}
            onJumpToLedger={jumpToLedger}
            onManageCategories={() => {
              setCategoryModalType("budget_allocation");
              setIsCategoryModalOpen(true);
            }}
            onManageRevenueCategories={() => {
              setCategoryModalType("revenue");
              setIsCategoryModalOpen(true);
            }}
            onOpenBudgetCeilingModal={() => setIsBudgetCeilingModalOpen(true)}
            onOpenRecordModal={(type) => {
              setRecordInitialType(type);
              setRecordInitialCategory(undefined);
              setIsRecordModalOpen(true);
            }}
            pendingRevenue={pendingRevenue}
            revenueStreams={revenueStreams}
            verifiedExpenses={verifiedExpenses}
            verifiedRevenue={verifiedRevenue}
            verifiedTicketRevenue={verifiedTicketRevenue}
          />
        )}

        {activeTab === "ledger" && (
          <EventDomainLedger
            canRecord={canRecord}
            categories={categories}
            costCenters={costCenters}
            currentUserId={currentUserId}
            domain="all"
            eventId={event.id}
            initialCategoryFilter={ledgerInitialCategory}
            initialStatusFilter={ledgerInitialStatus}
            initialTypeFilter={ledgerInitialType}
            onExportCsv={() => downloadLedgerCSV(transactions)}
            onInspect={(txn) => setSelectedTxnForVoucher(txn)}
            onRecordTransaction={() => {
              setRecordInitialType("expense");
              setRecordInitialCategory(undefined);
              setIsRecordModalOpen(true);
            }}
            revenueStreams={revenueStreams}
            ticketTiers={ticketTiers}
            transactions={transactions}
            userRole={userRole}
          />
        )}

        {activeTab === "statement" && (
          <TabReports
            activityLogs={activityLogs}
            budgetCeiling={event.budgetCeiling}
            canManageTeamRoles={canManageTeamRoles}
            costCenters={costCenters}
            event={event}
            onOpenAssignTeamModal={() => {
              setSelectedTeamMember(null);
              setTeamModalMode("assign");
              setIsTeamModalOpen(true);
            }}
            onOpenDownloadReportModal={() => setIsDownloadReportModalOpen(true)}
            onOpenRevokeTeamModal={(member) => {
              setSelectedTeamMember(member);
              setTeamModalMode("revoke");
              setIsTeamModalOpen(true);
            }}
            pendingTransactionsCount={pendingTransactionsCount}
            revenueStreams={revenueStreams}
            teamMembers={teamMembers}
            totalExpenses={verifiedExpenses}
            totalRevenue={verifiedRevenue}
            transactions={transactions}
          />
        )}
      </div>

      {/* Global Reused & Polished Modals */}
      <RecordTransactionModal
        budgetCeiling={event.budgetCeiling}
        categories={categories}
        costCenters={costCenters}
        initialCategory={recordInitialCategory}
        initialType={recordInitialType}
        isOpen={isRecordModalOpen}
        isPending={isPending}
        onClose={() => {
          if (!isPending) setIsRecordModalOpen(false);
        }}
        onSave={handleSaveTransaction}
        ticketTiers={activeTicketTiers}
        userRole={userRole}
      />

      <VoidRecordModal
        isOpen={isVoidModalOpen}
        isPending={isPending}
        onClose={() => {
          if (!isPending) {
            setIsVoidModalOpen(false);
            setRecordToVoid(null);
          }
        }}
        onConfirmVoid={handleConfirmVoid}
        record={recordToVoid}
        userRoles={userRole ? [userRole] : []}
      />

      <TransactionDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedTransaction(null);
        }}
        transaction={selectedTransaction}
      />

      <VoucherInspectionDrawer
        currentUserId={currentUserId}
        eventId={event.id}
        isOpen={Boolean(selectedTxnForVoucher)}
        onClose={() => setSelectedTxnForVoucher(null)}
        onVoidRecord={(record) => {
          setRecordToVoid(record);
          setIsVoidModalOpen(true);
        }}
        transaction={selectedTxnForVoucher}
        userRole={userRole}
      />

      <EventCategoryManagementModal
        budgetCeiling={event.budgetCeiling}
        canDelete={canDeleteCategories}
        canManage={canManageCategories}
        categories={categories}
        categoryType={categoryModalType}
        costCenters={costCenters}
        eventId={event.id}
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSwitchCategoryType={setCategoryModalType}
      />

      <EventBudgetCeilingModal
        currentCeiling={event.budgetCeiling}
        eventId={event.id}
        isOpen={isBudgetCeilingModalOpen}
        onClose={() => setIsBudgetCeilingModalOpen(false)}
      />

      <EventTicketTierModal
        eventId={event.id}
        isOpen={isTierModalOpen}
        mode={tierModalMode}
        onClose={() => {
          setIsTierModalOpen(false);
          setSelectedTierForEdit(null);
        }}
        tier={selectedTierForEdit}
      />

      <DownloadReportModal
        eventId={event.id}
        eventTitle={event.title}
        isOpen={isDownloadReportModalOpen}
        onClose={() => setIsDownloadReportModalOpen(false)}
        onExportCsv={() => downloadLedgerCSV(transactions)}
      />

      {eventRow && (
        <>
          <EventEditModal
            event={eventRow}
            isOpen={isEditEventModalOpen}
            onClose={() => setIsEditEventModalOpen(false)}
            returnTo={dashboardReturnPath}
          />
          <EventLifecycleModal
            action={lifecycleAction}
            event={eventRow}
            isOpen={Boolean(lifecycleAction)}
            onClose={() => setLifecycleAction(null)}
            returnTo={dashboardReturnPath}
          />
        </>
      )}

      <EventTeamRoleModal
        clubMembers={clubMembers}
        eventId={event.id}
        eventTitle={event.title}
        existingMemberIds={existingTeamMemberIds}
        isOpen={isTeamModalOpen}
        mode={teamModalMode}
        onClose={() => {
          setIsTeamModalOpen(false);
          setSelectedTeamMember(null);
        }}
        returnTo={dashboardReturnPath}
        targetMember={selectedTeamMember}
      />
    </div>
  );
}
