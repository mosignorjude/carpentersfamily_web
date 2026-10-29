"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { backfillMemberHistoricalDuesAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import {
  formatReconciliationTally,
  PRE_LAUNCH_MONTH_SHORT_LABELS,
  STATUTORY_MONTHLY_DUES_NGN,
  selectAllUnclearedMonths,
  toggleReconciliationMonth,
  VALID_PRE_LAUNCH_MONTHS,
} from "@/lib/pre-launch-reconciliation.mjs";

export type ReconciliationMember = {
  id: string;
  fullName: string;
  username?: string | null;
  avatarUrl?: string | null;
  clearedMonths: string[]; // e.g. ['2026-02-01', '2026-03-01']
};

export type PreLaunchDuesReconciliationCardProps = {
  members: ReconciliationMember[];
  isAdmin: boolean;
};

interface MemberRowProps {
  member: ReconciliationMember;
}

function MemberReconciliationRow({ member }: MemberRowProps) {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const unclearedMonths = selectAllUnclearedMonths(member.clearedMonths);
  const activeSelectedMonths = selectedMonths.filter(
    (m) => !member.clearedMonths.includes(m),
  );
  const isAllUnclearedSelected =
    unclearedMonths.length > 0 &&
    unclearedMonths.every((m) => activeSelectedMonths.includes(m));
  const isFullyReconciled = unclearedMonths.length === 0;

  const tally = formatReconciliationTally(activeSelectedMonths.length);

  const initial = (member.fullName || member.username || "M")
    .trim()
    .charAt(0)
    .toUpperCase();

  const cleanUsername = member.username
    ? member.username.startsWith("@")
      ? member.username
      : `@${member.username}`
    : "@member";

  function handleToggle(month: string) {
    setSelectedMonths((prev) =>
      toggleReconciliationMonth(prev, month, member.clearedMonths),
    );
  }

  function handleSelectAllUnpaid() {
    setSelectedMonths(unclearedMonths);
  }

  function handleClear() {
    setSelectedMonths([]);
  }

  return (
    <div
      className="p-4 sm:p-5 rounded-xl bg-white border border-[#E5DDD3] hover:border-[#174C37]/40 transition-colors shadow-2xs space-y-4"
      data-testid={`reconciliation-row-${member.id}`}
    >
      {/* Top Header: Member Identity & Monthly Rate */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3 min-w-0">
          {member.avatarUrl ? (
            /* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by production CSP */
            <img
              alt={member.fullName}
              className="w-10 h-10 rounded-full object-cover border border-[#E5DDD3] shrink-0"
              src={member.avatarUrl}
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-full bg-[#FAF6F0] border border-[#E5DDD3] text-[#174C37] flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs"
            >
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <h4 className="text-sm font-extrabold text-[#3D291F] truncate">
              {member.fullName}
            </h4>
            <div className="flex items-center gap-2 text-xs text-[#54433A]">
              <span className="font-mono text-[#7A685D] truncate">
                {cleanUsername}
              </span>
              <span aria-hidden="true" className="text-[#B8ACA0]">
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#174C37]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#174C37]" />
                Active Member
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-[11px] font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-2.5 py-1 rounded-md border border-[#E5DDD3]">
            ₦5,000 / month
          </span>
          {isFullyReconciled && (
            <span className="text-[11px] font-bold text-[#174C37] bg-[#F2F8F5] px-2 py-1 rounded-md border border-[#174C37]/30 flex items-center gap-1">
              <Check className="w-3 h-3 text-[#174C37]" />
              Fully Reconciled
            </span>
          )}
        </div>
      </div>

      {/* 8-Month Badges Interactive Strip */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-[#54433A]">
          <span>Pre-Launch Months (Feb–Sep 2026)</span>
          <div className="flex items-center gap-2">
            <button
              className="text-[11px] font-bold text-[#174C37] hover:underline disabled:opacity-40 disabled:hover:no-underline cursor-pointer disabled:cursor-not-allowed"
              disabled={isFullyReconciled || isAllUnclearedSelected}
              onClick={handleSelectAllUnpaid}
              type="button"
            >
              Select All Unpaid
            </button>
            <span aria-hidden="true" className="text-[#B8ACA0]">
              ·
            </span>
            <button
              className="text-[11px] font-bold text-[#7A685D] hover:text-[#BA3C2A] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
              disabled={activeSelectedMonths.length === 0}
              onClick={handleClear}
              type="button"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {VALID_PRE_LAUNCH_MONTHS.map((month) => {
            const isCleared = member.clearedMonths.includes(month);
            const isSelected = activeSelectedMonths.includes(month);
            const label =
              (PRE_LAUNCH_MONTH_SHORT_LABELS as Record<string, string>)[
                month
              ] ?? month;

            if (isCleared) {
              return (
                <button
                  aria-label={`${label} 2026: Already reconciled/cleared`}
                  aria-disabled="true"
                  className="p-2 rounded-lg bg-[#F2F8F5] border border-[#174C37]/30 text-[#174C37] flex flex-col items-center justify-center gap-1 text-xs font-bold opacity-85 cursor-not-allowed shadow-2xs"
                  disabled
                  key={month}
                  title="Already reconciled/cleared"
                  type="button"
                >
                  <span className="text-[11px]">{label}</span>
                  <Lock className="w-3 h-3 text-[#174C37]" />
                </button>
              );
            }

            if (isSelected) {
              return (
                <button
                  aria-label={`${label} 2026: Selected for reconciliation`}
                  className="p-2 rounded-lg bg-[#174C37] border border-[#174C37] text-white flex flex-col items-center justify-center gap-1 text-xs font-extrabold shadow-xs cursor-pointer hover:bg-[#103D2B] transition-colors"
                  key={month}
                  onClick={() => handleToggle(month)}
                  type="button"
                >
                  <span className="text-[11px]">{label}</span>
                  <Check className="w-3 h-3 text-[#D6A23A]" />
                </button>
              );
            }

            return (
              <button
                aria-label={`${label} 2026: Click to select`}
                className="p-2 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-[#54433A] flex flex-col items-center justify-center gap-1 text-xs font-bold hover:border-[#174C37]/50 hover:text-[#3D291F] transition-colors cursor-pointer"
                key={month}
                onClick={() => handleToggle(month)}
                type="button"
              >
                <span className="text-[11px]">{label}</span>
                <span className="w-3 h-3 rounded-full border border-[#B8ACA0] inline-block" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Footer: Live Calculation & Submit Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#E5DDD3]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#3D291F] px-3 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3]">
            {tally.label}
          </span>
          <span className="text-[11px] text-[#7A685D] hidden md:inline">
            (₦{STATUTORY_MONTHLY_DUES_NGN.toLocaleString()} / mo)
          </span>
        </div>

        <form
          action={backfillMemberHistoricalDuesAction}
          className="w-full sm:w-auto"
          method="post"
        >
          <input name="member_id" type="hidden" value={member.id} />
          {activeSelectedMonths.map((m) => (
            <input key={m} name="covered_months" type="hidden" value={m} />
          ))}
          <input
            name="notes"
            type="hidden"
            value="Pre-launch dues reconciliation (Feb-Sep 2026)"
          />
          <FormSubmitButton
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-bold"
            disabled={activeSelectedMonths.length === 0}
            loadingText="Reconciling..."
          >
            Reconcile Dues
          </FormSubmitButton>
        </form>
      </div>
    </div>
  );
}

export function PreLaunchDuesReconciliationCard({
  members,
  isAdmin,
}: PreLaunchDuesReconciliationCardProps) {
  // Collapsed by default on mobile to eliminate 1,900px vertical scroll burden
  const [isCollapsed, setIsCollapsed] = useState(true);

  // If not admin, render clean read-only administrative advisory
  if (!isAdmin) {
    return (
      <div
        className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs"
        data-testid="pre-launch-reconciliation-read-only"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#7A685D] flex items-center justify-center">
            <Lock className="w-4 h-4 text-[#7A685D]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#3D291F]">
              Pre-Launch Dues Reconciliation Workspace
            </h3>
            <p className="text-xs text-[#7A685D] mt-0.5">
              Access restricted to Club Administrators. Only authorized
              administrators may reconcile historical dues.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="dues-reconciliation-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xs overflow-hidden"
    >
      {/* Header Bar */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-gradient-to-r from-[#FAF6F0] to-white flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#174C37] text-white flex items-center justify-center shadow-2xs">
              <History className="w-4 h-4 text-[#D6A23A]" />
            </div>
            <h3
              className="text-base sm:text-lg font-black text-[#3D291F]"
              id="dues-reconciliation-heading"
            >
              Pre-Launch Dues Reconciliation Workspace (Feb–Sep 2026)
            </h3>
          </div>
          <p className="text-xs text-[#54433A] max-w-2xl leading-relaxed">
            Reconcile historical dues collected before October 2026 launch. Dues
            recorded here clear member obligations without inflating verified
            bank cash balance.
          </p>
        </div>

        <button
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand workspace" : "Collapse workspace"}
          className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#174C37] hover:bg-[#FAF6F0] transition-colors cursor-pointer shrink-0 min-h-[38px] flex items-center gap-1.5 text-xs font-bold shadow-2xs"
          onClick={() => setIsCollapsed((prev) => !prev)}
          type="button"
        >
          <span>{isCollapsed ? "Expand" : "Collapse"}</span>
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4 text-[#174C37]" />
          ) : (
            <ChevronUp className="w-4 h-4 text-[#174C37]" />
          )}
        </button>
      </div>

      {/* Content Area */}
      {!isCollapsed && (
        <div className="p-5 sm:p-6 space-y-5">
          {/* Informational Guidance Callout */}
          <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#174C37]/20 flex items-start gap-3 text-xs text-[#54433A]">
            <Info className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <strong className="text-[#174C37] font-bold block">
                Accounting Guard &amp; Zero Double-Counting
              </strong>
              <span>
                Pre-launch cash collected was deposited before portal go-live
                and is formally audited in the Treasury Opening Cash Reserve.
                Reconciling months here discharges member statutory liability
                without double-counting bank deposits.
              </span>
            </div>
          </div>

          {/* Members Workspace or Empty State */}
          {members.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2">
              <ShieldAlert className="w-6 h-6 text-[#7A685D] mx-auto opacity-60" />
              <p className="text-xs font-semibold text-[#7A685D]">
                No active members requiring pre-launch reconciliation.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <MemberReconciliationRow
                  key={`${member.id}-${member.clearedMonths.join(",")}`}
                  member={member}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
