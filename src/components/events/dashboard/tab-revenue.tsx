"use client";

import {
  Award,
  Beer,
  HeartHandshake,
  Plus,
  Store,
  Tags,
  Ticket,
  TrendingUp,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardRevenueStream,
  DashboardTransaction,
  RevenueCategory,
} from "./dashboard-types";
import { EventDomainLedger } from "./event-domain-ledger";
import { VoucherInspectionDrawer } from "./voucher-inspection-drawer";

interface TabRevenueProps {
  streams: DashboardRevenueStream[];
  canRecord: boolean;
  onRecordRevenue: (category?: RevenueCategory) => void;
  canManageCategories?: boolean;
  onManageCategories?: () => void;
  revenueTransactions?: DashboardTransaction[];
  eventId?: string;
  currentUserId?: string;
  userRole?: string;
}

export function TabRevenue({
  streams,
  canRecord,
  onRecordRevenue,
  canManageCategories,
  onManageCategories,
  revenueTransactions = [],
  eventId = "",
  currentUserId,
  userRole,
}: TabRevenueProps) {
  const [selectedTxn, setSelectedTxn] = useState<DashboardTransaction | null>(
    null,
  );

  const streamIcons: Record<
    RevenueCategory,
    React.ComponentType<{ className?: string }>
  > = {
    ticket_sales: Ticket,
    bar_merch: Beer,
    sponsorships: Award,
    vendor_booths: Store,
    donations: HeartHandshake,
  };

  const totalActual = streams.reduce((acc, s) => acc + s.actual, 0);
  const totalPending = streams.reduce((acc, s) => acc + s.pending, 0);

  return (
    <div className="space-y-6">
      {/* 1. Master Consolidated Revenue Streams Matrix Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#174C37]" />
              <h3 className="text-lg font-bold text-[#3D291F]">
                <span className="hidden sm:inline">
                  Revenue Streams & Inflow Matrix
                </span>
                <span className="sm:hidden">Revenue Streams</span>
              </h3>
            </div>
            <p className="text-xs text-[#6B5D53] mt-1">
              <span className="hidden sm:inline">
                Reconciled receipts vs target projections across authorized club
                revenue channels.
              </span>
              <span className="sm:hidden">
                Target projections & revenue streams.
              </span>
            </p>
          </div>

          {/* Aggregate Inflow Stats & Single Record Button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
              <span className="text-[11px] text-[#7A685D] block">
                Gross Reconciled
              </span>
              <span className="font-bold text-[#174C37] text-base tabular-nums font-mono">
                {formatNaira(totalActual)}
              </span>
            </div>
            <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
              <span className="text-[11px] text-[#7A685D] block">
                Pending Receivables
              </span>
              <span className="font-bold text-[#8D5B0E] text-base tabular-nums font-mono">
                {formatNaira(totalPending)}
              </span>
            </div>

            {canManageCategories && onManageCategories && (
              <button
                className="px-3.5 py-2.5 bg-white text-[#174C37] border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 min-h-[44px] shadow-xs shrink-0 cursor-pointer"
                onClick={onManageCategories}
                type="button"
              >
                <Tags className="w-4 h-4 text-[#174C37]" />
                <span>Categories</span>
              </button>
            )}

            {canRecord && (
              <button
                className="px-4 py-2.5 bg-[#174C37] text-white rounded-xl font-semibold hover:bg-[#103D2B] transition-colors flex items-center gap-1.5 min-h-[44px] shadow-xs shrink-0 cursor-pointer"
                id="btn-record-revenue"
                onClick={() => onRecordRevenue()}
                type="button"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>Record Revenue</span>
              </button>
            )}
          </div>
        </div>

        {/* Revenue Streams Table Matrix */}
        {streams.length === 0 ? (
          <EmptyStateCard
            className="my-4"
            description="No revenue streams or planned inflows have been recorded for this event yet."
            icon={TrendingUp}
            title="No Revenue Streams Recorded"
            {...(canManageCategories && onManageCategories
              ? {
                  actionLabel: "Manage Revenue Streams",
                  onAction: onManageCategories,
                }
              : {})}
          />
        ) : (
          <>
            {/* Mobile Revenue Streams Cards (sm:hidden) */}
            <div className="sm:hidden space-y-3 p-3">
              {streams.map((stream) => {
                const Icon = streamIcons[stream.id] || TrendingUp;
                const percentage = Math.min(
                  100,
                  (stream.actual / (stream.target || 1)) * 100,
                );
                const isAchieved =
                  stream.actual >= stream.target && stream.target > 0;

                return (
                  <div
                    className="bg-white p-3.5 rounded-xl border border-[#E5DDD3] shadow-2xs space-y-2.5"
                    key={`mobile-stream-${stream.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-[#3D291F] text-sm block">
                            {stream.name}
                          </span>
                          <span className="text-[11px] text-[#6B5D53] line-clamp-1">
                            {stream.description}
                          </span>
                        </div>
                      </div>
                      {isAchieved ? (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0] shrink-0">
                          Target Reached
                        </span>
                      ) : stream.actual > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FFF4E5] text-[#B27D16] border border-[#F8D8A7] shrink-0">
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#FAF6F0] text-[#6B5D53] border border-[#E5DDD3] shrink-0">
                          Pending
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div>
                        <span className="text-[#6B5D53] block text-[11px]">
                          Target:
                        </span>
                        <span className="font-mono font-semibold text-[#3D291F]">
                          {formatNaira(stream.target)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#6B5D53] block text-[11px]">
                          Reconciled Inflow:
                        </span>
                        <span className="font-mono font-bold text-[#174C37]">
                          {formatNaira(stream.actual)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex items-baseline justify-between font-mono text-xs">
                        <span className="text-[11px] text-[#6B5D53]">
                          Fulfillment:
                        </span>
                        <span className="font-semibold text-[#174C37]">
                          {formatPercent(percentage)}
                        </span>
                      </div>
                      <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isAchieved ? "bg-[#174C37]" : "bg-[#D6A23A]"
                          } ${percentWidthClass(percentage)}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Revenue Streams Table (hidden sm:block) */}
            <div className="hidden sm:block">
              <TableScroll label="Revenue streams by source">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5DDD3] bg-[#F7F3EC] text-[#7A685D] uppercase tracking-wider font-semibold text-[11px]">
                      <th className="py-2.5 px-3.5">Stream Name</th>
                      <th className="py-2.5 px-3.5">Target</th>
                      <th className="py-2.5 px-3.5">Reconciled Inflow</th>
                      <th className="py-2.5 px-3.5">Pending Receivables</th>
                      <th className="py-2.5 px-3.5">Fulfillment %</th>
                      <th className="py-2.5 px-3.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE5DC]">
                    {streams.map((stream) => {
                      const Icon = streamIcons[stream.id] || TrendingUp;
                      const percentage = Math.min(
                        100,
                        (stream.actual / (stream.target || 1)) * 100,
                      );
                      const isAchieved =
                        stream.actual >= stream.target && stream.target > 0;

                      return (
                        <tr
                          key={stream.id}
                          className="hover:bg-[#FAF6F0]/50 transition-colors"
                        >
                          {/* Name & Icon */}
                          <td className="py-3 px-3.5 max-w-[220px]">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="font-bold text-[#3D291F] block text-sm">
                                  {stream.name}
                                </span>
                                <span className="text-[11px] text-[#7A685D] line-clamp-1">
                                  {stream.description}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Target */}
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[#5C4638]">
                            {formatNaira(stream.target)}
                          </td>

                          {/* Reconciled Inflow */}
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-sm text-[#174C37]">
                            {formatNaira(stream.actual)}
                          </td>

                          {/* Pending Receivables */}
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[#8D5B0E]">
                            {formatNaira(stream.pending)}
                          </td>

                          {/* Fulfillment Progress */}
                          <td className="py-3 px-3.5 whitespace-nowrap min-w-[140px]">
                            <div className="flex items-baseline justify-between font-mono text-xs">
                              <span className="font-semibold text-[#3D291F]">
                                {formatPercent(percentage)}
                              </span>
                            </div>
                            <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 mt-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isAchieved ? "bg-[#174C37]" : "bg-[#D6A23A]"
                                } ${percentWidthClass(percentage)}`}
                              />
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            {isAchieved ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]">
                                Target Reached
                              </span>
                            ) : stream.actual > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FFF4E5] text-[#B27D16] border border-[#F8D8A7]">
                                In Progress
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]">
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </>
        )}
      </section>

      {/* 2. Embedded Revenue Inflow Ledger */}
      <EventDomainLedger
        currentUserId={currentUserId}
        domain="revenue"
        onInspect={(txn) => setSelectedTxn(txn)}
        title="Revenue Inflows Ledger"
        transactions={revenueTransactions}
        userRole={userRole}
      />

      {/* 3. Split-Screen Voucher Inspection Drawer */}
      <VoucherInspectionDrawer
        currentUserId={currentUserId}
        eventId={eventId}
        isOpen={Boolean(selectedTxn)}
        onClose={() => setSelectedTxn(null)}
        transaction={selectedTxn}
        userRole={userRole}
      />
    </div>
  );
}
