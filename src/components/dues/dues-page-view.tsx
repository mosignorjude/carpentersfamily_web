"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Receipt,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
  DuesMemberOption,
  DuesMonthOption,
} from "@/app/(member)/dues/dues-forms";
import { clubBrand } from "@/lib/brand";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
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

type DuesTab = "overview" | "history" | "officer";

interface DuesPageViewProps {
  member: DuesMemberOption;
  isAdmin?: boolean;
  isDuesExempt?: boolean;
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
  initialTab?: string;
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
  notice,
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
  isDuesExempt = false,
  viewerId,
  viewerRoles = [],
  pendingRequests = [],
  pendingMembersMap = {},
  ownRequests = [],
  paymentSettings,
  reconciliationMembers = [],
  initialTab,
}: DuesPageViewProps) {
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isDownloadReportOpen, setIsDownloadReportOpen] = useState(false);
  useModalHygiene({
    isOpen: isDownloadReportOpen,
    onClose: () => setIsDownloadReportOpen(false),
  });

  const validTab: DuesTab =
    initialTab === "officer" && isOfficer
      ? "officer"
      : initialTab === "history"
        ? "history"
        : "overview";
  const [activeTab, setActiveTab] = useState<DuesTab>(validTab);

  const handleTabChange = (newTab: DuesTab) => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.replaceState({}, "", url.toString());
    }
  };

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
      {/* Notice Banner */}
      {notice && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-[#174C37]/30 bg-white px-4 py-3 text-xs sm:text-sm font-semibold text-[#174C37] shadow-2xs animate-in fade-in duration-150"
          role="status"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2
              aria-hidden="true"
              className="w-4 h-4 shrink-0 text-[#174C37]"
            />
            <span className="truncate">{notice}</span>
          </div>
        </div>
      )}

      {/* Main Dues Hero Banner */}
      <section
        aria-labelledby="dues-hero-heading"
        className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-8 shadow-xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#174C37] uppercase tracking-wider">
              <span>Club Treasury</span>
            </div>

            <h1
              className="text-xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight"
              id="dues-hero-heading"
            >
              {member.id === targetMemberId && !isOfficer
                ? "Member Dues"
                : `Member Dues: ${member.full_name}`}
            </h1>

            <p className="hidden sm:block text-xs sm:text-sm text-[#443A33] max-w-2xl leading-relaxed font-normal">
              Monthly contributions supporting club welfare, grants, and events.
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
            </div>
          </div>

          {/* Quick Action Station */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            {isDuesExempt ? (
              <div className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 text-[#174C37] text-xs font-bold min-h-[46px] shadow-2xs">
                <ShieldCheck className="w-4 h-4 text-[#174C37]" />
                <span>Club Admin Dues Exempt</span>
              </div>
            ) : (
              <button
                id="settle-dues-header-btn"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-xs cursor-pointer min-h-[46px]"
                onClick={() => setIsPayModalOpen(true)}
                type="button"
              >
                <CreditCard className="w-4 h-4 text-[#D6A23A]" />
                <span>Pay Dues</span>
              </button>
            )}

            <button
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors cursor-pointer min-h-[42px] shadow-2xs"
              onClick={() => setIsDownloadReportOpen(true)}
              type="button"
            >
              <Download className="w-4 h-4 text-[#174C37]" />
              <span>Download Report</span>
            </button>
          </div>
        </div>
      </section>

      {/* Download Report Modal */}
      {isDownloadReportOpen && (
        <div
          aria-labelledby="dues-report-modal-title"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
        >
          <button
            aria-label="Close modal overlay"
            className="fixed inset-0 cursor-default bg-transparent border-0"
            onClick={() => setIsDownloadReportOpen(false)}
            type="button"
          />
          <div className="relative z-10 bg-white w-full max-w-sm rounded-[22px] border border-[#E5DDD3] p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
              <h3
                className="text-lg font-bold text-[#231F1D] tracking-tight"
                id="dues-report-modal-title"
              >
                Download Dues Report
              </h3>
              <button
                aria-label="Close dialog"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#7A685D] hover:text-[#231F1D] hover:bg-[#FAF6F0] transition-colors cursor-pointer border-0 bg-transparent"
                onClick={() => setIsDownloadReportOpen(false)}
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#5C4638] leading-relaxed">
              Choose a format to download your dues schedule and payment
              records.
            </p>

            <div className="space-y-2.5 pt-1">
              <form
                action="/api/reports/dues"
                method="post"
                onSubmit={() => setIsDownloadReportOpen(false)}
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="pdf" />
                <button
                  className="w-full py-3 px-4 rounded-xl bg-[#174C37] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#103D2B] active:scale-[0.99] transition shadow-xs cursor-pointer border-0 min-h-[44px]"
                  type="submit"
                >
                  <FileText className="w-4 h-4 text-[#85B89A] shrink-0" />
                  <span>Full Dues Report (PDF)</span>
                </button>
              </form>

              <form
                action="/api/reports/dues"
                method="post"
                onSubmit={() => setIsDownloadReportOpen(false)}
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="csv" />
                <button
                  className="w-full py-3 px-4 rounded-xl border border-[#CFD5D0] bg-white text-[#231F1D] text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#FAF6F0] active:scale-[0.99] transition shadow-xs cursor-pointer min-h-[44px]"
                  type="submit"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#174C37] shrink-0" />
                  <span>Dues Schedule Ledger (CSV)</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Alert Notices */}
      {invalidSelection && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>Could not find that member. Showing your own dues.</span>
        </div>
      )}

      {roleError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>Could not verify officer access. Showing your own dues.</span>
        </div>
      )}

      {detailedDataError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>
            Could not load dues details. Some features may be temporarily
            unavailable.
          </span>
        </div>
      )}

      {auditError && (
        <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-bold text-[#BA3C2A] flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
          <span>Could not load the audit history.</span>
        </div>
      )}

      {/* Officer Member Switcher (Compact Toolbar) */}
      {isOfficer && (
        <section
          aria-labelledby="officer-picker-heading"
          className="bg-white rounded-2xl border border-[#E5DDD3] p-3.5 sm:p-4 shadow-2xs"
        >
          <form
            action="/dues"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            method="get"
          >
            <input name="tab" type="hidden" value={activeTab} />
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2.5">
              <label
                className="flex items-center gap-2 text-xs font-bold text-[#3D291F] shrink-0"
                htmlFor="officer-member-select"
                id="officer-picker-heading"
              >
                <Users className="w-4 h-4 text-[#174C37]" />
                <span>Viewing Member:</span>
              </label>
              <select
                className="w-full sm:max-w-md rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] px-3 py-2 text-xs text-[#3D291F] font-semibold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden cursor-pointer"
                defaultValue={targetMemberId}
                id="officer-member-select"
                name="member_id"
              >
                {members.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.full_name} (@{option.username}) · {option.status}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[44px] sm:min-h-[38px]"
              type="submit"
            >
              View Member
            </button>
          </form>

          {memberListError && (
            <p className="text-xs text-[#BA3C2A] mt-2 font-medium" role="alert">
              Could not load the full member list. Only confirmed members are
              shown.
            </p>
          )}
        </section>
      )}

      {/* Workspace Tabs Navigation Bar */}
      <nav
        aria-label="Dues sections"
        className="flex items-center gap-2 border-b border-[#E5DDD3] pb-2 overflow-x-auto"
      >
        <button
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shrink-0 ${
            activeTab === "overview"
              ? "bg-[#174C37] text-white shadow-2xs"
              : "text-[#54433A] hover:bg-[#FAF6F0] bg-white border border-[#E5DDD3]"
          }`}
          onClick={() => handleTabChange("overview")}
          type="button"
        >
          <Calendar className="w-4 h-4" />
          <span>Overview &amp; Schedule</span>
        </button>

        <button
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shrink-0 ${
            activeTab === "history"
              ? "bg-[#174C37] text-white shadow-2xs"
              : "text-[#54433A] hover:bg-[#FAF6F0] bg-white border border-[#E5DDD3]"
          }`}
          onClick={() => handleTabChange("history")}
          type="button"
        >
          <Receipt className="w-4 h-4" />
          <span>Receipts &amp; Submissions</span>
          {ownRequests.filter((r) => r.status === "pending").length > 0 && (
            <span className="w-2 h-2 rounded-full bg-[#D6A23A]" />
          )}
        </button>

        {isOfficer && (
          <button
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shrink-0 ${
              activeTab === "officer"
                ? "bg-[#174C37] text-white shadow-2xs"
                : "text-[#54433A] hover:bg-[#FAF6F0] bg-white border border-[#E5DDD3]"
            }`}
            onClick={() => handleTabChange("officer")}
            type="button"
          >
            <Shield className="w-4 h-4" />
            <span>Officer Treasury</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-[#D6A23A] text-[#3D291F]">
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}
      </nav>

      {/* TAB 1: OVERVIEW & SCHEDULE */}
      {activeTab === "overview" && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          {/* 4-Stat Metric Summary Strip */}
          <div className="scroll-target" id="dues-summary">
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
                duesRows.filter((r) => r.status === "unpaid" || r.is_overdue)
                  .length
              }
            />
          </div>

          {/* Actionable Outstanding Balance Alert */}
          {openTotal > 0 && !isDuesExempt && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#FFF9F8] border border-[#F5C2C2] text-xs shadow-2xs">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0" />
                <span className="text-[#3D291F] font-medium">
                  You have an outstanding balance of{" "}
                  <strong className="font-mono font-bold text-[#BA3C2A]">
                    {formatNaira(openTotal)}
                  </strong>
                  . Settle now to keep your club welfare active.
                </span>
              </div>
              <button
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#BA3C2A] text-white text-xs font-bold hover:bg-[#a33222] transition-colors shadow-2xs cursor-pointer min-h-[38px] shrink-0"
                onClick={() => setIsPayModalOpen(true)}
                type="button"
              >
                <CreditCard className="w-3.5 h-3.5 text-white" />
                <span>Pay Balance</span>
              </button>
            </div>
          )}

          {/* Monthly Dues Schedule (Dual-Responsive) */}
          <div className="scroll-target" id="dues-schedule">
            <DuesScheduleCard
              currentMonth={currentMonth}
              duesRows={duesRows}
              memberName={member.full_name}
              onOpenPayDuesModal={() => setIsPayModalOpen(true)}
            />
          </div>
        </div>
      )}

      {/* TAB 2: RECEIPTS & SUBMISSIONS */}
      {activeTab === "history" && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          {/* Member Submitted Dues Payment Requests */}
          <div className="scroll-target" id="dues-requests">
            <MyDuesRequestsCard requests={ownRequests} />
          </div>

          {/* Recorded Payment History */}
          <div className="scroll-target" id="dues-payments">
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
        </div>
      )}

      {/* TAB 3: OFFICER TREASURY (Gated by isOfficer) */}
      {activeTab === "officer" && isOfficer && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          {/* Officer Approvals Queue */}
          {viewerId && (
            <div className="scroll-target" id="dues-approvals">
              <OfficerDuesApprovalsCard
                pendingMembersMap={pendingMembersMap}
                pendingRequests={pendingRequests}
                viewerId={viewerId}
                viewerRoles={viewerRoles}
              />
            </div>
          )}

          {/* Officer Treasury Controls (Record Payment, Write-off) */}
          <div className="scroll-target" id="dues-controls">
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

          {/* Pre-Launch Dues Reconciliation Workspace (Feb-Sep 2026) */}
          <div className="scroll-target" id="dues-reconciliation">
            <PreLaunchDuesReconciliationCard
              isAdmin={Boolean(isAdmin)}
              members={reconciliationMembers}
            />
          </div>

          {/* Rate History & Admin Scheduling */}
          <div className="scroll-target" id="dues-rates">
            <DuesRateScheduleCard
              canChangeRate={canChangeRate}
              nextMonth={nextMonth}
              rates={rates}
            />
          </div>

          {/* Officer Audit Trail */}
          <div className="scroll-target" id="dues-audit">
            <DuesAuditHistoryCard
              actorNames={actorNames}
              auditEntries={combinedAudit}
              auditPage={auditPage}
              pageSize={pageSize}
              targetMemberId={targetMemberId}
              totalAuditCount={totalAuditCount}
            />
          </div>
        </div>
      )}

      {/* Dignified Club Footer */}
      <footer className="pt-6 pb-6 border-t border-[#E5DDD3] space-y-4 text-xs text-[#54433A]">
        {isDuesExempt && (
          <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-[11px] text-[#54433A]">
            <strong className="text-[#3D291F]">
              Club Admin Dues Exemption Policy:
            </strong>{" "}
            Club Admins do not pay monthly dues while serving. Exempted dues
            return when the role is withdrawn unless recorded separately by an
            officer.
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          <div>
            <p className="font-bold text-[#3D291F]">
              {clubBrand.name} — {clubBrand.location}, Nigeria
            </p>
            <p className="text-xs text-[#54433A] mt-1">
              Private Members Portal · Fobbs Apartment, Michael Fidelis Nwaefulu
              Street, GRA Phase 1, Asaba
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
        </div>
      </footer>

      {/* Pay Dues Interactive Modal */}
      <PayDuesModal
        availableMonths={availableMonths}
        isAdmin={isDuesExempt}
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
