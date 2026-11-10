"use client";

import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CfButton, CfFilterPill } from "@/components/ui";
import { downloadLedgerCSV, formatNaira } from "@/lib/format";
import type {
  DashboardCostCenter,
  DashboardRevenueStream,
  DashboardTicketTier,
  DashboardTransaction,
  EventFinanceCategoryItem,
} from "./dashboard-types";
import { LedgerTransactionCard } from "./ledger-transaction-card";

interface EventDomainLedgerProps {
  title?: string;
  subtitle?: string;
  domain: "tickets" | "revenue" | "expenses" | "all";
  transactions: DashboardTransaction[];
  currentUserId?: string;
  userRole?: string;
  eventId?: string;
  categories?: EventFinanceCategoryItem[];
  costCenters?: DashboardCostCenter[];
  revenueStreams?: DashboardRevenueStream[];
  ticketTiers?: DashboardTicketTier[];
  canRecord?: boolean;
  initialTypeFilter?: "all" | "tickets" | "revenue" | "expenses";
  initialCategoryFilter?: string;
  initialStatusFilter?:
    | "all"
    | "recorded"
    | "approved"
    | "rejected"
    | "cancelled"
    | "voided";
  onExportCsv?: () => void;
  onRecordTransaction?: () => void;
  onInspect?: (transaction: DashboardTransaction) => void;
  onApprove?: (transaction: DashboardTransaction) => void;
  onReject?: (transaction: DashboardTransaction) => void;
  onVoid?: (transaction: DashboardTransaction) => void;
}

const PAGE_SIZE = 20;

