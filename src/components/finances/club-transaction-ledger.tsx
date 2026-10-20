"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Paperclip,
  Search,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FinanceTransaction } from "@/app/(member)/finances/finance-forms";
import {
  DataUnavailableCard,
  EmptyStateCard,
} from "@/components/ui/state-screen";
import type { FinanceReceipt } from "./receipt-modal";

interface ClubTransactionLedgerProps {
  transactions: FinanceTransaction[];
  receiptsByTransaction: Map<string, FinanceReceipt[]>;
  isOfficer: boolean;
  canCorrect: boolean;
  page: number;
  pageCount: number;
  transactionCount: number;
  pageSize: number;
  financeUnavailable: boolean;
  onViewReceipt: (transaction: FinanceTransaction) => void;
  onInitiateCorrect: (transaction: FinanceTransaction) => void;
  onInitiateVoid: (transaction: FinanceTransaction) => void;
}

function formatNaira(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "₦—";
  const num =
    typeof value === "number" ? BigInt(Math.round(value)) : BigInt(value);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

function financePageHref(page: number) {
  return `/finances?${new URLSearchParams({ page: String(page) }).toString()}`;
}

export function ClubTransactionLedger({
  transactions,
  receiptsByTransaction,
  isOfficer,
  canCorrect,
  page,
  pageCount,
  transactionCount,
  pageSize,
  financeUnavailable,
  onViewReceipt,
  onInitiateCorrect,
  onInitiateVoid,
}: ClubTransactionLedgerProps) {
  const [filterType, setFilterType] = useState<
    "all" | "income" | "expense" | "voided"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      if (filterType === "income" && txn.kind !== "income") return false;
      if (filterType === "expense" && txn.kind !== "expense") return false;
      if (filterType === "voided" && !txn.voided_at) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const desc = (txn.description ?? "").toLowerCase();
        const note = (txn.source_note ?? "").toLowerCase();
        const payee = (txn.payer_payee ?? "").toLowerCase();
        const cat = (txn.category_name_snapshot ?? "").toLowerCase();
        return (
          desc.includes(q) ||
          note.includes(q) ||
          payee.includes(q) ||
          cat.includes(q)
        );
      }
      return true;
    });
  }, [transactions, filterType, searchQuery]);

  return (
    <section
      aria-labelledby="ledger-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs"
    >
      {/* Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h2
                className="text-base sm:text-lg font-extrabold text-[#3D291F]"
                id="ledger-heading"
              >
                Institutional Financial Ledger
              </h2>
              <p className="text-xs text-[#54433A] font-medium">
                Consolidated club disbursements and non-dues income inflows
              </p>
            </div>
          </div>

          <div className="text-xs text-[#7A685D] font-medium self-start sm:self-center">
            Showing page{" "}
            <strong className="text-[#3D291F] font-bold">{page + 1}</strong> of{" "}
            <strong className="text-[#3D291F] font-bold">{pageCount}</strong> (
            {transactionCount} total records)
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E5DDD3] text-xs shadow-2xs self-start">
            <button
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilterType("all")}
              type="button"
            >
              All Records
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                filterType === "income"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilterType("income")}
              type="button"
            >
              Inflows
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                filterType === "expense"
                  ? "bg-[#BA3C2A] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilterType("expense")}
              type="button"
            >
              Disbursements
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                filterType === "voided"
                  ? "bg-[#7A685D] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilterType("voided")}
              type="button"
            >
              Voided History
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-full h-9 pl-9 pr-3 bg-white border border-[#E5DDD3] rounded-xl text-xs text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ledger records..."
              type="search"
              value={searchQuery}
            />
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      {financeUnavailable ? (
        <DataUnavailableCard
          className="my-4"
          description="The ledger or balance could not be verified. No transaction records or entry forms are available."
          title="Ledger Data Unavailable"
        />
      ) : filteredTransactions.length === 0 ? (
        <EmptyStateCard
          className="my-4"
          description={
            searchQuery
              ? "No transactions match your current search query. Try clearing the filter."
              : "No club transactions recorded for the selected period."
          }
          icon={FileText}
          title="No Transactions Found"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5DDD3] bg-[#FAF6F0]/60 text-[11px] font-bold text-[#54433A] uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Date</th>
                <th className="py-3 px-4">Transaction / Justification</th>
                <th className="py-3 px-4">Cost Center</th>
                <th className="py-3 px-4">Payer / Payee</th>
                <th className="py-3 px-4 text-right">Amount (₦)</th>
                <th className="py-3 px-4 text-center">Receipts</th>
                {canCorrect && (
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DDD3]">
              {filteredTransactions.map((transaction) => {
                const linkedReceipts =
                  receiptsByTransaction.get(transaction.id) ?? [];
                const isVoided = Boolean(transaction.voided_at);

                return (
                  <tr
                    className={`hover:bg-[#FAF6F0]/40 transition-colors ${
                      isVoided ? "bg-[#FAF6F0]/40 opacity-75" : ""
                    }`}
                    key={transaction.id}
                  >
                    {/* Date */}
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap text-[#54433A]">
                      <div className="font-semibold text-[#3D291F]">
                        {formatDate(transaction.transaction_date)}
                      </div>
                      <div className="text-[10px] text-[#7A685D] font-mono">
                        {formatTimestamp(transaction.created_at)}
                      </div>
                    </td>

                    {/* Title & Description */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            isVoided
                              ? "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3] line-through"
                              : transaction.kind === "income"
                                ? "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20"
                                : "bg-[#BA3C2A]/10 text-[#BA3C2A] border border-[#BA3C2A]/20"
                          }`}
                        >
                          {isVoided
                            ? "Voided"
                            : transaction.kind === "income"
                              ? "Non-Dues Income"
                              : "Disbursement"}
                        </span>
                        {isVoided && (
                          <span className="text-[10px] text-[#BA3C2A] font-semibold italic truncate">
                            Reason: {transaction.void_reason}
                          </span>
                        )}
                      </div>
                      <div
                        className={`font-bold text-[#3D291F] leading-snug ${
                          isVoided ? "line-through text-[#7A685D]" : ""
                        }`}
                      >
                        {transaction.kind === "income"
                          ? transaction.source_note
                          : transaction.description}
                      </div>
                    </td>

                    {/* Cost Center / Category */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {transaction.category_name_snapshot ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FAF6F0] text-[#3D291F] border border-[#E5DDD3]">
                          <Tag className="w-3 h-3 text-[#7A685D]" />
                          <span>{transaction.category_name_snapshot}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#7A685D] italic">
                          {transaction.kind === "income"
                            ? "Treasury Inflow"
                            : "General"}
                        </span>
                      )}
                    </td>

                    {/* Payer / Payee */}
                    <td className="py-3.5 px-4 text-[#54433A] whitespace-nowrap">
                      {transaction.payer_payee ? (
                        <span className="font-semibold text-[#3D291F]">
                          {transaction.payer_payee}
                        </span>
                      ) : (
                        <span className="text-[#B8ACA0] italic">—</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-mono font-bold text-sm tabular-nums ${
                          isVoided
                            ? "line-through text-[#7A685D]"
                            : transaction.kind === "income"
                              ? "text-[#174C37]"
                              : "text-[#BA3C2A]"
                        }`}
                      >
                        {transaction.kind === "income" ? "+" : "-"}
                        {formatNaira(transaction.amount_ngn)}
                      </span>
                    </td>

                    {/* Receipts Button */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          linkedReceipts.length > 0
                            ? "bg-[#174C37]/10 text-[#174C37] hover:bg-[#174C37] hover:text-white"
                            : isOfficer && !isVoided
                              ? "bg-[#FAF6F0] text-[#7A685D] hover:bg-white hover:text-[#3D291F] border border-[#E5DDD3]"
                              : "text-[#B8ACA0] cursor-default"
                        }`}
                        onClick={() => onViewReceipt(transaction)}
                        type="button"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>
                          {linkedReceipts.length > 0
                            ? `${linkedReceipts.length} ${linkedReceipts.length === 1 ? "Receipt" : "Receipts"}`
                            : isOfficer && !isVoided
                              ? "Attach"
                              : "None"}
                        </span>
                      </button>
                    </td>

                    {/* Officer Actions */}
                    {canCorrect && (
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        {!isVoided ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              aria-label={`Correct transaction ${transaction.id}`}
                              className="p-1.5 text-[#54433A] hover:text-[#174C37] hover:bg-[#FAF6F0] rounded-lg transition-colors cursor-pointer"
                              onClick={() => onInitiateCorrect(transaction)}
                              title="Correct Record"
                              type="button"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              aria-label={`Void transaction ${transaction.id}`}
                              className="p-1.5 text-[#BA3C2A] hover:bg-[#FDF2F2] rounded-lg transition-colors cursor-pointer"
                              onClick={() => onInitiateVoid(transaction)}
                              title="Void Record"
                              type="button"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#7A685D] italic">
                            Retained
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      {!financeUnavailable && transactionCount > pageSize && (
        <div className="p-4 border-t border-[#E5DDD3] bg-[#FAF6F0]/60 flex items-center justify-between text-xs font-semibold text-[#54433A]">
          {page > 0 ? (
            <Link
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#3D291F] hover:bg-[#FAF6F0] shadow-2xs transition-colors"
              href={financePageHref(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Newer records</span>
            </Link>
          ) : (
            <div />
          )}

          <span className="text-[11px] font-mono font-medium">
            Page {page + 1} of {pageCount}
          </span>

          {(page + 1) * pageSize < transactionCount ? (
            <Link
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#3D291F] hover:bg-[#FAF6F0] shadow-2xs transition-colors"
              href={financePageHref(page + 1)}
            >
              <span>Older records</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      )}
    </section>
  );
}
