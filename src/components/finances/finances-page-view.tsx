"use client";

import {
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  MinusCircle,
  PlusCircle,
  Settings2,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
  FinanceCategory,
  FinanceTransaction,
} from "@/app/(member)/finances/finance-forms";
import { voidRecordAction } from "@/app/actions";
import {
  ClubBankSettingsCard,
  type ClubPaymentSettings,
} from "@/components/admin/club-bank-settings-card";
import { VoidRecordModal } from "@/components/common/void-record-modal";
import { AiSummaryPanel } from "@/components/reports/ai-summary-panel";
import { dispatchFlashCard } from "@/components/ui/flash-card";
import { useSuccessNotice } from "@/components/ui/use-success-notice";
import {
  clearSubmissionDraftKey,
  createSubmissionKey,
  getSessionStorageSafe,
} from "@/lib/finance-idempotency.mjs";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import { CategoryManagementModal } from "./category-management-modal";
import { ClubFinancialSummary } from "./club-financial-summary";
import { ClubTransactionLedger } from "./club-transaction-ledger";
import { CorrectTransactionModal } from "./correct-transaction-modal";
import {
  type EventLedgerEntry,
  EventLedgerSection,
} from "./event-ledger-section";
import {
  type FinanceAuditRow,
  OfficerAuditHistory,
} from "./officer-audit-history";
import {
  OpeningBalanceEntryCard,
  type OpeningBalanceTransaction,
} from "./opening-balance-entry-card";
import { type FinanceReceipt, ReceiptModal } from "./receipt-modal";
import { RecordExpenseModal } from "./record-expense-modal";
import { RecordIncomeModal } from "./record-income-modal";

interface FinancesPageViewProps {
  isAdmin?: boolean;
  aiEnabled?: boolean;
  paymentSettings?: ClubPaymentSettings | null;
  existingOpeningBalance?: OpeningBalanceTransaction | null;
  isOfficer: boolean;
  canCorrect: boolean;
  today: string;
  summary: {
    balance?: number | string | null;
    dues_income?: number | string | null;
    other_income?: number | string | null;
    expenses?: number | string | null;
    event_inflow?: number | string | null;
    event_outflow?: number | string | null;
  } | null;
  openingBalanceTotal?: number;
  postLaunchDues?: number;
  preLaunchDues?: number;
  financeUnavailable: boolean;
  categoryUnavailable: boolean;
  receiptUnavailable: boolean;
  auditError: boolean;
  roleError: boolean;
  notice?: string;
  transactions: FinanceTransaction[];
  receiptsByTransaction: Map<string, FinanceReceipt[]>;
  categories: FinanceCategory[];
  eventLedgerEntries: EventLedgerEntry[];
  eventTitles: Map<string, string>;
  auditRows: FinanceAuditRow[];
  actorNames: Map<string, string>;
  page: number;
  pageCount: number;
  transactionCount: number;
  auditPage: number;
  auditPageCount: number;
  auditCount: number;
  pageSize: number;
  auditPageSize?: number;
  initialTab?: "ledger" | "events" | "setup";
}

