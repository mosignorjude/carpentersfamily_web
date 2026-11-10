"use client";

import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Download,
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
  refundEventTicketSaleAction,
  voidEventFinancialTransactionAction,
} from "@/app/actions";
import { dispatchActionStatusToast } from "@/components/ui/flash-card";
import { TableScroll } from "@/components/ui/table-scroll";
import { useSuccessNotice } from "@/components/ui/use-success-notice";
import { downloadLedgerCSV } from "@/lib/format";
import { getScrollBehavior } from "@/lib/tab-navigation.mjs";
import type {
  ActivityLogItem,
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
} from "./dashboard-types";
import { EventDomainLedger } from "./event-domain-ledger";
import { DownloadReportModal } from "./modals/download-report-modal";
import { EventBudgetCeilingModal } from "./modals/event-budget-ceiling-modal";
import { EventCategoryManagementModal } from "./modals/event-category-management-modal";
import { EventTicketTierModal } from "./modals/event-ticket-tier-modal";
import {
  type RecordedTransactionSubmission,
  RecordTransactionModal,
} from "./modals/record-transaction-modal";
import { TransactionDetailModal } from "./modals/transaction-detail-modal";
import { VoidTransactionModal } from "./modals/void-transaction-modal";
import { TabAuditLog } from "./tab-audit-log";
import { TabBudgetAllocations } from "./tab-budget-allocations";
import { TabExpenses } from "./tab-expenses";
import { TabOverview } from "./tab-overview";
import { TabReports } from "./tab-reports";
import { TabRevenue } from "./tab-revenue";
import { TabTeamRoles } from "./tab-team-roles";
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

interface EventDashboardViewProps {
  event: DashboardEventInfo;
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
  categories?: EventFinanceCategoryItem[];
  canManageCategories?: boolean;
  canDeleteCategories?: boolean;
  notice?: { message: string; isError?: boolean };
}

