"use client";

import {
  Award,
  Beer,
  HeartHandshake,
  Plus,
  Search,
  Store,
  Tags,
  Ticket,
  TrendingUp,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardRevenueStream,
  RevenueCategory,
} from "./dashboard-types";

interface TabRevenueProps {
  streams: DashboardRevenueStream[];
  canRecord: boolean;
  onRecordRevenue: (category?: RevenueCategory) => void;
  canManageCategories?: boolean;
  onManageCategories?: () => void;
}

export function TabRevenue({
  streams,
  canRecord,
  onRecordRevenue,
  canManageCategories,
  onManageCategories,
}: TabRevenueProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  const filteredStreams = streams.filter((stream) => {
    if (selectedCategory !== "all" && stream.id !== selectedCategory)
      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = stream.name.toLowerCase().includes(q);
      const matchDesc = stream.description.toLowerCase().includes(q);
      const matchItem = stream.breakdown.some((b) =>
        b.source.toLowerCase().includes(q),
      );
      return matchName || matchDesc || matchItem;
    }
    return true;
  });

  return (
    <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#174C37]" />
            <h3 className="text-lg font-bold text-[#3D291F]">
              Revenue Management & Inflows
            </h3>
          </div>
          <p className="text-xs text-[#7A685D] mt-1">
            Reconciled receipts across 5 club revenue streams: Ticketing,
            Concessions, Corporate Sponsors, Vendor Stalls, and Patron
            Donations.
          </p>
        </div>

        {/* Aggregate Inflow Stats */}
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
            <span className="font-bold text-[#D6A23A] text-base tabular-nums font-mono">
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
              onClick={() => onRecordRevenue()}
              type="button"
            >
              <Plus className="w-4 h-4 text-[#D6A23A]" />
              <span>Record Revenue</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Segmented Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-x-auto">
          <button
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
              selectedCategory === "all"
                ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
            }`}
            onClick={() => setSelectedCategory("all")}
            type="button"
          >
            All Streams ({streams.length})
          </button>
          {streams.map((s) => (
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
                selectedCategory === s.id
                  ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              key={s.id}
              onClick={() => setSelectedCategory(s.id)}
              type="button"
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search revenue item or sponsor..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* Streams Cards Grid */}
      {filteredStreams.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D]">
          No revenue streams or inflows recorded yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredStreams.map((stream) => {
            const Icon = streamIcons[stream.id] || TrendingUp;
            const percentage = Math.min(
              100,
              (stream.actual / (stream.target || 1)) * 100,
            );
            const variance = stream.actual - stream.target;

            return (
              <div
                className="bg-white rounded-2xl border border-[#E5DDD3] p-5 hover:border-[#174C37]/50 transition-colors flex flex-col justify-between"
                key={stream.id}
              >
                <div>
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#FAF6F0] flex items-center justify-center text-[#174C37] shrink-0 border border-[#E5DDD3]">
                        <Icon className="w-5 h-5 text-[#174C37]" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-[#3D291F]">
                          {stream.name}
                        </h4>
                        <p className="text-xs text-[#7A685D] mt-0.5">
                          {stream.description}
                        </p>
                      </div>
                    </div>

                    {canRecord && (
                      <button
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-[#174C37] bg-[#FAF6F0] border border-[#174C37]/30 rounded-lg hover:bg-[#174C37] hover:text-white transition-colors shrink-0 flex items-center gap-1 min-h-[36px]"
                        onClick={() => onRecordRevenue(stream.id)}
                        type="button"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Record</span>
                      </button>
                    )}
                  </div>

                  {/* Numbers Row */}
                  <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-center">
                    <div>
                      <span className="text-[11px] text-[#7A685D] block">
                        Target
                      </span>
                      <span className="font-semibold text-xs text-[#5C4638] tabular-nums font-mono">
                        {formatNaira(stream.target)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#7A685D] block">
                        Realized
                      </span>
                      <span className="font-bold text-xs text-[#174C37] tabular-nums font-mono">
                        {formatNaira(stream.actual)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#7A685D] block">
                        Variance
                      </span>
                      <span
                        className={`font-semibold text-xs tabular-nums font-mono ${
                          variance >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                        }`}
                      >
                        {variance >= 0
                          ? `+${formatNaira(variance)}`
                          : `-${formatNaira(Math.abs(variance))}`}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar (CSP Compliant with percentWidthClass) */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-[#7A685D]">
                      <span>Target realization</span>
                      <span className="font-semibold text-[#174C37] tabular-nums">
                        {formatPercent(
                          (stream.actual / (stream.target || 1)) * 100,
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-[#E5DDD3]/60 rounded-full h-2 overflow-hidden">
                      <div
                        className={`bg-[#174C37] h-full transition-all duration-500 ${percentWidthClass(percentage)}`}
                      />
                    </div>
                  </div>

                  {/* Itemized Line Items List */}
                  <div className="mt-4 pt-3 border-t border-[#E5DDD3]">
                    <span className="text-[11px] font-semibold text-[#7A685D] uppercase tracking-wide block mb-2">
                      Itemized Inflow Receipts ({stream.breakdown.length})
                    </span>

                    <div className="space-y-2">
                      {stream.breakdown.map((item) => (
                        <div
                          className="p-2.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]/70 text-xs flex items-center justify-between"
                          key={`${stream.id}-${item.source}`}
                        >
                          <div>
                            <span className="font-semibold text-[#3D291F] block">
                              {item.source}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                                item.status === "received"
                                  ? "bg-[#174C37]/10 text-[#174C37]"
                                  : item.status === "projected"
                                    ? "bg-[#D6A23A]/15 text-[#3D291F]"
                                    : "bg-[#BA3C2A]/10 text-[#BA3C2A]"
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <span className="font-bold text-[#174C37] tabular-nums font-mono">
                            {formatNaira(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
