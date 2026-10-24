"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatNaira } from "@/lib/format";

export type DuesScheduleRow = {
  member_id: string;
  covered_month: string;
  amount_ngn: number | string | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
};

interface DuesScheduleCardProps {
  duesRows: DuesScheduleRow[];
  currentMonth: string;
  memberName: string;
  onOpenPayDuesModal: () => void;
}

function formatMonth(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatDate(date: string) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(value);
}

export function DuesScheduleCard({
  duesRows,
  currentMonth,
  memberName,
  onOpenPayDuesModal,
}: DuesScheduleCardProps) {
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");

  const filteredRows = useMemo(() => {
    if (filter === "unpaid") {
      return duesRows.filter((r) => r.status === "unpaid" || r.is_overdue);
    }
    if (filter === "paid") {
      return duesRows.filter((r) => r.status === "paid");
    }
    return duesRows;
  }, [duesRows, filter]);

  // Sort descending by covered_month so latest months appear first
  const sortedRows = useMemo(() => {
    return [...filteredRows].reverse();
  }, [filteredRows]);

  const getStatusBadge = (row: DuesScheduleRow) => {
    if (row.status === "paid") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#EAF4ED] text-[#174C37] border border-[#A8D5BC]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Paid</span>
        </span>
      );
    }
    if (row.status === "written_off") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]">
          <span>Written off</span>
        </span>
      );
    }
    if (row.is_overdue) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FDF2F2] text-[#BA3C2A] border border-[#F5C2C2]">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Overdue</span>
        </span>
      );
    }
    const normalizedCurrentMonth = currentMonth.slice(0, 7);
    const normalizedRowMonth = row.covered_month.slice(0, 7);
    if (normalizedRowMonth > normalizedCurrentMonth) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FAF6F0] text-[#54433A] border border-[#E5DDD3]">
          <Clock className="w-3.5 h-3.5 text-[#54433A]" />
          <span>Upcoming</span>
        </span>
      );
    }
    if (normalizedRowMonth === normalizedCurrentMonth) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FDF8EE] text-[#D6A23A] border border-[#EED7A1]">
          <Clock className="w-3.5 h-3.5" />
          <span>Due at Month End</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FDF2F2] text-[#BA3C2A] border border-[#F5C2C2]">
        <span>Unpaid</span>
      </span>
    );
  };

  return (
    <section
      aria-labelledby="dues-schedule-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] overflow-hidden shadow-xs"
    >
      {/* Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="dues-schedule-heading"
            >
              Statutory Dues Schedule
            </h2>
          </div>
          <p className="text-xs text-[#54433A] font-medium mt-1">
            Eligible contribution breakdown for{" "}
            <strong className="text-[#3D291F] font-bold">{memberName}</strong> ·
            Calendar year
          </p>
        </div>

        {/* Filter Pills & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-[#E5DDD3] text-xs shadow-2xs">
            <button
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilter("all")}
              type="button"
            >
              All ({duesRows.length})
            </button>
            <button
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                filter === "unpaid"
                  ? "bg-[#BA3C2A] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilter("unpaid")}
              type="button"
            >
              Unpaid (
              {
                duesRows.filter((r) => r.status === "unpaid" || r.is_overdue)
                  .length
              }
              )
            </button>
            <button
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                filter === "paid"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#54433A] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setFilter("paid")}
              type="button"
            >
              Paid ({duesRows.filter((r) => r.status === "paid").length})
            </button>
          </div>

          <button
            id="pay-dues-modal-trigger"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D6A23A] text-[#3D291F] hover:bg-[#c9952f] text-xs font-extrabold shadow-2xs transition-colors cursor-pointer min-h-[36px]"
            onClick={onOpenPayDuesModal}
            type="button"
          >
            <CreditCard className="w-3.5 h-3.5 text-[#3D291F]" />
            <span>Pay Dues</span>
          </button>
        </div>
      </div>

      {/* Schedule Table */}
      {sortedRows.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <Calendar className="w-8 h-8 text-[#B8ACA0] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Schedule Records Match Filter
          </h4>
          <p className="text-xs text-[#54433A]">
            Select another filter tab or review your overall membership status.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5DDD3] bg-white text-[#54433A] uppercase font-bold text-[11px] tracking-wider">
                <th className="py-3 px-5" scope="col">
                  Covered Month
                </th>
                <th className="py-3 px-5" scope="col">
                  Statutory Amount
                </th>
                <th className="py-3 px-5" scope="col">
                  Due Date
                </th>
                <th className="py-3 px-5" scope="col">
                  Ledger Status
                </th>
                <th className="py-3 px-5 text-right" scope="col">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DDD3] bg-white font-medium text-[#3D291F]">
              {sortedRows.map((row) => {
                const isPaid = row.status === "paid";
                const isWrittenOff = row.status === "written_off";
                return (
                  <tr
                    className="hover:bg-[#FAF6F0]/75 transition-colors"
                    key={row.covered_month}
                  >
                    <td className="py-3.5 px-5 font-bold">
                      <div className="flex items-center gap-2">
                        <span>{formatMonth(row.covered_month)}</span>
                        {row.covered_month.slice(0, 7) ===
                          currentMonth.slice(0, 7) && (
                          <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3]">
                            Current Cycle
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 font-mono font-bold text-[#174C37]">
                      {row.amount_ngn != null
                        ? formatNaira(row.amount_ngn)
                        : "Rate unavailable"}
                    </td>
                    <td className="py-3.5 px-5 text-[#54433A]">
                      {formatDate(row.due_date)}
                    </td>
                    <td className="py-3.5 px-5">{getStatusBadge(row)}</td>
                    <td className="py-3.5 px-5 text-right">
                      {isPaid ? (
                        <span className="text-xs font-bold text-[#174C37] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
                          <span>Receipt Cleared</span>
                        </span>
                      ) : isWrittenOff ? (
                        <span className="text-xs font-semibold text-[#7A685D] inline-flex items-center gap-1">
                          <span>Waived / Written Off</span>
                        </span>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FAF6F0] text-[#3D291F] hover:bg-[#E5DDD3] border border-[#E5DDD3] text-xs font-bold transition-colors cursor-pointer"
                          onClick={onOpenPayDuesModal}
                          type="button"
                        >
                          <CreditCard className="w-3 h-3 text-[#174C37]" />
                          <span>Settle Now</span>
                        </button>
                      )}
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
