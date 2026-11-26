"use client";

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Receipt,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type {
  DuesMemberOption,
  DuesMonthOption,
} from "@/app/(member)/dues/dues-forms";
import type { DuesNotice } from "@/lib/dues-notices";
import { formatNaira } from "@/lib/format";
import { type AuditRow, DuesAuditHistoryCard } from "./dues-audit-history-card";
import {
  DuesPaymentsHistoryCard,
  type PaymentRow,
} from "./dues-payments-history-card";
import type { RateRow } from "./dues-rate-schedule-card";
import { DuesScheduleCard, type DuesScheduleRow } from "./dues-schedule-card";
import { DuesSummaryCards } from "./dues-summary-cards";
import { MyDuesRequestsCard } from "./my-dues-requests-card";
import type { DuesPaymentRequestItem } from "./officer-dues-approvals-card";
import { OfficerDuesControlsCard } from "./officer-dues-controls-card";

type LedgerTab = "overview" | "history" | "audit";

interface MemberDuesLedgerViewProps {
  member: DuesMemberOption;
  members: DuesMemberOption[];
  targetIsDuesExempt: boolean;
  canRecord: boolean;
  canWriteOff: boolean;
  canRecordForTarget: boolean;
  recordBlockedReason: string | null;
  canCorrect: boolean;
  canAttachReceipt: boolean;
  duesRows: DuesScheduleRow[];
  payments: PaymentRow[];
  rates: RateRow[];
  coverageByPayment: Map<string, string[]>;
  combinedAudit: AuditRow[];
  actorNames: Map<string, string>;
  clubTotalIncome: number | null;
  memberRequests: DuesPaymentRequestItem[];
  notice?: DuesNotice;
  memberListError: boolean;
  detailedDataError: boolean;
  auditError: boolean;
  today: string;
  currentMonth: string;
  nextMonth: string;
  availableMonths: DuesMonthOption[];
  pastUnpaidMonths: DuesMonthOption[];
  openTotal: number;
  paymentPage: number;
  totalPaymentsCount: number;
  auditPage: number;
  totalAuditCount: number;
  pageSize: number;
  initialTab?: string;
}

