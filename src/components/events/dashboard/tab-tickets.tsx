"use client";

import { Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
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
  onInspectTransaction?: (transaction: DashboardTransaction) => void;
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
  onInspectTransaction,
  ticketSalesTransactions = [],
  eventId = "",
  currentUserId,
  userRole,
}: TabTicketsProps) {
  const [selectedTxn, setSelectedTxn] = useState<DashboardTransaction | null>(
    null,
  );

  const activeTiers = tiers.filter(
    (t) => !t.retiredAt && t.status !== "retired",
  );
  const totalSold = tiers.reduce((acc, t) => acc + t.sold, 0);
  const totalCapacity = activeTiers.reduce((acc, t) => acc + t.capacity, 0);
  const totalGross = tiers.reduce((acc, t) => acc + t.sold * t.price, 0);
  const filledPercent =
    totalCapacity > 0 ? Math.min(100, (totalSold / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-4 min-w-0">
      {/* Top Summary & Actions Card */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#3D291F]">
              Ticket Tiers & Capacity Mix
            </h2>
            <p className="text-xs text-[#5C4638]">
              Manage admission tiers, pricing, and live box-office inventory
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && onOpenCreateTierModal && (
              <button
                className="px-3.5 py-2 min-h-[44px] rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] hover:border-[#174C37] text-xs font-bold text-[#3D291F] flex items-center gap-1.5 cursor-pointer transition-colors"
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
                className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                id="btn-record-ticket-sale"
                onClick={() => onOpenRecordTicketModal()}
                type="button"
              >
                <Ticket className="w-4 h-4 text-[#F0C768]" />
                <span>Record Ticket Sale</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-3.5 border-t border-[#E5DDD3] grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-[#FAF6F0] rounded-xl p-3 border border-[#E5DDD3]/70">
            <span className="text-[11px] uppercase font-semibold text-[#7A685D] block">
              Verified Ticket Revenue
            </span>
            <div className="text-lg sm:text-xl font-bold text-[#174C37] mt-0.5 font-mono tabular-nums">
              {formatNaira(totalGross)}
            </div>
          </div>

          <div className="bg-[#FAF6F0] rounded-xl p-3 border border-[#E5DDD3]/70">
            <span className="text-[11px] uppercase font-semibold text-[#7A685D] block">
              Total Passes Sold
            </span>
            <div className="text-lg sm:text-xl font-bold text-[#3D291F] mt-0.5 font-mono tabular-nums">
              {totalSold}{" "}
              <span className="text-xs font-normal text-[#7A685D]">
                / {totalCapacity}
              </span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-[#FAF6F0] rounded-xl p-3 border border-[#E5DDD3]/70 flex flex-col justify-center">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-[#5C4638]">Capacity Mix</span>
              <span className="font-mono font-bold text-[#174C37]">
                {filledPercent.toFixed(1)}% Filled
              </span>
            </div>
            <div className="w-full h-2 bg-[#E5DDD3] rounded-full overflow-hidden">
              <div
                className={`h-full bg-[#174C37] rounded-full transition-all duration-300 ${percentWidthClass(
                  filledPercent,
                )}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tier Cards Grid (3-col Desktop, Stacked Mobile) */}
      {tiers.length === 0 ? (
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 space-y-4">
          <EmptyStateCard
            className="my-2"
            description="Add a ticket tier to start recording ticket sales."
            icon={Ticket}
            title="No Ticket Tiers Yet"
          />
          {canManage && onOpenCreateTierModal && (
            <div className="text-center">
              <button
                className="px-4 py-2.5 min-h-[44px] bg-[#174C37] text-white rounded-xl font-semibold hover:bg-[#103D2B] transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer"
                id="btn-create-tier-empty"
                onClick={onOpenCreateTierModal}
                type="button"
              >
                <Plus className="w-4 h-4 text-[#F0C768]" />
                <span>Add Ticket Tier</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tiers.map((tier) => {
            const isRetired =
              Boolean(tier.retiredAt) || tier.status === "retired";
            const tierRev = tier.sold * tier.price;
            const pct =
              tier.capacity > 0
                ? Math.min(100, (tier.sold / tier.capacity) * 100)
                : 0;
            const remaining = Math.max(0, tier.capacity - tier.sold);
            const isSoldOut =
              !isRetired &&
              (tier.status === "sold_out" || tier.sold >= tier.capacity);
            const isLimited = !isRetired && !isSoldOut && remaining <= 10;

            const badge = isRetired
              ? {
                  label: "Retired",
                  cls: "bg-[#BA3C2A]/15 text-[#BA3C2A]",
                }
              : isSoldOut
                ? {
                    label: "Sold Out",
                    cls: "bg-[#BA3C2A]/15 text-[#BA3C2A]",
                  }
                : isLimited
                  ? {
                      label: `${remaining} Left`,
                      cls: "bg-[#8D5B0E]/15 text-[#8D5B0E]",
                    }
                  : {
                      label: "Active",
                      cls: "bg-[#174C37]/10 text-[#174C37]",
                    };

            return (
              <div
                className={`bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs flex flex-col justify-between ${
                  isRetired ? "opacity-70" : ""
                }`}
                key={tier.id}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[#3D291F] truncate">
                          {tier.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      {tier.description && (
                        <p className="text-xs text-[#7A685D] mt-0.5">
                          {tier.description}
                        </p>
                      )}
                    </div>
                    <div className="text-base font-bold text-[#3D291F] font-mono tabular-nums shrink-0">
                      {formatNaira(tier.price)}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[#5C4638]">
                        Sold:{" "}
                        <strong className="text-[#3D291F] font-mono">
                          {tier.sold} / {tier.capacity}
                        </strong>
                      </span>
                      <span className="font-mono text-[#5C4638]">
                        {formatPercent(pct)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#E5DDD3] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${percentWidthClass(pct)} ${
                          isSoldOut ? "bg-[#BA3C2A]" : "bg-[#174C37]"
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-[#E5DDD3]/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#7A685D] block">
                      Tier Revenue
                    </span>
                    <span className="font-mono text-xs font-bold text-[#174C37]">
                      {formatNaira(tierRev)}
                    </span>
                  </div>

                  {canManage && !isRetired && (
                    <div className="flex items-center gap-1.5">
                      {onOpenEditTierModal && (
                        <button
                          className="px-3 py-2 min-h-[44px] rounded-xl bg-[#FAF6F0] hover:border-[#174C37] text-xs font-semibold text-[#174C37] border border-[#E5DDD3] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          id={`btn-edit-tier-${tier.id}`}
                          onClick={() => onOpenEditTierModal(tier)}
                          type="button"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                      {onOpenRetireTierModal && (
                        <button
                          className="px-3 py-2 min-h-[44px] rounded-xl bg-[#FAF6F0] hover:border-[#BA3C2A] text-xs font-semibold text-[#BA3C2A] border border-[#E5DDD3] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          id={`btn-retire-tier-${tier.id}`}
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
      )}

      {/* Filterable Ticket Sales Records (2-Line Card Format Everywhere) */}
      <EventDomainLedger
        currentUserId={currentUserId}
        domain="tickets"
        onInspect={onInspectTransaction ?? ((txn) => setSelectedTxn(txn))}
        subtitle="Tap any ticket card to inspect receipt, verify pending sale, or void"
        ticketTiers={tiers}
        title="Ticket Sales Records"
        transactions={ticketSalesTransactions}
        userRole={userRole}
      />

      {/* Local fallback drawer when TabTickets renders outside EventDashboardView */}
      {!onInspectTransaction && (
        <VoucherInspectionDrawer
          currentUserId={currentUserId}
          eventId={eventId}
          isOpen={selectedTxn !== null}
          onClose={() => setSelectedTxn(null)}
          transaction={selectedTxn}
          userRole={userRole}
        />
      )}
    </div>
  );
}
