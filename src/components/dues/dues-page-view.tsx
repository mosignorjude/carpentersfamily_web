"use client";

import {
  AlertCircle,
  CreditCard,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
  DuesMemberOption,
  DuesMonthOption,
} from "@/app/(member)/dues/dues-forms";
import { clubBrand } from "@/lib/brand";
import { type AuditRow, DuesAuditHistoryCard } from "./dues-audit-history-card";
import {
  DuesPaymentsHistoryCard,
  type PaymentRow,
} from "./dues-payments-history-card";
import { DuesRateScheduleCard, type RateRow } from "./dues-rate-schedule-card";
import { DuesScheduleCard, type DuesScheduleRow } from "./dues-schedule-card";
import { DuesSummaryCards } from "./dues-summary-cards";
import { MyDuesRequestsCard } from "./my-dues-requests-card";
import {
  type DuesPaymentRequestItem,
  OfficerDuesApprovalsCard,
} from "./officer-dues-approvals-card";
import { OfficerDuesControlsCard } from "./officer-dues-controls-card";
import { type DuesPaymentSettings, PayDuesModal } from "./pay-dues-modal";
import {
  PreLaunchDuesReconciliationCard,
  type ReconciliationMember,
} from "./pre-launch-dues-reconciliation-card";

interface DuesPageViewProps {
  member: DuesMemberOption;
  isAdmin?: boolean;
  isOfficer: boolean;
  canRecord: boolean;
  canWriteOff: boolean;
  canCorrect: boolean;
  canChangeRate: boolean;
  members: DuesMemberOption[];
  targetMemberId: string;
  duesRows: DuesScheduleRow[];
  payments: PaymentRow[];
  rates: RateRow[];
  coverageByPayment: Map<string, string[]>;
  combinedAudit: AuditRow[];
  actorNames: Map<string, string>;
  clubTotalIncome: number | null;
  notice?: string;
  invalidSelection: boolean;
  roleError: boolean;
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
  viewerId?: string;
  viewerRoles?: string[];
  pendingRequests?: DuesPaymentRequestItem[];
  pendingMembersMap?: Record<
    string,
    { full_name: string; username: string; roles: string[] }
  >;
  ownRequests?: DuesPaymentRequestItem[];
  paymentSettings?: DuesPaymentSettings | null;
  reconciliationMembers?: ReconciliationMember[];
}

