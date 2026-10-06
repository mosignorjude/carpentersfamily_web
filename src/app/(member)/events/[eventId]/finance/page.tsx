import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  correctEventFinancialTransactionAction,
  createEventTicketTierAction,
  editEventTicketSaleAction,
  recordEventFinancialTransactionAction,
  recordEventTicketSaleAction,
  refundEventTicketSaleAction,
  retireEventTicketTierAction,
  signOutAction,
  updateEventTicketTierAction,
  voidEventFinancialTransactionAction,
} from "@/app/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EventRecord = {
  id: string;
  title: string;
  status: string;
  archived_at: string | null;
  income_enabled: boolean;
  expenses_enabled: boolean;
  ticketing_enabled: boolean;
  budget_enabled: boolean;
};

type TicketTier = {
  id: string;
  event_id: string;
  name: string;
  price_ngn: number;
  capacity: number;
  retired_at: string | null;
};

type TicketTierStatus = { tier_id: string; sold_quantity: number };
type EventTransaction = {
  id: string;
  event_id: string;
  kind: string;
  amount_ngn: number;
  transaction_date: string;
  description: string | null;
  payer_payee: string | null;
  source_note: string | null;
  payment_method: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};
type TicketSale = {
  id: string;
  event_id: string;
  tier_id: string;
  seller_id: string;
  buyer_name: string | null;
  quantity: number;
  unit_price_ngn: number;
  amount_ngn: number;
  payment_method: string | null;
  created_at: string;
  refunded_at: string | null;
  refund_reason: string | null;
};
type EventReceipt = {
  id: string;
  transaction_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};
type LedgerEntry = {
  id: string;
  event_id: string;
  generation: number;
  entry_kind: string;
  event_status: string;
  signed_amount_ngn: number | string;
  created_at: string;
};
type MemberName = { id: string; full_name: string; username: string };
type BudgetRecord = { total_ngn: number };
type FinanceAuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

const notices: Record<string, string> = {
  saved: "The event financial record was saved.",
  corrected: "The record was corrected and its prior values were audited.",
  voided: "The record was voided and retained in history.",
  "tier-saved": "The ticket tier was saved.",
  "tier-retired":
    "The ticket tier was retired; previous sales remain recorded.",
  "sale-saved": "The ticket sale was recorded.",
  "sale-edited": "The ticket sale was updated and its change was audited.",
  refunded: "The sale was refunded and retained in the event history.",
  "receipt-uploaded": "The receipt was securely attached to this event record.",
  "receipt-invalid": "Choose a valid PDF, JPEG, or PNG receipt under 4 MiB.",
  "receipt-too-large": "The receipt upload is too large.",
  "receipt-failed": "The receipt could not be attached. Try again later.",
  "receipt-unavailable": "Receipt storage is not configured or is unavailable.",
  denied: "You are not allowed to perform that event-finance action.",
  "invalid-request": "Check the values and try again.",
  "operation-failed":
    "The request was rejected. Check event state, capacity, and required values.",
};

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatMoney(value: number | string | bigint) {
  return money.format(typeof value === "number" ? value : BigInt(value));
}