export function FinancesPageView({
  isAdmin = false,
  aiEnabled = false,
  paymentSettings,
  existingOpeningBalance,
  isOfficer,
  canCorrect,
  today,
  summary,
  openingBalanceTotal = 0,
  postLaunchDues = 0,
  preLaunchDues = 0,
  financeUnavailable,
  categoryUnavailable,
  receiptUnavailable,
  auditError,
  roleError,
  notice: _notice,
  transactions,
  receiptsByTransaction,
  categories,
  eventLedgerEntries,
  eventTitles,
  auditRows,
  actorNames,
  page,
  pageCount,
  transactionCount,
  auditPage,
  auditPageCount,
  auditCount,
  pageSize,
  auditPageSize = 20,
  initialTab = "ledger",
}: FinancesPageViewProps) {
  const [activeTab, setActiveTab] = useState<"ledger" | "events" | "setup">(
    initialTab === "setup" && isOfficer
      ? "setup"
      : initialTab === "events"
        ? "events"
        : "ledger",
  );
  const switchTab = (nextTab: "ledger" | "events" | "setup") => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "ledger") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  };
  const [isRecordIncomeOpen, setIsRecordIncomeOpen] = useState(false);
  const [isRecordExpenseOpen, setIsRecordExpenseOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDownloadReportOpen, setIsDownloadReportOpen] = useState(false);
  const [includeAiInPdf, setIncludeAiInPdf] = useState(true);
  useModalHygiene({
    isOpen: isDownloadReportOpen,
    onClose: () => setIsDownloadReportOpen(false),
  });

  const [correctingTransaction, setCorrectingTransaction] =
    useState<FinanceTransaction | null>(null);
  const [voidingTransaction, setVoidingTransaction] =
    useState<FinanceTransaction | null>(null);
  const [receiptViewingTransaction, setReceiptViewingTransaction] =
    useState<FinanceTransaction | null>(null);

  // Generate dynamic client idempotency keys and refresh after mutations
  const [incomeIdempotencyKey, setIncomeIdempotencyKey] = useState(() =>
    createSubmissionKey(),
  );
  const [expenseIdempotencyKey, setExpenseIdempotencyKey] = useState(() =>
    createSubmissionKey(),
  );

  // Close open modals and rotate idempotency keys only when an action succeeds.
  useSuccessNotice(() => {
    const storage = getSessionStorageSafe();
    clearSubmissionDraftKey({ storage, scopeKey: "club:income" });
    clearSubmissionDraftKey({ storage, scopeKey: "club:expense" });
    setIsRecordIncomeOpen(false);
    setIsRecordExpenseOpen(false);
    setIsCategoryModalOpen(false);
    setCorrectingTransaction(null);
    setVoidingTransaction(null);
    setIncomeIdempotencyKey(createSubmissionKey());
    setExpenseIdempotencyKey(createSubmissionKey());
  });

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-150">
      {/* Page Header & Action Bar */}
      <header className="pb-5 border-b border-[#E5DDD3] flex flex-col 2xl:flex-row 2xl:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-1.5 max-w-2xl min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight leading-tight">
            Club Finances
          </h1>

          <p className="text-sm text-[#5C4638] leading-relaxed font-normal">
            Club balances, recorded income, and verified expenses.
          </p>
        </div>

        {/* Action Station — Single Primary CTA + Structured Secondary Actions */}
        <div
          className={
            isOfficer
              ? "grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 min-w-0 self-stretch sm:self-auto 2xl:justify-end"
              : "flex items-center gap-2 min-w-0 self-stretch sm:self-auto 2xl:justify-end"
          }
        >
          {isOfficer && (
            <>
              <button
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-[10px] bg-[#174C37] text-white text-xs sm:text-[13px] font-bold hover:bg-[#103D2B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-[44px] whitespace-nowrap shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1"
                disabled={financeUnavailable}
                id="officer-record-income-btn"
                onClick={() => setIsRecordIncomeOpen(true)}
                type="button"
              >
                <PlusCircle className="w-4 h-4 text-[#D6A23A] shrink-0" />
                <span>Record Income</span>
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-[10px] border border-[#BA3C2A]/35 bg-white text-[#BA3C2A] text-xs sm:text-[13px] font-bold hover:bg-[#FDF2F0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-[44px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA3C2A] focus-visible:ring-offset-1"
                disabled={financeUnavailable}
                id="officer-record-expense-btn"
                onClick={() => setIsRecordExpenseOpen(true)}
                type="button"
              >
                <MinusCircle className="w-4 h-4 shrink-0" />
                <span>Record Expense</span>
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-[10px] border border-[#E5DDD3] bg-white text-[#3D291F] text-xs sm:text-[13px] font-bold hover:bg-[#FAF6F0] transition-colors cursor-pointer min-h-[44px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1"
                id="officer-manage-categories-btn"
                onClick={() => setIsCategoryModalOpen(true)}
                type="button"
              >
                <Settings2 className="w-4 h-4 text-[#174C37] shrink-0" />
                <span>Manage Categories</span>
              </button>
            </>
          )}
          <button
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-xs sm:text-[13px] font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1 ${
              isOfficer
                ? "border border-[#E5DDD3] bg-white text-[#174C37] hover:bg-[#FAF6F0]"
                : "w-full sm:w-auto bg-[#174C37] text-white hover:bg-[#103D2B] shadow-2xs"
            }`}
            onClick={() => setIsDownloadReportOpen(true)}
            type="button"
          >
            <Download
              className={`w-4 h-4 shrink-0 ${
                isOfficer ? "text-[#174C37]" : "text-[#D6A23A]"
              }`}
            />
            <span>Download Report</span>
          </button>
        </div>
      </header>

      {isDownloadReportOpen && (
        <div
          aria-labelledby="finance-report-modal-title"
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
          <div className="relative z-10 bg-white w-full max-w-sm rounded-xl border border-[#E5DDD3] p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
              <h3
                className="text-lg font-bold text-[#3D291F] tracking-tight"
                id="finance-report-modal-title"
              >
                Download Finance Report
              </h3>
              <button
                aria-label="Close dialog"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#5C4638] hover:text-[#3D291F] hover:bg-[#FAF6F0] transition-colors cursor-pointer border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37]"
                onClick={() => setIsDownloadReportOpen(false)}
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[#5C4638] leading-relaxed">
              Select a format to export the audited club treasury summary and
              transaction ledger.
            </p>

            {aiEnabled && (
              <label className="flex items-center gap-2 min-h-[44px] px-1 text-xs text-[#5C4638] cursor-pointer select-none">
                <input
                  checked={includeAiInPdf}
                  className="w-4 h-4 accent-[#174C37]"
                  onChange={(e) => setIncludeAiInPdf(e.target.checked)}
                  type="checkbox"
                />
                <span>Include approved AI summary in PDF (when available)</span>
              </label>
            )}

            <div className="space-y-2.5 pt-1">
              <form
                action="/api/reports/finances"
                method="post"
                onSubmit={() => setIsDownloadReportOpen(false)}
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="pdf" />
                <input
                  name="includeAi"
                  type="hidden"
                  value={includeAiInPdf ? "true" : "false"}
                />
                <button
                  className="w-full py-3 px-4 rounded-[10px] bg-[#174C37] text-white text-sm font-semibold flex items-center justify-between hover:bg-[#103D2B] active:scale-[0.99] transition shadow-xs cursor-pointer border-0 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1"
                  type="submit"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-[#D6A23A] shrink-0" />
                    <span>Full Audit Report (PDF)</span>
                  </div>
                  <span className="text-xs bg-[#103D2B] px-2 py-0.5 rounded text-white/90 font-mono">
                    PDF
                  </span>
                </button>
              </form>

              <form
                action="/api/reports/finances"
                method="post"
                onSubmit={() => setIsDownloadReportOpen(false)}
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="csv" />
                <button
                  className="w-full py-3 px-4 rounded-[10px] border border-[#E5DDD3] bg-white text-[#3D291F] text-sm font-semibold flex items-center justify-between hover:bg-[#FAF6F0] active:scale-[0.99] transition shadow-2xs cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1"
                  type="submit"
                >
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="w-4 h-4 text-[#174C37] shrink-0" />
                    <span>Transaction Ledger (CSV)</span>
                  </div>
                  <span className="text-xs bg-[#FAF6F0] text-[#5C4638] px-2 py-0.5 rounded font-mono border border-[#E5DDD3]">
                    CSV
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {roleError && (
        <div
          className="p-4 rounded-xl border border-[#EED7A1] bg-[#FDF8EE] text-[#D6A23A] text-xs font-medium flex items-center gap-3"
          role="status"
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            Officer privileges could not be verified. You can still view shared
            records, but no officer actions or audit history are shown.
          </span>
        </div>
      )}

      {/* 1. Consolidated Financial Summary Strip */}
      <div id="finance-summary" className="scroll-target">
        <ClubFinancialSummary
          currentBalance={summary?.balance}
          duesIncome={summary?.dues_income}
          eventInflow={summary?.event_inflow}
          eventOutflow={summary?.event_outflow}
          isUnavailable={financeUnavailable}
          openingBalanceTotal={openingBalanceTotal}
          otherIncome={summary?.other_income}
          postLaunchDues={postLaunchDues}
          preLaunchDues={preLaunchDues}
          totalExpenses={summary?.expenses}
        />
      </div>

      {/* Workspace Underline Tabs */}
      <div
        aria-label="Club finance sections"
        className="flex items-center gap-1 sm:gap-2 border-b border-[#E5DDD3] overflow-x-auto"
        role="tablist"
      >
        <button
          aria-selected={activeTab === "ledger"}
          className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] ${
            activeTab === "ledger"
              ? "border-[#174C37] text-[#174C37]"
              : "border-transparent text-[#5C4638] hover:text-[#3D291F]"
          }`}
          onClick={() => switchTab("ledger")}
          role="tab"
          type="button"
        >
          <span>Club Ledger</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-mono tabular-nums ${
              activeTab === "ledger"
                ? "bg-[#174C37]/10 text-[#174C37]"
                : "bg-white text-[#5C4638] border border-[#E5DDD3]"
            }`}
          >
            {transactionCount}
          </span>
        </button>

        <button
          aria-selected={activeTab === "events"}
          className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] ${
            activeTab === "events"
              ? "border-[#174C37] text-[#174C37]"
              : "border-transparent text-[#5C4638] hover:text-[#3D291F]"
          }`}
          onClick={() => switchTab("events")}
          role="tab"
          type="button"
        >
          <span>Event Cash Posts</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-mono tabular-nums ${
              activeTab === "events"
                ? "bg-[#174C37]/10 text-[#174C37]"
                : "bg-white text-[#5C4638] border border-[#E5DDD3]"
            }`}
          >
            {eventLedgerEntries.length}
          </span>
        </button>

        {isOfficer && (
          <button
            aria-selected={activeTab === "setup"}
            className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] ${
              activeTab === "setup"
                ? "border-[#174C37] text-[#174C37]"
                : "border-transparent text-[#5C4638] hover:text-[#3D291F]"
            }`}
            onClick={() => switchTab("setup")}
            role="tab"
            type="button"
          >
            <span>Treasury Setup &amp; Audit</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-mono tabular-nums ${
                activeTab === "setup"
                  ? "bg-[#174C37]/10 text-[#174C37]"
                  : "bg-white text-[#5C4638] border border-[#E5DDD3]"
              }`}
            >
              {auditCount}
            </span>
          </button>
        )}
      </div>

      {/* Active Tab Panel */}
      <div role="tabpanel">
        {activeTab === "ledger" && (
          <div id="finance-ledger" className="scroll-target">
            <ClubTransactionLedger
              canCorrect={canCorrect}
              financeUnavailable={financeUnavailable}
              isOfficer={isOfficer}
              onInitiateCorrect={(txn) => setCorrectingTransaction(txn)}
              onInitiateVoid={(txn) => setVoidingTransaction(txn)}
              onViewReceipt={(txn) => setReceiptViewingTransaction(txn)}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              receiptsByTransaction={receiptsByTransaction}
              transactionCount={transactionCount}
              transactions={transactions}
            />
          </div>
        )}

        {activeTab === "events" && (
          <div id="finance-event-ledger" className="scroll-target">
            <EventLedgerSection
              entries={eventLedgerEntries}
              eventTitles={eventTitles}
              isUnavailable={financeUnavailable}
            />
          </div>
        )}

        {isOfficer && activeTab === "setup" && (
          <section
            aria-label="Treasury Setup & Audit"
            className="space-y-6"
            id="finance-controls"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ClubBankSettingsCard
                isAdmin={isAdmin}
                paymentSettings={paymentSettings}
              />
              <OpeningBalanceEntryCard
                canRecord={isAdmin}
                existingOpeningBalance={existingOpeningBalance}
                today={today}
              />
            </div>

            {isOfficer && aiEnabled && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#3D291F]">
                    Treasury AI Narrative &amp; Reporting
                  </h2>
                  <Link
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-white border border-[#E5DDD3] text-xs font-bold text-[#174C37] hover:bg-[#FAF6F0] transition-colors min-h-[44px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37]"
                    href="/officers/reports"
                  >
                    <span>Open AI Reports Centre</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  </Link>
                </div>
                <AiSummaryPanel
                  aiEnabled={aiEnabled}
                  reportType="club_finance"
                  title="Club Finance AI Summary"
                />
              </div>
            )}

            <div id="finance-audit" className="scroll-target">
              <OfficerAuditHistory
                actorNames={actorNames}
                auditCount={auditCount}
                auditError={auditError}
                auditPage={auditPage}
                auditPageCount={auditPageCount}
                auditRows={auditRows}
                pageSize={auditPageSize}
              />
            </div>
          </section>
        )}
      </div>

      {/* Footer Policy & Credentials */}
      <footer className="pt-6 pb-4 border-t border-[#E5DDD3] space-y-4 text-xs text-[#5C4638]">
        <details className="bg-white rounded-xl border border-[#E5DDD3] px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs text-[#5C4638] shadow-2xs group">
          <summary className="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none select-none min-h-[44px] py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] rounded-[10px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#174C37]" />
              </div>
              <span className="font-bold text-[#3D291F] leading-snug">
                Financial Privacy &amp; Transparency
              </span>
            </div>
            <span className="text-xs font-semibold text-[#174C37] group-open:hidden shrink-0 whitespace-nowrap">
              View Policy ▾
            </span>
            <span className="text-xs font-semibold text-[#5C4638] hidden group-open:inline shrink-0 whitespace-nowrap">
              Hide ▴
            </span>
          </summary>
          <div className="mt-2 pt-2.5 border-t border-[#E5DDD3] space-y-2 animate-in fade-in duration-150 text-[#5C4638] leading-relaxed">
            <p>
              Members can review recorded club income and expenses. Individual
              member dues records and personal payment histories remain strictly
              private to each member and authorized club officers.
            </p>
          </div>
        </details>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="space-y-0.5">
            <p className="font-bold text-[#3D291F]">
              Carpenters Family Social Club — Asaba, Delta State, Nigeria
            </p>
            <p className="text-xs text-[#5C4638]">
              Private Members Portal · Fobbs Apartment, Michael Fidelis Nwaefulu
              Street, GRA Phase 1, Asaba
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <Link
              className="inline-flex items-center min-h-[44px] text-[#174C37] font-bold hover:underline whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] rounded"
              href="/dues"
            >
              Member Dues &amp; Contributions
            </Link>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <RecordIncomeModal
        canBackdate={canCorrect}
        existingTransactions={transactions}
        idempotencyKey={incomeIdempotencyKey}
        isOpen={isRecordIncomeOpen}
        onClose={() => setIsRecordIncomeOpen(false)}
        today={today}
      />

      <RecordExpenseModal
        canBackdate={canCorrect}
        categories={categories}
        existingTransactions={transactions}
        idempotencyKey={expenseIdempotencyKey}
        isOpen={isRecordExpenseOpen}
        onClose={() => setIsRecordExpenseOpen(false)}
        today={today}
        categoryUnavailable={categoryUnavailable}
      />

      <CategoryManagementModal
        categories={categories}
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />

      <CorrectTransactionModal
        categories={categories}
        isOpen={Boolean(correctingTransaction)}
        onClose={() => setCorrectingTransaction(null)}
        today={today}
        transaction={correctingTransaction}
      />

      <VoidRecordModal
        isOpen={Boolean(voidingTransaction)}
        onClose={() => setVoidingTransaction(null)}
        onConfirmVoid={async (record, reason) => {
          const res = await voidRecordAction({
            entityType: "club_transaction",
            recordId: record.id,
            reason,
          });
          if (res && !res.success) {
            return res;
          }
          dispatchFlashCard({
            type: "success",
            title: "Transaction Voided",
            message: `${record.title} has been voided from the club ledger.`,
          });
          setVoidingTransaction(null);
          return { success: true };
        }}
        record={
          voidingTransaction
            ? {
                id: voidingTransaction.id,
                entityType: "club_transaction",
                title:
                  voidingTransaction.description ||
                  voidingTransaction.category_name_snapshot ||
                  "Club Transaction",
                amountNgn: Number(voidingTransaction.amount_ngn) || 0,
                reference: voidingTransaction.id.slice(0, 8),
                party: voidingTransaction.payer_payee || undefined,
                verificationStatus: voidingTransaction.voided_at
                  ? "cancelled"
                  : "approved",
              }
            : null
        }
        userRoles={isAdmin ? ["admin"] : isOfficer ? ["officer"] : []}
      />

      <ReceiptModal
        isOpen={Boolean(receiptViewingTransaction)}
        isOfficer={isOfficer}
        onClose={() => setReceiptViewingTransaction(null)}
        receiptUnavailable={receiptUnavailable}
        receipts={
          receiptViewingTransaction
            ? (receiptsByTransaction.get(receiptViewingTransaction.id) ?? [])
            : []
        }
        transaction={receiptViewingTransaction}
      />
    </div>
  );
}
