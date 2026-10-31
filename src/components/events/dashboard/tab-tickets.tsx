"use client";

import { ChevronDown, Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardTicketTier,
  DashboardTransaction,
} from "./dashboard-types";
import { EventDomainLedger } from "./event-domain-ledger";
import { VoucherInspectionDrawer } from "./voucher-inspection-drawer";

interface TabTicketsProps {
  tiers: DashboardTicketTier[];
  canManage?: boolean;
  onSimulateTicketSale?: (tierId: string) => void;
  onOpenRecordTicketModal?: (tierId?: string) => void;
  onOpenCreateTierModal?: () => void;
  onOpenEditTierModal?: (tier: DashboardTicketTier) => void;
  onOpenRetireTierModal?: (tier: DashboardTicketTier) => void;
  ticketSalesTransactions?: DashboardTransaction[];
  eventId?: string;
  currentUserId?: string;
  userRole?: string;
}

export function TabTickets({
  tiers,
  canManage = false,
  onOpenRecordTicketModal,
  onOpenCreateTierModal,
  onOpenEditTierModal,
  onOpenRetireTierModal,
  ticketSalesTransactions = [],
  eventId = "",
  currentUserId,
  userRole,
}: TabTicketsProps) {
  const [selectedTxn, setSelectedTxn] = useState<DashboardTransaction | null>(
    null,
  );
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  const totalSold = tiers.reduce((acc, t) => acc + t.sold, 0);
  const totalCapacity = tiers.reduce((acc, t) => acc + t.capacity, 0);
  const totalGross = tiers.reduce((acc, t) => acc + t.sold * t.price, 0);

  const tierBgClasses = [
    "bg-[#D6A23A]", // Amber
    "bg-[#174C37]", // Forest Green
    "bg-[#5C7C6D]", // Sage
    "bg-[#3D291F]", // Deep Espresso
    "bg-[#BA3C2A]", // Terracotta
  ];

  return (
    <div className="space-y-6">
      {/* 1. Master Consolidated Admission Tiers & Inventory Matrix Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[#174C37]" />
              <h3 className="text-lg font-bold text-[#3D291F]">
                <span className="hidden sm:inline">
                  Admission Tiers & Inventory Matrix
                </span>
                <span className="sm:hidden">Ticket Tiers</span>
              </h3>
            </div>
            <p className="text-xs text-[#6B5D53] mt-1">
              <span className="hidden sm:inline">
                Reconciled ticketing tallies across all authorized admission
                tiers.
              </span>
              <span className="sm:hidden">
                Tier inventory & revenue tallies.
              </span>
            </p>
          </div>

          {/* Aggregate Ticket Sales Summary & Single Record Button */}
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

            {canManage && onOpenCreateTierModal && (
              <button
                className="px-3.5 py-2 bg-white text-[#174C37] border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-xl font-semibold transition-colors flex items-center gap-1.5 min-h-[44px] shadow-xs cursor-pointer"
                id="btn-add-ticket-tier"
                onClick={onOpenCreateTierModal}
                type="button"
              >
                <Plus className="w-4 h-4 text-[#174C37]" />
                <span>Add Ticket Tier</span>
              </button>
            )}

            {onOpenRecordTicketModal && (
              <button
                className="px-4 py-2.5 bg-[#174C37] text-white rounded-xl font-semibold hover:bg-[#103D2B] transition-colors flex items-center gap-1.5 min-h-[44px] shadow-xs cursor-pointer"
                id="btn-record-ticket-sale"
                onClick={() => onOpenRecordTicketModal()}
                type="button"
              >
                <Ticket className="w-4 h-4 text-[#D6A23A]" />
                <span>Record Ticket Sale</span>
              </button>
            )}
          </div>
        </div>

        {/* Proportional Capacity Mix Bar */}
        {totalCapacity > 0 && (
          <div className="bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3] flex items-center gap-3">
            <span className="text-xs font-semibold text-[#5C4638] whitespace-nowrap">
              Capacity Mix:
            </span>
            <div className="flex-1 h-3 bg-[#E5DDD3] rounded-full overflow-hidden flex">
              {tiers.map((tier, idx) => {
                const widthPercent =
                  totalCapacity > 0 ? (tier.capacity / totalCapacity) * 100 : 0;
                return (
                  <div
                    key={tier.id}
                    className={`h-full transition-all duration-300 ${percentWidthClass(widthPercent)} ${tierBgClasses[idx % tierBgClasses.length]}`}
                    title={`${tier.name}: ${tier.sold}/${tier.capacity} passes (${widthPercent.toFixed(1)}% of inventory)`}
                  />
                );
              })}
            </div>
            <span className="text-xs font-mono font-semibold text-[#174C37]">
              {totalCapacity > 0
                ? Math.round((totalSold / totalCapacity) * 100)
                : 0}
              % Filled
            </span>
          </div>
        )}

        {/* Tiers Matrix Table */}
        {tiers.length === 0 ? (
          <div className="space-y-4">
            <EmptyStateCard
              className="my-4"
              description="No ticket tiers have been created for this event. Configure admission tiers to begin issuing passes."
              icon={Ticket}
              title="No Ticket Tiers Configured"
            />
            {canManage && onOpenCreateTierModal && (
              <div className="text-center">
                <button
                  className="px-4 py-2.5 bg-[#174C37] text-white rounded-xl font-semibold hover:bg-[#103D2B] transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer"
                  id="btn-create-tier-empty"
                  onClick={onOpenCreateTierModal}
                  type="button"
                >
                  <Plus className="w-4 h-4 text-[#D6A23A]" />
                  <span>Create Admission Tier</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Tier Cards (sm:hidden) */}
            <div className="sm:hidden space-y-3 p-3">
              {tiers.map((tier) => {
                const revenue = tier.sold * tier.price;
                const percentageFilled = Math.min(
                  100,
                  (tier.sold / (tier.capacity || 1)) * 100,
                );
                const remaining = tier.capacity - tier.sold;

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
                    className="bg-white p-3.5 rounded-xl border border-[#E5DDD3] shadow-2xs space-y-2.5"
                    key={`mobile-tier-${tier.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#3D291F] text-sm">
                            {tier.name}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusBadge.bg}`}
                          >
                            {statusBadge.label}
                          </span>
                        </div>
                        {tier.description && (
                          <p className="text-[11px] text-[#6B5D53] mt-0.5">
                            {tier.description}
                          </p>
                        )}
                      </div>
                      <span className="font-mono font-bold text-sm text-[#174C37]">
                        {formatNaira(tier.price)}
                      </span>
                    </div>

                    {/* Capacity Progress Bar */}
                    <div>
                      <div className="flex items-baseline justify-between text-xs font-mono">
                        <span className="text-[#6B5D53]">
                          Passes:{" "}
                          <strong className="text-[#3D291F]">
                            {tier.sold} / {tier.capacity}
                          </strong>
                        </span>
                        <span className="text-[11px] font-semibold text-[#174C37]">
                          {formatPercent(percentageFilled)}
                        </span>
                      </div>
                      <div className="w-full bg-[#E5DDD3] rounded-full h-2 mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${percentWidthClass(
                            percentageFilled,
                          )} ${
                            tier.status === "sold_out" ||
                            tier.sold >= tier.capacity
                              ? "bg-[#BA3C2A]"
                              : "bg-[#174C37]"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#F2ECE4] text-xs">
                      <div>
                        <span className="text-[#6B5D53]">Gross Inflow: </span>
                        <span className="font-mono font-bold text-[#3D291F]">
                          {formatNaira(revenue)}
                        </span>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2">
                          {onOpenEditTierModal && (
                            <button
                              className="px-3 py-1.5 text-xs font-semibold text-[#174C37] bg-[#FAF6F0] border border-[#174C37]/30 hover:bg-[#174C37] hover:text-white rounded-lg transition-colors min-h-[38px] flex items-center gap-1 cursor-pointer"
                              id={`btn-mobile-edit-tier-${tier.id}`}
                              onClick={() => onOpenEditTierModal(tier)}
                              type="button"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}
                          {onOpenRetireTierModal && (
                            <button
                              className="px-3 py-1.5 text-xs font-semibold text-[#BA3C2A] bg-[#FAF6F0] border border-[#BA3C2A]/30 hover:bg-[#BA3C2A] hover:text-white rounded-lg transition-colors min-h-[38px] flex items-center gap-1 cursor-pointer"
                              id={`btn-mobile-retire-tier-${tier.id}`}
                              onClick={() => onOpenRetireTierModal(tier)}
                              type="button"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Retire</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Tiers Table (hidden sm:block) */}
            <div className="hidden sm:block">
              <TableScroll label="Ticket sales">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5DDD3] bg-[#F7F3EC] text-[#7A685D] uppercase tracking-wider font-semibold text-[11px]">
                      <th className="py-2.5 px-3.5">Admission Tier</th>
                      <th className="py-2.5 px-3.5">Unit Price</th>
                      <th className="py-2.5 px-3.5">
                        Passes Issued / Capacity
                      </th>
                      <th className="py-2.5 px-3.5">Gross Inflow</th>
                      <th className="py-2.5 px-3.5 text-right">
                        Tier Controls
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE5DC]">
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
                        <tr
                          key={tier.id}
                          className="hover:bg-[#FAF6F0]/50 transition-colors"
                        >
                          {/* Name & Perks */}
                          <td className="py-3 px-3.5 max-w-[240px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#3D291F] text-sm">
                                {tier.name}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusBadge.bg}`}
                              >
                                {statusBadge.label}
                              </span>
                            </div>
                            {tier.description && (
                              <p className="text-[11px] text-[#7A685D] mt-0.5 line-clamp-1">
                                {tier.description}
                              </p>
                            )}
                            {tier.benefits && tier.benefits.length > 0 && (
                              <button
                                className="mt-1 text-[11px] text-[#174C37] font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                                onClick={() =>
                                  setExpandedTier(isExpanded ? null : tier.id)
                                }
                                type="button"
                              >
                                <span>
                                  {isExpanded ? "Hide perks" : "View perks"}
                                </span>
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                            )}
                            {isExpanded && tier.benefits && (
                              <ul className="mt-1.5 space-y-0.5 pl-3 list-disc text-[11px] text-[#5C4638]">
                                {tier.benefits.map((b) => (
                                  <li key={b}>{b}</li>
                                ))}
                              </ul>
                            )}
                          </td>

                          {/* Unit Price */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-sm text-[#174C37]">
                              {formatNaira(tier.price)}
                            </span>
                          </td>

                          {/* Capacity Progress */}
                          <td className="py-3 px-3.5 whitespace-nowrap min-w-[160px]">
                            <div className="flex items-baseline justify-between text-xs font-mono">
                              <span className="font-semibold text-[#3D291F]">
                                {tier.sold} / {tier.capacity}
                              </span>
                              <span className="text-[11px] text-[#7A685D]">
                                ({formatPercent(percentageFilled)})
                              </span>
                            </div>
                            <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 mt-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${percentWidthClass(
                                  percentageFilled,
                                )} ${
                                  tier.status === "sold_out" ||
                                  tier.sold >= tier.capacity
                                    ? "bg-[#BA3C2A]"
                                    : "bg-[#174C37]"
                                }`}
                              />
                            </div>
                          </td>

                          {/* Gross Inflow */}
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-sm text-[#3D291F]">
                            {formatNaira(revenue)}
                          </td>

                          {/* Tier Row Actions: Edit & Retire Only */}
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            {canManage ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {onOpenEditTierModal && (
                                  <button
                                    className="px-2.5 py-1 text-xs font-semibold text-[#174C37] bg-white border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-lg transition-colors flex items-center gap-1 cursor-pointer min-h-[30px]"
                                    id={`btn-edit-tier-${tier.id}`}
                                    onClick={() => onOpenEditTierModal(tier)}
                                    type="button"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                                {onOpenRetireTierModal && (
                                  <button
                                    className="px-2.5 py-1 text-xs font-semibold text-[#BA3C2A] bg-white border border-[#BA3C2A]/30 hover:bg-[#FDF0EE] rounded-lg transition-colors flex items-center gap-1 cursor-pointer min-h-[30px]"
                                    id={`btn-retire-tier-${tier.id}`}
                                    onClick={() => onOpenRetireTierModal(tier)}
                                    type="button"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Retire</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#7A685D]">
                                Active Quota
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

      {/* 2. Embedded Ticket Sales Ledger */}
      <EventDomainLedger
        currentUserId={currentUserId}
        domain="tickets"
        onInspect={(txn) => setSelectedTxn(txn)}
        title="Ticket Sales Ledger"
        transactions={ticketSalesTransactions}
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