function formatDay(value: string) {
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

function TicketTierForm({
  eventId,
  tier,
  sold,
}: {
  eventId: string;
  tier?: TicketTier;
  sold: number;
}) {
  return (
    <form
      action={tier ? updateEventTicketTierAction : createEventTicketTierAction}
      className="form-stack event-form"
    >
      <input name="event_id" type="hidden" value={eventId} />
      {tier ? <input name="tier_id" type="hidden" value={tier.id} /> : null}
      <label>
        Tier name
        <input
          autoComplete="off"
          defaultValue={tier?.name ?? ""}
          maxLength={80}
          name="name"
          required
        />
      </label>
      <label>
        Price (NGN)
        <input
          defaultValue={tier?.price_ngn ?? ""}
          inputMode="numeric"
          max={1_000_000_000_000}
          min={1}
          name="price_ngn"
          required
          type="number"
        />
      </label>
      <label>
        Capacity
        <input
          defaultValue={tier?.capacity ?? ""}
          inputMode="numeric"
          max={100_000}
          min={Math.max(1, sold)}
          name="capacity"
          required
          type="number"
        />
      </label>
      <label>
        Reason for {tier ? "change" : "creation"}
        <input maxLength={500} name="reason" required />
      </label>
      <button type="submit">{tier ? "Save tier" : "Add tier"}</button>
    </form>
  );
}

function EventTransactionForm({
  eventId,
  kind,
  today,
  canBackdate,
  idempotencyKey,
}: {
  eventId: string;
  kind: "income" | "expense";
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
}) {
  return (
    <form
      action={recordEventFinancialTransactionAction}
      className="form-stack event-form"
    >
      <input name="event_id" type="hidden" value={eventId} />
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />
      <label>
        {kind === "income" ? "Income source" : "Expense description"}
        <input
          maxLength={500}
          name={kind === "income" ? "source_note" : "description"}
          required
        />
      </label>
      <label>
        Amount (NGN)
        <input
          inputMode="numeric"
          max={1_000_000_000_000}
          min={1}
          name="amount_ngn"
          required
          type="number"
        />
      </label>
      <label>
        Date
        <input
          defaultValue={today}
          max={today}
          name="transaction_date"
          required
          type="date"
        />
      </label>
      <label>
        {kind === "income" ? "Payer (optional)" : "Payee"}
        <input
          maxLength={160}
          name="payer_payee"
          required={kind === "expense"}
        />
      </label>
      {kind === "income" ? (
        <label>
          Payment method
          <select defaultValue="cash" name="payment_method" required>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="mobile_money">Mobile money</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </label>
      ) : null}
      {!canBackdate ? (
        <p className="muted">
          Only Admin or Backup Admin can enter a past date.
        </p>
      ) : null}
      <button type="submit">Record {kind}</button>
    </form>
  );
}

function TicketSaleForm({
  eventId,
  tiers,
  idempotencyKey,
}: {
  eventId: string;
  tiers: TicketTier[];
  idempotencyKey: string;
}) {
  return (
    <form
      action={recordEventTicketSaleAction}
      className="form-stack event-form"
    >
      <input name="event_id" type="hidden" value={eventId} />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />
      <label>
        Ticket tier
        <select defaultValue="" name="tier_id" required>
          <option disabled value="">
            Select a tier
          </option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.name} · {formatMoney(tier.price_ngn)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantity
        <input
          inputMode="numeric"
          max={1000}
          min={1}
          name="quantity"
          required
          type="number"
        />
      </label>
      <label>
        Buyer (optional)
        <input maxLength={160} name="buyer_name" />
      </label>
      <label>
        Payment method (optional)
        <select defaultValue="" name="payment_method">
          <option value="">Not recorded</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="mobile_money">Mobile money</option>
          <option value="card">Card</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
      </label>
      <button type="submit">Record ticket sale</button>
    </form>
  );
}

export default async function EventFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  ) {
    redirect("/events?notice=invalid-request");
  }
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Event finances unavailable</h1>
          <p>
            Membership could not be verified, so no financial details were
            loaded.
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
          <p>This account cannot access event financial records.</p>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  const [
    eventResult,
    clubRolesResult,
    eventRolesResult,
    tierResult,
    summaryResult,
    transactionResult,
    saleResult,
    ledgerResult,
    budgetResult,
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, status, archived_at, income_enabled, expenses_enabled, ticketing_enabled, budget_enabled",
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select("role")
      .eq("event_id", eventId)
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_ticket_tiers")
      .select("id, event_id, name, price_ngn, capacity, retired_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase.rpc("event_finance_summary", { p_event_id: eventId }),
    supabase
      .from("event_financial_transactions")
      .select(
        "id, event_id, kind, amount_ngn, transaction_date, description, payer_payee, source_note, payment_method, created_at, voided_at, void_reason",
      )
      .eq("event_id", eventId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("event_ticket_sales")
      .select(
        "id, event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn, amount_ngn, payment_method, created_at, refunded_at, refund_reason",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("event_ledger_entries")
      .select(
        "id, event_id, generation, entry_kind, event_status, signed_amount_ngn, created_at",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("event_budgets")
      .select("total_ngn")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);
  if (eventResult.error || !eventResult.data) {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Event privacy</p>
          <h1>Event unavailable</h1>
          <p>
            This event could not be verified. No finance details were displayed.
          </p>
          <Link href="/events">Back to events</Link>
        </section>
      </main>
    );
  }
  const event = eventResult.data as EventRecord;
  const roles = new Set((clubRolesResult.data ?? []).map((row) => row.role));
  const eventRoles = new Set(
    (eventRolesResult.data ?? []).map((row) => row.role),
  );
  const isAdmin = roles.has("admin") || roles.has("backup_admin");
  const isOfficer = ["executive", "admin", "backup_admin"].some((role) =>
    roles.has(role),
  );
  const canManage =
    isAdmin ||
    roles.has("executive") ||
    eventRoles.has("lead") ||
    eventRoles.has("assistant");
  const canSell = event.status === "scheduled" && !event.archived_at;
  const financeUnavailable = Boolean(
    tierResult.error ||
      summaryResult.error ||
      transactionResult.error ||
      saleResult.error ||
      ledgerResult.error,
  );
  const tiers = (tierResult.data ?? []) as TicketTier[];
  const summary = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  const transactions = (transactionResult.data ?? []) as EventTransaction[];
  const sales = (saleResult.data ?? []) as TicketSale[];
  const ledgerEntries = (ledgerResult.data ?? []) as LedgerEntry[];
  const budget = budgetResult.data as BudgetRecord | null;
  const auditResult = isOfficer
    ? await supabase
        .from("audit_log")
        .select(
          "id, actor_id, action, entity_id, before_data, after_data, reason, occurred_at",
        )
        .eq("event_id", eventId)
        .order("occurred_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };
  const auditRows = (auditResult.data ?? []) as FinanceAuditEntry[];
  const auditActorIds = [...new Set(auditRows.map((entry) => entry.actor_id))];
  const auditActorsResult = auditActorIds.length
    ? await supabase
        .from("member_profiles")
        .select("id, full_name")
        .in("id", auditActorIds)
    : { data: [], error: null };
  const auditActorNames = new Map(
    (auditActorsResult.data ?? []).map((actor) => [actor.id, actor.full_name]),
  );
  const tierStatusResult = await supabase.rpc("event_ticket_tier_status", {
    p_event_id: eventId,
  });
  const soldByTier = new Map(
    ((tierStatusResult.data ?? []) as TicketTierStatus[]).map((row) => [
      row.tier_id,
      row.sold_quantity,
    ]),
  );
  const transactionIds = transactions.map((row) => row.id);
  const receiptResult = transactionIds.length
    ? await supabase
        .from("event_financial_receipts")
        .select(
          "id, transaction_id, original_filename, content_type, size_bytes, uploaded_at",
        )
        .in("transaction_id", transactionIds)
        .order("uploaded_at", { ascending: true })
        .limit(500)
    : { data: [], error: null };
  const receipts = (receiptResult.data ?? []) as EventReceipt[];
  const receiptsByTransaction = new Map<string, EventReceipt[]>();
  for (const receipt of receipts) {
    const list = receiptsByTransaction.get(receipt.transaction_id) ?? [];
    list.push(receipt);
    receiptsByTransaction.set(receipt.transaction_id, list);
  }
  const memberIds = [...new Set(sales.map((sale) => sale.seller_id))];
  const memberResult = memberIds.length
    ? await supabase
        .from("member_profiles")
        .select("id, full_name, username")
        .in("id", memberIds)
    : { data: [], error: null };
  const members = new Map(
    ((memberResult.data ?? []) as MemberName[]).map((member) => [
      member.id,
      member,
    ]),
  );
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = `${todayParts.find((part) => part.type === "year")?.value ?? ""}-${todayParts.find((part) => part.type === "month")?.value ?? ""}-${todayParts.find((part) => part.type === "day")?.value ?? ""}`;
  const expenses = BigInt(summary?.expense_ngn ?? 0);
  const noticesText = query.notice ? notices[query.notice] : undefined;

  return (
    <main className="shell">
      <section className="panel">
        <header className="finance-heading">
          <div>
            <p className="eyebrow">Shared event record</p>
            <h1>{event.title} finances</h1>
            <p>
              Active members can review event income, expenses, ticket sales,
              payer/payee details, and available receipts. Personal dues remain
              private.
            </p>
          </div>
          <nav aria-label="Member navigation" className="dues-nav">
            <Link href="/events">Events</Link>
            <Link href="/finances">Club finances</Link>
            <Link href="/">Member portal</Link>
            <form action={signOutAction}>
              <button className="button-secondary" type="submit">
                Sign out
              </button>
            </form>
          </nav>
        </header>

        {noticesText ? (
          <p className="notice" role="status">
            {noticesText}
          </p>
        ) : null}
        {clubRolesResult.error || eventRolesResult.error ? (
          <p className="notice" role="status">
            Role assignments could not be verified. You can review shared
            records, but no event-finance management forms are shown.
          </p>
        ) : null}

        {financeUnavailable ? (
          <p role="alert">
            Event finance data could not be verified. No totals or financial
            records are displayed.
          </p>
        ) : (
          <>
            <section
              aria-label="Event finance totals"
              className="finance-balance-grid"
            >
              <div>
                <span>Recorded income</span>
                <strong>{formatMoney(summary?.income_ngn ?? 0)}</strong>
              </div>
              <div>
                <span>Expenses</span>
                <strong>{formatMoney(summary?.expense_ngn ?? 0)}</strong>
              </div>
              <div>
                <span>Ticket income</span>
                <strong>{formatMoney(summary?.ticket_income_ngn ?? 0)}</strong>
              </div>
              <div className="finance-balance-total">
                <span>Net event result</span>
                <strong>{formatMoney(summary?.net_result_ngn ?? 0)}</strong>
              </div>
            </section>
            {event.budget_enabled &&
            budget &&
            expenses > BigInt(budget.total_ngn) ? (
              <p className="notice" role="status">
                Recorded expenses exceed the event budget by{" "}
                {formatMoney(expenses - BigInt(budget.total_ngn))}. Event
                managers should review the expense entries.
              </p>
            ) : null}

            {tierStatusResult.error && event.ticketing_enabled ? (
              <p role="alert">
                Ticket capacity could not be verified, so tier changes and new
                sales are disabled.
              </p>
            ) : null}

            {canManage && canSell && !tierStatusResult.error ? (
              <div className="finance-entry-grid">
                {event.income_enabled ? (
                  <section className="dues-section">
                    <p className="eyebrow">Event manager entry</p>
                    <h2>Record income</h2>
                    <EventTransactionForm
                      eventId={eventId}
                      kind="income"
                      today={today}
                      canBackdate={isAdmin}
                      idempotencyKey={randomUUID()}
                    />
                  </section>
                ) : null}
                {event.expenses_enabled ? (
                  <section className="dues-section">
                    <p className="eyebrow">Event manager entry</p>
                    <h2>Record expense</h2>
                    <EventTransactionForm
                      eventId={eventId}
                      kind="expense"
                      today={today}
                      canBackdate={isAdmin}
                      idempotencyKey={randomUUID()}
                    />
                  </section>
                ) : null}
                {event.ticketing_enabled ? (
                  <section className="dues-section">
                    <p className="eyebrow">Event manager entry</p>
                    <h2>Ticket tiers</h2>
                    {tiers
                      .filter((tier) => !tier.retired_at)
                      .map((tier) => (
                        <div className="finance-record" key={tier.id}>
                          <h3>{tier.name}</h3>
                          <p>
                            {formatMoney(tier.price_ngn)} ·{" "}
                            {soldByTier.get(tier.id) ?? 0} / {tier.capacity}{" "}
                            sold
                          </p>
                          <TicketTierForm
                            eventId={eventId}
                            tier={tier}
                            sold={soldByTier.get(tier.id) ?? 0}
                          />
                          <form
                            action={retireEventTicketTierAction}
                            className="inline-form"
                          >
                            <input
                              name="event_id"
                              type="hidden"
                              value={eventId}
                            />
                            <input
                              name="tier_id"
                              type="hidden"
                              value={tier.id}
                            />
                            <label className="inline-label">
                              Retirement reason
                              <input maxLength={500} name="reason" required />
                            </label>
                            <button className="button-secondary" type="submit">
                              Retire tier
                            </button>
                          </form>
                        </div>
                      ))}
                    <TicketTierForm eventId={eventId} sold={0} />
                  </section>
                ) : null}
              </div>
            ) : null}

            {event.ticketing_enabled ? (
              <section
                className="dues-section"
                aria-labelledby="sale-entry-heading"
              >
                <p className="eyebrow">Member ticket sales</p>
                <h2 id="sale-entry-heading">Record a ticket sale</h2>
                {canSell &&
                !tierStatusResult.error &&
                tiers.some((tier) => !tier.retired_at) ? (
                  <TicketSaleForm
                    eventId={eventId}
                    tiers={tiers.filter((tier) => !tier.retired_at)}
                    idempotencyKey={randomUUID()}
                  />
                ) : (
                  <p className="muted">
                    Ticket sales are unavailable because this event is closed,
                    capacity could not be verified, or there are no active
                    ticket tiers.
                  </p>
                )}
              </section>
            ) : null}

            <section
              className="dues-section"
              aria-labelledby="event-transactions-heading"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Member-visible records</p>
                  <h2 id="event-transactions-heading">Income and expenses</h2>
                </div>
                <p className="muted">Latest 50 entries</p>
              </div>
              {transactions.length === 0 ? (
                <p>No event income or expenses have been recorded.</p>
              ) : (
                <div className="finance-record-list">
                  {transactions.map((transaction) => {
                    const attached =
                      receiptsByTransaction.get(transaction.id) ?? [];
                    return (
                      <article
                        className={`finance-record${transaction.voided_at ? " finance-record-voided" : ""}`}
                        key={transaction.id}
                      >
                        <div className="finance-record-heading">
                          <div>
                            <p className="eyebrow">
                              {transaction.kind === "income"
                                ? "Event income"
                                : "Event expense"}
                              {transaction.voided_at ? " · Voided" : ""}
                            </p>
                            <h3>
                              {transaction.kind === "income"
                                ? transaction.source_note
                                : transaction.description}
                            </h3>
                          </div>
                          <strong>{formatMoney(transaction.amount_ngn)}</strong>
                        </div>
                        <dl className="finance-details">
                          <div>
                            <dt>Date</dt>
                            <dd>{formatDay(transaction.transaction_date)}</dd>
                          </div>
                          {transaction.payer_payee ? (
                            <div>
                              <dt>
                                {transaction.kind === "income"
                                  ? "Payer"
                                  : "Payee"}
                              </dt>
                              <dd>{transaction.payer_payee}</dd>
                            </div>
                          ) : null}
                          {transaction.payment_method ? (
                            <div>
                              <dt>Method</dt>
                              <dd>
                                {transaction.payment_method.replaceAll(
                                  "_",
                                  " ",
                                )}
                              </dd>
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
                          {receiptResult.error ? (
                            <p role="alert">
                              Receipt access could not be verified.
                            </p>
                          ) : attached.length ? (
                            <ul>
                              {attached.map((receipt) => (
                                <li key={receipt.id}>
                                  <a
                                    download
                                    href={`/api/event-finance-receipts/${receipt.id}`}
                                  >
                                    {receipt.original_filename}
                                  </a>
                                  <span className="muted">
                                    {" "}
                                    ({Math.ceil(receipt.size_bytes / 1024)} KB)
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted">No receipt attached.</p>
                          )}
                          {canManage &&
                          canSell &&
                          !transaction.voided_at &&
                          !receiptResult.error ? (
                            <form
                              action="/api/event-finance-receipts"
                              className="receipt-upload-form"
                              encType="multipart/form-data"
                              method="post"
                            >
                              <input
                                name="transactionId"
                                type="hidden"
                                value={transaction.id}
                              />
                              <input
                                name="eventId"
                                type="hidden"
                                value={eventId}
                              />
                              <label>
                                Attach a receipt (PDF, JPEG, or PNG; up to 4
                                MiB)
                                <input
                                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                  name="receipt"
                                  required
                                  type="file"
                                />
                              </label>
                              <button
                                className="button-secondary"
                                type="submit"
                              >
                                Attach receipt
                              </button>
                            </form>
                          ) : null}
                        </div>
                        {isAdmin && !transaction.voided_at ? (
                          <div className="finance-record-actions">
                            <form
                              action={correctEventFinancialTransactionAction}
                              className="form-stack event-form"
                            >
                              <input
                                name="event_id"
                                type="hidden"
                                value={eventId}
                              />
                              <input
                                name="transaction_id"
                                type="hidden"
                                value={transaction.id}
                              />
                              <h4>Correct transaction</h4>
                              <label>
                                Correct amount (NGN)
                                <input
                                  defaultValue={transaction.amount_ngn}
                                  max={1_000_000_000_000}
                                  min={1}
                                  name="amount_ngn"
                                  required
                                  type="number"
                                />
                              </label>
                              <label>
                                Correct date
                                <input
                                  defaultValue={transaction.transaction_date.slice(
                                    0,
                                    10,
                                  )}
                                  max={today}
                                  name="transaction_date"
                                  required
                                  type="date"
                                />
                              </label>
                              {transaction.kind === "income" ? (
                                <>
                                  <label>
                                    Correct income source
                                    <input
                                      defaultValue={
                                        transaction.source_note ?? ""
                                      }
                                      maxLength={500}
                                      name="source_note"
                                      required
                                    />
                                  </label>
                                  <label>
                                    Correct payer (optional)
                                    <input
                                      defaultValue={
                                        transaction.payer_payee ?? ""
                                      }
                                      maxLength={160}
                                      name="payer_payee"
                                    />
                                  </label>
                                  <label>
                                    Payment method
                                    <select
                                      defaultValue={
                                        transaction.payment_method ?? "cash"
                                      }
                                      name="payment_method"
                                    >
                                      <option value="cash">Cash</option>
                                      <option value="bank_transfer">
                                        Bank transfer
                                      </option>
                                      <option value="mobile_money">
                                        Mobile money
                                      </option>
                                      <option value="card">Card</option>
                                      <option value="cheque">Cheque</option>
                                      <option value="other">Other</option>
                                    </select>
                                  </label>
                                </>
                              ) : (
                                <>
                                  <label>
                                    Correct expense description
                                    <input
                                      defaultValue={
                                        transaction.description ?? ""
                                      }
                                      maxLength={500}
                                      name="description"
                                      required
                                    />
                                  </label>
                                  <label>
                                    Correct payee
                                    <input
                                      defaultValue={
                                        transaction.payer_payee ?? ""
                                      }
                                      maxLength={160}
                                      name="payer_payee"
                                      required
                                    />
                                  </label>
                                </>
                              )}
                              <label>
                                Reason for correction
                                <input maxLength={500} name="reason" required />
                              </label>
                              <button
                                className="button-secondary"
                                type="submit"
                              >
                                Save correction
                              </button>
                            </form>
                            <form
                              action={voidEventFinancialTransactionAction}
                              className="inline-form"
                            >
                              <input
                                name="event_id"
                                type="hidden"
                                value={eventId}
                              />
                              <input
                                name="transaction_id"
                                type="hidden"
                                value={transaction.id}
                              />
                              <label className="inline-label">
                                Void reason
                                <input maxLength={500} name="reason" required />
                              </label>
                              <button
                                className="button-secondary"
                                type="submit"
                              >
                                Void record
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {event.ticketing_enabled ? (
              <section
                className="dues-section"
                aria-labelledby="ticket-sales-heading"
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Member-visible records</p>
                    <h2 id="ticket-sales-heading">Ticket sales</h2>
                  </div>
                  <p className="muted">
                    Latest 50 sales · {summary?.tickets_sold ?? 0} tickets sold
                  </p>
                </div>
                {sales.length === 0 ? (
                  <p>No ticket sales have been recorded.</p>
                ) : (
                  <div className="finance-record-list">
                    {sales.map((sale) => {
                      const tier = tiers.find(
                        (item) => item.id === sale.tier_id,
                      );
                      const seller = members.get(sale.seller_id);
                      return (
                        <article
                          className={`finance-record${sale.refunded_at ? " finance-record-voided" : ""}`}
                          key={sale.id}
                        >
                          <div className="finance-record-heading">
                            <div>
                              <p className="eyebrow">
                                {sale.refunded_at
                                  ? "Refunded ticket sale"
                                  : "Ticket sale"}
                              </p>
                              <h3>{tier?.name ?? "Retained ticket tier"}</h3>
                            </div>
                            <strong>{formatMoney(sale.amount_ngn)}</strong>
                          </div>
                          <dl className="finance-details">
                            <div>
                              <dt>Seller</dt>
                              <dd>
                                {seller
                                  ? `${seller.full_name} (@${seller.username})`
                                  : "Former member"}
                              </dd>
                            </div>
                            <div>
                              <dt>Buyer</dt>
                              <dd>{sale.buyer_name ?? "Not recorded"}</dd>
                            </div>
                            <div>
                              <dt>Quantity</dt>
                              <dd>{sale.quantity}</dd>
                            </div>
                            <div>
                              <dt>Unit price</dt>
                              <dd>{formatMoney(sale.unit_price_ngn)}</dd>
                            </div>
                            {sale.payment_method ? (
                              <div>
                                <dt>Payment method</dt>
                                <dd>
                                  {sale.payment_method.replaceAll("_", " ")}
                                </dd>
                              </div>
                            ) : null}
                            <div>
                              <dt>Recorded</dt>
                              <dd>{formatTimestamp(sale.created_at)}</dd>
                            </div>
                            {sale.refunded_at ? (
                              <div>
                                <dt>Refund reason</dt>
                                <dd>{sale.refund_reason}</dd>
                              </div>
                            ) : null}
                          </dl>
                          {canSell &&
                          !sale.refunded_at &&
                          (sale.seller_id === authData.user.id || isAdmin) ? (
                            <div className="finance-record-actions">
                              <form
                                action={editEventTicketSaleAction}
                                className="form-stack event-form"
                              >
                                <input
                                  name="event_id"
                                  type="hidden"
                                  value={eventId}
                                />
                                <input
                                  name="sale_id"
                                  type="hidden"
                                  value={sale.id}
                                />
                                <label>
                                  Correct quantity
                                  <input
                                    defaultValue={sale.quantity}
                                    max={1000}
                                    min={1}
                                    name="quantity"
                                    required
                                    type="number"
                                  />
                                </label>
                                <label>
                                  Buyer (optional)
                                  <input
                                    defaultValue={sale.buyer_name ?? ""}
                                    maxLength={160}
                                    name="buyer_name"
                                  />
                                </label>
                                <label>
                                  Payment method
                                  <select
                                    defaultValue={sale.payment_method ?? ""}
                                    name="payment_method"
                                  >
                                    <option value="">Not recorded</option>
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">
                                      Bank transfer
                                    </option>
                                    <option value="mobile_money">
                                      Mobile money
                                    </option>
                                    <option value="card">Card</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="other">Other</option>
                                  </select>
                                </label>
                                <label>
                                  Reason for edit
                                  <input
                                    maxLength={500}
                                    name="reason"
                                    required
                                  />
                                </label>
                                <button
                                  className="button-secondary"
                                  type="submit"
                                >
                                  Save sale change
                                </button>
                              </form>
                              {isAdmin ? (
                                <form
                                  action={refundEventTicketSaleAction}
                                  className="inline-form"
                                >
                                  <input
                                    name="event_id"
                                    type="hidden"
                                    value={eventId}
                                  />
                                  <input
                                    name="sale_id"
                                    type="hidden"
                                    value={sale.id}
                                  />
                                  <label className="inline-label">
                                    Refund reason
                                    <input
                                      maxLength={500}
                                      name="reason"
                                      required
                                    />
                                  </label>
                                  <button
                                    className="button-secondary"
                                    type="submit"
                                  >
                                    Refund sale
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            <section
              className="dues-section"
              aria-labelledby="event-ledger-heading"
            >
              <p className="eyebrow">Retained club-ledger entries</p>
              <h2 id="event-ledger-heading">
                Completion and reopening history
              </h2>
              {ledgerEntries.length === 0 ? (
                <p>This event has not posted a result to the club ledger.</p>
              ) : (
                <div className="finance-record-list">
                  {ledgerEntries.map((entry) => (
                    <article className="finance-record" key={entry.id}>
                      <div className="finance-record-heading">
                        <div>
                          <p className="eyebrow">
                            Generation {entry.generation} · {entry.entry_kind}
                          </p>
                          <h3>{entry.event_status}</h3>
                        </div>
                        <strong>{formatMoney(entry.signed_amount_ngn)}</strong>
                      </div>
                      <p className="muted">
                        {formatTimestamp(entry.created_at)} ·{" "}
                        {entry.entry_kind === "reversal"
                          ? "Offsets the prior posting; both entries remain in history."
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
                aria-labelledby="event-finance-audit-heading"
              >
                <p className="eyebrow">Officer-only history</p>
                <h2 id="event-finance-audit-heading">Event finance changes</h2>
                {auditResult.error || auditActorsResult.error ? (
                  <p role="alert">
                    Event financial audit history could not be verified.
                  </p>
                ) : auditRows.length === 0 ? (
                  <p>No event finance changes are recorded.</p>
                ) : (
                  <div className="audit-list">
                    {auditRows.map((entry) => (
                      <article className="audit-card" key={entry.id}>
                        <h3>{entry.action.replaceAll("_", " ")}</h3>
                        <p className="muted">
                          {auditActorNames.get(entry.actor_id) ??
                            "Club officer"}{" "}
                          · {formatTimestamp(entry.occurred_at)}
                        </p>
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
                )}
              </section>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
