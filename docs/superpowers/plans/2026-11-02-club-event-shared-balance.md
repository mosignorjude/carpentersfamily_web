# Club & Event Shared Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the club balance reflect event cash (event income, expenses and ticket sales) the moment that cash moves, while the end-of-event ledger posting keeps happening as a pure audit snapshot.

**Architecture:** One new `private.event_cash_totals(uuid)` function becomes the single definition of "event cash". The closing trigger reads its posting amount from it, and the new ungated `private.club_finance_summary_core()` adds its all-events total to `balance` as separate `event_inflow` / `event_outflow` lines. The member gate moves to a thin `private.club_finance_summary()` wrapper, so `event_ledger_entries` stops feeding any total and event money never enters `other_income` or `expenses`.

**Tech Stack:** PostgreSQL 17 (Supabase hosted `kgihmudjdvwrvteclodl`), pgTAP, Next.js 16 App Router server components, TypeScript, Biome, `node --test`.

**Spec:** [docs/superpowers/specs/2026-11-02-club-event-shared-balance-design.md](../specs/2026-11-02-club-event-shared-balance-design.md) (commit `2906de4`). Read it with this plan; the plan argues from it.

## Global Constraints

- **Never run `supabase db push` without `--local`.** Plain `db push` applies migrations to the PRODUCTION database. Production apply is a separate, operator-gated step (Task 6).
- Migration filename is fixed by the spec: `supabase/migrations/20261102150000_club_event_shared_balance.sql`.
- The event-cash formula exists in exactly one place (`private.event_cash_totals(uuid)`). The closing trigger and the club summary both call it. Nothing else computes an event money figure.
- No new RLS policies on the money tables. No writes, backfill, or mirrored rows in `club_financial_transactions`. No change to dues, the opening balance, or the `pre_launch_reconciliation` guard.
- Every internal helper (`private.event_cash_totals`, `private.club_finance_summary_core`) is revoked from `public, anon, authenticated, service_role`.
- Every new/changed function keeps `security definer` (or `security invoker` where it already is) plus `set search_path = ''`, with all references schema-qualified.
- `CREATE OR REPLACE` cannot change a return type. The summary change requires `drop function` + `create function`, and drops remove grants, so the migration re-applies them.
- The migration ends with `notify pgrst, 'reload schema';` — the RPC row shape changed.
- pgTAP suites are wrapped in `begin; select no_plan(); … select * from finish(); rollback;`. Gate on **zero `not ok` lines in your own file**: the local stack carries seven pre-existing stale-name drift failures.
- In tests, event money must be written through RPCs under `set local role authenticated` with an Admin subject and a `scheduled` event — the guard trigger rejects owner DML, and `void`/`refund` RPCs reject a non-scheduled event.
- App tests use the repo source-text pattern (`readFileSync` + `assert.match`) under `node --test`. Biome runs on `next.config.ts src` via `npm run lint`; double quotes, 2-space indent, trailing commas.
- Money on screen renders through `formatNaira` from [src/lib/format.ts:8](../../../src/lib/format.ts#L8) (the spec's §6 mention of `formatNgn` refers to the report-side helper `formatNgn` in [src/lib/report-export.ts](../../../src/lib/report-export.ts); the screen helper is `formatNaira`).
- **Deploy order: database migration first, then app release.** The report route validates every summary key it renders, so a build that expects `event_inflow` fails closed (export shows "unavailable") until the migration is applied.

## File Structure

| File | Responsibility | Created/Modified by |
| --- | --- | --- |
| `supabase/migrations/20261102150000_club_event_shared_balance.sql` | The whole database change: helper, trigger rewiring, summary core + wrappers, grants, report keys, `notify pgrst` | Task 1 creates; Tasks 2–3 append |
| `supabase/tests/database/club_event_shared_balance_test.sql` | pgTAP proof of the accounting rule | Task 1 creates; Tasks 2–3 append |
| `supabase/tests/database/event_finance_ticketing_ledger_test.sql` | Existing suite whose one assertion encodes the old posting-summed balance | Task 2 modifies `:481-482` |
| `src/components/finances/club-financial-summary.tsx` | Summary card strip; gains the event-cash card | Task 4 |
| `src/components/finances/finances-page-view.tsx` | Summary prop type and forwarding | Task 4 |
| `src/components/finances/event-ledger-section.tsx` | Posting panel copy: audit snapshot, not counted | Task 4 |
| `tests/club-event-shared-balance-ui.test.mjs` | Source-text test for the three UI files | Task 4 |
| `src/app/api/reports/[report]/route.ts` | CSV columns, PDF lines, and the summary-key validation list | Task 5 |
| `tests/club-event-shared-balance-export.test.mjs` | Source-text test that CSV, PDF and validation agree | Task 5 |
| `docs/data-access-matrix.md` | One sentence recording the new report keys | Task 6 |
| `docs/superpowers/runbooks/2026-11-03-club-event-shared-balance-production.md` | Operator-gated production apply + verification | Task 6 |

Unchanged and verified as unchanged: `src/app/(member)/finances/page.tsx` (the RPC row is spread structurally), `src/lib/home-dashboard.mjs` (reads `dues_income` / `other_income` only), `private.event_finance_summary(uuid)` (event dashboard figures).

---

### Task 1: The single definition of event cash

**Files:**
- Create: `supabase/migrations/20261102150000_club_event_shared_balance.sql`
- Create: `supabase/tests/database/club_event_shared_balance_test.sql`
- Read for reference (do not modify): [supabase/migrations/20261013040328_event_finance_workspace_slk_behaviour.sql:299-367](../../../supabase/migrations/20261013040328_event_finance_workspace_slk_behaviour.sql#L299-L367)

**Interfaces:**
- Consumes: `public.event_financial_transactions` (`kind`, `amount_ngn`, `payment_status`, `voided_at`, `event_id`), `public.event_ticket_sales` (`amount_ngn` generated as `quantity × unit_price_ngn`, `refunded_at`, `event_id`).
- Produces: `private.event_cash_totals(p_event_id uuid) returns table (inflow numeric, outflow numeric, net numeric)`; `p_event_id is null` aggregates every event. Task 2 and the closing trigger call it.

- [ ] **Step 1: Write the failing pgTAP suite**

Create `supabase/tests/database/club_event_shared_balance_test.sql` with exactly this content:

```sql
begin;

select no_plan();

-- Fixture: one Admin who may create events and move event money, one ordinary
-- active member who reads the club summary, one staff profile and one pending
-- profile that the member gate must keep out.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000841', 'authenticated', 'authenticated', 'cbs-admin@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Admin","username":"cbs_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000842', 'authenticated', 'authenticated', 'cbs-member@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Member","username":"cbs_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000843', 'authenticated', 'authenticated', 'cbs-staff@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Staff","username":"cbs_staff"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000844', 'authenticated', 'authenticated', 'cbs-pending@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Pending","username":"cbs_pending"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000000841'::uuid
  and '00000000-0000-0000-0000-000000000842'::uuid;
update public.member_profiles set status = 'staff'
where id = '00000000-0000-0000-0000-000000000843';
update public.member_profiles set status = 'pending'
where id = '00000000-0000-0000-0000-000000000844';
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000841', 'admin', '00000000-0000-0000-0000-000000000841', 'Shared balance test primary Admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);

select set_config('test.cbs_event', public.create_event(
  'Shared Balance Test Event', 'party', pg_catalog.clock_timestamp() + interval '2 days',
  'Club Hall', null, false, false, true, true, true, true
)::text, true);
select set_config('test.cbs_tier', public.create_event_ticket_tier(
  current_setting('test.cbs_event')::uuid, 'General admission', 500, 10, 'Test capacity'
)::text, true);

-- Paid event income (inflow), pending income (no cash), and unreviewed money
-- that still counts because the rule is "did cash move".
select set_config('test.cbs_income_paid', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'income',
  p_amount_ngn => 700,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => null, p_payer_payee => 'A. Member', p_source_note => 'Paid ticket income',
  p_payment_method => 'cash',
  p_idempotency_key => '80000000-0000-0000-0000-000000000041'::uuid
) as summary;
select set_config('test.cbs_income_pending', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'income',
  p_amount_ngn => 900,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => null, p_payer_payee => 'B. Member', p_source_note => 'Pledged income',
  p_payment_method => 'cash', p_payment_status => 'pending',
  p_idempotency_key => '80000000-0000-0000-0000-000000000042'::uuid
) as summary;

-- Paid and deposit expenses leave the account; a pending expense does not.
select set_config('test.cbs_expense_paid', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 200,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => 'Hall decoration', p_payer_payee => 'Community Decorators',
  p_source_note => null, p_payment_method => null,
  p_idempotency_key => '80000000-0000-0000-0000-000000000043'::uuid
) as summary;
select set_config('test.cbs_expense_deposit', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 50,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => 'Sound deposit', p_payer_payee => 'DJ Supplies',
  p_source_note => null, p_payment_method => null, p_payment_status => 'deposit',
  p_idempotency_key => '80000000-0000-0000-0000-000000000044'::uuid
) as summary;
select set_config('test.cbs_expense_pending', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 300,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => 'Catering invoice', p_payer_payee => 'Catering Co',
  p_source_note => null, p_payment_method => null, p_payment_status => 'pending',
  p_idempotency_key => '80000000-0000-0000-0000-000000000045'::uuid
) as summary;

-- Two tickets at the tier price of 500 each.
select set_config('test.cbs_sale', cash.sale_id::text, true)
from public.record_event_ticket_sale(
  p_event_id => current_setting('test.cbs_event')::uuid,
  p_tier_id => current_setting('test.cbs_tier')::uuid, p_quantity => 2,
  p_buyer_name => 'Ticket buyer', p_payment_method => 'cash',
  p_idempotency_key => '80000000-0000-0000-0000-000000000046'::uuid
) as cash;
reset role;

-- Event cash: income paid 700 + tickets 1000 = 1700 in;
-- expense paid 200 + deposit 50 = 250 out; net 1450.
select is(
  (select inflow from private.event_cash_totals(current_setting('test.cbs_event')::uuid)),
  1700::numeric,
  'event inflow is paid event income plus unrefunded ticket sales'
);
select is(
  (select outflow from private.event_cash_totals(current_setting('test.cbs_event')::uuid)),
  250::numeric,
  'event outflow is paid and deposit event expenses only'
);
select is(
  (select net from private.event_cash_totals(current_setting('test.cbs_event')::uuid)),
  1450::numeric,
  'event net is inflow minus outflow'
);
select is(
  (select net from private.event_cash_totals(null)),
  1450::numeric,
  'a null event scope aggregates every event'
);
select is(
  (select net from private.event_cash_totals('00000000-0000-0000-0000-000000000000'::uuid)),
  0::numeric,
  'an unknown event has no cash rather than failing the aggregate'
);
select throws_ok(
  $$select transaction_id from public.record_event_financial_transaction(
    p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'income',
    p_amount_ngn => 100,
    p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    p_description => null, p_payer_payee => null, p_source_note => 'Deposit income',
    p_payment_method => 'cash', p_payment_status => 'deposit',
    p_idempotency_key => '80000000-0000-0000-0000-000000000047'::uuid)$$,
  '23514', 'The event financial transaction values are invalid.',
  'a deposit cannot be recorded as event income, so deposit money is only ever an outflow'
);

select * from finish();

rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase test db --local supabase/tests/database/club_event_shared_balance_test.sql`
Expected: FAIL — `private.event_cash_totals(uuid)` does not exist (the helper assertions error out). If instead the *fixture* errors first, fix the fixture before continuing; the RPC parameter names and defaults come from [supabase/migrations/20261027233000_allow_event_revenue_category.sql:2-54](../../../supabase/migrations/20261027233000_allow_event_revenue_category.sql#L2-L54) and [supabase/migrations/20261025123000_event_payment_methods.sql:420-468](../../../supabase/migrations/20261025123000_event_payment_methods.sql#L420-L468).

If the local stack is behind the repository, apply migrations first: `npx supabase db push --local --include-all`.

- [ ] **Step 3: Create the migration with the helper and the rewired closing trigger**

Create `supabase/migrations/20261102150000_club_event_shared_balance.sql`:

```sql
-- One bank account backs club and event money. Event cash is club money from
-- the moment it moves, so the club balance reads it live instead of waiting for
-- the end-of-event ledger posting. This helper is the single definition of
-- "event cash" for the live summary and for the closing snapshot, so the two
-- cannot drift apart.

create or replace function private.event_cash_totals(p_event_id uuid)
returns table (inflow numeric, outflow numeric, net numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select totals.v_inflow, totals.v_outflow, totals.v_inflow - totals.v_outflow
  from (
    select
      (
        coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
          from public.event_financial_transactions as t
          where t.kind = 'income' and t.payment_status = 'paid'
            and t.voided_at is null
            and (p_event_id is null or t.event_id = p_event_id)), 0::numeric)
        + coalesce((select pg_catalog.sum(s.amount_ngn::numeric)
          from public.event_ticket_sales as s
          where s.refunded_at is null
            and (p_event_id is null or s.event_id = p_event_id)), 0::numeric)
      )::numeric as v_inflow,
      coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
        from public.event_financial_transactions as t
        where t.kind = 'expense' and t.payment_status in ('paid', 'deposit')
          and t.voided_at is null
          and (p_event_id is null or t.event_id = p_event_id)), 0::numeric
      )::numeric as v_outflow
  ) as totals;
$function$;

revoke all on function private.event_cash_totals(uuid)
  from public, anon, authenticated, service_role;

-- The closing posting now reads the same helper. Its generation, entry_kind,
-- event_status, created_by, audit rows and append-only guard dance are
-- unchanged; only the arithmetic source moves.
create or replace function private.sync_event_status_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_signed_amount numeric(30, 0);
  v_generation integer;
  v_posting public.event_ledger_entries%rowtype;
  v_ledger_id uuid;
begin
  if old.status = new.status then return new; end if;
  if old.status = 'scheduled' and new.status in ('completed', 'cancelled') then
    select cash.net::numeric(30, 0) into v_signed_amount
      from private.event_cash_totals(new.id) as cash;
    select coalesce(pg_catalog.max(le.generation), 0) + 1 into v_generation
      from public.event_ledger_entries as le where le.event_id = new.id;
    perform pg_catalog.set_config('app.event_ledger_insert', 'on', true);
    insert into public.event_ledger_entries (
      event_id, generation, entry_kind, event_status, signed_amount_ngn, created_by
    ) values (
      new.id, v_generation, 'posting', new.status, v_signed_amount, new.status_changed_by
    ) returning id into v_ledger_id;
    perform pg_catalog.set_config('app.event_ledger_insert', 'off', true);
    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
    ) values (
      new.status_changed_by, 'event_ledger_posted', 'event_ledger_entry', v_ledger_id, new.id,
      null, pg_catalog.jsonb_build_object('event_id', new.id, 'generation', v_generation,
        'event_status', new.status, 'signed_amount_ngn', v_signed_amount),
      'Automatic event ledger post on event completion or cancellation.'
    );
  elsif old.status in ('completed', 'cancelled') and new.status = 'scheduled' then
    select le.* into v_posting from public.event_ledger_entries as le
      where le.event_id = new.id and le.entry_kind = 'posting'
        and not exists (
          select 1 from public.event_ledger_entries as rev
          where rev.entry_kind = 'reversal' and rev.reverses_entry_id = le.id
        )
      order by le.generation desc limit 1 for update;
    if found then
      perform pg_catalog.set_config('app.event_ledger_insert', 'on', true);
      insert into public.event_ledger_entries (
        event_id, generation, entry_kind, event_status, signed_amount_ngn,
        reverses_entry_id, created_by
      ) values (
        new.id, v_posting.generation, 'reversal', old.status,
        -v_posting.signed_amount_ngn, v_posting.id, new.status_changed_by
      ) returning id into v_ledger_id;
      perform pg_catalog.set_config('app.event_ledger_insert', 'off', true);
      insert into public.audit_log (
        actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
      ) values (
        new.status_changed_by, 'event_ledger_reversed', 'event_ledger_entry', v_ledger_id, new.id,
        pg_catalog.jsonb_build_object('posting_id', v_posting.id,
          'signed_amount_ngn', v_posting.signed_amount_ngn),
        pg_catalog.jsonb_build_object('event_id', new.id, 'reverses_entry_id', v_posting.id,
          'signed_amount_ngn', -v_posting.signed_amount_ngn),
        'Automatic event ledger reversal on event reopening.'
      );
    end if;
  end if;
  return new;
end;
$function$;
```

Before saving, diff the trigger body against the live definition in [supabase/migrations/20261013040328_event_finance_workspace_slk_behaviour.sql:299-367](../../../supabase/migrations/20261013040328_event_finance_workspace_slk_behaviour.sql#L299-L367). The only intended difference is the `select … into v_signed_amount` block.

- [ ] **Step 4: Apply locally and run the suite**

Run: `npx supabase db push --local --include-all`
Then: `npx supabase test db --local supabase/tests/database/club_event_shared_balance_test.sql`
Expected: PASS — zero `not ok` lines in this file.

- [ ] **Step 5: Confirm the existing closing-posting suite still agrees**

Run: `npx supabase test db --local supabase/tests/database/event_finance_ticketing_ledger_test.sql`
Expected: the posting/reversal assertions at `:451-455` and `:476-480` still pass (₦1850 / −₦1850) because the helper reproduces the old expression; only the balance assertion at `:481` fails, and Task 2 owns it. Record that failure — do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261102150000_club_event_shared_balance.sql supabase/tests/database/club_event_shared_balance_test.sql
git commit -m "feat(finance): define event cash once and source the closing posting from it"
```

---

### Task 2: The club summary reads live event cash and stops reading postings

**Files:**
- Modify: `supabase/migrations/20261102150000_club_event_shared_balance.sql` (append)
- Modify: `supabase/tests/database/club_event_shared_balance_test.sql` (append, before `select * from finish();`)
- Modify: `supabase/tests/database/event_finance_ticketing_ledger_test.sql:481-482`
- Read for reference: [supabase/migrations/20261027170450_opening_balance_classification.sql:29-64](../../../supabase/migrations/20261027170450_opening_balance_classification.sql#L29-L64)

**Interfaces:**
- Consumes: `private.event_cash_totals(uuid)` from Task 1, `private.club_dues_income_total()`, `private.is_active_club_member()`.
- Produces: `private.club_finance_summary_core()`, `private.club_finance_summary()` and `public.club_finance_summary()` all returning `table (dues_income numeric, other_income numeric, expenses numeric, event_inflow numeric, event_outflow numeric, balance numeric)`. Task 3 reads the two new keys through the report function; Tasks 4–5 read them in the app.

- [ ] **Step 1: Append the failing summary assertions**

Insert into `supabase/tests/database/club_event_shared_balance_test.sql` immediately before `select * from finish();`:

```sql
-- The club balance now contains event cash while the event is still open, and
-- event money is not a club line item.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 1450::numeric,
  'the club balance contains live event cash before the event closes');
select is(
  (select event_inflow from public.club_finance_summary()), 1700::numeric,
  'the summary reports event inflow as its own line');
select is(
  (select event_outflow from public.club_finance_summary()), 250::numeric,
  'the summary reports event outflow as its own line');
select is(
  (select other_income from public.club_finance_summary()), 0::numeric,
  'event income never enters club other income');
select is(
  (select expenses from public.club_finance_summary()), 0::numeric,
  'event expenses never enter club expenses');
reset role;

-- Money leaving the event leaves the club balance too, without any posting.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.void_event_financial_transaction(current_setting('test.cbs_expense_paid')::uuid, 'Decoration cancelled')$$,
  'Admin can void the paid event expense');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select event_outflow from public.club_finance_summary()), 50::numeric,
  'a voided event expense leaves the club balance immediately');
