"use client";

import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  Download,
  FileText,
  Layers,
  Lock,
  MapPin,
  Plus,
  Shield,
  Ticket,
  Users,
  Wallet,
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
  TransactionType,
} from "./dashboard-types";
import {
  MobileTabBottomSheet,
  type MobileTabItem,
} from "./mobile-tab-bottom-sheet";
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
    setActiveTab(initialTab);
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
          "expenses",
          "budget",
          "revenue",
          "reports",
          "team_roles",
          "audit_log",
        ].includes(tabName)
      ) {
        setActiveTab(tabName as DashboardTab);
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
    setActiveTab(tabId);
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("tab", tabId);
    const newRelativePathQuery = `${window.location.pathname}?${searchParams.toString()}#event-finance-${tabId}`;
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

  const isAdminOrBackup = userRole === "admin" || userRole === "backup_admin";
  const isLeadOrExec =
    isAdminOrBackup || userRole === "executive" || userRole === "event_lead";
  const canRecord = isLeadOrExec && !isLocked;

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

  // 8 Exact Tabs Configuration (User requested separate Expenses from Budget & Allocations)
  const tabs: MobileTabItem[] = [
    {
      id: "overview",
      label: "Overview",
      subtitle: "Financial summary, budget ceiling & variances",
      icon: Layers,
    },
    {
      id: "tickets",
      label: "Tickets",
      subtitle: "Tier inventory, sales tallies & pass holders",
      icon: Ticket,
    },
    {
      id: "expenses",
      label: "Expenses",
      subtitle: "Operational cost centers & vendor receipts",
      icon: Wallet,
    },
    {
      id: "budget",
      label: "Budget & Allocations",
      subtitle: "Departmental limits & statutory caps",
      icon: BarChart3,
    },
    {
      id: "revenue",
      label: "Revenue",
      subtitle: "Sponsorships, donations & external inflows",
      icon: DollarSign,
    },
    {
      id: "reports",
      label: "Reports",
      subtitle: "Financial statements, P&L & PDF export",
      icon: BarChart3,
    },
    {
      id: "team_roles",
      label: "Team & Roles",
      subtitle: "Committee desks & authorized officers",
      icon: Users,
    },
    {
      id: "audit_log",
      label: "Audit Log",
      subtitle: "Immutable transaction journal & void logs",
      icon: Shield,
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
      {/* Top Scoped Header Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4">
        {/* Navigation Breadcrumb & Back Link */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#E5DDD3]">
          <Link
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#174C37] hover:underline min-h-[44px]"
            href="/events"
          >
            <ArrowLeft className="w-4 h-4 text-[#174C37]" />
            <span>Back to Events and planning</span>
          </Link>

          <div className="flex items-center gap-2">
            {(event.attendanceEnabled || event.minutesEnabled) && (
              <Link
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] hover:border-[#174C37]/40 text-xs font-semibold text-[#174C37] transition-colors min-h-[44px]"
                href={`/attendance?event=${encodeURIComponent(event.id)}`}
              >
                <FileText className="w-3.5 h-3.5 text-[#174C37]" />
                <span>Minutes & Attendance</span>
              </Link>
            )}
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold capitalize border ${statusBadgeClass}`}
            >
              {event.archivedAt ? "Archived" : event.status}
            </span>
          </div>
        </div>

        {/* Title & Metadata */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#7A685D] mb-1">
              <span className="font-bold text-[#174C37] uppercase">
                {event.type} Event Dashboard
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[#3D291F] capitalize">
                Status: {event.status}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#3D291F] tracking-tight">
              {event.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5C4638] mt-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#174C37]" />
                <span>{event.dateFormatted}</span>
              </div>
              <span aria-hidden="true" className="text-[#E5DDD3]">
                ·
              </span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#174C37]" />
                <span className="font-mono">{event.timeWAT}</span>
              </div>
              <span aria-hidden="true" className="text-[#E5DDD3]">
                ·
              </span>
              <div className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-[#174C37]" />
                <span className="truncate">{event.location}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions (Export CSV, Record Ticket Sale, Record Transaction) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              className="px-3.5 py-2 text-xs font-medium text-[#3D291F] bg-white border border-[#E5DDD3] rounded-xl hover:bg-[#FAF6F0] min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer"
              id="btn-export-csv"
              onClick={() => downloadLedgerCSV(transactions)}
              title="Download Ledger CSV"
              type="button"
            >
              <Download className="w-3.5 h-3.5 text-[#174C37]" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {canRecord && (
              <>
                {/* Direct Ticket Sale Action */}
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

                {/* Standard Record Transaction */}
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
                  : "Only an Admin or Backup Admin can reopen completed or cancelled records."}
              </span>
            </div>
          </div>
        )}

        {/* Mobile Interactive Bottom Sheet Picker (Option B) */}
        <div className="pt-2 border-t border-[#E5DDD3] sm:hidden">
          <MobileTabBottomSheet
            activeTab={activeTab}
            onSelectTab={selectTab}
            tabs={tabs}
          />
        </div>

        {/* 8 Horizontal Pill Tabs (Tablet & Desktop) */}
        <div className="hidden sm:block pt-2 border-t border-[#E5DDD3]">
          <TableScroll className="rounded-xl" label="Dashboard sections">
            <div className="flex w-max items-center gap-2 p-1.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 min-h-[48px] cursor-pointer border-0 ${
                      isActive
                        ? "bg-[#174C37] text-white shadow-xs font-semibold"
                        : "bg-transparent text-[#5C4638] hover:text-[#174C37] hover:bg-white/80"
                    }`}
                    key={tab.id}
                    onClick={() => selectTab(tab.id)}
                    type="button"
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? "text-[#D6A23A]" : "text-[#7A685D]"
                      }`}
                    />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </TableScroll>
          <p className="mt-1.5 text-xs text-[#7A685D] lg:hidden">
            Swipe left for more sections
          </p>
        </div>
      </section>

      {/* Render Active Tab Component */}
      <div
        id={`event-finance-${activeTab}`}
        className="scroll-target tab-panel-focus event-finance-panel space-y-6"
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

        {activeTab === "budget" && (
          <TabBudgetAllocations
            budgetCeiling={event.budgetCeiling}
            canManageCategories={canManageCategories}
            costCenters={costCenters}
            onManageCategories={() => {
              setCategoryModalType("budget_allocation");
              setIsCategoryModalOpen(true);
            }}
            onOpenBudgetCeilingModal={() => setIsBudgetCeilingModalOpen(true)}
            revenueStreams={revenueStreams}
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

        {activeTab === "reports" && (
          <TabReports
            budgetCeiling={event.budgetCeiling}
            costCenters={costCenters}
            event={event}
            revenueStreams={revenueStreams}
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
    </div>
  );
}
