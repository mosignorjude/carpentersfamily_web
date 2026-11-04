"use client";

import {
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ClubLogo from "@/components/club-logo";
import { clubBrand } from "@/lib/brand";
import { formatEventTime } from "@/lib/event-times.mjs";
import { formatNaira } from "@/lib/format";

export interface PublicTicketTier {
  id: string;
  name: string;
  price_ngn: number;
  capacity: number | null;
  sold: number;
}

export interface PublicTicketedEvent {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  description: string | null;
  tiers: PublicTicketTier[];
}

export interface PublicBankInfo {
  bank_name: string;
  account_name: string;
  account_number: string;
  instructions: string | null;
}

interface TicketsStorefrontViewProps {
  events: PublicTicketedEvent[];
  bank: PublicBankInfo | null;
  isAuthenticatedMember?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function TicketsStorefrontView({
  events,
  bank,
  isAuthenticatedMember = false,
}: TicketsStorefrontViewProps) {
  const [selectedTierByEvent, setSelectedTierByEvent] = useState<
    Record<string, string>
  >({});
  const [quantityByEvent, setQuantityByEvent] = useState<
    Record<string, number>
  >({});
  const [buyerNameByEvent, setBuyerNameByEvent] = useState<
    Record<string, string>
  >({});
  const [copiedAccount, setCopiedAccount] = useState(false);

  const accountNumber = bank?.account_number || "1307798889";
  const bankName = bank?.bank_name || "ProvidusUnity";
  const accountName = bank?.account_name || "The Carpenters Fam Soc Club Asb";

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedAccount(true);
      window.setTimeout(() => setCopiedAccount(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#3D291F] font-sans antialiased">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF6F0]/95 backdrop-blur-md border-b border-[#E5DDD3]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            className="flex items-center gap-3 no-underline text-[#3D291F]"
            href="/tickets"
          >
            <div className="p-2 rounded-xl bg-white border border-[#E5DDD3] shadow-2xs">
              <ClubLogo size="sm" variant="dark" />
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight block leading-tight text-[#3D291F]">
                {clubBrand.name}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#174C37] block">
                Official Event Box Office · tickets.carpentersfamily.com.ng
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E5DDD3] bg-white hover:bg-[#FAF6F0] text-xs font-bold text-[#174C37] transition-colors no-underline shadow-2xs"
              href={isAuthenticatedMember ? "/events" : "/"}
            >
              <span>
                {isAuthenticatedMember ? "Member Portal" : "Member Sign In"}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Hero Banner */}
        <section className="rounded-2xl bg-[#0C3325] text-white p-6 sm:p-10 shadow-md border border-[#174C37] space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold uppercase tracking-widest text-[#D6A23A]">
            <Ticket className="w-3.5 h-3.5" />
            <span>Official Event Passes & Reservations</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white max-w-2xl leading-tight">
            Purchase Event Tickets & Celebration Passes
          </h1>
          <p className="text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed">
            Select your preferred ticket tier below and complete settlement via
            the official Carpenters Family Social Club treasury account.
          </p>
        </section>

        {events.length === 0 ? (
          <section className="rounded-2xl bg-white border border-[#E5DDD3] p-10 text-center space-y-3 shadow-xs">
            <Ticket className="w-10 h-10 text-[#174C37] mx-auto opacity-75" />
            <h2 className="text-lg font-extrabold text-[#3D291F]">
              No Ticketed Events Currently Open
            </h2>
            <p className="text-xs sm:text-sm text-[#5C4638] max-w-md mx-auto leading-relaxed">
              Upcoming club celebrations and ticketed gatherings will appear
              here as soon as box office sales open.
            </p>
          </section>
        ) : (
          <div className="space-y-6">
            {events.map((event) => {
              const tiers = event.tiers ?? [];
              const selectedTierId =
                selectedTierByEvent[event.id] ?? tiers[0]?.id ?? "";
              const selectedTier =
                tiers.find((t) => t.id === selectedTierId) ?? tiers[0];
              const quantity = quantityByEvent[event.id] ?? 1;
              const buyerName = buyerNameByEvent[event.id] ?? "";
              const totalNgn = selectedTier
                ? Number(selectedTier.price_ngn) * quantity
                : 0;
              const eventDate = new Date(event.starts_at);

              return (
                <article
                  className="rounded-2xl bg-white border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-6"
                  key={event.id}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-[#E5DDD3]">
                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#174C37]/10 text-[#174C37] text-[11px] font-bold uppercase tracking-wider">
                        Box Office Open
                      </span>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
                        {event.title}
                      </h2>
                      {event.description && (
                        <p className="text-xs sm:text-sm text-[#5C4638] max-w-2xl leading-relaxed">
                          {event.description}
                        </p>
                      )}
                    </div>

                    <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] p-4 space-y-2 text-xs shrink-0 min-w-[240px]">
                      <div className="flex items-center gap-2 font-bold text-[#3D291F]">
                        <Calendar className="w-4 h-4 text-[#174C37] shrink-0" />
                        <span>{dateFormatter.format(eventDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#5C4638] font-medium">
                        <Clock className="w-4 h-4 text-[#174C37] shrink-0" />
                        <span>{formatEventTime(event.starts_at)} WAT</span>
                      </div>
                      <div className="flex items-start gap-2 text-[#5C4638] font-medium">
                        <MapPin className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
                        <span>{event.location}</span>
                      </div>
                    </div>
                  </div>

                  {tiers.length === 0 ? (
                    <div className="p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] font-medium">
                      Ticket tiers for this event are being finalized. Please
                      check back shortly.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Tier Selection */}
                      <div className="lg:col-span-7 space-y-4">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#54433A]">
                          1. Select Ticket Tier
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {tiers.map((tier) => {
                            const isSelected = selectedTier?.id === tier.id;
                            const remaining =
                              tier.capacity !== null
                                ? Math.max(0, tier.capacity - tier.sold)
                                : null;
                            const soldOut =
                              remaining !== null && remaining <= 0;

                            return (
                              <button
                                className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-1.5 ${
                                  isSelected
                                    ? "border-[#174C37] bg-[#174C37]/5 ring-2 ring-[#174C37]/20"
                                    : "border-[#E5DDD3] bg-[#FAF6F0]/60 hover:bg-white"
                                } ${soldOut ? "opacity-50 cursor-not-allowed" : ""}`}
                                disabled={soldOut}
                                key={tier.id}
                                onClick={() =>
                                  setSelectedTierByEvent((prev) => ({
                                    ...prev,
                                    [event.id]: tier.id,
                                  }))
                                }
                                type="button"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#3D291F]">
                                    {tier.name}
                                  </span>
                                  <span className="text-sm font-mono font-extrabold text-[#174C37]">
                                    {formatNaira(Number(tier.price_ngn))}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#7A685D] font-medium">
                                  {soldOut
                                    ? "Sold out"
                                    : remaining !== null
                                      ? `${remaining} pass${remaining === 1 ? "" : "es"} available`
                                      : "Available"}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div>
                            <label
                              className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1"
                              htmlFor={`qty-${event.id}`}
                            >
                              Number of Passes
                            </label>
                            <select
                              className="w-full h-11 px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-bold text-[#3D291F]"
                              id={`qty-${event.id}`}
                              onChange={(e) =>
                                setQuantityByEvent((prev) => ({
                                  ...prev,
                                  [event.id]: Number(e.target.value) || 1,
                                }))
                              }
                              value={quantity}
                            >
                              {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                                <option key={num} value={num}>
                                  {num} {num === 1 ? "Pass" : "Passes"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1"
                              htmlFor={`buyer-${event.id}`}
                            >
                              Guest / Buyer Name (for Transfer Narration)
                            </label>
                            <input
                              className="w-full h-11 px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
                              id={`buyer-${event.id}`}
                              maxLength={80}
                              onChange={(e) =>
                                setBuyerNameByEvent((prev) => ({
                                  ...prev,
                                  [event.id]: e.target.value,
                                }))
                              }
                              placeholder="Enter full name..."
                              type="text"
                              value={buyerName}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Checkout & Payment Box */}
                      <div className="lg:col-span-5 rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] p-5 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D] block">
                              Selected Order Total
                            </span>
                            <span className="text-xs font-semibold text-[#5C4638]">
                              {quantity} × {selectedTier?.name}
                            </span>
                          </div>
                          <span className="text-xl font-mono font-extrabold text-[#174C37]">
                            {formatNaira(totalNgn)}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white border border-[#E5DDD3] space-y-2.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#3D291F]">
                            <Building2 className="w-4 h-4 text-[#174C37]" />
                            <span>
                              {bankName} · {accountName}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3]">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A685D] block">
                                Account Number
                              </span>
                              <span className="text-base font-mono font-extrabold text-[#174C37] tracking-wider">
                                {accountNumber}
                              </span>
                            </div>
                            <button
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors cursor-pointer"
                              onClick={handleCopyAccount}
                              type="button"
                            >
                              {copiedAccount ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#D6A23A]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Account</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="text-[11px] text-[#5C4638] leading-relaxed">
                            <strong className="text-[#3D291F]">
                              Transfer Narration:{" "}
                            </strong>
                            <span className="font-mono bg-[#FAF6F0] px-1.5 py-0.5 rounded border border-[#E5DDD3]">
                              TICKET - {event.title.slice(0, 20)} -{" "}
                              {buyerName.trim() || "YOUR NAME"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 text-[11px] text-[#5C4638] leading-relaxed">
                          <ShieldCheck className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
                          <span>
                            Use the transfer narration above when sending your
                            payment so the Event Committee can immediately issue
                            and verify your pass.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