export function DuesPageView({
  member,
  isOfficer,
  canRecord,
  canWriteOff,
  canCorrect,
  canChangeRate,
  members,
  targetMemberId,
  duesRows,
  payments,
  rates,
  coverageByPayment,
  combinedAudit,
  actorNames,
  clubTotalIncome,
  notice: _notice,
  invalidSelection,
  roleError,
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
  isAdmin = false,
  viewerId,
  viewerRoles = [],
  pendingRequests = [],
  pendingMembersMap = {},
  ownRequests = [],
  paymentSettings,
  reconciliationMembers = [],
}: DuesPageViewProps) {
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  const paidRows = duesRows.filter((r) => r.status === "paid");
  const paidMonthsCount = paidRows.length;
  const standardMonthlyRate = 10000;
  const currentMonthlyRate =
    rates.length > 0
      ? Number(rates[rates.length - 1].monthly_amount_ngn) ||
        standardMonthlyRate
      : standardMonthlyRate;

  const totalPaidAmount = paidRows.reduce(
    (sum, r) => sum + (Number(r.amount_ngn) || standardMonthlyRate),
    0,
  );

  const nextRateObj =
    rates.find(
      (r) => r.effective_month.slice(0, 7) === nextMonth.slice(0, 7),
    ) ?? null;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 pb-12 font-sans antialiased text-[#3D291F]">
      {/* Main Dues Hero Banner */}
      <section
        aria-labelledby="dues-hero-heading"
        className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-8 shadow-xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#174C37] uppercase tracking-wider">
              <span>Club Treasury</span>
            </div>

            <h1
              className="text-xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight"
              id="dues-hero-heading"
            >
              {member.id === targetMemberId && !isOfficer
                ? "My Dues & Contributions"
                : `Member Dues: ${member.full_name}`}
            </h1>

            <p className="hidden sm:block text-xs sm:text-sm text-[#443A33] max-w-2xl leading-relaxed font-normal">
              Statutory monthly contributions supporting club governance, member
              welfare, benevolent grants, and official gatherings.
            </p>

            {/* Member Trust Metadata */}
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
              {isOfficer && (
                <>
                  <span aria-hidden="true" className="text-[#B8ACA0]">
                    ·
                  </span>
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider bg-[#0C3325] px-2.5 py-0.5 rounded shadow-2xs">
                    Officer View
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quick Action Station */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            {isAdmin ? (
              <div className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 text-[#174C37] text-xs font-bold min-h-[46px] shadow-2xs">
                <ShieldCheck className="w-4 h-4 text-[#174C37]" />
                <span>Admin Dues Exempt</span>
              </div>
            ) : (
              <button
                id="settle-dues-header-btn"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-xs cursor-pointer min-h-[46px]"
                onClick={() => setIsPayModalOpen(true)}
                type="button"
              >
                <CreditCard className="w-4 h-4 text-[#D6A23A]" />
                <span>Settle Dues / Payment Info</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <form
                action="/api/reports/dues"
                className="flex-1"
                method="post"
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="csv" />
                <button
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors cursor-pointer min-h-[38px] shadow-2xs"
                  type="submit"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#174C37]" />
                  <span>Dues CSV</span>
                </button>
              </form>

              <form
                action="/api/reports/dues"
                className="flex-1"
                method="post"
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="pdf" />
                <button
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors cursor-pointer min-h-[38px] shadow-2xs"
                  type="submit"
                >
                  <FileText className="w-3.5 h-3.5 text-[#BA3C2A]" />
                  <span>Dues PDF</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Admin Exemption Dignified Notice (hidden on mobile to prevent duplication with top badge) */}
      {isAdmin && (
        <div className="hidden sm:flex p-4 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 items-center gap-3 text-xs text-[#174C37] font-medium shadow-2xs">
          <ShieldCheck className="w-5 h-5 text-[#174C37] shrink-0" />
          <div>
            <strong className="font-bold block">
              Club Administrator Exemption
            </strong>
            <span>
              Club Administrators are exempt from statutory membership dues
              obligations under club financial policy. No dues obligations
              accrue for this account.
            </span>
          </div>
        </div>
      )}

      {invalidSelection && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>
            That member selection could not be verified. Your own dues are
            shown.
          </span>
        </div>
      )}

      {roleError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>
            Officer access could not be verified, so this page shows only your
            own records.
          </span>
        </div>
      )}

      {detailedDataError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>
            Dues details could not be verified. Some financial views or mutation
            forms may be temporarily unavailable.
          </span>
        </div>
      )}

      {auditError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>Dues audit history could not be verified or loaded.</span>
        </div>
      )}

      {/* Officer Member Switcher */}
      {isOfficer && (
        <section
          aria-labelledby="officer-picker-heading"
          className="bg-white rounded-xl border border-[#E5DDD3] p-5 shadow-xs"
        >
          <form
            action="/dues"
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
            method="get"
          >
            <div className="flex-1 space-y-1.5">
              <label
                className="flex items-center gap-2 text-xs font-extrabold text-[#3D291F] uppercase tracking-wider"
                htmlFor="officer-member-select"
                id="officer-picker-heading"
              >
                <Users className="w-4 h-4 text-[#174C37]" />
                <span>Review Individual Member Ledger</span>
              </label>
              <select
                className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] font-bold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden cursor-pointer"
                defaultValue={targetMemberId}
                id="officer-member-select"
                name="member_id"
              >
                {members.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.full_name} · @{option.username} · {option.status}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[40px]"
              type="submit"
            >
              Load Ledger
            </button>
          </form>

          {memberListError && (
            <p className="text-xs text-[#BA3C2A] mt-2 font-medium" role="alert">
              The full member roster could not be verified; only verified
              identities are loaded.
            </p>
          )}
        </section>
      )}

      {/* 4-Stat Metric Summary Strip */}
      <div id="dues-summary" className="scroll-target">
        <DuesSummaryCards
          clubTotalIncome={clubTotalIncome}
          isOfficer={isOfficer}
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
            duesRows.filter((r) => r.status === "unpaid" || r.is_overdue).length
          }
        />
      </div>

      {/* Officer Approvals Queue (Phase 4 Governance) */}
      {isOfficer && viewerId && (
        <div id="dues-approvals" className="scroll-target">
          <OfficerDuesApprovalsCard
            pendingMembersMap={pendingMembersMap}
            pendingRequests={pendingRequests}
            viewerId={viewerId}
            viewerRoles={viewerRoles}
          />
        </div>
      )}

      {/* Member Submitted Dues Payment Requests */}
      <div id="dues-requests" className="scroll-target">
        <MyDuesRequestsCard requests={ownRequests} />
      </div>

      {/* Eligible Months Dues Schedule */}
      <div id="dues-schedule" className="scroll-target">
        <DuesScheduleCard
          currentMonth={currentMonth}
          duesRows={duesRows}
          memberName={member.full_name}
          onOpenPayDuesModal={() => setIsPayModalOpen(true)}
        />
      </div>

      {/* Recorded Payment History */}
      <div id="dues-payments" className="scroll-target">
        <DuesPaymentsHistoryCard
          canCorrect={canCorrect}
          coverageByPayment={coverageByPayment}
          members={members}
          pageSize={pageSize}
          paymentPage={paymentPage}
          payments={payments}
          targetMemberId={targetMemberId}
          totalPaymentsCount={totalPaymentsCount}
        />
      </div>

      {/* Officer Treasury Controls (Mutations: Record Payment, Write-off) */}
      {isOfficer && (
        <div id="dues-controls" className="scroll-target">
          <OfficerDuesControlsCard
            availableMonths={availableMonths}
            canRecord={canRecord}
            canWriteOff={canWriteOff}
            memberId={targetMemberId}
            memberName={member.full_name}
            pastUnpaidMonths={pastUnpaidMonths}
            today={today}
          />
        </div>
      )}

      {/* Pre-Launch Dues Reconciliation Workspace (Feb-Sep 2026) */}
      {isOfficer && (
        <div id="dues-reconciliation" className="scroll-target">
          <PreLaunchDuesReconciliationCard
            isAdmin={Boolean(isAdmin)}
            members={reconciliationMembers}
          />
        </div>
      )}

      {/* Rate History & Admin Scheduling */}
      <div id="dues-rates" className="scroll-target">
        <DuesRateScheduleCard
          canChangeRate={canChangeRate}
          nextMonth={nextMonth}
          rates={rates}
        />
      </div>

      {/* Officer Audit Trail */}
      {isOfficer && (
        <div id="dues-audit" className="scroll-target">
          <DuesAuditHistoryCard
            actorNames={actorNames}
            auditEntries={combinedAudit}
            auditPage={auditPage}
            pageSize={pageSize}
            targetMemberId={targetMemberId}
            totalAuditCount={totalAuditCount}
          />
        </div>
      )}

      {/* Dignified Club Footer */}
      <footer className="pt-8 pb-6 border-t border-[#E5DDD3] text-xs text-[#54433A] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-bold text-[#3D291F]">
            {clubBrand.name} — {clubBrand.location}, Nigeria
          </p>
          <p className="text-xs text-[#54433A] mt-1">
            Private Members Portal · Nnebisi Road Secretariat · Est. 1988
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <Link
            className="text-[#174C37] font-bold hover:underline"
            href="/finances"
          >
            Club Finances
          </Link>
        </div>
      </footer>

      {/* Pay Dues Interactive Modal */}
      <PayDuesModal
        availableMonths={availableMonths}
        isAdmin={isAdmin}
        isOpen={isPayModalOpen}
        memberName={member.full_name}
        monthlyRateNgn={currentMonthlyRate}
        onClose={() => setIsPayModalOpen(false)}
        paymentSettings={paymentSettings}
        unpaidTotalNgn={openTotal}
      />
    </div>
  );
}