select is(
  (select balance from public.club_finance_summary()), 1650::numeric,
  'the club balance follows the voided expense');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.refund_event_ticket_sale(current_setting('test.cbs_sale')::uuid, 'Buyer refunded')$$,
  'Admin can refund the ticket sale');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select event_inflow from public.club_finance_summary()), 700::numeric,
  'a refunded ticket sale leaves the club balance immediately');
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'the club balance follows the refund');
reset role;

-- Closing posts the same money that is already in the balance.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.set_event_status(current_setting('test.cbs_event')::uuid, 'completed', 'Shared balance test close')$$,
  'Admin can complete the event');
select is(
  (select signed_amount_ngn from public.event_ledger_entries
    where event_id = current_setting('test.cbs_event')::uuid
      and entry_kind = 'posting' and generation = 1),
  650::numeric,
  'the closing posting equals that event''s live cash net');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'closing the event does not move the club balance');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.set_event_status(current_setting('test.cbs_event')::uuid, 'scheduled', 'Shared balance test reopen')$$,
  'Admin can reopen the completed event');
select is(
  (select signed_amount_ngn from public.event_ledger_entries
    where event_id = current_setting('test.cbs_event')::uuid
      and entry_kind = 'reversal' and generation = 1),
  -650::numeric,
  'reopening appends the equal opposite audit row');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'reopening does not reverse money out of the club balance');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.set_event_status(current_setting('test.cbs_event')::uuid, 'cancelled', 'Shared balance test cancel')$$,
  'Admin can cancel the reopened event');
