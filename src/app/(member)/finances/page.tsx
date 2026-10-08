import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ClubExpenseForm,
  ClubIncomeForm,
  type FinanceCategory,
  FinanceCategoryForms,
  FinanceCorrectionForm,
  type FinanceTransaction,
  FinanceVoidForm,
} from "./finance-forms";

const PAGE_SIZE = 50;
const notices: Record<string, string> = {
  saved: "The financial transaction was recorded.",
  corrected: "The record was corrected and the prior values were audited.",
  voided: "The record was voided and retained in the history.",
  "category-saved": "The category was added.",
  "category-retired":
    "The category was retired; historical records retain its name.",
  "receipt-uploaded":
    "The receipt was securely attached to the financial record.",
  "receipt-duplicate":
    "That receipt is already attached to this financial record.",
  "receipt-invalid": "Choose a valid PDF, JPEG, or PNG receipt under 4 MiB.",
  "receipt-too-large": "The receipt upload is too large.",
  "receipt-failed": "The receipt could not be attached. Try again later.",
  "receipt-unavailable":
    "Receipt storage is not configured or is temporarily unavailable.",
  denied: "You do not have permission to perform that operation.",
  "invalid-request": "The request details were invalid.",
  "operation-failed":
    "The request was rejected. Check the amount, date, category, account state, and required reason.",
};

type FinanceAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

type FinanceReceipt = {
  id: string;
  transaction_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};
type EventLedgerEntry = {
  id: string;
  event_id: string;
  generation: number;
  entry_kind: string;
  event_status: string;
  signed_amount_ngn: number | string;
  created_at: string;
};

