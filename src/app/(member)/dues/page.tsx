import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type DuesMemberOption,
  type DuesMonthOption,
  DuesPaymentCorrectionForm,
  DuesPaymentForm,
  DuesRateForm,
  DuesWriteOffForm,
  type PaymentCorrection,
} from "./dues-forms";

type DuesStatusRow = {
  member_id: string;
  covered_month: string;
  amount_ngn: number | string | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
};

type PaymentRow = {
  id: string;
  member_id: string;
  amount_ngn: number | string;
  payment_date: string;
  recorded_by: string;
  recorded_at: string;
  corrected_at: string | null;
};

type DispositionRow = {
  payment_id: string | null;
  covered_month: string;
  amount_ngn: number | string;
  is_current: boolean;
};

type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  target_member_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_PAGE_SIZE = 50;

const notices: Record<string, string> = {
  saved: "The dues operation was recorded.",
  "rate-saved": "The next-month dues rate was saved.",
  denied: "You do not have permission to perform that operation.",
  "invalid-request": "The dues operation details were invalid.",
  "operation-failed":
    "The request was rejected. Check the member state, selected months, amount, rate, and reason, then try again.",
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

function monthAfter(month: string) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const value = new Date(Date.UTC(yearValue, monthValue, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
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

function formatNaira(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "Rate unavailable";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function statusLabel(row: DuesStatusRow, currentMonth: string) {
  if (row.status === "paid") return "Paid";
  if (row.status === "written_off") return "Written off";
  if (row.is_overdue) return "Overdue";
  if (row.covered_month.slice(0, 7) > currentMonth) return "Upcoming";
  if (row.covered_month.slice(0, 7) === currentMonth) return "Due at month end";
  return "Unpaid";
}

function toMonthOption(row: DuesStatusRow): DuesMonthOption {
  return {
    month: row.covered_month,
    amount: row.amount_ngn,
    label: formatMonth(row.covered_month),
  };
}

function pageNumber(value?: string) {
  if (!value || !/^\d{1,6}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function historyPageHref(memberId: string, key: string, page: number) {
  const params = new URLSearchParams({
    member_id: memberId,
    [key]: String(page),
  });
  return `/dues?${params.toString()}`;
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    member_id?: string;
    payment_page?: string;
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
          <h1>Dues records unavailable</h1>
          <p>
            Member dues could not be loaded. No financial data was displayed.
          </p>
        </section>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: ownProfile, error: ownProfileError } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (ownProfileError || ownProfile?.status !== "active") {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Dues privacy</p>
          <h1>Access denied</h1>
          <p>This account cannot access active member dues records.</p>
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
    (roles.has("executive") || roles.has("admin") || roles.has("backup_admin"));
  const canRecord = isOfficer;
  const canWriteOff = isOfficer;
  const canCorrect = roles.has("admin") || roles.has("backup_admin");
  const canChangeRate = canCorrect;

  let members: DuesMemberOption[] = [
    {
      id: ownProfile.id,
      full_name: ownProfile.full_name,
      username: ownProfile.username,
      status: ownProfile.status,
    },
  ];
  let memberListError = false;
  if (isOfficer) {
    const { data: memberRows, error } = await supabase
      .from("member_profiles")
      .select("id, full_name, username, status")
      .in("status", ["active", "deactivated"])
      .order("full_name", { ascending: true })
      .limit(1000);
    memberListError = Boolean(error);
    if (memberRows) members = memberRows as DuesMemberOption[];
  }

  const requestedMemberId =
    isOfficer && params.member_id && uuidPattern.test(params.member_id)
      ? params.member_id
      : ownProfile.id;
  const selectedMember = members.find(
    (member) => member.id === requestedMemberId,
  );
  const member = selectedMember ?? {
    id: ownProfile.id,
    full_name: ownProfile.full_name,
    username: ownProfile.username,
    status: ownProfile.status,
  };
  const targetMemberId = selectedMember ? requestedMemberId : ownProfile.id;
  const invalidSelection = Boolean(
    isOfficer && params.member_id && !selectedMember,
  );
  const paymentPage = pageNumber(params.payment_page);
  const auditPage = pageNumber(params.audit_page);

  const [statusResult, paymentResult, rateResult, incomeResult] =
    await Promise.all([
      supabase
        .from("dues_month_status")
        .select(
          "member_id, covered_month, amount_ngn, status, due_date, is_overdue",
        )
        .eq("member_id", targetMemberId)
        .order("covered_month", { ascending: true })
        .limit(1200),
      supabase
        .from("dues_payments")
        .select(
          "id, member_id, amount_ngn, payment_date, recorded_by, recorded_at, corrected_at",
          { count: "exact" },
        )
        .eq("member_id", targetMemberId)
        .order("payment_date", { ascending: false })
        .order("recorded_at", { ascending: false })
        .range(
          paymentPage * HISTORY_PAGE_SIZE,
          (paymentPage + 1) * HISTORY_PAGE_SIZE - 1,
        ),
      supabase
        .from("dues_rates")
        .select(
          "id, effective_month, monthly_amount_ngn, changed_by, changed_at, reason",
        )
        .order("effective_month", { ascending: true })
        .limit(1200),
      supabase.rpc("club_dues_income_total"),
    ]);

  const duesRows = (statusResult.data ?? []) as DuesStatusRow[];
  const payments = (paymentResult.data ?? []) as PaymentRow[];
  const rates = rateResult.data ?? [];
  const paymentIds = payments.map((payment) => payment.id);
  let coverageRows: DispositionRow[] = [];
  let coverageError = false;
  if (paymentIds.length > 0) {
    const { data, error } = await supabase
      .from("dues_month_dispositions")
      .select("payment_id, covered_month, amount_ngn, is_current")
      .in("payment_id", paymentIds)
      .eq("is_current", true)
      .order("covered_month", { ascending: true });
    coverageError = Boolean(error);
    coverageRows = (data ?? []) as DispositionRow[];
  }

  let duesAudit: AuditRow[] = [];
  let auditError = false;
  let auditCount = 0;
  if (isOfficer) {
    const auditResult = await supabase
      .from("audit_log")
      .select(
        "id, actor_id, action, entity_type, entity_id, target_member_id, before_data, after_data, reason, occurred_at",
        { count: "exact" },
      )
      .in("action", [
        "dues_payment_recorded",
        "dues_payment_corrected",
        "dues_month_written_off",
        "dues_rate_changed",
      ])
      .or(`target_member_id.eq.${targetMemberId},action.eq.dues_rate_changed`)
      .order("occurred_at", { ascending: false })
      .range(
        auditPage * HISTORY_PAGE_SIZE,
        (auditPage + 1) * HISTORY_PAGE_SIZE - 1,
      );
    auditError = Boolean(auditResult.error);
    duesAudit = (auditResult.data ?? []) as AuditRow[];
    auditCount = auditResult.count ?? 0;
  }

  const actorIds = [...new Set(duesAudit.map((entry) => entry.actor_id))];
  let actorNames = new Map<string, string>();
  if (isOfficer && actorIds.length > 0) {
    const { data } = await supabase
      .from("member_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    actorNames = new Map(
      (data ?? []).map((entry) => [entry.id, entry.full_name]),
    );
  }

  const notice = params.notice ? notices[params.notice] : undefined;
  const today = todayInWAT();
  const currentMonth = `${today.slice(0, 7)}-01`;
  const nextMonth = monthAfter(today.slice(0, 7));
  const unpaidMonths = duesRows.filter((row) => row.status === "unpaid");
  const pastUnpaidMonths = unpaidMonths
    .filter((row) => row.covered_month < currentMonth)
    .map(toMonthOption);
  const availableMonths = unpaidMonths.map(toMonthOption);
  const coverageByPayment = new Map<string, string[]>();
  for (const coverage of coverageRows) {
    if (!coverage.payment_id) continue;
    const months = coverageByPayment.get(coverage.payment_id) ?? [];
    months.push(coverage.covered_month);
    coverageByPayment.set(coverage.payment_id, months);
  }
  const combinedAudit = duesAudit;
  const openTotal = unpaidMonths.reduce(
    (total, row) => total + Number(row.amount_ngn ?? 0),
    0,
  );
  const detailedDataError = Boolean(
    statusResult.error || paymentResult.error || coverageError,
  );

  return (
    <main className="shell dues-page">
      <section className="panel dues-panel">
        <header className="dues-heading member-page-header">
          <div>
            <p className="eyebrow">Private financial record</p>
            <h1>Dues</h1>
            <p>
              {isOfficer
                ? "Officer access is recorded. Changes are checked in PostgreSQL and written to the audit history."
                : "You can see your own dues history. Other members’ individual dues details are private."}
            </p>
          </div>
        </header>

        <section
          aria-label="Dues report exports"
          className="report-export-actions"
        >
          <form
            action="/api/reports/dues"
            method="post"
            target="_blank"
            rel="noopener"
          >
            <input name="format" type="hidden" value="csv" />
            <button className="button-secondary" type="submit">
              Download dues CSV
            </button>
          </form>
          <form
            action="/api/reports/dues"
            method="post"
            target="_blank"
            rel="noopener"
          >
            <input name="format" type="hidden" value="pdf" />
            <button className="button-secondary" type="submit">
              Download dues PDF
            </button>
          </form>
          <p className="muted">
            Members receive their own dues rows. Executive, Admin, and Backup
            Admin reports follow the existing officer access rules.
          </p>
        </section>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
        {invalidSelection ? (
          <p className="notice" role="status">
            That member selection could not be verified. Your own dues are
            shown.
          </p>
        ) : null}
        {roleError ? (
          <p className="notice" role="status">
            Officer access could not be verified, so this page shows only your
            own records.
          </p>
        ) : null}

        <section aria-labelledby="club-total-heading" className="dues-total">
          <div>
            <p className="eyebrow">Club aggregate</p>
            <h2 id="club-total-heading">All-time dues income</h2>
          </div>
          <strong>
            {incomeResult.error
              ? "Unavailable"
              : formatNaira(incomeResult.data)}
          </strong>
        </section>

        {isOfficer ? (
          <form action="/dues" className="member-picker" method="get">
            <label>
              Review member dues
              <select defaultValue={targetMemberId} name="member_id">
                {members.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.full_name} · @{option.username} · {option.status}
                  </option>
                ))}
              </select>
            </label>
            <button className="button-secondary" type="submit">
              View member dues
            </button>
            {memberListError ? (
              <p className="muted" role="alert">
                The member list could not be verified; no other member was
                loaded.
              </p>
            ) : null}
          </form>
        ) : null}

        <section aria-labelledby="member-dues-heading" className="dues-section">
          <div className="section-heading dues-record-heading">
            <div>
              <p className="eyebrow">
                {isOfficer ? "Officer view" : "Your record"}
              </p>
              <h2 id="member-dues-heading">{member.full_name}</h2>
              <p className="muted">
                @{member.username} · {member.status}
              </p>
            </div>
            <div className="dues-balance">
              <span>Unpaid total</span>
              <strong>{formatNaira(openTotal)}</strong>
            </div>
          </div>

          {detailedDataError ? (
            <p role="alert">
              Dues details could not be verified. No financial data or mutation
              forms are available.
            </p>
          ) : duesRows.length === 0 ? (
            <p>No dues months are available for this membership period.</p>
          ) : (
            <div className="table-scroll">
              <table className="dues-table">
                <caption>
                  Dues status by eligible month for {member.full_name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Due date</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...duesRows].reverse().map((row) => (
                    <tr key={row.covered_month}>
                      <th scope="row">{formatMonth(row.covered_month)}</th>
                      <td>
                        <span aria-hidden="true" className="dues-cell-label">
                          Amount
                        </span>
                        {formatNaira(row.amount_ngn)}
                      </td>
                      <td>
                        <span aria-hidden="true" className="dues-cell-label">
                          Due date
                        </span>
                        {formatDate(row.due_date)}
                      </td>
                      <td>
                        <span aria-hidden="true" className="dues-cell-label">
                          Status
                        </span>
                        <span className="dues-row-status">
                          {statusLabel(row, currentMonth.slice(0, 7))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="payment-history-heading"
          className="dues-section"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Payment history</p>
              <h2 id="payment-history-heading">Recorded payments</h2>
            </div>
          </div>
          {detailedDataError ? (
            <p role="alert">
              Payment history could not be verified. No payment records or
              correction forms are available.
            </p>
          ) : payments.length > 0 ? (
            <div className="member-list">
              {payments.map((payment) => {
                const paymentMonths = coverageByPayment.get(payment.id) ?? [];
                const correction: PaymentCorrection = {
                  id: payment.id,
                  member_id: payment.member_id,
                  amount_ngn: payment.amount_ngn,
                  payment_date: payment.payment_date,
                  covered_months: paymentMonths,
                };
                return (
                  <article className="payment-card" key={payment.id}>
                    <div className="section-heading">
                      <div>
                        <h3>{formatNaira(payment.amount_ngn)}</h3>
                        <p className="muted">
                          Paid {formatDate(payment.payment_date)}
                        </p>
                      </div>
                      {payment.corrected_at ? (
                        <span className="status-pill complete">Corrected</span>
                      ) : null}
                    </div>
                    <p>
                      Covered months:{" "}
                      {paymentMonths.length > 0
                        ? paymentMonths.map(formatMonth).join(", ")
                        : "No current coverage"}
                    </p>
                    {canCorrect && paymentMonths.length > 0 ? (
                      <DuesPaymentCorrectionForm
                        members={members}
                        payment={correction}
                      />
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : paymentPage === 0 ? (
            <p>No payment records are available.</p>
          ) : (
            <p>No payments exist on this page.</p>
          )}
          {!paymentResult.error &&
          (paymentResult.count ?? 0) > HISTORY_PAGE_SIZE ? (
            <nav
              aria-label="Payment history pages"
              className="history-pagination"
            >
              {paymentPage > 0 ? (
                <Link
                  href={historyPageHref(
                    targetMemberId,
                    "payment_page",
                    paymentPage - 1,
                  )}
                >
                  Newer payments
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {paymentPage + 1} of{" "}
                {Math.ceil((paymentResult.count ?? 0) / HISTORY_PAGE_SIZE)}
              </span>
              {(paymentPage + 1) * HISTORY_PAGE_SIZE <
              (paymentResult.count ?? 0) ? (
                <Link
                  href={historyPageHref(
                    targetMemberId,
                    "payment_page",
                    paymentPage + 1,
                  )}
                >
                  Older payments
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>

        {!detailedDataError && canRecord ? (
          <section
            aria-labelledby="record-payment-heading"
            className="dues-section"
          >
            <p className="eyebrow">Officer mutation</p>
            <h2 id="record-payment-heading">Record a dues payment</h2>
            <DuesPaymentForm
              availableMonths={availableMonths}
              memberId={targetMemberId}
              today={today}
            />
          </section>
        ) : null}

        {!detailedDataError && canWriteOff ? (
          <section aria-labelledby="writeoff-heading" className="dues-section">
            <p className="eyebrow">Final financial disposition</p>
            <h2 id="writeoff-heading">Write off old unpaid dues</h2>
            <p className="muted">
              Executive, Admin, and Backup Admin actions require a reason and
              remain in the audit history.
            </p>
            <DuesWriteOffForm
              memberId={targetMemberId}
              memberName={member.full_name}
              pastUnpaidMonths={pastUnpaidMonths}
            />
          </section>
        ) : null}

        <section
          aria-labelledby="rate-history-heading"
          className="dues-section"
        >
          <p className="eyebrow">Rate history</p>
          <h2 id="rate-history-heading">Monthly dues rates</h2>
          {rateResult.error ? (
            <p role="alert">The dues rate schedule could not be verified.</p>
          ) : (
            <div className="rate-list">
              {rates.map((rate) => (
                <article className="rate-item" key={rate.id}>
                  <strong>{formatNaira(rate.monthly_amount_ngn)}</strong>
                  <span>Effective {formatMonth(rate.effective_month)}</span>
                  <span className="muted">{rate.reason}</span>
                </article>
              ))}
            </div>
          )}
          {canChangeRate && !rateResult.error ? (
            <div className="rate-change">
              <h3>Change next month’s rate</h3>
              <p className="muted">
                Only the Admin or Backup Admin can schedule a rate. Effective
                rates for past months cannot be edited.
              </p>
              <DuesRateForm nextMonth={nextMonth} />
            </div>
          ) : null}
        </section>

        {isOfficer ? (
          <section
            aria-labelledby="dues-audit-heading"
            className="dues-section"
          >
            <p className="eyebrow">Officer-only audit history</p>
            <h2 id="dues-audit-heading">Dues changes</h2>
            {auditError ? (
              <p role="alert">Dues audit history could not be loaded.</p>
            ) : combinedAudit.length === 0 ? (
              <p>
                {auditPage === 0
                  ? "No dues changes have been recorded."
                  : "No changes exist on this page."}
              </p>
            ) : (
              <details className="history-disclosure">
                <summary>Review {auditCount} recorded changes</summary>
                <div className="history-disclosure-content">
                  <div className="member-list">
                    {combinedAudit.map((entry) => (
                      <article className="audit-card" key={entry.id}>
                        <div className="section-heading">
                          <div>
                            <h3>{entry.action.replaceAll("_", " ")}</h3>
                            <p className="muted">
                              {formatDate(entry.occurred_at)} ·{" "}
                              {actorNames.get(entry.actor_id) ?? "Club officer"}
                            </p>
                          </div>
                          <span className="muted">{entry.entity_type}</span>
                        </div>
                        <p>
                          <strong>Reason:</strong> {entry.reason}
                        </p>
                        <details>
                          <summary>View recorded change</summary>
                          <pre className="audit-data">
                            {JSON.stringify(
                              {
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
                  {!auditError && auditCount > HISTORY_PAGE_SIZE ? (
                    <nav
                      aria-label="Dues audit pages"
                      className="history-pagination"
                    >
                      {auditPage > 0 ? (
                        <Link
                          href={historyPageHref(
                            targetMemberId,
                            "audit_page",
                            auditPage - 1,
                          )}
                        >
                          Newer changes
                        </Link>
                      ) : (
                        <span />
                      )}
                      <span>
                        Page {auditPage + 1} of{" "}
                        {Math.ceil(auditCount / HISTORY_PAGE_SIZE)}
                      </span>
                      {(auditPage + 1) * HISTORY_PAGE_SIZE < auditCount ? (
                        <Link
                          href={historyPageHref(
                            targetMemberId,
                            "audit_page",
                            auditPage + 1,
                          )}
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
