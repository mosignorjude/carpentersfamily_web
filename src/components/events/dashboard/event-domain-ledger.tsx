"use client";

import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { ReceiptCell } from "@/components/finances/receipt-cell";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatNaira } from "@/lib/format";
import type { DashboardTransaction } from "./dashboard-types";

interface EventDomainLedgerProps {
  title?: string;
  domain: "tickets" | "revenue" | "expenses" | "all";
  transactions: DashboardTransaction[];
  currentUserId?: string;
  userRole?: string;
  eventId?: string;
  categories?: any[];
  canRecord?: boolean;
  onRecordTransaction?: () => void;
  onInspect?: (transaction: DashboardTransaction) => void;
  onApprove?: (transaction: DashboardTransaction) => void;
  onReject?: (transaction: DashboardTransaction) => void;
}

const PAGE_SIZE = 20;

export function EventDomainLedger({
  title = "Transaction Ledger",
  domain,
  transactions,
  currentUserId,
  userRole,
  onInspect,
  onApprove,
  onReject,
}: EventDomainLedgerProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "recorded" | "approved" | "rejected" | "cancelled"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "tickets" | "revenue" | "expenses"
  >("all");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "member" | "online"
  >("all");

  const isOfficer =
    userRole === "admin" ||
    userRole === "president" ||
    userRole === "executive" ||
    userRole === "lead" ||
    userRole === "event_lead";

  const isExecutive = userRole === "executive";

  const resolveStatus = (txn: DashboardTransaction) =>
    txn.status === "voided" ? "rejected" : txn.verificationStatus || "approved";

  // Filter transactions by status, channel, domain type, and search query
  const filtered = transactions.filter((txn) => {
    const status = resolveStatus(txn);
    if (statusFilter !== "all" && status !== statusFilter) {
      return false;
    }

    if (domain === "all" && typeFilter !== "all") {
      if (typeFilter === "tickets") {
        if (txn.category !== "ticket_sales") return false;
      } else if (typeFilter === "revenue") {
        if (txn.type !== "revenue" || txn.category === "ticket_sales") return false;
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
      return matchRef || matchId || matchDesc || matchParty || matchCat;
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
  const rejectedCount = transactions.filter(
    (t) => resolveStatus(t) === "rejected",
  ).length;
  const cancelledCount = transactions.filter(
    (t) => resolveStatus(t) === "cancelled",
  ).length;

  const ticketsCount = transactions.filter(
    (t) => t.category === "ticket_sales",
  ).length;
  const revenueCount = transactions.filter(
    (t) => t.type === "revenue" && t.category !== "ticket_sales",
  ).length;
  const expensesCount = transactions.filter(
    (t) => t.type === "expense",
  ).length;

  const filteredNet = filtered.reduce((acc, txn) => {
    const s = resolveStatus(txn);
    if (s === "rejected" || s === "cancelled") return acc;
    if (txn.type === "expense") return acc - txn.amount;
    return acc + txn.amount;
  }, 0);

  const memberChannelCount = transactions.filter(
    (t) =>
      (t.channel ||
        (t.categoryLabel === "Online Sales" ? "online" : "member")) ===
      "member",
  ).length;
  const onlineChannelCount = transactions.filter(
    (t) =>
      (t.channel ||
        (t.categoryLabel === "Online Sales" ? "online" : "member")) ===
      "online",
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs mt-6">
      {/* Ledger Header Bar */}
      <div className="p-4 sm:p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#174C37]" />
            <h4 className="text-base font-bold text-[#3D291F]">{title}</h4>
          </div>
          <p className="text-xs text-[#7A685D] mt-0.5">
            All verified and pending {domain} records.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search transactions..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* Sales Channel Filter Bar (Tickets domain only) */}
      {domain === "tickets" && (
        <div className="px-4 py-2 border-b border-[#E5DDD3] bg-[#FAF6F0]/80 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[11px] font-bold text-[#7A685D] uppercase tracking-wider mr-1 shrink-0">
            Channel:
          </span>
          <button
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
              channelFilter === "all"
                ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => {
              setChannelFilter("all");
              setCurrentPage(1);
            }}
            type="button"
          >
            All Channels ({transactions.length})
          </button>
          <button
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
              channelFilter === "member"
                ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => {
              setChannelFilter("member");
              setCurrentPage(1);
            }}
            type="button"
          >
            Member Sales ({memberChannelCount})
          </button>
          <button
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
              channelFilter === "online"
                ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => {
              setChannelFilter("online");
              setCurrentPage(1);
            }}
            type="button"
          >
            Online Sales ({onlineChannelCount})
          </button>
        </div>
      )}

      {/* Domain Type Filter Bar (Master Ledger domain="all") */}
      {domain === "all" && (
        <div className="px-4 py-2 border-b border-[#E5DDD3] bg-[#FAF6F0]/80 flex items-center justify-between gap-3 overflow-x-auto text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#7A685D] uppercase tracking-wider mr-1 shrink-0">
              Type:
            </span>
            <button
              className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
                typeFilter === "all"
                  ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                  : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => {
                setTypeFilter("all");
                setCurrentPage(1);
              }}
              type="button"
            >
              All ({transactions.length})
            </button>
            <button
              className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
                typeFilter === "tickets"
                  ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                  : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => {
                setTypeFilter("tickets");
                setCurrentPage(1);
              }}
              type="button"
            >
              Tickets ({ticketsCount})
            </button>
            <button
              className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
                typeFilter === "revenue"
                  ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                  : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => {
                setTypeFilter("revenue");
                setCurrentPage(1);
              }}
              type="button"
            >
              Revenue ({revenueCount})
            </button>
            <button
              className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
                typeFilter === "expenses"
                  ? "bg-[#174C37] text-white font-semibold shadow-2xs"
                  : "bg-white text-[#5C4638] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => {
                setTypeFilter("expenses");
                setCurrentPage(1);
              }}
              type="button"
            >
              Expenses ({expensesCount})
            </button>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[11px] text-[#7A685D] block">Filtered Net</span>
            <span
              className={`font-mono font-bold text-xs ${
                filteredNet >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
              }`}
            >
              {filteredNet >= 0 ? "+" : ""}
              {formatNaira(filteredNet)}
            </span>
          </div>
        </div>
      )}

      {/* Filter Pills Bar */}
      <div className="px-4 py-2.5 border-b border-[#E5DDD3] bg-[#FDFBF8] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] ${
              statusFilter === "all"
                ? "bg-[#174C37] text-white font-semibold"
                : "text-[#5C4638] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => {
              setStatusFilter("all");
              setCurrentPage(1);
            }}
            type="button"
          >
            All ({transactions.length})
          </button>
          <button
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] flex items-center gap-1.5 ${
              statusFilter === "recorded"
                ? "bg-[#D6A23A] text-[#3D291F] font-bold"
                : "text-[#B27D16] hover:bg-[#FFF4E5]"
            }`}
            onClick={() => {
              setStatusFilter("recorded");
              setCurrentPage(1);
            }}
            type="button"
          >
            <span className="w-2 h-2 rounded-full bg-[#D6A23A]" />
            Pending Review ({pendingCount})
          </button>
          <button
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] flex items-center gap-1.5 ${
              statusFilter === "approved"
                ? "bg-[#174C37] text-white font-semibold"
                : "text-[#174C37] hover:bg-[#E9F4EE]"
            }`}
            onClick={() => {
              setStatusFilter("approved");
              setCurrentPage(1);
            }}
            type="button"
          >
            <span className="w-2 h-2 rounded-full bg-[#174C37]" />
            Approved ({approvedCount})
          </button>
          <button
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] flex items-center gap-1.5 ${
              statusFilter === "rejected"
                ? "bg-[#BA3C2A] text-white font-semibold"
                : "text-[#BA3C2A] hover:bg-[#FDF0EE]"
            }`}
            onClick={() => {
              setStatusFilter("rejected");
              setCurrentPage(1);
            }}
            type="button"
          >
            <span className="w-2 h-2 rounded-full bg-[#BA3C2A]" />
            Rejected ({rejectedCount})
          </button>
          <button
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] flex items-center gap-1.5 ${
              statusFilter === "cancelled"
                ? "bg-[#5C4638] text-white font-semibold"
                : "text-[#5C4638] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => {
              setStatusFilter("cancelled");
              setCurrentPage(1);
            }}
            type="button"
          >
            <span className="w-2 h-2 rounded-full bg-[#5C4638]" />
            Cancelled ({cancelledCount})
          </button>
        </div>

        <div className="text-xs text-[#7A685D] font-mono">
          {totalItems > 0 ? (
            <span>
              Showing {startIndex + 1} – {Math.min(endIndex, totalItems)} of{" "}
              {totalItems}
            </span>
          ) : (
            <span>0 records found</span>
          )}
        </div>
      </div>

      {/* Mobile Transaction Cards (md:hidden) */}
      <div className="md:hidden divide-y divide-[#EBE5DC]">
        {pageTransactions.length === 0 ? (
          <div className="py-12 px-4 text-center text-[#6B5D53]">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-[#D6A23A]" />
            <p className="font-semibold text-sm text-[#3D291F]">
              No transactions found
            </p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "No records match your search criteria."
                : `No ${statusFilter === "all" ? "" : `${statusFilter} `}records for this event yet.`}
            </p>
          </div>
        ) : (
          pageTransactions.map((txn) => {
            const status = resolveStatus(txn);
            const isRejected = status === "rejected";
            const isCancelled = status === "cancelled";
            const isNotCounted = isRejected || isCancelled;
            const isPending = status === "recorded";
            const isApproved = status === "approved";
            const isExpense = domain === "expenses" || txn.type === "expense";

            const isSelfReview =
              Boolean(currentUserId) &&
              Boolean(txn.createdBy) &&
              txn.createdBy === currentUserId;

            return (
              <div
                className={`p-4 space-y-3 ${
                  isNotCounted ? "bg-[#FAF6F0]/40 opacity-80" : "bg-white"
                }`}
                key={`mobile-${txn.id}`}
              >
                {/* Header: Ref & Date & Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#FAF6F0] text-[#3D291F]"
                        title={`Full Transaction ID: ${txn.id}`}
                      >
                        #{txn.paymentRef || txn.id.slice(0, 8).toUpperCase()}
                      </span>
                      {txn.categoryLabel && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            domain === "tickets" &&
                            txn.categoryLabel === "Online Sales"
                              ? "text-[#174C37] bg-[#E9F4EE] border border-[#174C37]/20"
                              : "text-[#6B5D53] bg-[#FAF6F0]"
                          }`}
                        >
                          {txn.categoryLabel}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#6B5D53] font-mono mt-1 block">
                      {txn.date}
                    </span>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-base font-bold font-mono tabular-nums ${
                        isNotCounted
                          ? "line-through text-[#6B5D53]"
                          : isExpense
                            ? "text-[#BA3C2A]"
                            : "text-[#174C37]"
                      }`}
                    >
                      {isNotCounted ? "" : isExpense ? "-" : "+"}
                      {formatNaira(txn.amount)}
                    </span>
                    {isRejected && (
                      <span className="block text-[10px] font-bold uppercase text-[#BA3C2A]">
                        Reversed
                      </span>
                    )}
                    {isCancelled && (
                      <span className="block text-[10px] font-bold uppercase text-[#5C4638]">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>

                {/* Description & Counterparty */}
                <div>
                  <h4 className="font-semibold text-sm text-[#3D291F]">
                    {txn.description}
                  </h4>
                  <p className="text-xs text-[#6B5D53] mt-0.5">
                    Party:{" "}
                    <span className="font-medium text-[#3D291F]">
                      {txn.payerPayee}
                    </span>
                    {txn.paymentMethod ? ` · ${txn.paymentMethod}` : ""}
                  </p>
                  {isRejected && txn.rejectionReason && (
                    <div className="mt-1.5 text-xs text-[#BA3C2A] bg-[#FDF0EE] p-2 rounded-lg border border-[#F5C7C0]">
                      <strong>Reversed:</strong> {txn.rejectionReason}
                    </div>
                  )}
                  {isCancelled && txn.rejectionReason && (
                    <div className="mt-1.5 text-xs text-[#5C4638] bg-[#FAF6F0] p-2 rounded-lg border border-[#E5DDD3]">
                      <strong>Cancelled:</strong> {txn.rejectionReason}
                    </div>
                  )}
                </div>

                {/* Footer: Voucher, Status, Actions */}
                <div className="flex items-center justify-between pt-2.5 border-t border-[#F2ECE4] gap-2">
                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    {isPending && (
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#FFF4E5] text-[#B27D16] border border-[#F8D8A7]">
                        Pending Review
                      </span>
                    )}
                    {isApproved && (
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]">
                        Approved
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#FDF0EE] text-[#BA3C2A] border border-[#F5C7C0]">
                        Rejected
                      </span>
                    )}
                    {isCancelled && (
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#FAF6F0] text-[#5C4638] border border-[#E5DDD3]">
                        Cancelled
                      </span>
                    )}

                    {/* Voucher Evidence */}
                    <ReceiptCell
                      isLegacy={txn.isLegacy}
                      paymentMethod={txn.paymentMethod}
                      paymentStatus={txn.paymentStatus}
                      receipt={txn.receipt ?? null}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-2 text-xs font-semibold text-[#174C37] bg-white border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-xl transition-colors flex items-center gap-1.5 min-h-[44px] cursor-pointer"
                      onClick={() => onInspect(txn)}
                      type="button"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Inspect</span>
                    </button>

                    {isOfficer &&
                      isPending &&
                      (isExecutive && isSelfReview ? (
                        <span className="text-[10px] font-semibold text-[#B27D16] bg-[#FFF4E5] border border-[#F8D8A7] px-2.5 py-1.5 rounded-lg text-center">
                          Needs Another Officer's Review
                        </span>
                      ) : (
                        <>
                          {onApprove && (
                            <button
                              aria-label="Quick Approve Record"
                              className="p-2.5 text-[#174C37] bg-[#E9F4EE] hover:bg-[#D4ECE0] rounded-xl transition-colors border border-[#174C37]/30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                              onClick={() => onApprove(txn)}
                              title="Quick Approve Record"
                              type="button"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {onReject && (
                            <button
                              aria-label="Reject and Reverse Transaction"
                              className="p-2.5 text-[#BA3C2A] bg-[#FDF0EE] hover:bg-[#F8D7D2] rounded-xl transition-colors border border-[#BA3C2A]/30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                              onClick={() => onReject(txn)}
                              title="Reject and Reverse Transaction"
                              type="button"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Ledger Table (hidden md:block) */}
      <div className="hidden md:block">
        <TableScroll label="Ledger transactions">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E5DDD3] bg-[#F7F3EC] text-[#7A685D] uppercase tracking-wider font-semibold text-[11px]">
                <th className="py-3 px-4">Ref & Date</th>
                <th className="py-3 px-4">Description & Party</th>
                <th className="py-3 px-4">
                  {domain === "tickets" ? "Channel" : "Category"}
                </th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Receipt</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBE5DC]">
              {pageTransactions.length === 0 ? (
                <tr>
                  <td
                    className="py-12 px-4 text-center text-[#7A685D]"
                    colSpan={7}
                  >
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-[#D6A23A]" />
                    <p className="font-semibold text-sm text-[#3D291F]">
                      No transactions found
                    </p>
                    <p className="text-xs mt-1">
                      {searchQuery
                        ? "No records match your search criteria."
                        : `No ${statusFilter === "all" ? "" : `${statusFilter} `}records for this event yet.`}
                    </p>
                  </td>
                </tr>
              ) : (
                pageTransactions.map((txn) => {
                  const status = resolveStatus(txn);
                  const isRejected = status === "rejected";
                  const isCancelled = status === "cancelled";
                  const isNotCounted = isRejected || isCancelled;
                  const isPending = status === "recorded";
                  const isApproved = status === "approved";
                  const isExpense =
                    domain === "expenses" || txn.type === "expense";

                  const isSelfReview =
                    Boolean(currentUserId) &&
                    Boolean(txn.createdBy) &&
                    txn.createdBy === currentUserId;

                  return (
                    <tr
                      className={`hover:bg-[#FAF6F0]/60 transition-colors ${
                        isNotCounted ? "bg-[#FAF6F0]/30 opacity-75" : ""
                      }`}
                      key={txn.id}
                    >
                      {/* Ref & Date */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F] block w-fit cursor-help"
                          title={`Full Transaction ID: ${txn.id}`}
                        >
                          #{txn.paymentRef || txn.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="text-[11px] text-[#7A685D] block mt-0.5 font-mono">
                          {txn.date}
                        </span>
                      </td>

                      {/* Description & Counterparty */}
                      <td className="py-3 px-4 max-w-[280px]">
                        <div
                          className="font-semibold text-[#3D291F] truncate"
                          title={txn.description}
                        >
                          {txn.description}
                        </div>
                        <div className="text-[11px] text-[#7A685D] truncate mt-0.5">
                          Party:{" "}
                          <span className="font-medium text-[#5C4638]">
                            {txn.payerPayee}
                          </span>
                        </div>
                        {isRejected && txn.rejectionReason && (
                          <div className="mt-1 text-[10px] text-[#BA3C2A] bg-[#FDF0EE] p-1.5 rounded-md border border-[#F5C7C0]">
                            <strong>Reversed:</strong> {txn.rejectionReason}
                          </div>
                        )}
                        {isCancelled && txn.rejectionReason && (
                          <div className="mt-1 text-[10px] text-[#5C4638] bg-[#FAF6F0] p-1.5 rounded-md border border-[#E5DDD3]">
                            <strong>Cancelled:</strong> {txn.rejectionReason}
                          </div>
                        )}
                      </td>

                      {/* Category / Channel */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-semibold text-xs block ${
                            domain === "tickets" &&
                            txn.categoryLabel === "Online Sales"
                              ? "text-[#174C37]"
                              : "text-[#3D291F]"
                          }`}
                        >
                          {txn.categoryLabel || "General"}
                        </span>
                        <span className="text-[11px] text-[#7A685D]">
                          {txn.paymentMethod}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-bold font-mono tabular-nums ${
                            isNotCounted
                              ? "line-through text-[#7A685D]"
                              : isExpense
                                ? "text-[#BA3C2A]"
                                : "text-[#174C37]"
                          }`}
                        >
                          {isNotCounted ? "" : isExpense ? "-" : "+"}
                          {formatNaira(txn.amount)}
                        </span>
                        {isRejected && (
                          <span className="block text-[10px] font-bold uppercase text-[#BA3C2A]">
                            Reversed
                          </span>
                        )}
                        {isCancelled && (
                          <span className="block text-[10px] font-bold uppercase text-[#5C4638]">
                            Cancelled
                          </span>
                        )}
                      </td>

                      {/* Receipt Voucher */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <ReceiptCell
                            isLegacy={txn.isLegacy}
                            paymentMethod={txn.paymentMethod}
                            paymentStatus={txn.paymentStatus}
                            receipt={txn.receipt ?? null}
                          />
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isPending && (
                          <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#FFF4E5] text-[#B27D16] border border-[#F8D8A7]">
                            Pending Review
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]">
                            Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#FDF0EE] text-[#BA3C2A] border border-[#F5C7C0]">
                            Rejected
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#FAF6F0] text-[#5C4638] border border-[#E5DDD3]">
                            Cancelled
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="px-2.5 py-1 text-[11px] font-semibold text-[#174C37] bg-white border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-lg transition-colors flex items-center gap-1 min-h-[30px] cursor-pointer"
                            onClick={() => onInspect(txn)}
                            type="button"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>

                          {/* Quick Approve / Reject for Officers */}
                          {isOfficer &&
                            isPending &&
                            (isExecutive && isSelfReview ? (
                              <span className="text-[10px] font-semibold text-[#B27D16] bg-[#FFF4E5] border border-[#F8D8A7] px-2 py-1 rounded-lg">
                                Needs Another Officer's Review
                              </span>
                            ) : (
                              <>
                                {onApprove && (
                                  <button
                                    className="p-1 text-[#174C37] hover:bg-[#E9F4EE] rounded-lg transition-colors border border-[#174C37]/30 cursor-pointer"
                                    onClick={() => onApprove(txn)}
                                    title="Quick Approve Record"
                                    type="button"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onReject && (
                                  <button
                                    className="p-1 text-[#BA3C2A] hover:bg-[#FDF0EE] rounded-lg transition-colors border border-[#BA3C2A]/30 cursor-pointer"
                                    onClick={() => onReject(txn)}
                                    title="Reject and Reverse Transaction"
                                    type="button"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-[#7A685D]">
            Page <strong className="text-[#3D291F]">{validPage}</strong> of{" "}
            <strong className="text-[#3D291F]">{totalPages}</strong> (20 per
            page)
          </span>

          <div className="flex items-center gap-1.5 max-w-full overflow-x-auto py-1">
            <button
              className="px-3 py-1.5 border border-[#E5DDD3] bg-white rounded-lg font-medium text-[#3D291F] hover:bg-[#FAF6F0] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 min-h-[38px] shrink-0 cursor-pointer"
              disabled={validPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (num) => (
                  <button
                    className={`min-w-[36px] min-h-[36px] px-2 rounded-lg font-mono font-medium text-xs transition-colors cursor-pointer flex items-center justify-center ${
                      num === validPage
                        ? "bg-[#174C37] text-white font-bold"
                        : "bg-white border border-[#E5DDD3] text-[#5C4638] hover:bg-[#FAF6F0]"
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

            <button
              className="px-3 py-1.5 border border-[#E5DDD3] bg-white rounded-lg font-medium text-[#3D291F] hover:bg-[#FAF6F0] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 min-h-[38px] shrink-0 cursor-pointer"
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              type="button"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