export function EventDomainLedger({
  title = "Unified Event Ledger & Audit Journal",
  subtitle = "All verified, pending, and voided entries in one place — tap any card to review its receipt",
  domain,
  transactions,
  currentUserId,
  userRole,
  costCenters = [],
  revenueStreams = [],
  ticketTiers = [],
  initialTypeFilter = "all",
  initialCategoryFilter = "",
  initialStatusFilter = "all",
  onExportCsv,
  onInspect,
}: EventDomainLedgerProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialCategoryFilter && initialCategoryFilter !== "All"
      ? initialCategoryFilter
      : "All",
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "recorded" | "approved" | "rejected" | "cancelled" | "voided"
  >(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState<
    "all" | "tickets" | "revenue" | "expenses"
  >(initialTypeFilter);
  const [channelFilter, setChannelFilter] = useState<
    "all" | "member" | "online"
  >("all");

  useEffect(() => {
    if (initialTypeFilter) {
      setTypeFilter(initialTypeFilter);
      setCurrentPage(1);
    }
  }, [initialTypeFilter]);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
      setCurrentPage(1);
    }
  }, [initialStatusFilter]);

  useEffect(() => {
    const nextCat =
      initialCategoryFilter && initialCategoryFilter !== "All"
        ? initialCategoryFilter
        : "All";
    setCategoryFilter(nextCat);
    setCurrentPage(1);
  }, [initialCategoryFilter]);

  const resolveStatus = (txn: DashboardTransaction) => {
    if (txn.verificationStatus === "cancelled") return "cancelled";
    if (txn.status === "voided") return "rejected";
    return txn.verificationStatus || "approved";
  };

  const categoryGroups = useMemo(() => {
    const tierOptions = Array.from(
      new Set([
        ...ticketTiers.map((t) => t.name),
        ...transactions
          .filter((t) => t.category === "ticket_sales" && t.tierName)
          .map((t) => t.tierName as string),
      ]),
    );

    const revOptions = Array.from(
      new Set([
        ...revenueStreams
          .filter((r) => r.id !== "ticket_sales")
          .map((r) => r.name),
        ...transactions
          .filter((t) => t.type === "revenue" && t.category !== "ticket_sales")
          .map((t) => t.categoryLabel),
      ]),
    );

    const expOptions = Array.from(
      new Set([
        ...costCenters.map((c) => c.name),
        ...transactions
          .filter((t) => t.type === "expense")
          .map((t) => t.categoryLabel),
      ]),
    );

    return { tierOptions, revOptions, expOptions };
  }, [ticketTiers, revenueStreams, costCenters, transactions]);

  const filtered = transactions.filter((txn) => {
    const status = resolveStatus(txn);
    if (statusFilter === "voided") {
      if (status !== "rejected" && status !== "cancelled") return false;
    } else if (statusFilter === "cancelled") {
      if (status !== "cancelled") return false;
    } else if (statusFilter !== "all" && status !== statusFilter) {
      return false;
    }

    if (domain === "all" && typeFilter !== "all") {
      if (typeFilter === "tickets") {
        if (txn.category !== "ticket_sales") return false;
      } else if (typeFilter === "revenue") {
        if (txn.type !== "revenue" || txn.category === "ticket_sales")
          return false;
      } else if (typeFilter === "expenses") {
        if (txn.type !== "expense") return false;
      }
    }

    if (domain === "tickets" && channelFilter !== "all") {
      const txnChannel =
        txn.channel ||
        (txn.categoryLabel === "Online Sales" ? "online" : "member");
      if (txnChannel !== channelFilter) {
        return false;
      }
    } else if (
      domain === "all" &&
      typeFilter === "tickets" &&
      channelFilter !== "all"
    ) {
      const txnChannel =
        txn.channel ||
        (txn.categoryLabel === "Online Sales" ? "online" : "member");
      if (txnChannel !== channelFilter) {
        return false;
      }
    }

    if (categoryFilter !== "All") {
      const norm = categoryFilter.trim().toLowerCase();
      const matchCategory =
        (txn.tierName || "").toLowerCase() === norm ||
        (txn.categoryLabel || "").toLowerCase() === norm ||
        (txn.category || "").toLowerCase() === norm;
      if (!matchCategory) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRef = (txn.paymentRef || txn.id.slice(0, 8))
        .toLowerCase()
        .includes(q);
      const matchId = txn.id.toLowerCase().includes(q);
      const matchDesc = (txn.description || "").toLowerCase().includes(q);
      const matchParty = (txn.payerPayee || "").toLowerCase().includes(q);
      const matchCat = (txn.categoryLabel || "").toLowerCase().includes(q);
      const matchTier = (txn.tierName || "").toLowerCase().includes(q);
      return (
        matchRef || matchId || matchDesc || matchParty || matchCat || matchTier
      );
    }

    return true;
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pageTransactions = filtered.slice(startIndex, endIndex);

  const pendingCount = transactions.filter(
    (t) => resolveStatus(t) === "recorded",
  ).length;
  const approvedCount = transactions.filter(
    (t) => resolveStatus(t) === "approved",
  ).length;
  const cancelledCount = transactions.filter(
    (t) => resolveStatus(t) === "cancelled",
  ).length;
  const voidedCount = transactions.filter((t) => {
    const s = resolveStatus(t);
    return s === "rejected" || s === "cancelled";
  }).length;

  const ticketsCount = transactions.filter(
    (t) => t.category === "ticket_sales",
  ).length;
  const revenueCount = transactions.filter(
    (t) => t.type === "revenue" && t.category !== "ticket_sales",
  ).length;
  const expensesCount = transactions.filter((t) => t.type === "expense").length;

  const verifiedFilteredNet = filtered.reduce((acc, txn) => {
    const s = resolveStatus(txn);
    const isRejected = s === "rejected";
    const isCancelled = s === "cancelled";
    const isNotCounted = isRejected || isCancelled;
    if (isNotCounted || s !== "approved") return acc;
    if (txn.type === "expense") return acc - txn.amount;
    return acc + txn.amount;
  }, 0);

  const ticketScoped = transactions.filter(
    (t) => domain === "tickets" || t.category === "ticket_sales",
  );
  const memberChannelCount = ticketScoped.filter(
    (t) =>
      (t.channel ||
        (t.categoryLabel === "Online Sales" ? "online" : "member")) ===
      "member",
  ).length;
  const onlineChannelCount = ticketScoped.filter(
    (t) =>
      (t.channel ||
        (t.categoryLabel === "Online Sales" ? "online" : "member")) ===
      "online",
  ).length;

  const handleResetFilters = () => {
    setTypeFilter("all");
    setCategoryFilter("All");
    setStatusFilter("all");
    setChannelFilter("all");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handleCsvExport = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    downloadLedgerCSV(filtered);
  };

  return (
    <div className="space-y-3.5 min-w-0">
      {/* Filter Card */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#3D291F]">
              {title}
            </h3>
            <p className="text-xs text-[#5C4638] mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CfButton
              onClick={handleCsvExport}
              size="compact"
              variant="secondary"
            >
              <Download className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
              <span>Export CSV</span>
            </CfButton>
          </div>
        </div>

        {/* Search Input + Grouped Category Select + Reset */}
        {domain === "all" ? (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                aria-label="Search ledger entries"
                className="w-full min-h-[44px] pl-9 pr-10 py-2 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#3D291F] placeholder:text-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by title, party name, or #ref..."
                type="text"
                value={searchQuery}
              />
              {searchQuery && (
                <button
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[#7A685D] hover:text-[#3D291F] rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  type="button"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="sm:col-span-6 flex items-center gap-2">
              <select
                aria-label="Filter by category"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] cursor-pointer"
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                value={categoryFilter}
              >
                <option value="All">All Categories & Tiers</option>
                {categoryGroups.tierOptions.length > 0 && (
                  <optgroup label="Ticket Tiers">
                    {categoryGroups.tierOptions.map((tier) => (
                      <option key={`tier-${tier}`} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </optgroup>
                )}
                {categoryGroups.revOptions.length > 0 && (
                  <optgroup label="Revenue Streams">
                    {categoryGroups.revOptions.map((rev) => (
                      <option key={`rev-${rev}`} value={rev}>
                        {rev}
                      </option>
                    ))}
                  </optgroup>
                )}
                {categoryGroups.expOptions.length > 0 && (
                  <optgroup label="Expense Cost Centers">
                    {categoryGroups.expOptions.map((exp) => (
                      <option key={`exp-${exp}`} value={exp}>
                        {exp}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <CfButton
                className="shrink-0 bg-[#E5DDD3]/60 hover:bg-[#E5DDD3]"
                onClick={handleResetFilters}
                size="compact"
                variant="secondary"
              >
                Reset
              </CfButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                aria-label="Search ticket records"
                className="w-full min-h-[44px] pl-9 pr-10 py-2 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#3D291F] placeholder:text-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search buyer, tier, or #ref..."
                type="text"
                value={searchQuery}
              />
              {searchQuery && (
                <button
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[#7A685D] hover:text-[#3D291F] rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  type="button"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {(searchQuery ||
              statusFilter !== "all" ||
              channelFilter !== "all") && (
              <CfButton
                className="shrink-0 bg-[#E5DDD3]/60 hover:bg-[#E5DDD3]"
                onClick={handleResetFilters}
                size="compact"
                variant="secondary"
              >
                Reset
              </CfButton>
            )}
          </div>
        )}

        {/* Domain Filter Pills (Unified Ledger) */}
        {domain === "all" && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              {
                id: "all" as const,
                label: `All Domains (${transactions.length})`,
              },
              { id: "tickets" as const, label: `Tickets (${ticketsCount})` },
              {
                id: "revenue" as const,
                label: `Other Revenue (${revenueCount})`,
              },
              { id: "expenses" as const, label: `Expenses (${expensesCount})` },
            ].map((pill) => (
              <CfFilterPill
                active={typeFilter === pill.id}
                key={pill.id}
                onClick={() => {
                  setTypeFilter(pill.id);
                  setCurrentPage(1);
                }}
                tone="forest"
              >
                {pill.label}
              </CfFilterPill>
            ))}
          </div>
        )}

        {/* Sales Channel Filter Bar */}
        {(domain === "tickets" ||
          (domain === "all" && typeFilter === "tickets")) && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[#E5DDD3]/70">
            <span className="text-[11px] font-bold text-[#7A685D] uppercase tracking-wider mr-1 shrink-0">
              Channel:
            </span>
            {[
              {
                id: "all" as const,
                label: `All Channels (${ticketScoped.length})`,
              },
              {
                id: "member" as const,
                label: `Member Sales (${memberChannelCount})`,
              },
              {
                id: "online" as const,
                label: `Online Sales (${onlineChannelCount})`,
              },
            ].map((ch) => (
              <CfFilterPill
                active={channelFilter === ch.id}
                key={ch.id}
                onClick={() => {
                  setChannelFilter(ch.id);
                  setCurrentPage(1);
                }}
                tone="deep"
              >
                {ch.label}
              </CfFilterPill>
            ))}
          </div>
        )}

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[#E5DDD3]/70">
          {[
            {
              id: "all" as const,
              label: `All Status (${transactions.length})`,
            },
            { id: "approved" as const, label: `Approved (${approvedCount})` },
            { id: "recorded" as const, label: `Pending (${pendingCount})` },
            ...(cancelledCount > 0
              ? [
                  {
                    id: "cancelled" as const,
                    label: `Cancelled (${cancelledCount})`,
                  },
                ]
              : []),
            {
              id: "voided" as const,
              label: `Voided (${voidedCount})`,
            },
          ].map((pill) => {
            const isActive =
              statusFilter === pill.id ||
              (pill.id === "voided" && statusFilter === "rejected");
            return (
              <CfFilterPill
                active={isActive}
                key={pill.id}
                onClick={() => {
                  setStatusFilter(pill.id);
                  setCurrentPage(1);
                }}
                tone="espresso"
              >
                {pill.label}
              </CfFilterPill>
            );
          })}
        </div>
      </div>

      {/* Count & Net Verified Summary + Unified 2-Line Cards */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#7A685D]">
          <span className="font-semibold uppercase tracking-wider">
            {totalItems > 0
              ? `Showing ${startIndex + 1}–${Math.min(endIndex, totalItems)} of ${totalItems} transactions`
              : `Showing 0 of ${transactions.length} transactions`}
          </span>
          <span className="font-mono text-[#3D291F] font-bold">
            Net Verified:{" "}
            <span
              className={
                verifiedFilteredNet >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
              }
            >
              {verifiedFilteredNet >= 0 ? "+" : "-"}
              {formatNaira(Math.abs(verifiedFilteredNet))}
            </span>
          </span>
        </div>

        {pageTransactions.length === 0 ? (
          <div className="p-8 text-center bg-white border border-[#E5DDD3] rounded-2xl space-y-2">
            <h4 className="text-base font-bold text-[#3D291F]">
              No Matching Ledger Entries
            </h4>
            <p className="text-xs text-[#7A685D]">
              Try resetting your filters or search query to view all event
              transactions.
            </p>
            <div className="pt-1">
              <CfButton
                className="text-[#174C37]"
                onClick={handleResetFilters}
                size="compact"
                variant="secondary"
              >
                Reset All Filters
              </CfButton>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {pageTransactions.map((txn) => (
              <LedgerTransactionCard
                currentUserId={currentUserId}
                key={txn.id}
                onSelect={(selected) => onInspect?.(selected)}
                transaction={txn}
                userRole={userRole}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 rounded-2xl border border-[#E5DDD3] bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-[#7A685D]">
            Page <strong className="text-[#3D291F]">{validPage}</strong> of{" "}
            <strong className="text-[#3D291F]">{totalPages}</strong> (20 per
            page)
          </span>

          <div className="flex items-center gap-1.5 max-w-full overflow-x-auto py-1">
            <CfButton
              disabled={validPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              size="compact"
              variant="secondary"
            >
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Previous</span>
            </CfButton>

            <div className="hidden sm:flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (num) => (
                  <button
                    className={`min-w-[44px] min-h-[44px] px-2 rounded-xl font-mono font-medium text-xs transition-colors cursor-pointer flex items-center justify-center ${
                      num === validPage
                        ? "bg-[#174C37] text-white font-bold"
                        : "bg-[#FAF6F0] border border-[#E5DDD3] text-[#5C4638] hover:border-[#174C37]"
                    }`}
                    key={num}
                    onClick={() => setCurrentPage(num)}
                    type="button"
                  >
                    {num}
                  </button>
                ),
              )}
            </div>

            <CfButton
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              size="compact"
              variant="secondary"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </CfButton>
          </div>
        </div>
      )}
    </div>
  );
}