export function MemberDuesLedgerView({
  member,
  members,
  targetIsDuesExempt,
  canRecord,
  canWriteOff,
  canRecordForTarget,
  recordBlockedReason,
  canCorrect,
  canAttachReceipt,
  duesRows,
  payments,
  rates,
  coverageByPayment,
  combinedAudit,
  actorNames,
  clubTotalIncome,
  memberRequests,
  notice,
  memberListError,
  detailedDataError,
  auditError,
  today,
  currentMonth,
  nextMonth,
  availableMonths,
  pastUnpaidMonths,
  openTotal,
  paymentPage,
  totalPaymentsCount,
  auditPage,
  totalAuditCount,
  pageSize,
  initialTab,
}: MemberDuesLedgerViewProps) {
  const router = useRouter();
  const [selectedMemberId, setSelectedMemberId] = useState(member.id);

  const validTab: LedgerTab =
    initialTab === "history"
      ? "history"
      : initialTab === "audit"
        ? "audit"
        : "overview";
  const [activeTab, setActiveTab] = useState<LedgerTab>(validTab);

  const baseHref = `/dues/members/${member.id}`;

  const handleTabChange = (newTab: LedgerTab) => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleSwitchMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMemberId || selectedMemberId === member.id) return;
    router.push(`/dues/members/${selectedMemberId}`);
  };

  const paidRows = duesRows.filter((r) => r.status === "paid");
  const paidMonthsCount = paidRows.length;
  const standardMonthlyRate = 5000;
  const currentMonthlyRate =
    rates.length > 0
      ? Number(rates[rates.length - 1].monthly_amount_ngn) ||
        standardMonthlyRate
      : standardMonthlyRate;

  const totalPaidAmount = paidRows.reduce(
    (sum, r) => sum + (Number(r.amount_ngn) || currentMonthlyRate),
    0,
  );

  const nextRateObj =
    rates.find(
      (r) => r.effective_month.slice(0, 7) === nextMonth.slice(0, 7),
    ) ?? null;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 pb-12 font-sans antialiased text-[#3D291F]">
      {/* Breadcrumb & Quick Switcher */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-3.5 sm:p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 text-xs font-bold text-[#174C37] hover:underline min-h-[38px]"
          href="/dues?tab=officer"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>Back to Officer Treasury</span>
        </Link>

        <form
          className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto"
          onSubmit={handleSwitchMember}
        >
          <label
            className="flex items-center gap-1.5 text-xs font-bold text-[#54433A] shrink-0"
            htmlFor="member-ledger-switcher"
          >
            <Users className="w-4 h-4 text-[#174C37]" />
            <span>Switch Member:</span>
          </label>
          <select
            className="w-full sm:w-72 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] px-3 py-2 text-xs text-[#3D291F] font-semibold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden cursor-pointer"
            id="member-ledger-switcher"
            onChange={(e) => setSelectedMemberId(e.target.value)}
            value={selectedMemberId}
          >
            {members.map((option) => (
              <option key={option.id} value={option.id}>
                {option.full_name} (@{option.username}) · {option.status}
              </option>
            ))}
          </select>
          <button
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[40px]"
            type="submit"
          >
            Open Ledger
          </button>
        </form>
      </div>

      {/* Typed Notice Banner */}
      {notice && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold shadow-2xs animate-in fade-in duration-150 ${
            notice.variant === "error"
              ? "border border-[#F5C2C2] bg-[#FFF9F8] text-[#BA3C2A]"
              : "border border-[#174C37]/30 bg-white text-[#174C37]"
          }`}
          role={notice.variant === "error" ? "alert" : "status"}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {notice.variant === "error" ? (
              <AlertCircle
                aria-hidden="true"
                className="w-4 h-4 shrink-0 text-[#BA3C2A]"
              />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="w-4 h-4 shrink-0 text-[#174C37]"
              />
            )}
            <span>{notice.message}</span>
          </div>
        </div>
      )}

      {/* Member Hero Banner */}
      <section
        aria-labelledby="member-ledger-heading"
        className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-8 shadow-xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#174C37] uppercase tracking-wider">
              <span>Officer Member Ledger</span>
            </div>

            <h1
              className="text-xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight"
              id="member-ledger-heading"
            >
              Member Dues Ledger: {member.full_name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-[#E5DDD3] text-xs font-medium text-[#4F3E35]">
              <div>
                Member:{" "}
                <strong className="text-[#3D291F] font-bold">
                  {member.full_name}
                </strong>{" "}
                <span className="text-[#6B5D53]">(@{member.username})</span>
              </div>
              <span aria-hidden="true" className="text-[#B8ACA0]">
                ·
              </span>
              <div className="text-[#174C37] font-bold flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#174C37]" />
                <span className="capitalize">{member.status} Member</span>
              </div>
              {openTotal > 0 && !targetIsDuesExempt && (
                <>
                  <span aria-hidden="true" className="text-[#B8ACA0]">
                    ·
                  </span>
                  <div className="text-[#BA3C2A] font-bold">
                    Outstanding: {formatNaira(openTotal)}
                  </div>
                </>
              )}
            </div>
          </div>

          {targetIsDuesExempt && (
            <div className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 text-[#174C37] text-xs font-bold min-h-[46px] shadow-2xs shrink-0">
              <ShieldCheck className="w-4 h-4 text-[#174C37]" />
              <span>Club Admin Dues Exempt</span>
            </div>
          )}
        </div>
      </section>

      {/* Alert Banners */}
      {memberListError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>Could not load the full member list.</span>
        </div>
      )}

      {detailedDataError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>
            Could not load some dues details for this member. Some sections may
            be incomplete.
          </span>
        </div>
      )}

      {auditError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>Could not load the audit history for this member.</span>
        </div>
      )}

      {/* Workspace Tabs */}
      <nav
        aria-label="Member ledger sections"
        className="flex items-center gap-2 border-b border-[#E5DDD3] pb-2 overflow-x-auto"
      >
        <button
          className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shrink-0 ${
            activeTab === "overview"
              ? "bg-[#174C37] text-white shadow-2xs"
              : "text-[#54433A] hover:bg-[#FAF6F0] bg-white border border-[#E5DDD3]"
          }`}
          onClick={() => handleTabChange("overview")}
          type="button"
        >
          <Calendar className="w-4 h-4" />
          <span>Overview &amp; Record</span>
        </button>

        <button
          className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shrink-0 ${
            activeTab === "history"
              ? "bg-[#174C37] text-white shadow-2xs"
              : "text-[#54433A] hover:bg-[#FAF6F0] bg-white border border-[#E5DDD3]"
          }`}
          onClick={() => handleTabChange("history")}
          type="button"
        >
          <Receipt className="w-4 h-4" />
          <span>Payments &amp; Receipts</span>
        </button>

        <button
          className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shrink-0 ${
            activeTab === "audit"
              ? "bg-[#174C37] text-white shadow-2xs"
              : "text-[#54433A] hover:bg-[#FAF6F0] bg-white border border-[#E5DDD3]"
          }`}
          onClick={() => handleTabChange("audit")}
          type="button"
        >
          <Shield className="w-4 h-4" />
          <span>Audit Log</span>
        </button>
      </nav>

      {/* TAB 1: OVERVIEW & OFFICER RECORDING */}
      {activeTab === "overview" && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          <DuesSummaryCards
            clubTotalIncome={clubTotalIncome}
            isOfficer
            monthlyRate={currentMonthlyRate}
            nextMonthRate={
              nextRateObj
                ? {
                    effectiveMonth: nextRateObj.effective_month,
                    amount: Number(nextRateObj.monthly_amount_ngn),
                  }
                : null
            }
            openTotal={openTotal}
            paidMonthsCount={paidMonthsCount}
            totalPaidAmount={totalPaidAmount}
            unpaidMonthsCount={
              duesRows.filter((r) => r.status === "unpaid" || r.is_overdue)
                .length
            }
          />

          <OfficerDuesControlsCard
            availableMonths={availableMonths}
            canRecord={canRecord}
            canRecordForTarget={canRecordForTarget}
            canWriteOff={canWriteOff}
            memberId={member.id}
            memberName={member.full_name}
            monthlyRateNgn={currentMonthlyRate}
            pastUnpaidMonths={pastUnpaidMonths}
            recordBlockedReason={recordBlockedReason}
            returnTo={baseHref}
            today={today}
          />

          <DuesScheduleCard
            currentMonth={currentMonth}
            duesRows={duesRows}
            memberName={member.full_name}
            showPayActions={false}
          />
        </div>
      )}

      {/* TAB 2: MEMBER PAYMENTS & RECEIPTS */}
      {activeTab === "history" && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          <MyDuesRequestsCard
            requests={memberRequests}
            title={`${member.full_name}'s Submitted Requests`}
          />

          <DuesPaymentsHistoryCard
            baseHref={baseHref}
            canAttachReceipt={canAttachReceipt}
            canCorrect={canCorrect}
            coverageByPayment={coverageByPayment}
            members={members}
            pageSize={pageSize}
            paymentPage={paymentPage}
            payments={payments}
            returnUrl={`${baseHref}?tab=history`}
            targetMemberId={member.id}
            totalPaymentsCount={totalPaymentsCount}
          />
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === "audit" && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          <DuesAuditHistoryCard
            actorNames={actorNames}
            auditEntries={combinedAudit}
            auditPage={auditPage}
            baseHref={baseHref}
            pageSize={pageSize}
            tabParam="audit"
            targetMemberId={member.id}
            totalAuditCount={totalAuditCount}
          />
        </div>
      )}
    </div>
  );
}