select is(
  (select count(*) from public.event_ledger_entries
    where event_id = current_setting('test.cbs_event')::uuid and entry_kind = 'posting'),
  2::bigint,
  'the second close appends a fresh posting generation');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'the second posting still leaves the club balance unchanged');
reset role;

-- A posting row, on its own, must not be money.
select set_config('app.event_ledger_insert', 'on', true);
insert into public.event_ledger_entries (
  event_id, generation, entry_kind, event_status, signed_amount_ngn, created_by
) values (
  current_setting('test.cbs_event')::uuid, 98, 'posting', 'completed', 99999,
  '00000000-0000-0000-0000-000000000841'
);
select set_config('app.event_ledger_insert', 'off', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'an event ledger row alone never moves the club balance');
select is(
  (select other_income from public.club_finance_summary()), 0::numeric,
  'a positive posting row never enters club other income');
select is(
  (select expenses from public.club_finance_summary()), 0::numeric,
  'a negative posting row never enters club expenses');
reset role;

-- The member gate is unchanged, and the internals are not callable.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000843', true);
select is((select count(*) from public.club_finance_summary()), 0::bigint,
  'a staff profile still gets no club aggregate');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000844', true);
select is((select count(*) from public.club_finance_summary()), 0::bigint,
  'a pending profile gets no club aggregate');