function todayInWAT() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function pageNumber(value?: string) {
  if (!value || !/^\d{1,6}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function financePageHref(key: "page" | "audit_page", value: number) {
  return `/finances?${new URLSearchParams({ [key]: String(value) }).toString()}`;
}

function formatNaira(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "Unavailable";
  const amount = typeof value === "number" ? BigInt(value) : BigInt(value);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    page?: string;
    audit_page?: string;
  }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Club finances unavailable</h1>
          <p>
            No financial data was displayed because membership could not be
            verified.
          </p>
        </section>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Member privacy</p>
          <h1>Access denied</h1>
          <p>This account cannot access club financial records.</p>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  const roles = new Set(
    roleError ? [] : (roleRows ?? []).map((row) => row.role),
  );
  const isOfficer =
    !roleError &&
    ["executive", "admin", "backup_admin"].some((role) => roles.has(role));
  const canCorrect =
    !roleError && (roles.has("admin") || roles.has("backup_admin"));

  const requestedPage = pageNumber(params.page);
  const requestedAuditPage = pageNumber(params.audit_page);
  const [transactionCountResult, categoryResult, summaryResult] =
    await Promise.all([
      supabase
        .from("club_financial_transactions")
        .select(
          "id, kind, amount_ngn, transaction_date, description, category_id, category_name_snapshot, payer_payee, source_note, created_at, updated_at, voided_at, void_reason",
          { count: "exact", head: true },
        ),
      supabase
        .from("finance_categories")
        .select("id, name, retired_at")
        .order("name", { ascending: true })
        .limit(200),
      supabase.rpc("club_finance_summary"),
    ]);
  const transactionCount = transactionCountResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(transactionCount / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const [transactionResult, auditCountResult] = await Promise.all([
    supabase
      .from("club_financial_transactions")
      .select(
        "id, kind, amount_ngn, transaction_date, description, category_id, category_name_snapshot, payer_payee, source_note, created_at, updated_at, voided_at, void_reason",
      )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    isOfficer
      ? supabase
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .in("action", [
            "club_finance_recorded",
            "club_finance_corrected",
            "club_finance_voided",
            "club_finance_receipt_attached",
            "finance_category_created",
            "finance_category_retired",
          ])
      : Promise.resolve({ count: 0, error: null }),
  ]);
  const auditCount = auditCountResult.count ?? 0;
  const auditPageCount = Math.max(1, Math.ceil(auditCount / PAGE_SIZE));
  const auditPage = Math.min(requestedAuditPage, auditPageCount - 1);
  const auditResult = isOfficer
    ? await supabase
        .from("audit_log")
        .select(
          "id, actor_id, action, entity_id, before_data, after_data, reason, occurred_at",
        )
        .in("action", [
          "club_finance_recorded",
          "club_finance_corrected",
          "club_finance_voided",
          "club_finance_receipt_attached",
          "finance_category_created",
          "finance_category_retired",
        ])
        .order("occurred_at", { ascending: false })
        .range(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE - 1)
    : null;

  const categories = (categoryResult.data ?? []) as FinanceCategory[];
  const transactions = (transactionResult.data ?? []) as FinanceTransaction[];
  const receiptResult = transactions.length
    ? await supabase
        .from("club_financial_receipts")
        .select(
          "id, transaction_id, original_filename, content_type, size_bytes, uploaded_at",
        )
        .in(
          "transaction_id",
          transactions.map((transaction) => transaction.id),
        )
        .order("uploaded_at", { ascending: true })
        .limit(1000)
    : null;
  const receipts = (receiptResult?.data ?? []) as FinanceReceipt[];
  const receiptsByTransaction = new Map<string, FinanceReceipt[]>();
  for (const receipt of receipts) {
    const linkedReceipts = receiptsByTransaction.get(receipt.transaction_id);
    if (linkedReceipts) linkedReceipts.push(receipt);
    else receiptsByTransaction.set(receipt.transaction_id, [receipt]);
  }
  const receiptUnavailable = Boolean(receiptResult?.error);
  const eventLedgerResult = await supabase
    .from("event_ledger_entries")
    .select(
      "id, event_id, generation, entry_kind, event_status, signed_amount_ngn, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const eventLedgerEntries = (eventLedgerResult.data ??
    []) as EventLedgerEntry[];
  const eventLedgerEventsResult = eventLedgerEntries.length
    ? await supabase
        .from("events")
        .select("id, title")
        .in("id", [
          ...new Set(eventLedgerEntries.map((entry) => entry.event_id)),
        ])
    : { data: [], error: null };
  const eventTitles = new Map(
    (eventLedgerEventsResult.data ?? []).map((event) => [
      event.id,
      event.title,
    ]),
  );
  const financeUnavailable = Boolean(
    transactionCountResult.error ||
      transactionResult.error ||
      summaryResult.error,
  );
  const categoryUnavailable = Boolean(categoryResult.error);
  const summary = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  const auditError = Boolean(auditResult?.error);
  const auditRows = (auditResult?.data ?? []) as FinanceAuditRow[];
  let actorNames = new Map<string, string>();
  if (isOfficer && auditRows.length > 0) {
    const actorIds = [...new Set(auditRows.map((entry) => entry.actor_id))];
    const { data } = await supabase
      .from("member_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    actorNames = new Map((data ?? []).map((item) => [item.id, item.full_name]));
  }

  const today = todayInWAT();

  return (
    <main className="shell">
      <section className="panel">
        <header className="finance-heading member-page-header">
          <div>
            <p className="eyebrow">Shared club records</p>
            <h1>Club finances</h1>
            <p>
              Members can review recorded club income and expenses, including
              payer or payee details. Individual dues records stay private to
              the member and authorized officers.
            </p>
          </div>
        </header>

        {params.notice && notices[params.notice] ? (
          <p className="notice" role="status">
            {notices[params.notice]}
          </p>
        ) : null}
        {roleError ? (
          <p className="notice" role="status">
            Officer privileges could not be verified. You can still view shared
            records, but no officer actions or audit history are shown.
          </p>
        ) : null}

        <section aria-label="Club balance" className="finance-overview">
          {financeUnavailable || !summary ? (
            <p role="alert">
              Finance totals could not be verified, so no balance is displayed.
            </p>
          ) : (
            <>
              <div className="finance-balance-total">
                <p className="eyebrow">Shared financial snapshot · all time</p>
                <span>Current balance</span>
                <strong>{formatNaira(summary.balance)}</strong>
              </div>
              <dl className="finance-balance-grid">
                <div>
                  <dt>Dues income</dt>
                  <dd>{formatNaira(summary.dues_income)}</dd>
                </div>
                <div>
                  <dt>Other income</dt>
                  <dd>{formatNaira(summary.other_income)}</dd>
                </div>
                <div>
                  <dt>Expenses</dt>
                  <dd>{formatNaira(summary.expenses)}</dd>
                </div>
              </dl>
            </>
          )}
          <p className="finance-overview-note muted">
            The balance uses all-time dues and non-dues records. CSV and PDF
            exports cover the current Africa/Lagos calendar year and include
            receipt filenames when available.
          </p>
        </section>
        <section
          aria-label="Club finance exports"
          className="report-export-actions"
        >
          <form
            action="/api/reports/finances"
            method="post"
            target="_blank"
            rel="noopener"
          >
            <input name="format" type="hidden" value="csv" />
            <button className="button-secondary" type="submit">
              Download finance CSV
            </button>
          </form>
          <form
            action="/api/reports/finances"
            method="post"
            target="_blank"
            rel="noopener"
          >
            <input name="format" type="hidden" value="pdf" />
            <button className="button-secondary" type="submit">
              Download finance PDF
            </button>
          </form>
        </section>

        {isOfficer && !financeUnavailable ? (
          <details className="finance-officer-tools">
            <summary className="finance-tools-summary">
              <span className="finance-tools-summary-copy">
                <span className="eyebrow">Officer actions</span>
                <strong>Record and manage club finances</strong>
              </span>
              <span aria-hidden="true" className="finance-tools-open-label">
                Open tools
              </span>
              <span aria-hidden="true" className="finance-tools-close-label">
                Close tools
              </span>
            </summary>
            <div className="finance-officer-tools-content">
              <header className="finance-tools-heading">
                <div>
                  <h2>Available officer tools</h2>
                </div>
                <p>
                  Executive, Admin, and Backup Admin can record income and
                  expenses. Only Admin and Backup Admin can correct or void a
                  posted entry. Corrections and voids require reasons and are
                  included in the officer-only audit history.
                </p>
              </header>
              <div className="finance-entry-grid">
                <section
                  className="dues-section"
                  aria-labelledby="income-entry-heading"
                >
                  <p className="eyebrow">Officer entry</p>
                  <h2 id="income-entry-heading">Record non-dues income</h2>
                  <ClubIncomeForm
                    today={today}
                    canBackdate={canCorrect}
                    idempotencyKey={randomUUID()}
                  />
                </section>
                <section
                  className="dues-section"
                  aria-labelledby="expense-entry-heading"
                >
                  <p className="eyebrow">Officer entry</p>
                  <h2 id="expense-entry-heading">Record an expense</h2>
                  {categoryUnavailable ? (
                    <p role="alert">
                      Categories could not be verified. Expense entry is
                      disabled.
                    </p>
                  ) : categories.some((category) => !category.retired_at) ? (
                    <ClubExpenseForm
                      categories={categories}
                      today={today}
                      canBackdate={canCorrect}
                      idempotencyKey={randomUUID()}
                    />
                  ) : (
                    <p>
                      Create an active category before recording an expense.
                    </p>
                  )}
                </section>
                <section
                  className="dues-section"
                  aria-labelledby="category-heading"
                >
                  <p className="eyebrow">Officer category management</p>
                  <h2 id="category-heading">Expense categories</h2>
                  {categoryUnavailable ? (
                    <p role="alert">
                      Categories could not be verified. Category changes are
                      disabled.
                    </p>
                  ) : (
                    <FinanceCategoryForms categories={categories} />
                  )}
                </section>
              </div>
            </div>
          </details>
        ) : null}

        <section className="dues-section" aria-labelledby="ledger-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Member-visible ledger</p>
              <h2 id="ledger-heading">Income and expenses</h2>
            </div>
            <p className="muted">
              Showing page {page + 1} of {pageCount}
            </p>
          </div>
          {financeUnavailable ? (
            <p role="alert">
              The ledger or balance could not be verified. No transaction
              records or entry forms are available.
            </p>
          ) : transactions.length === 0 ? (
            <p>No club income or expenses have been recorded yet.</p>
          ) : (
            <div className="finance-record-list">
              {transactions.map((transaction) => (
                <article
                  className={`finance-record${transaction.voided_at ? " finance-record-voided" : ""}`}
                  key={transaction.id}
                >
                  <div className="finance-record-heading">
                    <div>
                      <p className="eyebrow">
                        {transaction.kind === "income"
                          ? "Non-dues income"
                          : "Expense"}
                        {transaction.voided_at
                          ? " · Voided — retained in history"
                          : ""}
                      </p>
                      <h3>
                        {transaction.kind === "income"
                          ? transaction.source_note
                          : transaction.description}
                      </h3>
                    </div>
                    <strong>{formatNaira(transaction.amount_ngn)}</strong>
                  </div>
                  <dl className="finance-details">
                    <div>
                      <dt>Date</dt>
                      <dd>{formatDate(transaction.transaction_date)}</dd>
                    </div>
                    {transaction.category_name_snapshot ? (
                      <div>
                        <dt>Category</dt>
                        <dd>{transaction.category_name_snapshot}</dd>
                      </div>
                    ) : null}
                    {transaction.payer_payee ? (
                      <div>
                        <dt>
                          {transaction.kind === "income" ? "Payer" : "Payee"}
                        </dt>
                        <dd>{transaction.payer_payee}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Recorded</dt>
                      <dd>{formatTimestamp(transaction.created_at)}</dd>
                    </div>
                    {transaction.voided_at ? (
                      <div>
                        <dt>Void reason</dt>
                        <dd>{transaction.void_reason}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="finance-receipts">
                    <h4>Receipts</h4>
                    {receiptUnavailable ? (
                      <p role="alert">
                        Receipt attachments could not be verified. Download and
                        upload controls are unavailable.
                      </p>
                    ) : (receiptsByTransaction.get(transaction.id) ?? [])
                        .length > 0 ? (
                      <ul>
                        {(receiptsByTransaction.get(transaction.id) ?? []).map(
                          (receipt) => (
                            <li key={receipt.id}>
                              <a
                                href={`/api/finance-receipts/${receipt.id}`}
                                download
                              >
                                {receipt.original_filename}
                              </a>
                              <span className="muted">
                                {" "}
                                ({Math.ceil(receipt.size_bytes / 1024)} KB)
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="muted">No receipt attached.</p>
                    )}
                    {isOfficer &&
                    !transaction.voided_at &&
                    !receiptUnavailable ? (
                      <form
                        action="/api/finance-receipts"
                        className="receipt-upload-form"
                        encType="multipart/form-data"
                        method="post"
                      >
                        <input
                          name="transactionId"
                          type="hidden"
                          value={transaction.id}
                        />
                        <label>
                          Attach a receipt (PDF, JPEG, or PNG; up to 4 MiB)
                          <input
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            name="receipt"
                            required
                            type="file"
                          />
                        </label>
                        <button className="button-secondary" type="submit">
                          Attach receipt
                        </button>
                      </form>
                    ) : null}
                  </div>
                  {canCorrect && !transaction.voided_at ? (
                    <div className="finance-record-actions">
                      <FinanceCorrectionForm
                        transaction={transaction}
                        categories={categories}
                        today={today}
                      />
                      <FinanceVoidForm transaction={transaction} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          {!financeUnavailable && transactionCount > PAGE_SIZE ? (
            <nav
              aria-label="Finance ledger pages"
              className="history-pagination"
            >
              {page > 0 ? (
                <Link href={financePageHref("page", page - 1)}>
                  Newer records
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {page + 1} of {pageCount}
              </span>
              {(page + 1) * PAGE_SIZE < transactionCount ? (
                <Link href={financePageHref("page", page + 1)}>
                  Older records
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>

        <section
          className="dues-section"
          aria-labelledby="event-ledger-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Event results</p>
              <h2 id="event-ledger-heading">
                Event ledger posts and reversals
              </h2>
            </div>
            <p className="muted">Latest 50 entries</p>
          </div>
          {eventLedgerResult.error || eventLedgerEventsResult.error ? (
            <p role="alert">Event ledger entries could not be verified.</p>
          ) : eventLedgerEntries.length === 0 ? (
            <p>No event results have been posted yet.</p>
          ) : (
            <div className="finance-record-list">
              {eventLedgerEntries.map((entry) => (
                <article className="finance-record" key={entry.id}>
                  <div className="finance-record-heading">
                    <div>
                      <p className="eyebrow">
                        Generation {entry.generation} · {entry.entry_kind}
                      </p>
                      <h3>
                        <Link href={`/events/${entry.event_id}/finance`}>
                          {eventTitles.get(entry.event_id) ?? "Retained event"}
                        </Link>
                      </h3>
                    </div>
                    <strong>{formatNaira(entry.signed_amount_ngn)}</strong>
                  </div>
                  <p className="muted">
                    {entry.event_status} · {formatTimestamp(entry.created_at)} ·{" "}
                    {entry.entry_kind === "reversal"
                      ? "Offsets its original result; both remain in history."
                      : "Posted when the event was completed or cancelled."}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {isOfficer ? (
          <section
            className="dues-section"
            aria-labelledby="finance-audit-heading"
          >
            <p className="eyebrow">Officer-only history</p>
            <h2 id="finance-audit-heading">Finance changes</h2>
            {auditError ? (
              <p role="alert">Audit history could not be verified.</p>
            ) : auditRows.length === 0 ? (
              <p>No finance changes are recorded.</p>
            ) : (
              <details className="history-disclosure">
                <summary>Review {auditCount} recorded changes</summary>
                <div className="history-disclosure-content">
                  <div className="audit-list">
                    {auditRows.map((entry) => (
                      <article className="audit-card" key={entry.id}>
                        <div className="section-heading">
                          <div>
                            <h3>{entry.action.replaceAll("_", " ")}</h3>
                            <p className="muted">
                              {actorNames.get(entry.actor_id) ?? "Club officer"}{" "}
                              · {formatTimestamp(entry.occurred_at)}
                            </p>
                          </div>
                        </div>
                        <p>
                          <strong>Reason:</strong> {entry.reason}
                        </p>
                        <details>
                          <summary>Recorded changes</summary>
                          <pre className="audit-data">
                            {JSON.stringify(
                              {
                                target: entry.entity_id,
                                before: entry.before_data,
                                after: entry.after_data,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </article>
                    ))}
                  </div>
                  {!auditError && auditCount > PAGE_SIZE ? (
                    <nav
                      aria-label="Finance audit pages"
                      className="history-pagination"
                    >
                      {auditPage > 0 ? (
                        <Link
                          href={financePageHref("audit_page", auditPage - 1)}
                        >
                          Newer changes
                        </Link>
                      ) : (
                        <span />
                      )}
                      <span>
                        Page {auditPage + 1} of {auditPageCount}
                      </span>
                      {(auditPage + 1) * PAGE_SIZE < auditCount ? (
                        <Link
                          href={financePageHref("audit_page", auditPage + 1)}
                        >
                          Older changes
                        </Link>
                      ) : (
                        <span />
                      )}
                    </nav>
                  ) : null}
                </div>
              </details>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}
