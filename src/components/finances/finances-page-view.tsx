"use client";

import { FileSpreadsheet, FileText, Shield, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
  FinanceCategory,
  FinanceTransaction,
} from "@/app/(member)/finances/finance-forms";
import {
  ClubBankSettingsCard,
  type ClubPaymentSettings,
} from "@/components/admin/club-bank-settings-card";
import { useSuccessNotice } from "@/components/ui/use-success-notice";
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
import { OfficerFinanceControls } from "./officer-finance-controls";
import {
  OpeningBalanceEntryCard,
  type OpeningBalanceTransaction,
} from "./opening-balance-entry-card";
import { type FinanceReceipt, ReceiptModal } from "./receipt-modal";
import { RecordExpenseModal } from "./record-expense-modal";
import { RecordIncomeModal } from "./record-income-modal";
import { VoidTransactionModal } from "./void-transaction-modal";

interface FinancesPageViewProps {
  isAdmin?: boolean;
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
  } | null;
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
}

export function FinancesPageView({
  isAdmin = false,
  paymentSettings,
  existingOpeningBalance,
  isOfficer,
  canCorrect,
  today,
  summary,
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
}: FinancesPageViewProps) {
  const [isRecordIncomeOpen, setIsRecordIncomeOpen] = useState(false);
  const [isRecordExpenseOpen, setIsRecordExpenseOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const [correctingTransaction, setCorrectingTransaction] =
    useState<FinanceTransaction | null>(null);
  const [voidingTransaction, setVoidingTransaction] =
    useState<FinanceTransaction | null>(null);
  const [receiptViewingTransaction, setReceiptViewingTransaction] =
    useState<FinanceTransaction | null>(null);

  // Generate dynamic client idempotency keys and refresh after mutations
  const [incomeIdempotencyKey, setIncomeIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [expenseIdempotencyKey, setExpenseIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  // Close open modals and rotate idempotency keys only when an action succeeds.
  useSuccessNotice(() => {
    setIsRecordIncomeOpen(false);
    setIsRecordExpenseOpen(false);
    setIsCategoryModalOpen(false);
    setCorrectingTransaction(null);
    setVoidingTransaction(null);
    setIncomeIdempotencyKey(crypto.randomUUID());
    setExpenseIdempotencyKey(crypto.randomUUID());
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-150">
      {/* Hero Header */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#174C37]">
                Club Treasury
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              Club Finances & Institutional Ledger
            </h1>

            <p className="text-xs sm:text-sm text-[#443A33] leading-relaxed font-normal">
              Shared club-level financial ledger. Members can review
              consolidated club income, institutional balances, and verified
              disbursements.
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-[#E5DDD3] text-xs font-medium text-[#4F3E35]">
              <div>
                Access:{" "}
                <strong className="text-[#3D291F] font-bold">
                  General Assembly Ledger
                </strong>
              </div>
              <span aria-hidden="true" className="text-[#B8ACA0]">
                ·
              </span>
              <div className="text-[#174C37] font-bold">
                {isOfficer
                  ? "Officer Management Desk Active"
                  : "Member Verification Active"}
              </div>
            </div>
          </div>

          {/* Quick Action Station */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 self-stretch sm:self-auto">
            <div className="bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3] text-right">
              <span className="text-[10px] text-[#7A685D] block uppercase font-bold tracking-wider">
                Ledger Status
              </span>
              <span className="text-xs font-bold text-[#174C37] block">
                Audited &amp; Reconciled
              </span>
            </div>

            <div className="flex items-center gap-2">
              <form
                action="/api/reports/finances"
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
                  <span>Finance CSV</span>
                </button>
              </form>

              <form
                action="/api/reports/finances"
                className="flex-1"
                method="post"
                rel="noopener"
                target="_blank"
              >
                <input name="format" type="hidden" value="pdf" />
                <button
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors cursor-pointer min-h-[38px] shadow-2xs"
                  type="submit"
                >
                  <FileText className="w-3.5 h-3.5 text-[#D6A23A]" />
                  <span>Finance PDF</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Privacy & Shared Ledger Mandate Banner */}
        <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-start gap-3">
          <Shield className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-[#3D291F] font-bold">
              Privacy & Shared Ledger Mandate:{" "}
            </strong>
            <span>
              Members can review recorded club income and expenses, including
              payer or payee details. Individual dues records stay private to
              the member and authorized officers.
            </span>
          </div>
        </div>
      </section>

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
          isUnavailable={financeUnavailable}
          otherIncome={summary?.other_income}
          totalExpenses={summary?.expenses}
        />
      </div>

      {/* 2. Officer-Only Treasury Controls & Settlement Governance */}
      {isOfficer && !financeUnavailable && (
        <section aria-label="Officer Treasury Governance" className="space-y-6">
          <div id="finance-controls" className="scroll-target">
            <OfficerFinanceControls
              canCorrect={canCorrect}
              isOfficer={isOfficer}
              onOpenCategoryManagement={() => setIsCategoryModalOpen(true)}
              onOpenRecordExpense={() => setIsRecordExpenseOpen(true)}
              onOpenRecordIncome={() => setIsRecordIncomeOpen(true)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ClubBankSettingsCard
              isAdmin={isAdmin}
              paymentSettings={paymentSettings}
            />
            <OpeningBalanceEntryCard
              canRecord={isAdmin}
              existingOpeningBalance={existingOpeningBalance}
            />
          </div>
        </section>
      )}

      {/* 3. Member-Visible Transaction Ledger */}
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

      {/* 4. Event Ledger Posts & Reversals */}
      <div id="finance-event-ledger" className="scroll-target">
        <EventLedgerSection
          entries={eventLedgerEntries}
          eventTitles={eventTitles}
          isUnavailable={financeUnavailable}
        />
      </div>

      {/* 5. Officer-Only Financial Audit Trail */}
      {isOfficer && (
        <div id="finance-audit" className="scroll-target">
          <OfficerAuditHistory
            actorNames={actorNames}
            auditCount={auditCount}
            auditError={auditError}
            auditPage={auditPage}
            auditPageCount={auditPageCount}
            auditRows={auditRows}
            pageSize={pageSize}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="pt-8 pb-4 border-t border-[#E5DDD3] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#7A685D]">
        <div>
          <p className="font-bold text-[#3D291F]">
            Carpenters Family Social Club — Asaba, Delta State, Nigeria
          </p>
          <p className="text-[11px] text-[#7A685D]">
            Private Members Portal · Nnebisi Road Secretariat · Est. 1988
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <Link
            className="text-[#174C37] font-bold hover:underline"
            href="/dues"
          >
            Member Dues & Contributions
          </Link>
        </div>
      </footer>

      {/* Modals */}
      <RecordIncomeModal
        canBackdate={canCorrect}
        idempotencyKey={incomeIdempotencyKey}
        isOpen={isRecordIncomeOpen}
        onClose={() => setIsRecordIncomeOpen(false)}
        today={today}
      />

      <RecordExpenseModal
        canBackdate={canCorrect}
        categories={categories}
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

      <VoidTransactionModal
        isOpen={Boolean(voidingTransaction)}
        onClose={() => setVoidingTransaction(null)}
        transaction={voidingTransaction}
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
