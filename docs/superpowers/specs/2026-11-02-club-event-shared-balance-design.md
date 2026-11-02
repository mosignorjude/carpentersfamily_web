# Design: One Bank Account, Two Ledgers — Real-Time Event Cash in the Club Balance

- **Date**: 2026-11-02
- **Status**: Approved design — awaiting spec review
- **Branch**: `feat/club-administrator-role`
- **Migration**: `supabase/migrations/20261102150000_club_event_shared_balance.sql`

---

## 1. Intent and Why

The club runs one bank account. Club dues, club income and club expenses are recorded in
`club_financial_transactions`, while event income and event spending are recorded in
`event_financial_transactions` and `event_ticket_sales`. Every naira that an event receives or
spends is physically the club's money, in the club's account, from the moment it moves.

Today the club balance only learns about an event when the event is closed. The closing trigger
writes one summary row into `event_ledger_entries`, and `private.club_finance_summary()` sums
those rows:

- positive postings land in `other_income`,
- negative postings land in `expenses`,
- the net lands in `balance`.

So an event that is mid-flight is financially invisible to the club. Verified against production
on 2026-11-02:

| figure | value |
| --- | --- |
| club balance shown to members | ₦202,000 (₦195,000 dues + ₦7,000 opening balance) |
| `event_ledger_entries` total | ₦0 (one closed event, no cash) |
| `dues_payments` | 8 rows, ₦195,000 |
| cash already moved by the live `scheduled` event | ₦368,000 in / ₦242,700 out |
| net absent from the club balance | **+₦125,300** |

A treasurer reading `/finances` is therefore ₦125,300 wrong about the club's own bank balance,
and the number self-corrects only when somebody closes the event.

Two things must both be true, and today they conflict:

1. Event transactions must **not** become club line items — the club ledger is about club
   money, and duplicating event rows into it would make an event's ticket sales look like club
   "other income" and an event's sound hire look like club "expenses".
2. Event cash must **still** move the club balance, because it is the same account.

The resolution is to stop deriving the balance from the closing snapshot and start deriving it
from the live event rows, while leaving the closing snapshot in place as history.

## 2. Goals, Non-Goals, Anti-Goals

### Goals
- The club balance reflects event cash the moment that cash moves — on record, on refund, on
  void, on payment-status change — with no batch step and no closing action required.
- Event money is reported as event money: its own inflow and outflow lines, never folded into
  `dues_income`, `other_income`, or `expenses`.
- The end-of-event posting keeps happening, keeps its exact current amounts, and remains
  auditable — it simply stops feeding any total.
- The live rule and the closing rule cannot drift apart, because they are the same code.
- No double counting, before, during, or after an event closes.

### Non-Goals
- Mirroring event rows into `club_financial_transactions`.
- Giving event rows their own rows in the club ledger list or the club CSV transaction export.
- Changing what a closing posting means, its generation/reversal machinery, or the append-only
  guard on `event_ledger_entries`.
- Changing dues, the opening balance, or the pre-launch reconciliation guard.
- Changing accrual semantics (what `pending`/`unpaid` count for) or staged-review semantics.

### Anti-Goals
- A balance that counts the same event cash twice — once live, once posted.
- A club ledger whose line items silently include event activity.
- A balance that jumps when a treasurer presses "Complete event", because that button moves no
  money.
- Reintroducing the failure class from the 2026-10-28 incident, where a missing column-level
  `SELECT` grant made a whole PostgREST read return `42501` and the app rendered an empty ledger
  as if there were no data.

## 3. The Accounting Rule

### 3.1 The invariant

```
club balance = dues_income_live                        -- excluding pre_launch_reconciliation
             + club income (unvoided, incl. opening)   -- per 20261027170450 behaviour
             − club expenses (unvoided)
             + Σ event cash inflow   (all events, all statuses)
             − Σ event cash outflow (all events, all statuses)
```

`event cash` for one event is **exactly** the expression already used by the live closing
trigger (`private.sync_event_status_to_ledger()`, read from production 2026-11-02):

