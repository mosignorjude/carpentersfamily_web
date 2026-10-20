"use client";

import { Download, FileText, Paperclip, Search, Shield } from "lucide-react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { downloadLedgerCSV, formatNaira } from "./dashboard-mock-data";
import type { ActivityLogItem, DashboardTransaction } from "./dashboard-types";

interface TabAuditLogProps {
  transactions: DashboardTransaction[];
  activityLogs: ActivityLogItem[];
  userRole: string;
  onViewTransaction: (txn: DashboardTransaction) => void;
  onInitiateVoid: (txn: DashboardTransaction) => void;
}

export function TabAuditLog({
  transactions,
  activityLogs,
  userRole,
  onViewTransaction,
  onInitiateVoid,
}: TabAuditLogProps) {
  const [filterType, setFilterType] = useState<
    "all" | "revenue" | "expense" | "voided"
  >("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const isAdmin = userRole === "admin" || userRole === "backup_admin";

  const categories = Array.from(
    new Set(transactions.map((t) => t.categoryLabel)),
  );

  const filteredTransactions = transactions.filter((txn) => {
    if (
      filterType === "revenue" &&
      (txn.type !== "revenue" || txn.status === "voided")
    )
      return false;
    if (
      filterType === "expense" &&
      (txn.type !== "expense" || txn.status === "voided")
    )
      return false;
    if (filterType === "voided" && txn.status !== "voided") return false;

    if (filterCategory !== "all" && txn.categoryLabel !== filterCategory)
      return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = txn.description.toLowerCase().includes(q);
      const matchParty = txn.payerPayee.toLowerCase().includes(q);
      const matchRef = txn.paymentRef.toLowerCase().includes(q);
      const matchId = txn.id.toLowerCase().includes(q);
      return matchDesc || matchParty || matchRef || matchId;
    }

    return true;
  });

  return (
    <div className="space-y-8">
      {/* Section 1: Transaction Ledger Journal */}
      <section
        aria-labelledby="ledger-heading"
        className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#174C37]" />
              <h3
                className="text-lg font-bold text-[#3D291F]"
                id="ledger-heading"
              >
                Financial Ledger & Transaction Journal
              </h3>
            </div>
            <p className="text-xs text-[#7A685D] mt-1">
              Complete verifiable record of all receipts, disbursements,
              authorizations, and retained audit adjustments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#174C37] bg-[#FAF6F0] border border-[#174C37]/30 rounded-xl hover:bg-[#174C37] hover:text-white transition-colors min-h-[44px] cursor-pointer"
              onClick={() => downloadLedgerCSV(filteredTransactions)}
              title="Download CSV export of currently visible ledger rows"
              type="button"
            >
              <Download className="w-4 h-4" />
              <span>Download Ledger CSV</span>
            </button>
          </div>
        </div>

        {/* Role Notice & Filter Controls */}
        <div className="space-y-3">
          <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-xs text-[#5C4638] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#174C37]">
                Club Governance Rule:
              </span>
              <span>
                Executive and Admin can record entries; only Admin can void
                entries. Permanent deletion is prohibited under security policy.
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#7A685D] shrink-0">
              Current: {userRole.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Segmented Filter Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-x-auto">
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
                  filterType === "all"
                    ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                    : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
                }`}
                onClick={() => setFilterType("all")}
                type="button"
              >
                All Records ({transactions.length})
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
                  filterType === "revenue"
                    ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                    : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
                }`}
                onClick={() => setFilterType("revenue")}
                type="button"
              >
                Inflows / Revenue
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
                  filterType === "expense"
                    ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                    : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
                }`}
                onClick={() => setFilterType("expense")}
                type="button"
              >
                Outflows / Expenses
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
                  filterType === "voided"
                    ? "bg-[#BA3C2A] text-white shadow-xs font-semibold border-0"
                    : "bg-transparent border-0 text-[#5C4638] hover:text-[#BA3C2A]"
                }`}
                onClick={() => setFilterType("voided")}
                type="button"
              >
                Retained / Voided
              </button>
            </div>

            {/* Category Dropdown and Search */}
            <div className="flex items-center gap-2">
              <select
                className="h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                onChange={(e) => setFilterCategory(e.target.value)}
                value={filterCategory}
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="relative min-w-[200px] flex-1">
                <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reference, payee..."
                  type="text"
                  value={searchQuery}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Table */}
        {transactions.length === 0 ? (
          <EmptyStateCard
            className="my-4"
            description="No historical audits recorded for this event yet."
            icon={FileText}
            title="No Historical Audits"
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E5DDD3]">
            <table
              aria-label="Transaction journal"
              className="w-full text-xs text-left"
            >
              <thead className="bg-[#FAF6F0] text-[#7A685D] uppercase font-semibold border-b border-[#E5DDD3]">
                <tr>
                  <th className="py-3 px-3.5">Ref / Date</th>
                  <th className="py-3 px-3.5">Description & Counterparty</th>
                  <th className="py-3 px-3.5">Category</th>
                  <th className="py-3 px-3.5 text-right">Amount (NGN)</th>
                  <th className="py-3 px-3.5">Authorized By</th>
                  <th className="py-3 px-3.5 text-center">Receipt</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD3]">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 text-center text-sm text-[#7A685D]"
                      colSpan={7}
                    >
                      No transactions match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((txn) => {
                    const isVoided = txn.status === "voided";
                    const isRevenue = txn.type === "revenue";

                    return (
                      <tr
                        className={`hover:bg-[#FAF6F0]/80 transition-colors ${
                          isVoided ? "bg-[#FAF6F0]/50 text-[#7A685D]" : ""
                        }`}
                        key={txn.id}
                      >
                        {/* Ref & Date */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap">
                          <span className="font-mono font-bold text-[#3D291F] block">
                            {txn.id}
                          </span>
                          <span className="text-[11px] text-[#7A685D]">
                            {txn.date}
                          </span>
                        </td>

                        {/* Description & Counterparty */}
                        <td className="py-3.5 px-3.5 max-w-xs">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-semibold text-xs leading-snug ${
                                isVoided
                                  ? "line-through text-[#7A685D]"
                                  : "text-[#3D291F]"
                              }`}
                            >
                              {txn.description}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#7A685D] mt-0.5 truncate">
                            Party:{" "}
                            <strong className="text-[#5C4638]">
                              {txn.payerPayee}
                            </strong>{" "}
                            · Ref:{" "}
                            <span className="font-mono">{txn.paymentRef}</span>
                          </div>

                          {/* Visible Retained History wording if voided */}
                          {isVoided && txn.voidReason && (
                            <div className="mt-1.5 p-2 rounded-md bg-[#BA3C2A]/10 border border-[#BA3C2A]/20 text-[11px] text-[#BA3C2A] space-y-0.5">
                              <p className="font-semibold">{txn.voidReason}</p>
                              <p className="text-[10px] text-[#7A685D]">
                                Voided by {txn.voidedBy} · {txn.voidedAt}
                              </p>
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap">
                          <span className="font-medium text-[#3D291F] text-xs block">
                            {txn.categoryLabel}
                          </span>
                          <span className="text-[11px] text-[#7A685D]">
                            {txn.paymentMethod}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                          <span
                            className={`text-sm font-bold font-mono tabular-nums ${
                              isVoided
                                ? "line-through text-[#7A685D]"
                                : isRevenue
                                  ? "text-[#174C37]"
                                  : "text-[#BA3C2A]"
                            }`}
                          >
                            {isVoided ? "" : isRevenue ? "+" : "-"}
                            {formatNaira(txn.amount)}
                          </span>
                          {isVoided && (
                            <span className="block text-[10px] uppercase font-bold text-[#BA3C2A]">
                              Voided (Preserved)
                            </span>
                          )}
                        </td>

                        {/* Authorization */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap text-xs">
                          <span className="text-[#3D291F] font-medium block">
                            {txn.authorizedBy}
                          </span>
                          <span className="text-[10px] text-[#7A685D]">
                            {txn.authorizerRole}
                          </span>
                        </td>

                        {/* Receipt Indicator */}
                        <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                          {txn.receiptFileName ? (
                            <button
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#174C37] bg-[#FAF6F0] rounded-md hover:bg-[#174C37] hover:text-white transition-colors cursor-pointer"
                              onClick={() => onViewTransaction(txn)}
                              title={`View receipt voucher: ${txn.receiptFileName}`}
                              type="button"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                          ) : (
                            <span className="text-[#7A685D] text-[11px]">
                              N/A
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-3.5 text-right whitespace-nowrap space-x-1">
                          <button
                            className="px-2.5 py-1.5 text-[11px] font-medium text-[#3D291F] bg-white border border-[#E5DDD3] rounded-md hover:bg-[#FAF6F0] transition-colors cursor-pointer"
                            onClick={() => onViewTransaction(txn)}
                            title="View audit voucher"
                            type="button"
                          >
                            Inspect
                          </button>

                          {!isVoided && isAdmin && (
                            <button
                              className="px-2.5 py-1.5 text-[11px] font-medium text-[#BA3C2A] bg-white border border-[#BA3C2A]/30 rounded-md hover:bg-[#BA3C2A] hover:text-white transition-colors cursor-pointer"
                              onClick={() => onInitiateVoid(txn)}
                              title="Void record"
                              type="button"
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2: Chronological System Activity Audit Trail */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#D6A23A]" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#3D291F]">
                Chronological Officer Activity Audit Log
              </h4>
              <p className="text-xs text-[#7A685D]">
                Immutable system audit trail verifying all officer operations.
              </p>
            </div>
          </div>

          <span className="text-xs font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-3 py-1 rounded-xl border border-[#E5DDD3]">
            {activityLogs.length} Logged Audit Events
          </span>
        </div>

        {activityLogs.length === 0 ? (
          <p className="text-xs text-[#7A685D] py-6 text-center">
            No officer audit events logged for this event yet.
          </p>
        ) : (
          <div className="divide-y divide-[#E5DDD3]">
            {activityLogs.map((log) => (
              <div
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                key={log.id}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#3D291F]">
                      {log.action}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-[#174C37] bg-[#174C37]/10 px-2 py-0.5 rounded-full">
                      {log.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#5C4638]">{log.details}</p>
                  <span className="text-[11px] text-[#7A685D]">
                    Authorized by: <strong>{log.user}</strong> ({log.userRole})
                  </span>
                </div>

                <span className="font-mono text-[11px] text-[#7A685D] shrink-0 self-end sm:self-center">
                  {log.timestamp}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
