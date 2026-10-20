"use client";

import { Check, ChevronDown, Ticket } from "lucide-react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { percentWidthClass } from "@/lib/percent-width-class";
import { formatNaira, formatPercent } from "./dashboard-mock-data";
import type { DashboardTicketTier } from "./dashboard-types";

interface TabTicketsProps {
  tiers: DashboardTicketTier[];
  onSimulateTicketSale?: (tierId: string) => void;
  onOpenRecordTicketModal?: (tierId?: string) => void;
}

export function TabTickets({
  tiers,
  onSimulateTicketSale,
  onOpenRecordTicketModal,
}: TabTicketsProps) {
  const [expandedTier, setExpandedTier] = useState<string | null>("early_bird");

  const totalSold = tiers.reduce((acc, t) => acc + t.sold, 0);
  const totalCapacity = tiers.reduce((acc, t) => acc + t.capacity, 0);
  const totalGross = tiers.reduce((acc, t) => acc + t.sold * t.price, 0);

  return (
    <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
        <div>
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-[#174C37]" />
            <h3 className="text-lg font-bold text-[#3D291F]">
              Ticket Inventory & Tier Revenue Breakdown
            </h3>
          </div>
          <p className="text-xs text-[#7A685D] mt-1">
            Reconciled ticketing tallies across all 4 authorized admission
            tiers.
          </p>
        </div>

        {/* Aggregate Ticket Sales Summary & Action */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
            <span className="text-[#7A685D] block text-[11px]">
              Gross Ticketing Inflow
            </span>
            <span className="font-bold text-[#174C37] text-sm tabular-nums font-mono">
              {formatNaira(totalGross)}
            </span>
          </div>

          <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
            <span className="text-[#7A685D] block text-[11px]">
              Total Passes Issued
            </span>
            <span className="font-bold text-[#3D291F] text-sm tabular-nums font-mono">
              {totalSold} / {totalCapacity}
            </span>
          </div>

          {onOpenRecordTicketModal && (
            <button
              className="px-4 py-2.5 bg-[#174C37] text-white rounded-xl font-semibold hover:bg-[#103D2B] transition-colors flex items-center gap-1.5 min-h-[44px] shadow-xs"
              onClick={() => onOpenRecordTicketModal()}
              type="button"
            >
              <Ticket className="w-4 h-4 text-[#D6A23A]" />
              <span>Record Ticket Sale</span>
            </button>
          )}
        </div>
      </div>

      {/* Tiers Grid */}
      {tiers.length === 0 ? (
        <EmptyStateCard
          className="my-4"
          description="No ticket tiers have been created for this event. Configure admission tiers to begin issuing passes."
          icon={Ticket}
          title="No Ticket Tiers Configured"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tier) => {
            const revenue = tier.sold * tier.price;
            const percentageFilled = Math.min(
              100,
              (tier.sold / (tier.capacity || 1)) * 100,
            );
            const remaining = tier.capacity - tier.sold;
            const isExpanded = expandedTier === tier.id;

            const statusBadge =
              tier.status === "sold_out" || tier.sold >= tier.capacity
                ? {
                    label: "Sold Out",
                    bg: "bg-[#BA3C2A]/10 text-[#BA3C2A] border-[#BA3C2A]/20",
                  }
                : tier.status === "limited" || remaining <= 10
                  ? {
                      label: `${remaining} Left`,
                      bg: "bg-[#D6A23A]/15 text-[#3D291F] border-[#D6A23A]/40",
                    }
                  : {
                      label: "Active",
                      bg: "bg-[#174C37]/10 text-[#174C37] border-[#174C37]/20",
                    };

            return (
              <div
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all duration-200 ${
                  tier.id === "vip"
                    ? "border-[#D6A23A] bg-[#FAF6F0]/60"
                    : "border-[#E5DDD3] bg-white hover:border-[#174C37]/40"
                }`}
                key={tier.id}
              >
                <div>
                  {/* Header with price and status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-[#7A685D] uppercase tracking-wider block">
                        Tier
                      </span>
                      <h4 className="text-base font-bold text-[#3D291F]">
                        {tier.name}
                      </h4>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${statusBadge.bg}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Unit Price Callout */}
                  <div className="mt-3 bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3]">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-[#7A685D]">Unit Price</span>
                      <span className="text-lg font-bold text-[#174C37] tabular-nums font-mono">
                        {formatNaira(tier.price)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-[#E5DDD3]/60 text-xs">
                      <span className="text-[#7A685D]">Gross Inflow</span>
                      <span className="font-semibold text-[#3D291F] tabular-nums font-mono">
                        {formatNaira(revenue)}
                      </span>
                    </div>
                  </div>

                  {/* Capacity Progress (CSP Compliant with percentWidthClass) */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#7A685D]">Sold / Capacity</span>
                      <span className="font-semibold text-[#3D291F] tabular-nums font-mono">
                        {tier.sold} / {tier.capacity} (
                        {formatPercent(percentageFilled)})
                      </span>
                    </div>

                    <div className="w-full bg-[#E5DDD3]/50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          tier.status === "sold_out" ||
                          tier.sold >= tier.capacity
                            ? "bg-[#174C37]"
                            : tier.id === "vip"
                              ? "bg-[#D6A23A]"
                              : "bg-[#174C37]"
                        } ${percentWidthClass(percentageFilled)}`}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#5C4638] mt-3 leading-relaxed">
                    {tier.description}
                  </p>
                </div>

                {/* Benefits Disclosure Accordion */}
                <div className="mt-4 pt-3 border-t border-[#E5DDD3]">
                  <button
                    id={`btn-tier-accordion-${tier.id}`}
                    className="btn-tier-accordion w-full flex items-center justify-between text-xs font-medium text-[#174C37] bg-transparent border-0 hover:text-[#0C3325] focus:outline-hidden py-1 cursor-pointer"
                    onClick={() => setExpandedTier(isExpanded ? null : tier.id)}
                    type="button"
                  >
                    <span>Admission Privileges ({tier.benefits.length})</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <ul className="mt-2 space-y-1.5 text-xs text-[#5C4638] bg-[#FAF6F0] p-2.5 rounded-xl border border-[#E5DDD3]">
                      {tier.benefits.map((b) => (
                        <li
                          className="flex items-start gap-1.5 leading-snug"
                          key={`${tier.id}-${b}`}
                        >
                          <Check className="w-3.5 h-3.5 text-[#174C37] shrink-0 mt-0.5" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Action Buttons for this Tier */}
                  {tier.sold < tier.capacity && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {onOpenRecordTicketModal && (
                        <button
                          className="w-full px-3 py-2 text-xs font-semibold text-white bg-[#174C37] rounded-xl hover:bg-[#103D2B] transition-colors focus:outline-hidden focus:ring-2 focus:ring-[#D6A23A] min-h-[38px] flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                          onClick={() => onOpenRecordTicketModal(tier.id)}
                          type="button"
                        >
                          <Ticket className="w-3.5 h-3.5 text-[#D6A23A]" />
                          <span>Record {tier.name} Sale</span>
                        </button>
                      )}

                      {onSimulateTicketSale && (
                        <button
                          className="w-full px-3 py-1.5 text-xs font-medium text-[#174C37] bg-white border border-[#174C37]/40 rounded-xl hover:bg-[#FAF6F0] transition-colors focus:outline-hidden min-h-[34px] cursor-pointer"
                          onClick={() => onSimulateTicketSale(tier.id)}
                          type="button"
                        >
                          Quick Test (+1 Sale)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