export function EventDashboardView({
  event,
  userRole,
  currentUserId,
  initialTab = "overview",
  initialTicketTiers,
  initialRevenueStreams,
  initialCostCenters,
  initialTransactions,
  initialActivityLogs,
  teamMembers,
  categories = [],
  canManageCategories = false,
  canDeleteCategories = false,
  notice: _notice,
}: EventDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [scrollRequest, setScrollRequest] = useState(0);
  const lastInitialTab = useRef(initialTab);
  const [isPending, startTransition] = useTransition();

  // Authoritative state from server props (updated via revalidatePath on success)
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
  const [transactionToVoid, setTransactionToVoid] =
    useState<DashboardTransaction | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<DashboardTransaction | null>(null);

  // Category management modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryModalType, setCategoryModalType] = useState<
    "expense" | "budget_allocation" | "revenue"
  >("expense");

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

  // Mobile 'more' dropdown state
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleDismiss(event: Event) {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setIsMoreOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
        document.getElementById("tab-btn-more")?.focus();
      }
    }

    if (isMoreOpen) {
      document.addEventListener("mousedown", handleDismiss);
      document.addEventListener("touchstart", handleDismiss);
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleDismiss);
        document.removeEventListener("touchstart", handleDismiss);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isMoreOpen]);

  useSuccessNotice(() => {
    setIsRecordModalOpen(false);
    setIsVoidModalOpen(false);
    setTransactionToVoid(null);
    setIsBudgetCeilingModalOpen(false);
    setIsTierModalOpen(false);
    setSelectedTierForEdit(null);
  });

  // Keep the active tab in sync when soft navigation changes only the query string.
  useEffect(() => {
    if (initialTab === lastInitialTab.current) return;
    lastInitialTab.current = initialTab;
    let mapped = initialTab;
    if (mapped === "expenses" || mapped === "revenue") mapped = "budget";
    if (
      mapped === "reports" ||
      mapped === "team_roles" ||
      mapped === "audit_log"
    )
      mapped = "statement";
    setActiveTab(mapped);
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
        let mapped = tabName as DashboardTab;
        if (mapped === "expenses" || mapped === "revenue") mapped = "budget";
        if (
          mapped === "reports" ||
          mapped === "team_roles" ||
          mapped === "audit_log"
        )
          mapped = "statement";
        setActiveTab(mapped);
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
    let target = tabId;
    if (tabId === "expenses" || tabId === "revenue") target = "budget";
    if (tabId === "reports" || tabId === "team_roles" || tabId === "audit_log")
      target = "statement";
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

  useEffect(() => {
    if (!canRecord || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("action") === "record-transaction" ||
      window.location.hash === "#record-transaction"
    ) {
      setRecordInitialType("revenue");
      setRecordInitialCategory(
        ticketTiers.length > 0 ? "ticket_sales" : undefined,
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
  }, [canRecord, ticketTiers.length]);

  // Aggregate computations
  const totalTicketRevenue = ticketTiers.reduce(
    (acc, t) => acc + t.sold * t.price,
    0,
  );
  const totalTicketsSold = ticketTiers.reduce((acc, t) => acc + t.sold, 0);
  const totalTicketsCapacity = ticketTiers.reduce(
    (acc, t) => acc + t.capacity,
    0,
  );

  const totalRevenue = transactions
    .filter((t) => t.type === "revenue" && t.status === "posted")
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense" && t.status === "posted")
    .reduce((acc, t) => acc + t.amount, 0);

  const committedExpenses = costCenters.reduce(
    (acc, c) => acc + c.committed,
    0,
  );

  const pendingTransactionsCount = transactions.filter(
    (t) =>
      t.verificationStatus === "recorded" || (t.status as string) === "pending",
  ).length;

  const isOverBudget =
    event.budgetCeiling > 0 && totalExpenses > event.budgetCeiling;

  // Handlers
  const handleSaveTransaction = (txnData: RecordedTransactionSubmission) => {
    // Persist in Supabase via server actions; server revalidates on success
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

  const handleConfirmVoid = (txnId: string, reason: string) => {
    const targetTxn = transactions.find((t) => t.id === txnId);

    // Persist in Supabase via server actions; server revalidates on success
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        txnId,
      )
    ) {
      const fd = new FormData();
      fd.set("event_id", event.id);
      fd.set("return_tab", activeTab);
      fd.set("reason", reason.slice(0, 500));
      if (targetTxn?.category === "ticket_sales") {
        fd.set("sale_id", txnId);
        dispatchActionStatusToast({
          title: "Refunding Ticket Sale…",
          message: `Reversing ticket sale ${txnId} and restoring tier capacity.`,
        });
        startTransition(() => {
          void refundEventTicketSaleAction(fd);
        });
      } else {
        fd.set("transaction_id", txnId);
        dispatchActionStatusToast({
          title: "Voiding Ledger Record…",
          message: `Reversing transaction ${txnId} with audit trail.`,
        });
        startTransition(() => {
          void voidEventFinancialTransactionAction(fd);
        });
      }
    }
  };

  // 5 Unified Primary Tabs Configuration
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
      label: "Budget & Revenue",
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
      subtitle: "Official P&L statement, export & committee desks",
      icon: ClipboardCheck,
    },
  ];

  const statusBadgeClass = event.archivedAt
    ? "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]"
    : event.status === "scheduled"
      ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30"
      : event.status === "completed"
        ? "text-[#5C4638] bg-[#FAF6F0] border-[#E5DDD3]"
        : "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30";

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Scoped Header Card with brand accent line */}
      <section className="bg-white rounded-[20px] sm:rounded-2xl border border-[#E5DDD3] shadow-xs overflow-hidden">
        {/* Forest Green Top Brand Accent */}
        <div className="h-1 bg-[#174C37] w-full" />

        <div className="p-4 sm:p-6 space-y-4">
          {/* Navigation Breadcrumb & Back Link */}
          <div className="flex items-center justify-between gap-2 sm:gap-4 pb-3.5 border-b border-[#E5DDD3]">
            <Link
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#174C37] hover:underline min-h-[44px]"
              href="/events"
            >
              <ArrowLeft className="w-4 h-4 text-[#174C37] shrink-0" />
              <span>Back to Events</span>
            </Link>

            <div className="flex items-center gap-2">
              {event.type !== "party" &&
                (event.attendanceEnabled || event.minutesEnabled) && (
                  <Link
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] hover:border-[#174C37]/40 text-xs font-semibold text-[#174C37] transition-colors min-h-[44px]"
                    href={`/meeting-hub?event=${encodeURIComponent(event.id)}`}
                    title="Open Meeting Hub for minutes and roll call"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#174C37]" />
                    <span>Meeting Hub</span>
                  </Link>
                )}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize border ${statusBadgeClass}`}
              >
                {event.archivedAt ? "Archived" : event.status}
              </span>
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[#7A685D]">
                <span className="font-bold text-[#174C37] uppercase tracking-wider text-[11px]">
                  {event.type} Event Dashboard
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#3D291F] capitalize text-[11px]">
                  Status: {event.status}
                </span>
              </div>

              <h1 className="text-[26px] sm:text-3xl font-extrabold sm:font-bold text-[#231F1D] sm:text-[#3D291F] tracking-tight leading-tight">
                {event.title}
              </h1>

              {/* Date, Time & Location Row with Details Disclosure Toggle */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] sm:text-xs text-[#4A524D] sm:text-[#5C4638]">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#174C37] shrink-0" />
                  <span>{event.dateFormatted}</span>
                </div>
                <span aria-hidden="true" className="text-[#E5DDD3]">
                  •
                </span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#174C37] shrink-0" />
                  <span className="font-mono">{event.timeWAT}</span>
                </div>
                <span aria-hidden="true" className="text-[#E5DDD3]">
                  •
                </span>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#174C37] shrink-0" />
                  <span className="truncate max-w-[200px] sm:max-w-xs">
                    {event.location}
                  </span>
                </div>
                {/* On-demand Details Disclosure Button */}
                <button
                  type="button"
                  onClick={() => setIsHeaderExpanded((prev) => !prev)}
                  aria-expanded={isHeaderExpanded}
                  aria-controls="event-header-details"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#174C37] hover:text-[#0C3325] px-2 py-1 rounded-lg hover:bg-[#FAF6F0] transition-colors ml-auto sm:ml-2 min-h-[44px] cursor-pointer"
                >
                  <span>{isHeaderExpanded ? "Hide info" : "Details"}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isHeaderExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Quick Actions (Desktop View) */}
            <div className="hidden sm:flex flex-wrap items-center gap-2 shrink-0">
              <button
                className="px-3.5 py-2 text-xs font-semibold text-[#231F1D] bg-white border border-[#CFD5D0] rounded-xl hover:bg-[#FAF6F0] min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer"
                id="btn-export-report-desktop"
                onClick={() => setIsDownloadReportModalOpen(true)}
                title="Download Report (PDF / CSV)"
                type="button"
              >
                <Download className="w-3.5 h-3.5 text-[#174C37]" />
                <span>Download Report</span>
              </button>

              {canRecord && (
                <>
                  <button
                    className="px-3.5 py-2 text-xs font-semibold text-[#174C37] bg-[#174C37]/10 hover:bg-[#174C37]/20 border border-[#174C37]/30 rounded-xl min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer"
                    id="btn-record-ticket-sale"
                    onClick={() => {
                      setRecordInitialType("revenue");
                      setRecordInitialCategory("ticket_sales");
                      setIsRecordModalOpen(true);
                    }}
                    type="button"
                  >
                    <Ticket className="w-4 h-4 text-[#D6A23A]" />
                    <span>Record Ticket Sale</span>
                  </button>

                  <button
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#174C37] hover:bg-[#103D2B] border border-[#174C37] rounded-xl min-h-[44px] flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    id="btn-record-transaction"
                    onClick={() => {
                      setRecordInitialType("revenue");
                      setRecordInitialCategory(undefined);
                      setIsRecordModalOpen(true);
                    }}
                    type="button"
                  >
                    <Plus className="w-4 h-4 text-[#D6A23A]" />
                    <span>Record Transaction</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Collapsible Metadata Drawer */}
          {isHeaderExpanded && (
            <div
              id="event-header-details"
              className="pt-3.5 border-t border-[#E5DDD3] space-y-3 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3]">
                <div>
                  <span className="text-[#6B5D53] block text-[11px]">
                    Financial Reference
                  </span>
                  <span className="font-mono font-bold text-[#3D291F]">
                    EVT-{event.id.slice(0, 8).toUpperCase()}-FIN
                  </span>
                </div>
                {event.durationLabel && (
                  <div>
                    <span className="text-[#6B5D53] block text-[11px]">
                      Scheduled Duration
                    </span>
                    <span className="font-semibold text-[#3D291F]">
                      {event.durationLabel}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[#6B5D53] block text-[11px]">
                    Meeting Hub Context
                  </span>
                  <span className="text-[#3D291F]">
                    Minutes and attendance roll calls are maintained in the
                    separate Meeting Hub.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Action Section (Mobile View: 1 or 2-Button Grid) */}
          <div className="sm:hidden pt-1">
            <h2 className="text-[15px] font-semibold text-[#231F1D] mb-2.5">
              Quick Actions
            </h2>
            <div
              className={
                canRecord
                  ? "grid grid-cols-2 gap-2.5"
                  : "grid grid-cols-1 gap-2.5"
              }
            >
              <button
                className="w-full py-3 px-3 min-h-[48px] rounded-[14px] bg-white border border-[#CFD5D0] text-[#231F1D] font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-stone-50 active:scale-[0.98] transition shadow-[0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer"
                id="btn-download-report-mobile"
                onClick={() => setIsDownloadReportModalOpen(true)}
                type="button"
              >
                <Download className="w-[17px] h-[17px] text-[#174C37] shrink-0" />
                <span className="truncate">Download Report</span>
              </button>

              {canRecord && (
                <button
                  className="w-full py-3 px-3 min-h-[48px] rounded-[14px] bg-[#174C37] text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-[#103D2B] active:scale-[0.98] transition shadow-xs cursor-pointer"
                  id="btn-record-transaction-mobile"
                  onClick={() => {
                    setRecordInitialType("revenue");
                    setRecordInitialCategory(undefined);
                    setIsRecordModalOpen(true);
                  }}
                  type="button"
                >
                  <Plus className="w-[17px] h-[17px] text-[#85B89A] shrink-0" />
                  <span className="truncate">Record Transaction</span>
                </button>
              )}
            </div>
          </div>

          {/* Lock Notice if completed or cancelled */}
          {isLocked && (
            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#7A685D] shrink-0" />
              <div>
                <span className="font-semibold text-[#3D291F]">
                  Planning is locked for this event.{" "}
                </span>
                <span>
                  {event.archivedAt
                    ? "Retained indefinitely for permanent reporting and audit. Records are read-only."
                    : "Only an Admin or President can reopen completed or cancelled records."}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. Joined Content Card: Tab Navigation & Active Tab Content */}
      <section className="bg-white rounded-[20px] border border-[#E5DDD3] p-4 sm:p-6 shadow-xs relative">
        <nav aria-label="Event Sections" className="relative">
          {/* Mobile 5-Tab Bar (sm:hidden) */}
          <div className="sm:hidden mb-4">
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1.5 px-0.5"
              role="tablist"
            >
              {/* Tab 1: Overview */}
              <button
                id="tab-btn-overview"
                aria-controls="tab-content"
                aria-selected={activeTab === "overview"}
                role="tab"
                type="button"
                onClick={() => selectTab("overview")}
                className={`group flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-2 rounded-[14px] cursor-pointer min-h-[48px] px-3.5 py-2.5 shrink-0 transition-colors ${
                  activeTab === "overview"
                    ? "bg-[#EEEADD] text-[#174C37] font-semibold"
                    : "bg-white text-[#231F1D] font-medium border border-[#E5DDD3] hover:bg-stone-50"
                }`}
              >
                <PieChart className="w-4 h-4 text-[#174C37]" />
                <span className="text-[13px] whitespace-nowrap">Overview</span>
              </button>

              {/* Tab 2: Tickets */}
              <button
                id="tab-btn-tickets"
                aria-controls="tab-content"
                aria-selected={activeTab === "tickets"}
                role="tab"
                type="button"
                onClick={() => selectTab("tickets")}
                className={`group flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-2 rounded-[14px] cursor-pointer min-h-[48px] px-3.5 py-2.5 shrink-0 transition-colors ${
                  activeTab === "tickets"
                    ? "bg-[#EEEADD] text-[#174C37] font-semibold"
                    : "bg-white text-[#231F1D] font-medium border border-[#E5DDD3] hover:bg-stone-50"
                }`}
              >
                <Ticket className="w-4 h-4 text-[#174C37]" />
                <span className="text-[13px] whitespace-nowrap">Tickets</span>
                {totalTicketsSold > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
                      activeTab === "tickets"
                        ? "bg-white/40 text-[#174C37]"
                        : "bg-[#E5DDD3] text-[#3D291F]"
                    }`}
                  >
                    {totalTicketsSold}
                  </span>
                )}
              </button>

              {/* Tab 3: Budget & Revenue */}
              <button
                id="tab-btn-budget"
                aria-controls="tab-content"
                aria-selected={
                  activeTab === "budget" ||
                  activeTab === "expenses" ||
                  activeTab === "revenue"
                }
                role="tab"
                type="button"
                onClick={() => selectTab("budget")}
                className={`group flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-2 rounded-[14px] cursor-pointer min-h-[48px] px-3.5 py-2.5 shrink-0 transition-colors ${
                  activeTab === "budget" ||
                  activeTab === "expenses" ||
                  activeTab === "revenue"
                    ? "bg-[#EEEADD] text-[#174C37] font-semibold"
                    : "bg-white text-[#231F1D] font-medium border border-[#E5DDD3] hover:bg-stone-50"
                }`}
              >
                <Layers className="w-4 h-4 text-[#174C37]" />
                <span className="text-[13px] whitespace-nowrap">
                  Budget & Streams
                </span>
                {isOverBudget && (
                  <span className="w-2 h-2 rounded-full bg-[#BA3C2A] animate-ping" />
                )}
              </button>

              {/* Tab 4: Ledger */}
              <button
                id="tab-btn-ledger"
                aria-controls="tab-content"
                aria-selected={activeTab === "ledger"}
                role="tab"
                type="button"
                onClick={() => selectTab("ledger")}
                className={`group flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-2 rounded-[14px] cursor-pointer min-h-[48px] px-3.5 py-2.5 shrink-0 transition-colors ${
                  activeTab === "ledger"
                    ? "bg-[#EEEADD] text-[#174C37] font-semibold"
                    : "bg-white text-[#231F1D] font-medium border border-[#E5DDD3] hover:bg-stone-50"
                }`}
              >
                <Receipt className="w-4 h-4 text-[#174C37]" />
                <span className="text-[13px] whitespace-nowrap">Ledger</span>
                {transactions.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
                      activeTab === "ledger"
                        ? "bg-white/40 text-[#174C37]"
                        : "bg-[#E5DDD3] text-[#3D291F]"
                    }`}
                  >
                    {transactions.length}
                  </span>
                )}
                {pendingTransactionsCount > 0 && (
                  <span
                    className="w-2 h-2 rounded-full bg-[#D6A23A]"
                    title={`${pendingTransactionsCount} pending review`}
                  />
                )}
              </button>

              {/* Tab 5: Statement & Team */}
              <button
                id="tab-btn-statement"
                aria-controls="tab-content"
                aria-selected={
                  activeTab === "statement" ||
                  activeTab === "reports" ||
                  activeTab === "team_roles" ||
                  activeTab === "audit_log"
                }
                role="tab"
                type="button"
                onClick={() => selectTab("statement")}
                className={`group flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-2 rounded-[14px] cursor-pointer min-h-[48px] px-3.5 py-2.5 shrink-0 transition-colors ${
                  activeTab === "statement" ||
                  activeTab === "reports" ||
                  activeTab === "team_roles" ||
                  activeTab === "audit_log"
                    ? "bg-[#EEEADD] text-[#174C37] font-semibold"
                    : "bg-white text-[#231F1D] font-medium border border-[#E5DDD3] hover:bg-stone-50"
                }`}
              >
                <ClipboardCheck className="w-4 h-4 text-[#174C37]" />
                <span className="text-[13px] whitespace-nowrap">
                  Statement & Team
                </span>
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#7A685D] px-1 pt-1 font-medium">
              <span>5 Sections</span>
              <span className="text-[#174C37]">Swipe for more →</span>
            </div>
          </div>

          {/* Desktop 5-Pill Tab Bar (hidden sm:block) */}
          <div className="hidden sm:block">
            <TableScroll label="Dashboard sections">
              <div className="flex w-max items-center gap-2 p-1.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
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
                      className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 min-h-[48px] cursor-pointer border-0 ${
                        isActive
                          ? "bg-[#174C37] text-white shadow-xs font-semibold"
                          : "bg-transparent text-[#5C4638] hover:text-[#174C37] hover:bg-white/80"
                      }`}
                      id={`tab-btn-${tab.id}-desktop`}
                      key={tab.id}
                      onClick={() => selectTab(tab.id)}
                      role="tab"
                      type="button"
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          isActive ? "text-[#D6A23A]" : "text-[#7A685D]"
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
                          className="w-2 h-2 rounded-full bg-[#D6A23A]"
                          title={`${tab.pendingBadge} pending review`}
                        />
                      ) : null}
                      {tab.alert && (
                        <span className="w-2 h-2 rounded-full bg-[#BA3C2A] animate-ping" />
                      )}
                    </button>
                  );
                })}
              </div>
            </TableScroll>
            <p className="mt-1.5 text-xs text-[#7A685D] lg:hidden">
              Swipe right for more sections
            </p>
          </div>

          {/* Subtle horizontal divider separating the tab bar from the active tab content on desktop */}
          <div className="hidden sm:block my-5 border-b border-[#E5DDD3]" />
        </nav>

        {/* Render Active Tab Component */}
        <div
          id={`event-finance-${activeTab}`}
          className="scroll-target tab-panel-focus event-finance-panel space-y-6 min-w-0 max-w-full"
          tabIndex={-1}
        >
          {activeTab === "overview" && (
            <TabOverview
              budgetCeiling={event.budgetCeiling}
              canManageCategories={canManageCategories}
              canRecord={canRecord}
              committedExpenses={committedExpenses}
              costCenters={costCenters}
              event={event}
              onInspectTransaction={(txn) => setSelectedTxnForVoucher(txn)}
              onJumpToLedger={jumpToLedger}
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
              ticketTiers={ticketTiers}
              totalExpenses={totalExpenses}
              totalRevenue={totalRevenue}
              totalTicketRevenue={totalTicketRevenue}
              totalTicketsCapacity={totalTicketsCapacity}
              totalTicketsSold={totalTicketsSold}
              transactions={transactions}
            />
          )}

          {activeTab === "tickets" && (
            <TabTickets
              canManage={canManageCategories}
              currentUserId={currentUserId}
              eventId={event.id}
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
                  ? (_tierId) => {
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
              costCenters={costCenters}
              onJumpToLedger={jumpToLedger}
              onManageCategories={() => {
                setCategoryModalType("budget_allocation");
                setIsCategoryModalOpen(true);
              }}
              onOpenBudgetCeilingModal={() => setIsBudgetCeilingModalOpen(true)}
              revenueStreams={revenueStreams}
            />
          )}

          {activeTab === "expenses" && (
            <TabExpenses
              budgetCeiling={event.budgetCeiling}
              canRecord={canRecord}
              costCenters={costCenters}
              currentUserId={currentUserId}
              eventId={event.id}
              expenseTransactions={transactions.filter(
                (t) => t.type === "expense",
              )}
              onRecordExpense={(cat) => {
                setRecordInitialType("expense");
                setRecordInitialCategory(cat);
                setIsRecordModalOpen(true);
              }}
              userRole={userRole}
            />
          )}

          {activeTab === "revenue" && (
            <TabRevenue
              canManageCategories={canManageCategories}
              canRecord={canRecord}
              currentUserId={currentUserId}
              eventId={event.id}
              onManageCategories={() => {
                setCategoryModalType("revenue");
                setIsCategoryModalOpen(true);
              }}
              onRecordRevenue={(cat) => {
                setRecordInitialType("revenue");
                setRecordInitialCategory(cat);
                setIsRecordModalOpen(true);
              }}
              revenueTransactions={transactions.filter(
                (t) => t.type === "revenue" && t.category !== "ticket_sales",
              )}
              streams={revenueStreams}
              userRole={userRole}
            />
          )}

          {activeTab === "ledger" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#3D291F]">
                    Master Event Financial Ledger
                  </h3>
                  <p className="text-xs text-[#7A685D]">
                    Real-time transaction register across all ticket sales,
                    revenue inflows, and expense disbursements.
                  </p>
                </div>
              </div>
              <EventDomainLedger
                canRecord={canRecord}
                categories={categories}
                currentUserId={currentUserId}
                domain="all"
                eventId={event.id}
                initialCategoryFilter={ledgerInitialCategory}
                initialStatusFilter={ledgerInitialStatus}
                initialTypeFilter={ledgerInitialType}
                onInspect={(txn) => setSelectedTxnForVoucher(txn)}
                onRecordTransaction={() => {
                  setRecordInitialType("expense");
                  setRecordInitialCategory(undefined);
                  setIsRecordModalOpen(true);
                }}
                transactions={transactions}
                userRole={userRole}
              />
            </div>
          )}

          {(activeTab === "statement" || activeTab === "reports") && (
            <TabReports
              budgetCeiling={event.budgetCeiling}
              costCenters={costCenters}
              event={event}
              onOpenDownloadReportModal={() =>
                setIsDownloadReportModalOpen(true)
              }
              revenueStreams={revenueStreams}
              teamMembers={teamMembers}
              totalExpenses={totalExpenses}
              totalRevenue={totalRevenue}
              transactions={transactions}
            />
          )}

          {activeTab === "team_roles" && (
            <TabTeamRoles event={event} team={teamMembers} />
          )}

          {activeTab === "audit_log" && (
            <TabAuditLog
              activityLogs={activityLogs}
              onInitiateVoid={(txn) => {
                setTransactionToVoid(txn);
                setIsVoidModalOpen(true);
              }}
              onViewTransaction={(txn) => {
                setSelectedTransaction(txn);
                setIsDetailModalOpen(true);
              }}
              transactions={transactions}
              userRole={userRole}
            />
          )}
        </div>
      </section>

      {/* Global Modals */}
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
        ticketTiers={ticketTiers}
        userRole={userRole}
      />

      <VoidTransactionModal
        isOpen={isVoidModalOpen}
        isPending={isPending}
        onClose={() => {
          if (!isPending) {
            setIsVoidModalOpen(false);
            setTransactionToVoid(null);
          }
        }}
        onConfirmVoid={handleConfirmVoid}
        transaction={transactionToVoid}
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
    </div>
  );
}