- `event_financial_transactions` where `voided_at is null`:
  - `kind = 'income'` and `payment_status = 'paid'` → inflow `amount_ngn`
  - `kind = 'expense'` and `payment_status in ('paid', 'deposit')` → outflow `amount_ngn`
- `event_ticket_sales` where `refunded_at is null` → inflow `amount_ngn`

Status-agnostic by design: the rule is "did cash move", and `events.status` is
`('scheduled' | 'completed' | 'cancelled')`
([20261003101500_events_roles_budgets_lifecycle.sql:49](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261003101500_events_roles_budgets_lifecycle.sql#L49)).
A cancelled event that kept a non-refunded ticket sale keeps counting, because the money is
still in the account. That is the existing closing formula's behaviour too, so the two agree.

### 3.2 Sign convention

`inflow` and `outflow` are both non-negative magnitudes; `net = inflow − outflow`. The summary
columns `event_inflow` and `event_outflow` are therefore never negative, which is what makes
them safe to render as separate club lines.

### 3.3 Rules deliberately inherited, not changed

Recorded here as decisions, so nobody later mistakes them for oversights:

- **`verification_status` is ignored.** An event transaction or ticket sale still in
  `recorded` (pending officer review) counts in the balance. This matches the closing formula,
  which predates the verification columns added by
  [20261028000000_event_domain_ledgers_and_verification.sql](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql).
  If the rule changed here, the live balance and the closing snapshot would disagree at the
  moment of closing — the one thing this design exists to prevent.
- **Income counts only `paid`; expenses count `paid` and `deposit`.** The asymmetry is
  inherited verbatim from the closing formula. Deposits taken by an event do not count as event
  inflow; deposits paid out by an event do count as outflow.
- **The pre-launch dues guard is untouched.** `payment_method = 'pre_launch_reconciliation'`
  dues stay out of the treasury balance, per
  [2026-10-25-pre-launch-financial-and-dues-onboarding-design.md:47-56](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/docs/superpowers/specs/2026-10-25-pre-launch-financial-and-dues-onboarding-design.md#L47-L56).

### 3.4 Effect at shipping time

Applying the migration changes the reported balance from ₦202,000 to ₦327,300 (+₦125,300) with
no data change whatsoever. The closed event contributes ₦0 under both the old and the new rule,
so the jump is exactly the currently-invisible scheduled-event cash and nothing else.

## 4. Architecture

Three units, each with one job. All live in `private`, all `SECURITY DEFINER` with
`set search_path = ''`, following the pattern the codebase already uses for the summary.

### 4.1 `private.event_cash_totals(p_event_id uuid)`

```sql
returns table (inflow numeric, outflow numeric, net numeric)
```

The single definition of "event cash". `p_event_id is null` aggregates across every event; a
value scopes to one event. Everything in this design that needs an event money figure calls
this, and nothing else computes one.

- Called with `NULL` by the club summary (live balance).
- Called with the event id by `private.sync_event_status_to_ledger()` to produce the posting's
  `signed_amount_ngn` (`net::numeric(30,0)`), replacing that function's inline `CASE` sum. The
  posting keeps its generation, `entry_kind`, `event_status`, `created_by`, audit-log row and
  append-only GUC dance; only the arithmetic source changes.

This is what makes drift impossible: the closing snapshot and the live term are the same
function body, so they agree by construction rather than by discipline.

### 4.2 `private.club_finance_summary_core()`

Holds the formula of §3.1. Ungated, revoked from `public, anon, authenticated, service_role`.
Returns:

```sql
returns table (dues_income numeric, other_income numeric, expenses numeric,
               event_inflow numeric, event_outflow numeric, balance numeric)
```

`dues_income`, `other_income` and `expenses` keep their current meanings minus the event
posting terms, which are removed. `balance` gains the live event net.

### 4.3 The gated wrappers

- `private.club_finance_summary()` keeps its member gate
  (`where (select private.is_active_club_member())`) and forwards `select * from` the core.
- `public.club_finance_summary()` keeps forwarding the private one.

Splitting core from gate now is not decoration. The unimplemented Staff Phase 2 money-visibility
plan ([docs/superpowers/plans/2026-11-01-staff-phase2-money-visibility.md:318-499](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/docs/superpowers/plans/2026-11-01-staff-phase2-money-visibility.md#L318-L499))
specifies exactly this `*_core` + gated-wrapper shape, because a `staff` profile fails
`private.is_active_club_member()` — which tests `member_profiles.status = 'active'`
([20261002135252_core_membership_roles_rls.sql:128-143](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261002135252_core_membership_roles_rls.sql#L128-L143)) —
and production has one `staff` row (the Admin account). Building the seam now means Phase 2 adds
one staff wrapper instead of rewriting this function and colliding with it.

### 4.4 Migration mechanics (ordered, and each step is load-bearing)

1. `create function private.event_cash_totals(uuid)` — new, and immediately revoked from
   `public, anon, authenticated, service_role`: it is an internal, never a callable endpoint.
   The app receives event cash only through the summary columns.
2. `create or replace function private.sync_event_status_to_ledger()` to call the helper,
   schema-qualified as `private.event_cash_totals(new.id)` because the function runs with
   `set search_path = ''`. `CREATE OR REPLACE` preserves its existing grants.
3. **`drop function` then `create function`** for `private.club_finance_summary_core()`,
   `private.club_finance_summary()` and `public.club_finance_summary()`. Postgres refuses to
   change a function's return type via `CREATE OR REPLACE`, and the new columns are a return-type
   change. Dropping drops the grants, so the migration re-applies them.
4. `revoke … from public, anon, service_role` plus `grant execute … to authenticated` for the
   public wrappers, and full revoke (including `authenticated`) for `*_core` and
   `event_cash_totals` internals — the service-role hardening rule means no new definer path may
   inherit ambient rights.
5. `create or replace function public.club_finance_report_data()` to add
   `event_inflow` / `event_outflow` keys to its `summary` object
   ([20261027170450_opening_balance_classification.sql:197-205](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261027170450_opening_balance_classification.sql#L197-L205)).
   It is `SECURITY INVOKER`, so it inherits the member gate and needs no grant change. Its
   `transactions` array stays club-only.
6. `notify pgrst, 'reload schema';` — the RPC's row shape changed; without this PostgREST serves
   the stale signature.

Per-event sums are already indexed: both live tables have an `event_id`-leading index
(`event_financial_transactions_event_date_idx`, `event_ticket_sales_event_created_idx`). The
all-events aggregate is a sequential scan over tables holding hundreds of rows, so no new index
is added.

## 5. Data Flow

**Record a ticket sale (₦8,000, `recorded`).** `record_event_ticket_sale` inserts into
`event_ticket_sales` → next `club_finance_summary()` call includes ₦8,000 in `event_inflow` and
in `balance`. Nothing touches `event_ledger_entries`.

**Mark an event expense `paid`.** The row's `payment_status` changes → `event_outflow` grows by
that amount, `balance` falls. `pending` or `unpaid` contributes nothing.

**Refund a sale / void a transaction.** `refunded_at` / `voided_at` is set → the row drops out of
the helper, so the balance falls back by itself. If this happens after the event closed, the
balance still moves (see §7).

**Complete or cancel an event.** The trigger writes its posting row from
`event_cash_totals(new.id).net` and audits it. Because postings are no longer summed, the club
balance is **unchanged** by the close — it already contains every naira in that posting.

**Reopen an event.** The trigger writes the reversal row. The club balance is unchanged; only the
audit history grows.

## 6. App Surface

| File | Change |
| --- | --- |
| [src/app/(member)/finances/page.tsx:140](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/(member)/finances/page.tsx#L140) | none — the RPC call already forwards all columns. |
| [src/app/(member)/finances/page.tsx:255](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/(member)/finances/page.tsx#L255) | panel relabelled "Event close postings (audit snapshot — not counted in the balance)". |
| [src/components/finances/finances-page-view.tsx:54-55](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/finances/finances-page-view.tsx#L54-L55) | summary props gain optional `event_inflow` / `event_outflow` (`number \| string \| null`, matching the existing fields). |
| [src/components/finances/finances-page-view.tsx:325-327](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/finances/finances-page-view.tsx#L325-L327) | new event-cash card: inflow, outflow, net, with one plain sentence — the same account, counted as money moves, not as club income or expenses. Balance stays the headline figure. |
| [src/app/api/reports/[report]/route.ts:126-169](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/api/reports/%5Breport%5D/route.ts#L126-L169) | CSV gains the two columns, PDF gains the two summary lines. |
| [src/app/api/reports/[report]/route.ts:319-320](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/api/reports/%5Breport%5D/route.ts#L319-L320) | header list extended to match. |
| [src/lib/home-dashboard.mjs:413-414](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/lib/home-dashboard.mjs#L413-L414) | none — it reads `dues_income`/`other_income`, whose meaning is unchanged, and the balance figure it shows becomes correct for free. |

New money on screen renders through `formatNaira`
([src/lib/format.ts:8](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/lib/format.ts#L8)).
The export path keeps its own `formatNgn` / `formatPdfAmount` helpers.

## 7. Behaviour Changes This Deliberately Causes

1. **Closing an event no longer changes the club balance.** Today it changes it by the posting
   amount; after this the balance already contained that money.
2. **Reopening an event no longer reverses money out of the club balance.** Today the reversal
   row subtracts the posting from the balance; after this, reopening changes only history. The
   live rows are the truth.
3. **Refunding or voiding after close now moves the club balance.** Today it cannot, because
   postings are frozen at close. Moving money is a real event, so the balance should follow it.
4. **Event cash stops appearing inside `other_income` and `expenses`.** Anyone reading last
   year's exported club report and comparing it to a screen after this change will see the same
   `balance` but different `other_income`/`expenses` splits. That is the intended correction, and
   the reason the new lines exist separately.
5. **A `staff` login still sees zero rows**, because the member gate stays. This design neither
   fixes nor worsens it; it makes the fix a one-function addition in Phase 2 Task 2.

## 8. Failure Modes and Safety

- **Double counting is structurally excluded**, not just avoided: the posting term disappears in
  the same migration that introduces the live term, and pgTAP pins the equality (a closed event's
  balance before and after the posting row exists is identical).
- **Column-grant / `42501` class is out of the path.** All five money tables are
  `relrowsecurity` + `relforcerowsecurity`, owned by `postgres`, and the summary reads through a
  `SECURITY DEFINER` function whose owner has `rolbypassrls = true` (verified in production
  2026-11-02). The event rows are read by the function, not by PostgREST, so a future
  ungranted column cannot empty the balance.
- **Return-shape change is the real deployment hazard.** Forgetting the `drop`/`create` pair
  fails the migration loudly; forgetting `notify pgrst, 'reload schema'` fails silently with a
  stale RPC shape. Both are explicit steps, and Step 4 of the test plan checks the live shape.
- **No fallbacks.** If the helper's subqueries fail, the summary function raises and the page
  surfaces an error — this design adds no `coalesce`-style silence beyond the existing
  `coalesce(..., 0)` around empty sums, which is correct arithmetic, not error swallowing.

## 9. Testing

### 9.1 pgTAP (write first, watch it fail)

New suite `supabase/tests/database/club_event_shared_balance_test.sql`, `select no_plan();`,
gated on zero `not ok` lines **in this file** (the local stack carries seven pre-existing
stale-name failures).

Cases, each asserting on `public.club_finance_summary()` as an active member:

1. paid event income → `event_inflow` and `balance` rise by the amount.
2. `pending` / `unpaid` event income → no change.
3. paid event expense → `event_outflow` and lower `balance`.
4. `deposit` event expense → counts; `deposit` event income → does not.
5. ticket sale → rises; `refunded_at` set → returns to the prior figure.
6. voided event transaction → returns to the prior figure.
7. complete an event → posting row exists, `signed_amount_ngn` equals that event's `net`, and
   the club `balance` is **unchanged** across the close.
8. reopen then re-close → balance unchanged both times; posting and reversal rows both present.
9. money moving after a close → the balance follows the live rows while the posting rows
   stay frozen. Proved as close → reopen → refund/void, because the refund and void RPCs
   both reject a non-scheduled event.
10. `event_ledger_entries` rows alone (inject one directly) → no effect on `balance`,
    `other_income` or `expenses`.
11. non-member and `staff`-status subject → still zero rows from the wrapper; the core is not
    executable by `authenticated`.

Existing assertions that must be re-derived because they encode the old split:
[club_finances_test.sql:203-207](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/tests/database/club_finances_test.sql#L203-L207),
[event_finance_ticketing_ledger_test.sql:481-497](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/tests/database/event_finance_ticketing_ledger_test.sql#L481-L497),
[pre_launch_financial_onboarding_test.sql:387-429](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/tests/database/pre_launch_financial_onboarding_test.sql#L387-L429),
[report_exports_test.sql:55-57](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/tests/database/report_exports_test.sql#L55-L57).

### 9.2 App tests

`node --test` with the repo's source-text pattern: the summary type carries the two new fields;
`/finances` renders the event-cash card; the posting panel carries the audit-snapshot label; the
report route's header list matches its row builder. Plus
[tests/home-dashboard.test.mjs:277](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/tests/home-dashboard.test.mjs#L277),
which asserts the RPC name list, stays valid.

`npm run lint` (Biome) before every commit.

### 9.3 Verification order

1. Failing pgTAP test, run against `--local`.
2. Migration written; `supabase db push --local --include-all`; suite green.
3. `supabase db reset --local` for a clean baseline, full `supabase test db --local`, compare
   against the known seven drift failures.
4. Production apply (separate, operator-gated step — never a bare `supabase db push`).

### 9.4 Production verification after apply

Before/after snapshot of `public.club_finance_summary()` as an active member, expecting
`balance` 202000 → 327300, `event_inflow` 368000, `event_outflow` 242700, `dues_income` 195000,
`other_income` and `expenses` unchanged in meaning. Then confirm the `/finances` screen and the
finance CSV both show the new lines. Method note from the 2026-11-02 investigation: a
role-restricted read must use `select set_config('request.jwt.claims', '<json>', true)` —
`set local request.jwt.claims = '<json>'` silently does nothing for a three-part GUC name, and a
`data ?? []` style app read cannot distinguish "no rows" from "permission denied".

## 10. Out of Scope

- The event dashboard's own figures. `private.event_finance_summary(p_event_id)` and the
  workspace totals keep working exactly as now; this change only affects what the club sees.
- The event-dashboard tab findings from the 2026-11-02 audit (totals vs ledger divergence,
  retired-tier hiding, `unallocated` ceiling money, the 50-row audit cap, fabricated cash-velocity
  percentages, the dropped server `notice`, hardcoded activity-log actor names).
- Whether `recorded` (pending-review) money should count in *event* totals — the event dashboard
  raises this independently of the club balance.
- Staff/admin money visibility (Phase 2 Task 2, already planned).
- Any `club_financial_transactions` write, backfill, or mirrored row.

## 11. Evidence Base

Read-only production probes run 2026-11-02 against project `kgihmudjdvwrvteclodl`; no writes were
performed. Live `private.club_finance_summary()`, `public.club_finance_summary()` and
`private.sync_event_status_to_ledger()` definitions were taken from `pg_get_functiondef`, not
from migration files, and match
[20261027170450_opening_balance_classification.sql:29-54](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261027170450_opening_balance_classification.sql#L29-L54)
and
[20261013040328_event_finance_workspace_slk_behaviour.sql:298-351](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261013040328_event_finance_workspace_slk_behaviour.sql#L298-L351).
`member_profiles.status` distribution: 10 `active`, 1 `staff`, 1 `rejected`, 1 `pending`,
2 `deactivated`.