select throws_ok($$select * from private.club_finance_summary_core()$$, '42501', null,
  'members cannot execute the summary core');
select throws_ok($$select * from private.event_cash_totals(null)$$, '42501', null,
  'members cannot execute the event cash helper');
reset role;

select ok(
  not has_function_privilege('authenticated', 'private.club_finance_summary_core()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.event_cash_totals(uuid)', 'EXECUTE')
  and has_function_privilege('private.club_finance_summary()', 'authenticated', 'EXECUTE')
  and has_function_privilege('public.club_finance_summary()', 'authenticated', 'EXECUTE')
  and not has_function_privilege('public.club_finance_summary()', 'anon', 'EXECUTE'),
  'only the gated wrappers are callable and the internals stay revoked'
);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase test db --local supabase/tests/database/club_event_shared_balance_test.sql`
Expected: FAIL — `column "event_inflow" does not exist` and, for the last block, `private.club_finance_summary_core() does not exist`.

- [ ] **Step 3: Append the summary functions and grants to the migration**

Append to `supabase/migrations/20261102150000_club_event_shared_balance.sql`:

```sql
-- The club formula. Event postings are no longer summed anywhere in it; live
-- event cash is, as its own inflow and outflow lines. The return type changed,
-- so the old four-column functions are dropped and their grants re-applied.
drop function if exists public.club_finance_summary();
drop function if exists private.club_finance_summary();
drop function if exists private.club_finance_summary_core();

create or replace function private.club_finance_summary_core()
returns table (dues_income numeric, other_income numeric, expenses numeric,
  event_inflow numeric, event_outflow numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select private.club_dues_income_total()), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'income' and t.is_opening_balance is false and t.voided_at is null), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'expense' and t.voided_at is null), 0)::numeric,
    cash.inflow,
    cash.outflow,
    coalesce((select pg_catalog.sum(dp.amount_ngn) from public.dues_payments as dp
      where dp.payment_method is distinct from 'pre_launch_reconciliation'), 0)::numeric
      + coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + cash.net
  from private.event_cash_totals(null::uuid) as cash;
$function$;

create or replace function private.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric,
  event_inflow numeric, event_outflow numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select summary.* from private.club_finance_summary_core() as summary
  where (select private.is_active_club_member());
$function$;

create or replace function public.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric,
  event_inflow numeric, event_outflow numeric, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.club_finance_summary();
$function$;

revoke all on function private.club_finance_summary_core()
  from public, anon, authenticated, service_role;
revoke all on function private.club_finance_summary()
  from public, anon, service_role;
revoke all on function public.club_finance_summary()
  from public, anon, service_role;
