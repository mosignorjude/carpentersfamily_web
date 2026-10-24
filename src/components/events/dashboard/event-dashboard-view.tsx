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
import type React from "react";
import { useEffect, useState, useTransition } from "react";
import {
  recordEventFinancialTransactionAction,
  recordEventTicketSaleAction,
  refundEventTicketSaleAction,
  voidEventFinancialTransactionAction,
} from "@/app/actions";
import { downloadLedgerCSV } from "@/lib/format";
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
import { EventCategoryManagementModal } from "./modals/event-category-management-modal";
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
  if (normalized.includes("transfer") || normalized.includes("nibss")) {
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
  const [, startTransition] = useTransition();

  // Local state synchronized with server props
  const [ticketTiers, setTicketTiers] =
    useState<DashboardTicketTier[]>(initialTicketTiers);
  const [revenueStreams, setRevenueStreams] = useState<
    DashboardRevenueStream[]
  >(initialRevenueStreams);
  const [costCenters, setCostCenters] =
    useState<DashboardCostCenter[]>(initialCostCenters);
  const [transactions, setTransactions] =
    useState<DashboardTransaction[]>(initialTransactions);
  const [activityLogs, setActivityLogs] =
    useState<ActivityLogItem[]>(initialActivityLogs);

  useEffect(() => {
    setTicketTiers(initialTicketTiers);
    setRevenueStreams(initialRevenueStreams);
    setCostCenters(initialCostCenters);
    setTransactions(initialTransactions);
    setActivityLogs(initialActivityLogs);
  }, [
    initialTicketTiers,
    initialRevenueStreams,
    initialCostCenters,
    initialTransactions,
    initialActivityLogs,
  ]);

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

  // Synchronize hash with tab
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
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
        ].includes(hash)
      ) {
        setActiveTab(hash as DashboardTab);
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
    window.history.replaceState(null, "", `#${tabId}`);
  };

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
    const newTxnId = `TXN-2026-${String(transactions.length + 1).padStart(3, "0")}`;
    const newTxn: DashboardTransaction = {
      ...txnData,
      id: newTxnId,
      status: "posted",
    };

    setTransactions((prev) => [newTxn, ...prev]);

    // Update tickets tier if ticket_sales
    if (txnData.category === "ticket_sales") {
      setTicketTiers((prev) =>
        prev.map((tier) => {
          if (
            tier.id === txnData.tierId ||
            txnData.description.toLowerCase().includes(tier.name.toLowerCase())
          ) {
            const qty = txnData.ticketQuantity ?? 1;
            const nextSold = Math.min(tier.capacity, tier.sold + qty);
            return {
              ...tier,
              sold: nextSold,
              status: nextSold >= tier.capacity ? "sold_out" : tier.status,
            };
          }
          return tier;
        }),
      );
    }

    // Update cost center spent amount if expense
    if (txnData.type === "expense") {
      setCostCenters((prev) =>
        prev.map((c) => {
          if (
            c.id === txnData.category ||
            c.categoryId === txnData.category ||
            c.name.toLowerCase() === txnData.categoryLabel.toLowerCase()
          ) {
            return {
              ...c,
              spent: c.spent + txnData.amount,
              items: [
                {
                  name: txnData.description,
                  allocated: c.allocated,
                  spent: txnData.amount,
                  vendor: txnData.payerPayee,
                },
                ...c.items,
              ],
            };
          }
          return c;
        }),
      );
    }

    // Add activity log
    const newLog: ActivityLogItem = {
      id: `LOG-${Date.now().toString().slice(-4)}`,
      action:
        txnData.type === "revenue"
          ? "Revenue Receipt Posted"
          : "Disbursement Recorded",
      category: txnData.categoryLabel,
      details: `${txnData.description} for ₦${txnData.amount.toLocaleString()}`,
      user: txnData.authorizedBy,
      userRole: txnData.authorizerRole,
      timestamp: txnData.date,
    };
    setActivityLogs((prev) => [newLog, ...prev]);

    // Persist in Supabase via server actions
    const idempotencyKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "00000000-0000-4000-8000-000000000000";
    const dbMethod = mapDbPaymentMethod(txnData.paymentMethod);

    if (txnData.category === "ticket_sales" && txnData.tierId) {
      const fd = new FormData();
      fd.set("event_id", event.id);
      fd.set("tier_id", txnData.tierId);
      fd.set("quantity", String(txnData.ticketQuantity ?? 1));
      fd.set("buyer_name", txnData.payerPayee.slice(0, 160));
      fd.set("payment_method", dbMethod);
      fd.set("idempotency_key", idempotencyKey);
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
    fd.set("kind", txnData.type === "revenue" ? "income" : "expense");
    fd.set("amount_ngn", String(Math.round(txnData.amount)));
    fd.set("transaction_date", lagosToday);
    fd.set("category_id", txnData.category);
    fd.set("category_name", txnData.categoryLabel);
    fd.set("payment_status", "paid");
    fd.set("idempotency_key", idempotencyKey);

    if (txnData.type === "revenue") {
      fd.set(
        "source_note",
        `${txnData.description}${txnData.paymentRef ? ` (Ref: ${txnData.paymentRef})` : ""}`.slice(
          0,
          500,
        ),
      );
      fd.set("payer_payee", txnData.payerPayee.slice(0, 160));
      fd.set("payment_method", dbMethod);
    } else {
      if (txnData.budgetAllocationCategoryId) {
        fd.set(
          "budget_allocation_category_id",
          txnData.budgetAllocationCategoryId,
        );
      }
      fd.set(
        "description",
        `${txnData.description}${txnData.paymentRef ? ` (Ref: ${txnData.paymentRef})` : ""}`.slice(
          0,
          500,
        ),
      );
      fd.set("payer_payee", txnData.payerPayee.slice(0, 160));
    }

    startTransition(() => {
      void recordEventFinancialTransactionAction(fd);
    });
  };

  const handleConfirmVoid = (txnId: string, reason: string) => {
    const targetTxn = transactions.find((t) => t.id === txnId);
    const now = new Date();
    const watTime = `${now.toISOString().slice(0, 10)} ${now
      .getHours()
      .toString()
      .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id === txnId) {
          return {
            ...t,
            status: "voided",
            voidReason: reason,
            voidedBy: "Club Administrator",
            voidedAt: watTime,
          };
        }
        return t;
      }),
    );

    const voidLog: ActivityLogItem = {
      id: `LOG-${Date.now().toString().slice(-4)}`,
      action: "Ledger Record Voided",
      category: "Audit & Policy",
      details: `Voided ${txnId}. Stated Reason: ${reason}`,
      user: "Club Administrator",
      userRole: "Admin",
      timestamp: watTime,
    };
    setActivityLogs((prev) => [voidLog, ...prev]);

    // Persist in Supabase via server actions
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        txnId,
      )
    ) {
      const fd = new FormData();
      fd.set("event_id", event.id);
      fd.set("reason", reason.slice(0, 500));
      if (targetTxn?.category === "ticket_sales") {
        fd.set("sale_id", txnId);
        startTransition(() => {
          void refundEventTicketSaleAction(fd);
        });
      } else {
        fd.set("transaction_id", txnId);
        startTransition(() => {
          void voidEventFinancialTransactionAction(fd);
        });
      }
    }
  };

  // 8 Exact Tabs Configuration (User requested separate Expenses from Budget & Allocations)
  const tabs: {
    id: DashboardTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "overview", label: "Overview", icon: Layers },
    { id: "tickets", label: "Tickets", icon: Ticket },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "budget", label: "Budget & Allocations", icon: BarChart3 },
    { id: "revenue", label: "Revenue", icon: DollarSign },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "team_roles", label: "Team & Roles", icon: Users },
    { id: "audit_log", label: "Audit Log", icon: Shield },
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
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#174C37] hover:underline min-h-[36px]"
            href="/events"
          >
            <ArrowLeft className="w-4 h-4 text-[#174C37]" />
            <span>Back to Events and planning</span>
          </Link>

          <div className="flex items-center gap-2">
            {(event.attendanceEnabled || event.minutesEnabled) && (
              <Link
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] hover:border-[#174C37]/40 text-xs font-semibold text-[#174C37] transition-colors"
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

        {/* 8 Horizontal Pill Tabs */}
        <div className="flex items-center justify-between gap-3 pt-2 overflow-x-auto border-t border-[#E5DDD3]">
          <div className="flex items-center gap-1 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 min-h-[38px] cursor-pointer border-0 ${
                    isActive
                      ? "bg-[#174C37] text-white shadow-xs font-semibold"
                      : "bg-transparent text-[#5C4638] hover:text-[#174C37] hover:bg-white/80"
                  }`}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  type="button"
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive ? "text-[#D6A23A]" : "text-[#7A685D]"
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Render Active Tab Component */}
      {activeTab === "overview" && (
        <TabOverview
          budgetCeiling={event.budgetCeiling}
          canRecord={canRecord}
          committedExpenses={committedExpenses}
          costCenters={costCenters}
          event={event}
          onNavigateTab={(tab) => selectTab(tab as DashboardTab)}
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
          onOpenRecordTicketModal={
            canRecord
              ? (_tierId) => {
                  setRecordInitialType("revenue");
                  setRecordInitialCategory("ticket_sales");
                  setIsRecordModalOpen(true);
                }
              : undefined
          }
          tiers={ticketTiers}
        />
      )}

      {activeTab === "expenses" && (
        <TabExpenses
          budgetCeiling={event.budgetCeiling}
          canRecord={canRecord}
          costCenters={costCenters}
          onRecordExpense={(cat) => {
            setRecordInitialType("expense");
            setRecordInitialCategory(cat);
            setIsRecordModalOpen(true);
          }}
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
          revenueStreams={revenueStreams}
        />
      )}

      {activeTab === "revenue" && (
        <TabRevenue
          canManageCategories={canManageCategories}
          canRecord={canRecord}
          onManageCategories={() => {
            setCategoryModalType("revenue");
            setIsCategoryModalOpen(true);
          }}
          onRecordRevenue={(cat) => {
            setRecordInitialType("revenue");
            setRecordInitialCategory(cat);
            setIsRecordModalOpen(true);
          }}
          streams={revenueStreams}
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

      {/* Global Modals */}
      <RecordTransactionModal
        budgetCeiling={event.budgetCeiling}
        categories={categories}
        costCenters={costCenters}
        initialCategory={recordInitialCategory}
        initialType={recordInitialType}
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSave={handleSaveTransaction}
        ticketTiers={ticketTiers}
        userRole={userRole}
      />

      <VoidTransactionModal
        isOpen={isVoidModalOpen}
        onClose={() => {
          setIsVoidModalOpen(false);
          setTransactionToVoid(null);
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
    </div>
  );
}
