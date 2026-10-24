"use client";

import { Calendar, ChevronRight, Layers, RotateCcw } from "lucide-react";
import Link from "next/link";
import { formatNaira } from "@/lib/format";

export type EventLedgerEntry = {
  id: string;
  event_id: string;
  generation: number;
  entry_kind: string;
  event_status: string;
  signed_amount_ngn: number | string;
  created_at: string;
};

interface EventLedgerSectionProps {
  entries: EventLedgerEntry[];
  eventTitles: Map<string, string>;
  isUnavailable?: boolean;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export function EventLedgerSection({
  entries,
  eventTitles,
  isUnavailable = false,
}: EventLedgerSectionProps) {
  return (
    <section
      aria-labelledby="event-ledger-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
            <Layers className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="event-ledger-heading"
            >
              Event Ledger Posts & Reversals
            </h2>
            <p className="text-xs text-[#54433A] font-medium">
              Automated financial reconciliation from completed or cancelled
              club events
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono font-medium text-[#7A685D] self-start sm:self-center">
          Latest {entries.length} posts
        </span>
      </div>

      {isUnavailable ? (
        <div className="p-8 text-center text-xs text-[#BA3C2A]">
          Event ledger entries could not be verified.
        </div>
      ) : entries.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <Calendar className="w-10 h-10 text-[#B8ACA0] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Event Results Posted
          </h4>
          <p className="text-xs text-[#7A685D] max-w-sm mx-auto">
            When events conclude or reconcile financial budgets, their audited
            post results appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5DDD3] bg-[#FAF6F0]/60 text-[11px] font-bold text-[#54433A] uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Timestamp</th>
                <th className="py-3 px-4">Event & Workspace</th>
                <th className="py-3 px-4">Generation / Kind</th>
                <th className="py-3 px-4">Status & Policy Note</th>
                <th className="py-3 px-4 sm:px-6 text-right">
                  Net Posted Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DDD3]">
              {entries.map((entry) => {
                const title =
                  eventTitles.get(entry.event_id) ?? "Retained Event";
                const isReversal = entry.entry_kind === "reversal";
                const amount = Number(entry.signed_amount_ngn);

                return (
                  <tr
                    className="hover:bg-[#FAF6F0]/40 transition-colors"
                    key={entry.id}
                  >
                    <td className="py-3.5 px-4 sm:px-6 text-[11px] font-mono text-[#7A685D] whitespace-nowrap">
                      {formatTimestamp(entry.created_at)}
                    </td>

                    <td className="py-3.5 px-4">
                      <Link
                        className="font-bold text-[#174C37] hover:underline flex items-center gap-1 group"
                        href={`/events/${entry.event_id}/finance`}
                      >
                        <span>{title}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isReversal
                              ? "bg-[#D6A23A]/15 text-[#3D291F] border border-[#D6A23A]/30"
                              : "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20"
                          }`}
                        >
                          {isReversal ? (
                            <RotateCcw className="w-3 h-3 text-[#D6A23A]" />
                          ) : (
                            <Layers className="w-3 h-3 text-[#174C37]" />
                          )}
                          <span className="capitalize">{entry.entry_kind}</span>
                        </span>
                        <span className="text-[10px] text-[#7A685D] font-mono font-medium">
                          Gen {entry.generation}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-[#54433A]">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#174C37]" />
                        <span className="font-semibold text-[#3D291F] capitalize">
                          {entry.event_status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7A685D] mt-0.5">
                        {isReversal
                          ? "Offsets original post result; both records remain in immutable history."
                          : "Posted upon event conclusion and financial reconciliation."}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <span
                        className={`font-mono font-bold text-sm tabular-nums ${
                          amount >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                        }`}
                      >
                        {amount >= 0 ? "+" : ""}
                        {formatNaira(entry.signed_amount_ngn)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