grant execute on function private.club_finance_summary() to authenticated;
grant execute on function public.club_finance_summary() to authenticated;
```

`private.club_finance_summary()` must be granted to `authenticated` because the `SECURITY INVOKER` public wrapper runs with the caller's rights.

- [ ] **Step 4: Run the new suite**

Run: `npx supabase db push --local --include-all`
Then: `npx supabase test db --local supabase/tests/database/club_event_shared_balance_test.sql`
Expected: PASS — zero `not ok` lines in this file.

- [ ] **Step 5: Re-derive the one existing assertion the new rule supersedes**

In [supabase/tests/database/event_finance_ticketing_ledger_test.sql:481-482](../../../supabase/tests/database/event_finance_ticketing_ledger_test.sql#L481-L482), replace:

```sql
select is((select balance from public.club_finance_summary()), 0::numeric,
  'club balance nets the original event post and its reversal');
```

with:

```sql
select is((select balance from public.club_finance_summary()), 1850::numeric,
  'club balance holds the event cash itself, not the post and its reversal');
```

The value is the event's live net, which that suite already proves is ₦1850 at `:357-359` and at the closing assertion `:451-455`. The next balance assertion in that file, `:497` (`1850::numeric` after the cancel), stays as written — under the new rule it is still correct, for a different reason, so update only its message:

```sql
select is((select balance from public.club_finance_summary()), 1850::numeric,
  'club balance keeps counting the live event cash after the second posting');
```

- [ ] **Step 6: Verify the other four suites named in the spec need no edit**

Run each and require zero `not ok` in that file:

```
npx supabase test db --local supabase/tests/database/club_finances_test.sql
npx supabase test db --local supabase/tests/database/pre_launch_financial_onboarding_test.sql
npx supabase test db --local supabase/tests/database/report_exports_test.sql
npx supabase test db --local supabase/tests/database/event_finance_ticketing_ledger_test.sql
```

Expected: all pass unchanged except the two lines edited in Step 5. `club_finances_test.sql` asserts `other_income 4000 / expenses 12500 / balance -8500` with no event rows in its fixture, and the new `event_inflow`/`event_outflow` columns are additive, so those numbers are unaffected. `pre_launch_financial_onboarding_test.sql:405-431` and `report_exports_test.sql:54-58` likewise contain no event rows. If any of them fail, the failure is real double counting or a lost grant — fix the migration, not the assertion.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261102150000_club_event_shared_balance.sql supabase/tests/database/club_event_shared_balance_test.sql supabase/tests/database/event_finance_ticketing_ledger_test.sql
git commit -m "feat(finance): count live event cash in the club balance, not postings"
```

---

### Task 3: Report data carries the event cash lines

**Files:**
- Modify: `supabase/migrations/20261102150000_club_event_shared_balance.sql` (append)
- Modify: `supabase/tests/database/club_event_shared_balance_test.sql` (append)
- Read for reference: [supabase/migrations/20261027170450_opening_balance_classification.sql:149-228](../../../supabase/migrations/20261027170450_opening_balance_classification.sql#L149-L228)

**Interfaces:**
- Consumes: `public.club_finance_summary()` six-column row from Task 2.
- Produces: `public.club_finance_report_data()` whose `summary` object has the text keys `dues_income`, `other_income`, `expenses`, `event_inflow`, `event_outflow`, `balance`. Task 5's route validates and renders exactly these.

- [ ] **Step 1: Append the failing report assertions**

Insert before `select * from finish();` in `supabase/tests/database/club_event_shared_balance_test.sql`:

```sql
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (public.club_finance_report_data()->'summary'->>'event_inflow')::numeric, 700::numeric,
  'the report summary exposes event inflow');
select is(
  (public.club_finance_report_data()->'summary'->>'event_outflow')::numeric, 50::numeric,
  'the report summary exposes event outflow');
select is(
  (public.club_finance_report_data()->'summary'->>'balance')::numeric, 650::numeric,
  'the report balance matches the live club summary');
select is(
  jsonb_array_length(public.club_finance_report_data()->'transactions'), 0,
  'event money never enters the club transaction list');
reset role;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase test db --local supabase/tests/database/club_event_shared_balance_test.sql`
Expected: FAIL — the `event_inflow` lookup yields NULL and `NULL::numeric` fails the comparison.

- [ ] **Step 3: Append the report function and the schema reload to the migration**

Append to `supabase/migrations/20261102150000_club_event_shared_balance.sql`:

```sql
-- The export snapshot reports event cash as its own lines. It stays SECURITY
-- INVOKER, so the member gate and every grant still apply, and its transaction
-- list stays club-only.
create or replace function public.club_finance_report_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with report_period as (
    select (pg_catalog.transaction_timestamp() at time zone 'Africa/Lagos')::date as as_of
  ),
  bounds as (
    select
      extract(year from report_period.as_of)::integer as report_year,
      pg_catalog.date_trunc('year', report_period.as_of::timestamp)::date as period_start,
      report_period.as_of,
      (pg_catalog.date_trunc('year', report_period.as_of::timestamp) + interval '1 year')::date as next_year
    from report_period
  ),
  transaction_rows as (
    select
      finance_txn.id,
      finance_txn.kind,
      finance_txn.is_opening_balance,
      finance_txn.amount_ngn::text as amount_ngn,
      finance_txn.transaction_date::text as transaction_date,
      finance_txn.description,
      finance_txn.category_name_snapshot,
      finance_txn.payer_payee,
      finance_txn.source_note,
      finance_txn.voided_at::text as voided_at,
      finance_txn.void_reason,
      finance_txn.created_at
    from public.club_financial_transactions as finance_txn
    cross join bounds
    where finance_txn.transaction_date >= bounds.period_start
      and finance_txn.transaction_date < bounds.next_year
    order by finance_txn.transaction_date, finance_txn.created_at, finance_txn.id
    limit 1001
  )
  select pg_catalog.jsonb_build_object(
    'year', bounds.report_year,
    'as_of', bounds.as_of::text,
    'row_count', (
      select pg_catalog.count(*)::text
      from public.club_financial_transactions as finance_txn
      where finance_txn.transaction_date >= bounds.period_start
        and finance_txn.transaction_date < bounds.next_year
    ),
    'summary', (
      select pg_catalog.jsonb_build_object(
        'dues_income', summary.dues_income::text,
        'other_income', summary.other_income::text,
        'expenses', summary.expenses::text,
        'event_inflow', summary.event_inflow::text,
        'event_outflow', summary.event_outflow::text,
        'balance', summary.balance::text
      )
      from public.club_finance_summary() as summary
    ),
    'transactions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', transaction_rows.id,
          'kind', transaction_rows.kind,
          'is_opening_balance', transaction_rows.is_opening_balance,
          'amount_ngn', transaction_rows.amount_ngn,
          'transaction_date', transaction_rows.transaction_date,
          'description', transaction_rows.description,
          'category_name_snapshot', transaction_rows.category_name_snapshot,
          'payer_payee', transaction_rows.payer_payee,
          'source_note', transaction_rows.source_note,
          'voided_at', transaction_rows.voided_at,
          'void_reason', transaction_rows.void_reason
        )
        order by transaction_rows.transaction_date, transaction_rows.created_at, transaction_rows.id
      )
      from transaction_rows
    ), '[]'::jsonb)
  )
  from bounds
  where (select private.is_active_club_member());
$function$;

-- The summary RPC changed row shape; without this PostgREST keeps serving the
-- four-column signature.
notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run both affected suites**

Run: `npx supabase db push --local --include-all`
Then:

```
npx supabase test db --local supabase/tests/database/club_event_shared_balance_test.sql
npx supabase test db --local supabase/tests/database/report_exports_test.sql
```

Expected: both PASS, zero `not ok` in each file.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261102150000_club_event_shared_balance.sql supabase/tests/database/club_event_shared_balance_test.sql
git commit -m "feat(finance): expose event cash lines in the club report snapshot"
```

---

### Task 4: Show event cash as its own card and relabel the posting panel

**Files:**
- Modify: `src/components/finances/club-financial-summary.tsx:12-18`, `:56`, `:128`
- Modify: `src/components/finances/finances-page-view.tsx:52-57`, `:323-329`
- Modify: `src/components/finances/event-ledger-section.tsx:48-63`
- Create: `tests/club-event-shared-balance-ui.test.mjs`

**Interfaces:**
- Consumes: `club_finance_summary()` row with `event_inflow` / `event_outflow`, forwarded structurally by [src/app/(member)/finances/page.tsx:325](../../../src/app/(member)/finances/page.tsx#L325).
- Produces: `ClubFinancialSummary` props `eventInflow` and `eventOutflow`; a fifth summary card; the audit-snapshot copy in the posting panel.

- [ ] **Step 1: Write the failing app test**

Create `tests/club-event-shared-balance-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const summarySource = readFileSync(
  new URL("../src/components/finances/club-financial-summary.tsx", import.meta.url),
  "utf8"
);
const viewSource = readFileSync(
  new URL("../src/components/finances/finances-page-view.tsx", import.meta.url),
  "utf8"
);
const ledgerSource = readFileSync(
  new URL("../src/components/finances/event-ledger-section.tsx", import.meta.url),
  "utf8"
);

describe("Club event shared balance UI", () => {
  it("carries the two event cash fields through the summary props", () => {
    assert.match(
      viewSource,
      /event_inflow\?:\s*number \| string \| null;/,
      "the page view type must accept the RPC's event inflow"
    );
    assert.match(
      viewSource,
      /event_outflow\?:\s*number \| string \| null;/,
      "the page view type must accept the RPC's event outflow"
    );
    assert.match(viewSource, /eventInflow=\{summary\?\.event_inflow\}/);
    assert.match(viewSource, /eventOutflow=\{summary\?\.event_outflow\}/);
  });

  it("renders event cash as its own card without touching the club lines", () => {
    assert.match(summarySource, /eventInflow,\s*\n\s*eventOutflow,/);
    assert.match(summarySource, /lg:grid-cols-5/);
    assert.doesNotMatch(summarySource, /lg:grid-cols-4/);
    assert.match(summarySource, /Event Cash/);
    assert.match(summarySource, /formatNaira\(eventNet\)/);
    assert.match(summarySource, /formatNaira\(eventInflow\)/);
    assert.match(summarySource, /formatNaira\(eventOutflow\)/);
  });

  it("labels the event posting panel as audit history that is not counted", () => {
    assert.match(ledgerSource, /not counted in the balance/);
    assert.doesNotMatch(
      ledgerSource,
      /Automated financial reconciliation from completed or cancelled/,
      "the old copy implied the postings feed the club totals"
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/club-event-shared-balance-ui.test.mjs`
Expected: FAIL on the first assertion (`event_inflow?:` not found).

- [ ] **Step 3: Add the two props to the summary component and the fifth card**

In `src/components/finances/club-financial-summary.tsx`, extend the props interface:

```tsx
interface ClubFinancialSummaryProps {
  currentBalance: number | string | null | undefined;
  duesIncome: number | string | null | undefined;
  otherIncome: number | string | null | undefined;
  totalExpenses: number | string | null | undefined;
  eventInflow: number | string | null | undefined;
  eventOutflow: number | string | null | undefined;
  isUnavailable?: boolean;
}
```

and the destructuring:

```tsx
export function ClubFinancialSummary({
  currentBalance,
  duesIncome,
  otherIncome,
  totalExpenses,
  eventInflow,
  eventOutflow,
  isUnavailable = false,
}: ClubFinancialSummaryProps) {
```

Add the net just inside the component body, above the `return`:

```tsx
  const inflow = Number(eventInflow ?? 0);
  const outflow = Number(eventOutflow ?? 0);
  const eventNet = inflow - outflow;
```

Change the grid class at `:56` from `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`, and insert the new card after the Total Expenses card, before the closing `</div>` of the grid:

```tsx
          {/* 5. Event Cash (Same Account) */}
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#D6A23A]/40">
            <div>
              <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  Event Cash (Live)
                </span>
                <Scale className="w-4 h-4 text-[#D6A23A]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#3D291F] tracking-tight tabular-nums">
                {formatNaira(eventNet)}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#54433A]">
                <span>In {formatNaira(eventInflow)}</span>
                <span>Out {formatNaira(eventOutflow)}</span>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
              <span>
                One account, so it counts as it moves - never as club income or
                expenses
              </span>
            </div>
          </div>
```

Add `Scale` to the `lucide-react` import at the top of the file:

```tsx
import {
  AlertCircle,
  Coins,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
```

- [ ] **Step 4: Forward the fields from the page view**

In `src/components/finances/finances-page-view.tsx`, extend the `summary` type at `:52-57`:

```tsx
  summary: {
    balance?: number | string | null;
    dues_income?: number | string | null;
    other_income?: number | string | null;
    expenses?: number | string | null;
    event_inflow?: number | string | null;
    event_outflow?: number | string | null;
  } | null;
```

and pass the new props at `:323-329`:

```tsx
        <ClubFinancialSummary
          currentBalance={summary?.balance}
          duesIncome={summary?.dues_income}
          eventInflow={summary?.event_inflow}
          eventOutflow={summary?.event_outflow}
          isUnavailable={financeUnavailable}
          otherIncome={summary?.other_income}
          totalExpenses={summary?.expenses}
        />
```

- [ ] **Step 5: Relabel the posting panel**

In `src/components/finances/event-ledger-section.tsx`, replace the heading and subtext at `:51-60`:

```tsx
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="event-ledger-heading"
            >
              Event Close Postings
            </h2>
            <p className="text-xs text-[#54433A] font-medium">
              Audit snapshot of each completed or cancelled event - not counted
              in the balance
            </p>
```

- [ ] **Step 6: Run the app tests and the linter**

Run: `node --test tests/club-event-shared-balance-ui.test.mjs`
Expected: PASS.
Run: `npm run lint`
Expected: no errors. Fix any Biome complaint (import order, trailing commas) before committing.

- [ ] **Step 7: Commit**

```bash
git add src/components/finances/club-financial-summary.tsx src/components/finances/finances-page-view.tsx src/components/finances/event-ledger-section.tsx tests/club-event-shared-balance-ui.test.mjs
git commit -m "feat(ui): show event cash as its own club summary card"
```

---

### Task 5: Export the event cash lines in CSV and PDF

**Files:**
- Modify: `src/app/api/reports/[report]/route.ts:124-135` (CSV summary rows)
- Modify: `src/app/api/reports/[report]/route.ts:165-172` (PDF summary lines)
- Modify: `src/app/api/reports/[report]/route.ts:318-323` (validation list)
- Create: `tests/club-event-shared-balance-export.test.mjs`

**Interfaces:**
- Consumes: `club_finance_report_data()->'summary'` keys from Task 3, already read as `summary: Record<string, string | number>` at `:102` / `:161`.
- Produces: two extra CSV summary rows, two extra PDF lines, and two extra validated keys.

- [ ] **Step 1: Write the failing app test**

Create `tests/club-event-shared-balance-export.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/app/api/reports/[report]/route.ts", import.meta.url),
  "utf8"
);

const csvSection = source.slice(
  source.indexOf("function financeRowsToCsv"),
  source.indexOf("function financeRowsToPdf")
);
const pdfSection = source.slice(
  source.indexOf("function financeRowsToPdf"),
  source.indexOf("async function createFinanceExport")
);
const validationStart = source.indexOf("for (const field of [");
assert.notEqual(
  validationStart,
  -1,
  "the summary-key validation loop must exist"
);
const validationSection = source.slice(
  validationStart,
  source.indexOf("] as const", validationStart)
);

const SUMMARY_KEYS = [
  "dues_income",
  "other_income",
  "expenses",
  "event_inflow",
  "event_outflow",
  "balance",
];

describe("Club event shared balance exports", () => {
  for (const key of SUMMARY_KEYS) {
    it(`renders and validates summary.${key}`, () => {
      assert.match(
        csvSection,
        new RegExp(`String\\(summary\\.${key}\\)`),
        `the CSV must carry a row for ${key}`
      );
      assert.match(
        pdfSection,
        new RegExp(`formatPdfAmount\\(summary\\.${key}\\)`),
        `the PDF must carry a line for ${key}`
      );
      assert.match(
        validationSection,
        new RegExp(`"${key}"`),
        `${key} must be validated before the export is built`
      );
    });
  }

  it("names the event cash lines as event money, not club money", () => {
    assert.match(csvSection, /All-time event cash in \(NGN\)/);
    assert.match(csvSection, /All-time event cash out \(NGN\)/);
    assert.match(pdfSection, /All-time event cash in: /);
    assert.match(pdfSection, /All-time event cash out: /);
    assert.doesNotMatch(csvSection, /Event (income|expenses) \(NGN\)/);
  });

  it("keeps event rows out of the club transaction list", () => {
    assert.match(
      csvSection,
      /transactions\.map\(\(transaction\) => \[/,
      "the CSV transaction rows still come from the club ledger only"
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/club-event-shared-balance-export.test.mjs`
Expected: FAIL on `renders and validates summary.event_inflow`.

- [ ] **Step 3: Add the CSV summary rows**

In `src/app/api/reports/[report]/route.ts`, between the expenses row and the balance row at `:134-135`:

```tsx
    ["All-time expenses (NGN)", String(summary.expenses), ...emptyColumns],
    [
      "All-time event cash in (NGN)",
      String(summary.event_inflow),
      ...emptyColumns,
    ],
    [
      "All-time event cash out (NGN)",
      String(summary.event_outflow),
      ...emptyColumns,
    ],
    ["Current club balance (NGN)", String(summary.balance), ...emptyColumns],
```

- [ ] **Step 4: Add the PDF summary lines**

In the same file at `:165-171`, insert the two lines between expenses and balance:

```tsx
    `All-time expenses: ${formatPdfAmount(summary.expenses)}`,
    `All-time event cash in: ${formatPdfAmount(summary.event_inflow)}`,
    `All-time event cash out: ${formatPdfAmount(summary.event_outflow)}`,
    `Current club balance: ${formatPdfAmount(summary.balance)}`,
```

`formatPdfAmount` returns `null` for a non-integer value and the caller already bails to the unavailable state on `null`, so no extra guard is needed.

- [ ] **Step 5: Validate the new keys**

At `:318-323`, extend the loop so the export fails closed if the migration has not been applied:

```tsx
  for (const field of [
    "dues_income",
    "other_income",
    "expenses",
    "event_inflow",
    "event_outflow",
    "balance",
  ] as const) {
    if (wholeNgn(summary[field] as string | number) === null)
      return { kind: "unavailable" as const };
  }
```

- [ ] **Step 6: Run the app tests and the linter**

Run: `node --test tests/club-event-shared-balance-export.test.mjs`
Expected: PASS.
Run: `node --test`
Expected: the whole app suite passes, including `tests/home-dashboard.test.mjs` (its RPC-name list is unaffected) and `tests/admin-financial-settings-components.test.mjs`.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/reports/[report]/route.ts" tests/club-event-shared-balance-export.test.mjs
git commit -m "feat(reports): export event cash lines alongside the club summary"
```

---

### Task 6: Full gate, clean baseline, and the operator runbook

**Files:**
- Create: `docs/superpowers/runbooks/2026-11-03-club-event-shared-balance-production.md`
- Modify: `docs/data-access-matrix.md:386-390`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a verified local stack, a recorded production apply procedure, and one documented data-access line.

- [ ] **Step 1: Clean baseline and the whole database gate**

Run: `npx supabase db reset --local`
Expected: migrations apply in order with no error; the new migration runs last in its directory slot.
Run: `npx supabase test db --local`
Expected: the new suite reports zero `not ok`. The known drift is seven pre-existing stale-name suite-level failures; anything else is a regression. Record the exact failing file names in the commit message so the next person can compare.

- [ ] **Step 2: Whole app gate**

Run:

```
npm run lint
node --test
npm run build
```

Expected: all three succeed. A build failure here is real — the summary prop types and the report route are compiled.

- [ ] **Step 3: Verify the balance on screen**

Start the production build (`npm run start`, port 3001 per this project's verification convention) and sign in as an active member. Check, in one pass:
- The strip shows five cards; the fifth reads "Event Cash (Live)" with In/Out figures whose difference equals the headline.
- "All-Time Current Balance" equals dues + club income − club expenses + (event in − event out); compute it by hand from the other four cards plus the new one.
- The club ledger list contains no event rows.
- The posting panel is titled "Event Close Postings" and says the rows are not counted in the balance.
- `POST /api/reports/finances` in CSV and PDF each carries the two new lines.

If the browser cannot be driven here, say so explicitly in the final report instead of claiming the check passed.

- [ ] **Step 4: Record the new report keys in the data-access matrix**

In `docs/data-access-matrix.md`, extend the `club_finance_report_data()` bullet at `:386-390` with one sentence:

```markdown
  Its `summary` object now also carries `event_inflow` and `event_outflow`, so
  an export states the event cash that is inside the club balance without
  listing any event row as a club transaction.
```

- [ ] **Step 5: Write the operator-gated production runbook**

Create `docs/superpowers/runbooks/2026-11-03-club-event-shared-balance-production.md`:

```markdown
# Production apply: club & event shared balance

Status: operator-gated. Nothing in this document is run by the agent.

## Order of operations

1. Apply the migration to the hosted database:
   `npx supabase db push --linked --include-all`
   (`--linked` targets project `kgihmudjdvwrvteclodl`. Never a bare `db push`
   from a branch that also carries unrelated pending migrations - review the
   pending list it prints first.)
2. Verify the RPC shape and the figures (below).
3. Only then release the app build. The reverse order makes the finance export
   return "unavailable", because the route validates every summary key it
   renders and the four-column RPC cannot satisfy it.

## Before/after snapshot

Run as a database role that can see the tables (the CLI connects as `postgres`):

    select id, full_name, status from public.member_profiles
    where status = 'active' order by created_at limit 5;

Take one id, then:

    set role authenticated;
    select set_config('request.jwt.claim.sub', '<that member id>', false);
    select * from public.club_finance_summary();
    reset role;

The gate needs a member subject, and `set local request.jwt.claim.sub = ...`
does nothing for a three-part name - `set_config` is the only form that works.

Recorded by the 2026-11-02 read-only investigation: balance 202000, dues_income
195000, event postings total 0, live scheduled-event cash 368000 in / 242700
out. After the apply expect balance 327300, event_inflow 368000, event_outflow
242700, other_income and expenses unchanged in meaning. Money moved during
November testing changes those expectations, so recompute first:

    select
      (select coalesce(sum(case when kind = 'income' and payment_status = 'paid'
                                  then amount_ngn else 0 end), 0)::numeric
         from public.event_financial_transactions where voided_at is null)
      + (select coalesce(sum(amount_ngn), 0)::numeric
           from public.event_ticket_sales where refunded_at is null)
        as expected_event_inflow,
      (select coalesce(sum(amount_ngn), 0)::numeric
         from public.event_financial_transactions
         where kind = 'expense' and payment_status in ('paid', 'deposit')
           and voided_at is null) as expected_event_outflow;

`expected_event_inflow - expected_event_outflow` added to the pre-apply balance
must equal the new `balance`.

## If PostgREST still returns the old four columns

    notify pgrst, 'reload schema';

The migration already does this; a manual repeat is harmless and fixes a cache
that missed it.

## Rollback

Re-creating the four-column summary is a `drop function` plus the definitions in
`supabase/migrations/20261027170450_opening_balance_classification.sql:29-64`,
then re-granting execute to `authenticated` and notifying PostgREST. App
rollback alone is not enough: the released report route validates the two new
keys and will refuse to export until they exist.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/runbooks/2026-11-03-club-event-shared-balance-production.md docs/data-access-matrix.md
git commit -m "docs(finance): record the shared-balance production apply runbook"
```

- [ ] **Step 7: Hand back to the user**

Report: the local gate results (with the seven known drift failures named), the production apply step is deliberately **not** run, and the screen verification outcome or its absence. Do not open a PR or push without being asked.

---

## Self-Review Notes

Spec coverage: §3.1 invariant → Task 2 core; §3.2 sign convention → Task 2 (`event_inflow`/`event_outflow` asserted as non-negative magnitudes, net derived); §3.3 inherited quirks → Task 1 (`deposit` income rejected, pending money still counted because every fixture row is `verification_status = 'recorded'`, dues guard untouched by design); §4.1–4.4 → Tasks 1–2 including every ordered migration mechanic; §6 app surface → Tasks 4–5; §7 behaviour changes → Task 2's close/reopen/void/refund assertions; §8 failure modes → Task 2's stray-posting test and grant test, Task 5's fail-closed validation; §9.1 cases 1–11 → Tasks 1–2 (case 9 is proved as "money moved after a reopen moves the balance while the frozen posting does not", because both void and refund RPCs reject a non-scheduled event); §9.2 → Tasks 4–5; §9.3–9.4 → Task 6.

Two spec lines were amended while writing this plan, in the same commit. §9.1 case 9's literal wording ("refund after close") is not executable through the RPCs, because both the void and refund RPCs reject a non-scheduled event; the spec now states the invariant as close → reopen → refund/void with the posting rows frozen. §6 named `formatNgn`; the screen helper is `formatNaira`, and the export path keeps `formatNgn` through `formatPdfAmount`.
