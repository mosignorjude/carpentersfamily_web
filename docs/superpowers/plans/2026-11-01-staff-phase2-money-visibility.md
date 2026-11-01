# Staff Phase 2 — money visibility implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff administrators (`member_profiles.status = 'staff'`, the `/admin` panel) read-only visibility into club money — dues standing, the club ledger, event finance, receipts — plus a staff CSV export, without granting them a single write path.

**Architecture:** Every new capability is a `private.*` SECURITY DEFINER function that self-gates on `private.is_staff_administrator()`, exposed through a `public.*` SECURITY INVOKER wrapper — the pattern the codebase already uses for `private.club_finance_summary()` / `public.club_finance_summary()`. **No new RLS policies are added to any money table.** That is deliberate: the event finance tables grant `SELECT` per column across six migrations, so an additive staff policy would silently return empty result sets the moment one column is missing. Reading through definer functions sidesteps that class of bug entirely and keeps staff authority enumerable in one place.

**Tech Stack:** Next.js 16 App Router (server components + `"use server"` actions), Supabase Postgres with pgTAP tests, Node's built-in test runner (`node --test`) for app assertions, Biome for lint/format.

**Spec:** `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md` §8 ("Complete inventory of what a current admin can do"), rows marked `Backlog` / `No`. Parent programme plan: `docs/superpowers/plans/2026-10-29-president-staff-admin-panel.md`. Phase 1 shipped as `9c9b8d7` (2026-10-31).

## Shortlist — what is in this plan

| # | Capability (old admin → staff) | Task |
| --- | --- | --- |
| 1 | Per-member dues standing | T1, T6 |
| 2 | Club finance summary + shared ledger rows | T2, T7 |
| 3 | Event finance workspace (all events) | T3, T8 |
| 4 | Per-event ledger, ticket sales, ticket tiers | T4, T8 |
| 5 | Receipt list + download links | T5, T9 |
| 6 | Finance/dues report export | T10 |
| 7 | Roster context (current club role, dues) | T6 |

## Explicitly deferred (Phase 3 candidates — do not implement here)

Every **write** path: record/correct/write off dues, approve payment requests, record/correct/void club or event transactions, create/retire categories, opening balance, event create/edit/complete/cancel/reopen/archive, assign event roles, ticket tier CRUD, record/refund sales, staged review/verify, minutes, attendance session control and corrections, announcements/polls, settings writes, report PDF output, granting or revoking Executive, and staff notification delivery. Two reasons, both evidence-based:

- These are club-officer powers enforced by `private.is_active_club_member()` (`supabase/migrations/20261002135252_core_membership_roles_rls.sql:128-143`), which a staff profile fails by construction. Opening them means re-deciding the officer model, not extending a query.
- The president and executives hold all of them today, so operations are not blocked. Nothing here is urgent; the read gaps above are, because staff cannot troubleshoot a money complaint they cannot see.

One read gap is also deferred for scope: the per-event **budget matrix lines** in `event_budget_allocations` (the category breakdown under `Operational Cost Centers & Budget Matrix`). Task 3 exposes only the `event_budgets.total_ngn` header figure and the actual ledger sums, so a staff member can see an event's budget total and its real income/spend but not how that budget was allocated line by line. Adding it is a follow-on read RPC in the same style as Task 4; it is left out here because the old-admin screen staff are replacing (`admin/finances`) never showed allocations, so nothing regresses.

## Global Constraints

- **Never run `supabase db push` without `--local`.** Plain `db push` applies migrations to the production database. Local stack commands are `npx supabase db push --local --include-all`, `npx supabase db reset --local`, `npx supabase test db --local`.
- No new RLS policies on `member_profiles`, `club_financial_transactions`, `event_financial_transactions`, `event_ticket_sales`, `event_ledger_entries`, `event_budgets`, `event_budget_allocations`, `dues_*`, or `events`. Reads go through definer functions only.
- New ungranted internals: `*_core` helpers and any function with no gate must be revoked from `public, anon, authenticated, service_role`. Only gated entry points reach `authenticated`.
- Every money/quantity value returned to the app is typed `numeric` and explicitly cast (`t.amount_ngn::numeric`). Never `bigint`/`integer` in a `returns table` — a type drift on a later ALTER breaks the signature.
- Audit action strings must satisfy `check (action ~ '^[a-z][a-z0-9_.-]{0,79}$')` (`20261002135252_core_membership_roles_rls.sql:104`). This phase adds no new action names; it reuses `report_export_requested`.
- Migration filenames sort after the current latest (`20261101010000`): use the `2026110112xxxx` block assigned per task below.
- pgTAP suites in this repo use `select no_plan();` and the local stack carries seven pre-existing stale-name failures. Gate on **zero `not ok` lines in your own suite file**, not on a global green run.
- App tests are Node built-in runner, flat `tests/*.test.mjs`, asserting on `readFileSync` source text — the established staff pattern (`tests/staff-confirmation-resend.test.mjs:5-25`). No Supabase mock layer exists; do not add one.
- Formatting: Biome, double quotes, 2-space indent, trailing commas. Run `npm run lint` before every commit.
- Staff UI copy stays plain and non-technical; money renders through `formatNgn` (`src/lib/report-export.ts:258`).

## File structure

**Created — migrations** (one per DB task, in this order):

- `supabase/migrations/20261101120000_staff_dues_standing_read.sql` — T1
- `supabase/migrations/20261101121000_staff_club_finance_read.sql` — T2
- `supabase/migrations/20261101122000_staff_event_finance_overview.sql` — T3
- `supabase/migrations/20261101123000_staff_event_ledger_read.sql` — T4
- `supabase/migrations/20261101124000_staff_receipt_read.sql` — T5
- `supabase/migrations/20261101125000_staff_report_export_gate.sql` — T10

**Created — tests**

- `supabase/tests/database/staff_money_read_test.sql` — one suite, grows with T1…T5 and T10
- `tests/staff-dues-roster.test.mjs` — T6
- `tests/staff-finances-page.test.mjs` — T7
- `tests/staff-event-finance-page.test.mjs` — T8
- `tests/staff-receipt-links.test.mjs` — T9
- `tests/staff-report-export.test.mjs` — T10

**Created — app**

- `src/lib/staff-money.server.ts` — the only place staff money reads happen (`server-only`)
- `src/components/staff/staff-finance-summary-cards.tsx`
- `src/components/staff/staff-club-ledger-table.tsx`
- `src/components/staff/staff-event-finance-table.tsx`
- `src/components/staff/staff-event-ledger-table.tsx`
- `src/components/staff/staff-receipt-links.tsx`
- `src/app/(staff)/admin/finances/page.tsx`
- `src/app/(staff)/admin/finances/[eventId]/page.tsx`
- `src/app/api/staff-reports/[report]/route.ts`

**Modified**

- `src/app/(staff)/admin/members/page.tsx` — join dues standing + current role
- `src/components/staff/staff-member-table.tsx` — two new columns on `StaffMemberRow`
- `src/components/staff/staff-nav.tsx:9-16` — add the Finances link
- `src/app/(staff)/admin/page.tsx` — overview money stat cards
- `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md` — append §8b result table (T11)

---

## Task 1: Staff dues standing (DB)

**Files:**
- Create: `supabase/migrations/20261101120000_staff_dues_standing_read.sql`
- Test: `supabase/tests/database/staff_money_read_test.sql`

**Interfaces:**
- Consumes: `private.is_staff_administrator()` (`20261029120000_staff_administrator_identity.sql:17`), view `public.dues_month_status` (latest definition `20261101010000_fix_dues_report_and_role_notification_dedup.sql:3-111`).
- Produces: `public.staff_dues_standing()` returning `table(member_id uuid, unpaid_months bigint, overdue_months bigint, open_amount_ngn numeric, last_paid_month date)`. Task 6 calls it as `.rpc("staff_dues_standing")`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/staff_money_read_test.sql`:

```sql
begin;

select no_plan();

-- ===========================================================================
-- Structural checks run first so the suite fails legibly before the
-- reference migration exists.
-- ===========================================================================

select has_function(
  'public', 'staff_dues_standing', array[]::text[],
  'the staff dues standing read RPC exists'
);

-- ===========================================================================
-- Fixtures. Inserted as the migration test owner, then rolled back.
-- UUIDs and statuses mirror supabase/tests/database/president_staff_admin_test.sql:120-174.
-- ===========================================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'executive-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'member-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'staff-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'staff-disabled@example.test', '', '{}'::jsonb, '{}'::jsonb, now());

insert into public.member_profiles (id, full_name, username, status, profile_completed_at) values
  ('00000000-0000-0000-0000-000000000003', 'Executive One', 'executive_one', 'active', now()),
  ('00000000-0000-0000-0000-000000000004', 'Member One', 'member_one', 'active', now()),
  ('00000000-0000-0000-0000-000000000006', 'Staff One', 'staff_one', 'staff', now()),
  ('00000000-0000-0000-0000-000000000008', 'Disabled Staff', 'staff_disabled', 'staff', now());

update public.member_profiles
set staff_disabled_at = now()
where id = '00000000-0000-0000-0000-000000000008';

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000003', 'executive', '00000000-0000-0000-0000-000000000003', 'Initial test executive');

-- Seed dues through the real officer RPCs, exactly as dues_privacy_test.sql does.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000004', 5000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date]
    )$$,
  'fixture: executive records one paid dues month'
);

-- ===========================================================================
-- Staff session
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);

select ok(
  exists (
    select 1 from public.staff_dues_standing()
    where member_id = '00000000-0000-0000-0000-000000000004'
  ),
  'staff see the seeded member in the dues standing read'
);
select is(
  (select unpaid_months from public.staff_dues_standing()
   where member_id = '00000000-0000-0000-0000-000000000004'),
  8::bigint,
  'the eight pre-launch months stay unpaid'
);
select is(
  (select overdue_months from public.staff_dues_standing()
   where member_id = '00000000-0000-0000-0000-000000000004'),
  8::bigint,
  'every pre-launch month is already past its due date'
);
select is(
  (select open_amount_ngn from public.staff_dues_standing()
   where member_id = '00000000-0000-0000-0000-000000000004'),
  40000::numeric,
  'eight months at the 5000 NGN fallback rate'
);
select ok(
  (select last_paid_month from public.staff_dues_standing()
   where member_id = '00000000-0000-0000-0000-000000000004')
  = date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  'the last paid month matches the seeded payment'
);

-- A disabled staff account loses the read as well as the writes.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000008', true);

select is(
  (select count(*) from public.staff_dues_standing()),
  0::bigint,
  'a disabled staff account cannot use the dues standing read'
);

-- Non-staff callers get nothing at all.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select is(
  (select count(*) from public.staff_dues_standing()),
  0::bigint,
  'an active member cannot use the staff dues standing read'
);

select throws_ok(
  $$select count(*) from private.staff_dues_standing()$$,
  '42501',
  'permission denied for function staff_dues_standing',
  'the gated private helper is not directly callable'
);

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: FAIL — `not ok 1 - the staff dues standing read RPC exists` (`has_function` is false because no migration defines it yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261101120000_staff_dues_standing_read.sql`:

```sql
-- Staff Phase 2 (read-only money). One gated definer read per surface; no new
-- RLS policies, because the money tables grant SELECT per column and an
-- additive policy would silently return zero rows if one column were missed.
create or replace function private.staff_dues_standing()
returns table (
  member_id uuid,
  unpaid_months bigint,
  overdue_months bigint,
  open_amount_ngn numeric,
  last_paid_month date
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    dms.member_id,
    pg_catalog.count(*) filter (where dms.status = 'unpaid')::bigint,
    pg_catalog.count(*) filter (where dms.status = 'unpaid' and dms.is_overdue)::bigint,
    pg_catalog.coalesce(
      pg_catalog.sum(dms.amount_ngn) filter (where dms.status = 'unpaid'),
      0
    )::numeric,
    pg_catalog.max(dms.covered_month) filter (where dms.status = 'paid')::date
  from public.dues_month_status as dms
  where (select private.is_staff_administrator())
  group by dms.member_id;
$function$;

create or replace function public.staff_dues_standing()
returns table (
  member_id uuid,
  unpaid_months bigint,
  overdue_months bigint,
  open_amount_ngn numeric,
  last_paid_month date
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.staff_dues_standing();
$function$;

-- The invoker wrapper runs as the caller, so authenticated needs EXECUTE on
-- both halves of the pair. Nothing else is granted.
revoke all on function private.staff_dues_standing() from public, anon, service_role;
revoke all on function public.staff_dues_standing() from public, anon, service_role;
grant execute on function private.staff_dues_standing() to authenticated;
grant execute on function public.staff_dues_standing() to authenticated;
```

- [ ] **Step 4: Apply and re-run**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: PASS, zero `not ok` lines.

If `unpaid_months` is not `8`, the pre-launch month window in `dues_month_status` (`20261101010000_fix_dues_report_and_role_notification_dedup.sql:47-65`, `date '2026-02-01'` through `date '2026-09-01'`) differs from this reading of it. Run `select count(*) from public.dues_month_status where member_id = '00000000-0000-0000-0000-000000000004' and status = 'unpaid'` as the test owner, then correct the expectation and the `40000::numeric` amount to match what the view actually yields — do not change the function to fit a guess.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261101120000_staff_dues_standing_read.sql supabase/tests/database/staff_money_read_test.sql
git commit -m "feat(db): add staff-only dues standing read RPC"
```

---

## Task 2: Club finance summary and ledger reads (DB)

**Files:**
- Create: `supabase/migrations/20261101121000_staff_club_finance_read.sql`
- Test: `supabase/tests/database/staff_money_read_test.sql` (append a section)

**Interfaces:**
- Consumes: `private.is_staff_administrator()`, `private.club_dues_income_total()` (`20261002203635_dues_and_privacy.sql:645-664`), `private.club_finance_summary()` (`20261027170450_opening_balance_classification.sql:29-54`).
- Produces:
  - `public.staff_club_finance_summary()` → `table(dues_income numeric, other_income numeric, expenses numeric, balance numeric)`; same shape as `public.club_finance_summary()`.
  - `public.staff_club_transactions()` → `table(id uuid, kind text, amount_ngn numeric, transaction_date date, description text, category_name_snapshot text, payer_payee text, payment_method text, source_note text, is_opening_balance boolean, voided_at timestamptz, void_reason text, created_at timestamptz)`, newest 500.
  - Internal, ungranted: `private.club_dues_income_total_core()`, `private.club_finance_summary_core()`.
- Reused unchanged: `public.club_finance_summary()` and `public.club_dues_income_total()` keep their signatures and member behaviour, so every existing officer screen and pgTAP assertion still holds.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/database/staff_money_read_test.sql`, before the `-- Staff session` block (structural checks) and after the fixtures (behaviour):

```sql
select has_function(
  'public', 'staff_club_finance_summary', array[]::text[],
  'the staff club finance summary read RPC exists'
);
select has_function(
  'public', 'staff_club_transactions', array[]::text[],
  'the staff club ledger read RPC exists'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'club_finance_summary_core'
      and p.proacl @> array[pg_catalog.to_roleid('authenticated')]
  ),
  'the ungated summary core is not callable by authenticated'
);
```

Then inside the staff session block, after the existing dues assertions:

```sql
-- Seed one club transaction as the executive before switching to staff, so the
-- staff read has something to find. Put this immediately after the dues fixture.
select lives_ok(
  $$select public.record_club_financial_transaction(
      'income', 25000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      'Staff read fixture income', null, 'Test payer', 'fixture', gen_random_uuid()
    )$$,
  'fixture: executive records one club transaction'
);

-- and inside the staff session:
select ok(
  (select balance from public.staff_club_finance_summary()) >= 30000::numeric,
  'staff see a club balance that includes the seeded dues payment and transaction'
);
select is(
  (select count(*) from public.staff_club_transactions()),
  1::bigint,
  'staff read exactly the seeded club ledger row'
);
select is(
  (select kind from public.staff_club_transactions()),
  'income',
  'the ledger read returns the transaction kind'
);
```

And in the non-staff block:

```sql
select is(
  (select count(*) from public.staff_club_finance_summary()),
  0::bigint,
  'an active member cannot use the staff club summary read'
);
select is(
  (select count(*) from public.staff_club_transactions()),
  0::bigint,
  'an active member cannot use the staff club ledger read'
);
select lives_ok(
  $$select * from public.club_finance_summary()$$,
  'the member-facing club summary still works for an active member'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: FAIL — `not ok` on `staff_club_finance_summary` / `staff_club_transactions` existence.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261101121000_staff_club_finance_read.sql`. The two `_core` bodies are the existing SQL moved verbatim, with the member gate lifted out:

```sql
-- Split the gated member functions into an ungated core plus the original
-- public entry point, so the staff read shares one copy of the money maths.
create or replace function private.club_dues_income_total_core()
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.coalesce(pg_catalog.sum(dp.amount_ngn), 0)::numeric
  from public.dues_payments as dp;
$function$;

-- Signature and 42501 behaviour preserved from 20261002203635_dues_and_privacy.sql:645-664.
create or replace function private.club_dues_income_total()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (select private.is_active_club_member()) then
    raise exception using
      errcode = '42501',
      message = 'Only active members may view the aggregate dues income.';
  end if;

  return private.club_dues_income_total_core()::bigint;
end;
$function$;

-- Body is 20261027170450_opening_balance_classification.sql:36-52 with the
-- dues-income call pointed at the core so staff do not trip the 42501 raise.
create or replace function private.club_finance_summary_core()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    pg_catalog.coalesce((select private.club_dues_income_total_core()), 0)::numeric,
    pg_catalog.coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'income' and t.is_opening_balance is false and t.voided_at is null), 0)::numeric
      + pg_catalog.coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le
        where le.signed_amount_ngn > 0), 0)::numeric,
    pg_catalog.coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + pg_catalog.coalesce((select pg_catalog.sum(-le.signed_amount_ngn) from public.event_ledger_entries as le
        where le.signed_amount_ngn < 0), 0)::numeric,
    pg_catalog.coalesce((select pg_catalog.sum(dp.amount_ngn) from public.dues_payments as dp
      where dp.payment_method is distinct from 'pre_launch_reconciliation'), 0)::numeric
      + pg_catalog.coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - pg_catalog.coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + pg_catalog.coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le), 0)::numeric;
$function$;

-- Member path: same gate as before, one predicate.
create or replace function private.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.club_finance_summary_core()
  where (select private.is_active_club_member());
$function$;

create or replace function private.staff_club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.club_finance_summary_core()
  where (select private.is_staff_administrator());
$function$;

create or replace function public.staff_club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.staff_club_finance_summary();
$function$;

create or replace function private.staff_club_transactions()
returns table (
  id uuid, kind text, amount_ngn numeric, transaction_date date, description text,
  category_name_snapshot text, payer_payee text, payment_method text, source_note text,
  is_opening_balance boolean, voided_at timestamptz, void_reason text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    t.id, t.kind, t.amount_ngn::numeric, t.transaction_date, t.description,
    t.category_name_snapshot, t.payer_payee, t.payment_method, t.source_note,
    t.is_opening_balance, t.voided_at, t.void_reason, t.created_at
  from public.club_financial_transactions as t
  where (select private.is_staff_administrator())
  order by t.transaction_date desc, t.created_at desc
  limit 500;
$function$;

create or replace function public.staff_club_transactions()
returns table (
  id uuid, kind text, amount_ngn numeric, transaction_date date, description text,
  category_name_snapshot text, payer_payee text, payment_method text, source_note text,
  is_opening_balance boolean, voided_at timestamptz, void_reason text, created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.staff_club_transactions();
$function$;

revoke all on function private.club_dues_income_total_core()
  from public, anon, authenticated, service_role;
revoke all on function private.club_finance_summary_core()
  from public, anon, authenticated, service_role;

revoke all on function private.staff_club_finance_summary() from public, anon, service_role;
revoke all on function public.staff_club_finance_summary() from public, anon, service_role;
revoke all on function private.staff_club_transactions() from public, anon, service_role;
revoke all on function public.staff_club_transactions() from public, anon, service_role;

grant execute on function private.staff_club_finance_summary() to authenticated;
grant execute on function public.staff_club_finance_summary() to authenticated;
grant execute on function private.staff_club_transactions() to authenticated;
grant execute on function public.staff_club_transactions() to authenticated;
```

`CREATE OR REPLACE` preserves existing grants on `private.club_dues_income_total()` and `private.club_finance_summary()`, so no re-grant is needed for those two.

- [ ] **Step 4: Apply and re-run**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: PASS, zero `not ok` lines.

- [ ] **Step 5: Prove no member regression**

Run: `npx supabase test db --local supabase/tests/database/club_finances_test.sql supabase/tests/database/pre_launch_financial_onboarding_test.sql`
Expected: same result as before this migration. Record the baseline by running this command once **before** Step 3 and keeping the `not ok` count; these two suites carry known stale failures, so match the count rather than expecting zero.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101121000_staff_club_finance_read.sql supabase/tests/database/staff_money_read_test.sql
git commit -m "feat(db): add staff-only club finance summary and ledger reads"
```

---

## Task 3: Event finance overview read (DB)

**Files:**
- Create: `supabase/migrations/20261101122000_staff_event_finance_overview.sql`
- Test: `supabase/tests/database/staff_money_read_test.sql` (append)

**Interfaces:**
- Consumes: `private.event_finance_summary(uuid)` (`20261013032242_event_finance_category_links_status.sql:541-565`), `public.events`, `public.event_budgets`.
- Produces:
  - `public.staff_event_finance_overview()` → `table(event_id uuid, title text, status text, starts_at timestamptz, budget_ngn numeric, income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric, tickets_sold numeric, net_result_ngn numeric)`, most recent 200 events.
  - Internal: `private.event_finance_summary_core(p_event_id uuid)` returning **exactly** the existing `private.event_finance_summary` output types — `table(income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric, tickets_sold bigint, net_result_ngn numeric)` — minus the member gate. The types must match, because Postgres refuses to change the return type of an existing function through `CREATE OR REPLACE`.
- Task 4 extends the same per-event shape with row-level detail.

- [ ] **Step 1: Write the failing test**

Add to the fixture block (as the test owner, before any `set local role`):

```sql
insert into public.events (
  id, title, event_type, starts_at, location, status,
  status_changed_by, created_by, updated_by
) values (
  '11111111-1111-1111-1111-111111111111', 'Staff Read Gala', 'fundraiser',
  (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + interval '7 days',
  'Club hall', 'scheduled',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000003'
);

insert into public.event_budgets (event_id, total_ngn) values
  ('11111111-1111-1111-1111-111111111111', 400000);
```

Add to the structural checks:

```sql
select has_function(
  'public', 'staff_event_finance_overview', array[]::text[],
  'the staff event finance overview read RPC exists'
);
```

Add inside the staff session block:

```sql
select ok(
  exists (
    select 1 from public.staff_event_finance_overview()
    where event_id = '11111111-1111-1111-1111-111111111111'
  ),
  'staff see the fixture event in the finance overview'
);
select is(
  (select budget_ngn from public.staff_event_finance_overview()
   where event_id = '11111111-1111-1111-1111-111111111111'),
  400000::numeric,
  'staff see the event budget'
);
select is(
  (select net_result_ngn from public.staff_event_finance_overview()
   where event_id = '11111111-1111-1111-1111-111111111111'),
  0::numeric,
  'an event with no entries nets zero'
);
```

Add inside the non-staff block:

```sql
select is(
  (select count(*) from public.staff_event_finance_overview()),
  0::bigint,
  'an active member cannot use the staff event overview read'
);
select lives_ok(
  $$select * from public.event_finance_summary(
      '11111111-1111-1111-1111-111111111111')$$,
  'the member-facing event summary still runs for an active member'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: FAIL — `not ok` for `staff_event_finance_overview`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261101122000_staff_event_finance_overview.sql`:

```sql
-- The five money maths in event_finance_summary move into a core once. Both the
-- member gate and the staff gate read from it. Return types match the existing
-- function exactly; CREATE OR REPLACE cannot change them.
create or replace function private.event_finance_summary_core(p_event_id uuid)
returns table (
  income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    pg_catalog.coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid' and t.voided_at is null), 0),
    pg_catalog.coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit') and t.voided_at is null), 0),
    pg_catalog.coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    pg_catalog.coalesce((select pg_catalog.sum(s.quantity)::bigint from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    pg_catalog.coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null), 0)
      + pg_catalog.coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.refunded_at is null), 0)
  where p_event_id is not null
    and exists (select 1 from public.events as e where e.id = p_event_id);
$function$;

-- Signature and gate preserved from 20261013032242_event_finance_category_links_status.sql:541-565.
create or replace function private.event_finance_summary(p_event_id uuid)
returns table (
  income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select * from private.event_finance_summary_core(p_event_id)
  where (select private.is_active_club_member());
$function$;

create or replace function private.staff_event_finance_overview()
returns table (
  event_id uuid, title text, status text, starts_at timestamptz,
  budget_ngn numeric, income_ngn numeric, expense_ngn numeric,
  ticket_income_ngn numeric, tickets_sold numeric, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    e.id, e.title, e.status, e.starts_at,
    b.total_ngn::numeric,
    s.income_ngn, s.expense_ngn, s.ticket_income_ngn,
    s.tickets_sold::numeric, s.net_result_ngn
  from public.events as e
  cross join lateral private.event_finance_summary_core(e.id) as s
  left join public.event_budgets as b on b.event_id = e.id
  where (select private.is_staff_administrator())
  order by e.starts_at desc
  limit 200;
$function$;

create or replace function public.staff_event_finance_overview()
returns table (
  event_id uuid, title text, status text, starts_at timestamptz,
  budget_ngn numeric, income_ngn numeric, expense_ngn numeric,
  ticket_income_ngn numeric, tickets_sold numeric, net_result_ngn numeric
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.staff_event_finance_overview();
$function$;

revoke all on function private.event_finance_summary_core(uuid)
  from public, anon, authenticated, service_role;

revoke all on function private.staff_event_finance_overview() from public, anon, service_role;
revoke all on function public.staff_event_finance_overview() from public, anon, service_role;
grant execute on function private.staff_event_finance_overview() to authenticated;
grant execute on function public.staff_event_finance_overview() to authenticated;
```

`private.event_finance_summary` keeps its exact signature, so `src/app/(member)/events/[eventId]/dashboard/page.tsx` and every existing assertion continue to work untouched. If Postgres rejects the `create or replace` with "cannot change return type of existing function", a column type in the core drifted from the original — diff it against `20261013032242_event_finance_category_links_status.sql:541-545` rather than dropping and recreating the function.

- [ ] **Step 4: Apply and re-run**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: PASS.

- [ ] **Step 5: Prove no event regression**

Run: `npx supabase test db --local supabase/tests/database/event_finance_ticketing_ledger_test.sql supabase/tests/database/events_roles_budgets_lifecycle_test.sql` and `npm run build` (the build type-checks the dashboard consumer).
Expected: `not ok` count matches the baseline recorded before Step 3, and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101122000_staff_event_finance_overview.sql supabase/tests/database/staff_money_read_test.sql src/
git commit -m "feat(db): add staff-only event finance overview read"
```

---

## Task 4: Per-event ledger, sales, and tier reads (DB)

**Files:**
- Create: `supabase/migrations/20261101123000_staff_event_ledger_read.sql`
- Test: `supabase/tests/database/staff_money_read_test.sql` (append)

**Interfaces:**
- Consumes: `public.event_financial_transactions`, `public.event_ticket_sales`, `public.event_ticket_tiers`, Task 3's event fixture id.
- Produces (each takes one `uuid`, each staff-gated):
  - `public.staff_event_transactions(p_event_id uuid)` → `table(id uuid, kind text, amount_ngn numeric, transaction_date date, description text, payer_payee text, payment_method text, payment_status text, category_name_snapshot text, verification_status text, voided_at timestamptz, void_reason text, created_at timestamptz)`, limit 500.
  - `public.staff_event_ticket_sales(p_event_id uuid)` → `table(id uuid, tier_id uuid, buyer_name text, quantity numeric, unit_price_ngn numeric, amount_ngn numeric, payment_method text, verification_status text, refunded_at timestamptz, created_at timestamptz)`, limit 500.
  - `public.staff_event_ticket_tiers(p_event_id uuid)` → `table(id uuid, name text, price_ngn numeric, capacity numeric, retired_at timestamptz)`.

- [ ] **Step 1: Write the failing test**

Structural checks:

```sql
select has_function(
  'public', 'staff_event_transactions', array['uuid'],
  'the staff event transaction read RPC exists'
);
select has_function(
  'public', 'staff_event_ticket_sales', array['uuid'],
  'the staff event ticket sale read RPC exists'
);
select has_function(
  'public', 'staff_event_ticket_tiers', array['uuid'],
  'the staff event ticket tier read RPC exists'
);
```

Staff session block, and prove a foreign event id leaks nothing:

```sql
select is(
  (select count(*) from public.staff_event_transactions('11111111-1111-1111-1111-111111111111')),
  0::bigint,
  'the staff event transaction read returns no rows for an event with none'
);
select is(
  (select count(*) from public.staff_event_transactions('22222222-2222-2222-2222-222222222222')),
  0::bigint,
  'an unknown event id yields no rows rather than an error'
);
select is(
  (select count(*) from public.staff_event_ticket_sales('22222222-2222-2222-2222-222222222222')),
  0::bigint,
  'the ticket sale read tolerates an unknown event id'
);
```

Non-staff block:

```sql
select is(
  (select count(*) from public.staff_event_transactions('11111111-1111-1111-1111-111111111111')),
  0::bigint,
  'an active member cannot use the staff event transaction read'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: FAIL on the three new `has_function` checks.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261101123000_staff_event_ledger_read.sql`:

```sql
create or replace function private.staff_event_transactions(p_event_id uuid)
returns table (
  id uuid, kind text, amount_ngn numeric, transaction_date date, description text,
  payer_payee text, payment_method text, payment_status text, category_name_snapshot text,
  verification_status text, voided_at timestamptz, void_reason text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $function$
  select
    t.id, t.kind, t.amount_ngn::numeric, t.transaction_date, t.description,
    t.payer_payee, t.payment_method, t.payment_status, t.category_name_snapshot,
    t.verification_status, t.voided_at, t.void_reason, t.created_at
  from public.event_financial_transactions as t
  where (select private.is_staff_administrator())
    and t.event_id = p_event_id
  order by t.transaction_date desc, t.created_at desc
  limit 500;
$function$;

create or replace function public.staff_event_transactions(uuid)
returns table (
  id uuid, kind text, amount_ngn numeric, transaction_date date, description text,
  payer_payee text, payment_method text, payment_status text, category_name_snapshot text,
  verification_status text, voided_at timestamptz, void_reason text, created_at timestamptz
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.staff_event_transactions($1);
$function$;

create or replace function private.staff_event_ticket_sales(p_event_id uuid)
returns table (
  id uuid, tier_id uuid, buyer_name text, quantity numeric, unit_price_ngn numeric,
  amount_ngn numeric, payment_method text, verification_status text,
  refunded_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = '' as $function$
  select
    s.id, s.tier_id, s.buyer_name, s.quantity::numeric, s.unit_price_ngn::numeric,
    s.amount_ngn::numeric, s.payment_method, s.verification_status,
    s.refunded_at, s.created_at
  from public.event_ticket_sales as s
  where (select private.is_staff_administrator())
    and s.event_id = p_event_id
  order by s.created_at desc
  limit 500;
$function$;

create or replace function public.staff_event_ticket_sales(uuid)
returns table (
  id uuid, tier_id uuid, buyer_name text, quantity numeric, unit_price_ngn numeric,
  amount_ngn numeric, payment_method text, verification_status text,
  refunded_at timestamptz, created_at timestamptz
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.staff_event_ticket_sales($1);
$function$;

create or replace function private.staff_event_ticket_tiers(p_event_id uuid)
returns table (id uuid, name text, price_ngn numeric, capacity numeric, retired_at timestamptz)
language sql stable security definer set search_path = '' as $function$
  select
    tier.id, tier.name, tier.price_ngn::numeric, tier.capacity::numeric, tier.retired_at
  from public.event_ticket_tiers as tier
  where (select private.is_staff_administrator())
    and tier.event_id = p_event_id
  order by tier.created_at;
$function$;

create or replace function public.staff_event_ticket_tiers(uuid)
returns table (id uuid, name text, price_ngn numeric, capacity numeric, retired_at timestamptz)
language sql stable security invoker set search_path = '' as $function$
  select * from private.staff_event_ticket_tiers($1);
$function$;

revoke all on function private.staff_event_transactions(uuid) from public, anon, service_role;
revoke all on function private.staff_event_ticket_sales(uuid) from public, anon, service_role;
revoke all on function private.staff_event_ticket_tiers(uuid) from public, anon, service_role;
revoke all on function public.staff_event_transactions(uuid) from public, anon, service_role;
revoke all on function public.staff_event_ticket_sales(uuid) from public, anon, service_role;
revoke all on function public.staff_event_ticket_tiers(uuid) from public, anon, service_role;

grant execute on function private.staff_event_transactions(uuid) to authenticated;
grant execute on function private.staff_event_ticket_sales(uuid) to authenticated;
grant execute on function private.staff_event_ticket_tiers(uuid) to authenticated;
grant execute on function public.staff_event_transactions(uuid) to authenticated;
grant execute on function public.staff_event_ticket_sales(uuid) to authenticated;
grant execute on function public.staff_event_ticket_tiers(uuid) to authenticated;
```

- [ ] **Step 4: Apply and re-run**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261101123000_staff_event_ledger_read.sql supabase/tests/database/staff_money_read_test.sql
git commit -m "feat(db): add staff-only event ledger, ticket sale, and tier reads"
```

---

## Task 5: Staff receipt read (DB)

**Files:**
- Create: `supabase/migrations/20261101124000_staff_receipt_read.sql`
- Test: `supabase/tests/database/staff_money_read_test.sql` (append)

**Interfaces:**
- Consumes: `private.can_read_finance_receipt(uuid)` (`20261025120000_finance_receipts_r2.sql:111-158`), policy `finance_receipts_select_authorized` (same file, `:163-165`), RPC `public.get_finance_receipt_download(uuid)` (`:170-178`).
- Produces: no new functions. Staff become legitimate readers of `public.finance_receipts` and of the existing download route, because both paths already call this one helper.

Why widening the helper is sufficient: the SELECT policy is `using (private.can_read_finance_receipt(id))` and the table already has `grant select … to authenticated` (`:167`), so the helper is the only door. `src/app/api/receipts/[receiptId]/route.ts` performs no profile-status check of its own — it authenticates, then calls the RPC — so it needs no edit either.

- [ ] **Step 1: Write the failing test**

Seed a receipt as the test owner, before any `set local role`. It is deliberately unattached to a transaction, so this task does not depend on Task 2's row ids:

```sql
insert into public.finance_receipts (
  id, scope, object_key, original_filename,
  content_type, size_bytes, sha256, uploaded_by
) values (
  '33333333-3333-3333-3333-333333333333', 'club',
  'receipts/club/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333.pdf',
  'fixture-receipt.pdf', 'application/pdf', 1024,
  pg_catalog.repeat('a', 64),
  '00000000-0000-0000-0000-000000000003'
);
```

Add inside the existing staff session block:

```sql
select is(
  (select count(*) from public.finance_receipts
   where id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'staff can list the club receipt through the existing read policy'
);
select is(
  (select original_filename from public.get_finance_receipt_download(
     '33333333-3333-3333-3333-333333333333')),
  'fixture-receipt.pdf',
  'staff resolve receipt download metadata through the existing download RPC'
);
```

Add inside the existing active-member block — members must keep the access they already have:

```sql
select is(
  (select count(*) from public.finance_receipts
   where id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'an active member still reads the club-scope receipt'
);
```

And inside the disabled-staff block from Task 1:

```sql
select is(
  (select count(*) from public.finance_receipts),
  0::bigint,
  'a disabled staff account reads no receipts at all'
);
select is(
  (select count(*) from public.get_finance_receipt_download(
     '33333333-3333-3333-3333-333333333333')),
  0::bigint,
  'a disabled staff account cannot resolve a download'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: FAIL — the staff listing returns `0` and `get_finance_receipt_download` returns no rows, because line 123 denies every non-active-member.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261101124000_staff_receipt_read.sql`. This is the full current body with two added staff branches — keep the rest byte-for-byte:

```sql
-- Staff are system administrators: they may read any evidence scope, including
-- dues receipts, which the payer-match rule below would otherwise deny.
create or replace function private.can_read_finance_receipt(p_receipt_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt public.finance_receipts;
  v_dues_payer_id uuid;
begin
  if v_actor_id is null then
    return false;
  end if;

  -- Staff branch: the gate is the staff predicate, not club membership.
  if (select private.is_staff_administrator()) then
    select 1 into v_receipt from public.finance_receipts where id = p_receipt_id;
    return found;
  end if;

  if not (select private.is_active_club_member()) then
    return false;
  end if;

  select * into v_receipt
  from public.finance_receipts
  where id = p_receipt_id;

  if not found then
    return false;
  end if;

  if v_receipt.scope in ('club', 'event', 'event_ticket') then
    return true;
  end if;

  -- Dues receipts: accessible by payer or officers (admin, backup_admin, executive)
  if (select private.has_club_role('admin'))
     or (select private.has_club_role('backup_admin'))
     or (select private.has_club_role('executive')) then
    return true;
  end if;

  if v_receipt.dues_request_id is not null then
    select member_id into v_dues_payer_id
    from public.dues_payment_requests
    where id = v_receipt.dues_request_id;
  elsif v_receipt.dues_payment_id is not null then
    select member_id into v_dues_payer_id
    from public.dues_payments
    where id = v_receipt.dues_payment_id;
  end if;

  return v_dues_payer_id = v_actor_id;
end;
$$;
```

- [ ] **Step 4: Apply and re-run**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/staff_money_read_test.sql`
Expected: PASS.

- [ ] **Step 5: Prove the receipt suites still pass**

Run: `npx supabase test db --local supabase/tests/database/finance_receipts_test.sql`
Expected: `not ok` count matches the pre-task baseline. This suite is one of the seven carrying known stale assertions (`hasnt_table('public','event_financial_receipts')`), so compare counts rather than chasing green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101124000_staff_receipt_read.sql supabase/tests/database/staff_money_read_test.sql
git commit -m "feat(db): let staff read finance receipts"
```

---

## Task 6: Staff loader module and roster context (app)

**Files:**
- Create: `src/lib/staff-money.server.ts`
- Modify: `src/app/(staff)/admin/members/page.tsx:48-60`
- Modify: `src/components/staff/staff-member-table.tsx:11-19` (interface) and its row renderer
- Test: `tests/staff-dues-roster.test.mjs`

**Interfaces:**
- Consumes: `requireStaffProfile()` (`src/lib/staff-access.server.ts:16`), the gated RPCs created by T1–T4, and the staff receipt read policy from T5.
- Produces, all `Promise`s over the caller's Supabase server client:
  - `loadStaffDuesStanding(supabase): Promise<Map<string, StaffDuesStanding>>` where `StaffDuesStanding = { unpaidMonths: number; overdueMonths: number; openAmountNgn: number; lastPaidMonth: string | null }`
  - `loadStaffClubFinance(supabase): Promise<{ summary: StaffClubFinanceSummary | null; transactions: StaffClubTransaction[] }>`
  - `loadStaffEventFinanceOverview(supabase): Promise<StaffEventFinanceRow[]>`
  - `loadStaffEventFinance(supabase, eventId): Promise<{ transactions: StaffEventLedgerRow[]; sales: StaffTicketSaleRow[]; tiers: StaffTicketTierRow[] }>`
  - `loadStaffCurrentClubRoles(supabase): Promise<Map<string, string>>` — member id → active club role (`president` / `executive` / `admin`); members with no live assignment are absent from the map, so the roster falls back to `member`.
- Exported types from the loader: `StaffDuesStanding`, `StaffClubFinanceSummary`, `StaffClubTransaction`, `StaffEventFinanceRow`, `StaffEventLedgerRow`, `StaffTicketSaleRow`, `StaffTicketTierRow`. T7, T8 and T9 components import their row types from here; no page calls `supabase.rpc("staff_…")` directly.

- [ ] **Step 1: Write the failing test**

Create `tests/staff-dues-roster.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loader = readFileSync("src/lib/staff-money.server.ts", "utf8");
const roster = readFileSync("src/app/(staff)/admin/members/page.tsx", "utf8");
const table = readFileSync(
  "src/components/staff/staff-member-table.tsx",
  "utf8",
);

test("staff money loader is server-only and RPC-driven", () => {
  assert.match(loader, /^import "server-only";/m);
  for (const rpc of [
    "staff_dues_standing",
    "staff_club_finance_summary",
    "staff_club_transactions",
    "staff_event_finance_overview",
    "staff_event_transactions",
    "staff_event_ticket_sales",
    "staff_event_ticket_tiers",
  ]) {
    assert.ok(
      loader.includes(`rpc("${rpc}"`),
      `loader must call the ${rpc} RPC`,
    );
  }
  assert.doesNotMatch(
    loader,
    /\.from\("(club_financial_transactions|event_financial_transactions|dues_month_status)"/,
    "staff money reads must not touch money tables directly",
  );
});

test("roster joins dues standing and current club role", () => {
  assert.match(roster, /loadStaffDuesStanding/);
  assert.match(roster, /loadStaffCurrentClubRoles/);
  assert.match(roster, /\.neq\("status", "staff"\)/);
});

test("member table renders the two new context columns", () => {
  assert.match(table, /dues: StaffMemberDues/);
  assert.match(table, /clubRole: string/);
  assert.match(table, /Unpaid months/i);
  assert.match(table, /Open dues/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/staff-dues-roster.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open 'src/lib/staff-money.server.ts'`.

- [ ] **Step 3: Write the loader**

Create `src/lib/staff-money.server.ts`:

```ts
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface StaffDuesStanding {
  unpaidMonths: number;
  overdueMonths: number;
  openAmountNgn: number;
  lastPaidMonth: string | null;
}

export interface StaffClubFinanceSummary {
  duesIncome: number;
  otherIncome: number;
  expenses: number;
  balance: number;
}

export interface StaffClubTransaction {
  id: string;
  kind: "income" | "expense";
  amountNgn: number;
  transactionDate: string;
  description: string | null;
  categoryName: string | null;
  payerPayee: string | null;
  paymentMethod: string | null;
  isOpeningBalance: boolean;
  voidedAt: string | null;
  createdAt: string;
}

export interface StaffEventFinanceRow {
  eventId: string;
  title: string;
  status: string;
  startsAt: string;
  budgetNgn: number | null;
  incomeNgn: number;
  expenseNgn: number;
  ticketIncomeNgn: number;
  ticketsSold: number;
  netResultNgn: number;
}

export interface StaffEventLedgerRow {
  id: string;
  kind: string;
  amount_ngn: number;
  transaction_date: string;
  description: string | null;
  payer_payee: string | null;
  payment_status: string;
  verification_status: string | null;
  voided_at: string | null;
}

export interface StaffTicketSaleRow {
  id: string;
  buyer_name: string;
  quantity: number;
  unit_price_ngn: number;
  amount_ngn: number;
  payment_method: string;
  verification_status: string | null;
  refunded_at: string | null;
}

export interface StaffTicketTierRow {
  id: string;
  name: string;
  price_ngn: number;
  capacity: number;
  retired_at: string | null;
}

function num(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function loadStaffDuesStanding(
  supabase: StaffClient,
): Promise<Map<string, StaffDuesStanding>> {
  const { data, error } = await supabase.rpc("staff_dues_standing");
  if (error || !data) return new Map();
  return new Map(
    data.map((row) => [
      row.member_id as string,
      {
        unpaidMonths: num(row.unpaid_months),
        overdueMonths: num(row.overdue_months),
        openAmountNgn: num(row.open_amount_ngn),
        lastPaidMonth: (row.last_paid_month as string) ?? null,
      },
    ]),
  );
}

export async function loadStaffCurrentClubRoles(
  supabase: StaffClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("member_role_assignments")
    .select("member_id, role")
    .is("revoked_at", null);
  if (error || !data) return new Map();

  const rank: Record<string, number> = { president: 3, executive: 2, admin: 3 };
  const roles = new Map<string, string>();
  for (const row of data) {
    const current = roles.get(row.member_id as string);
    if (!current || (rank[row.role] ?? 1) > (rank[current] ?? 1)) {
      roles.set(row.member_id as string, row.role);
    }
  }
  return roles;
}

export async function loadStaffClubFinance(
  supabase: StaffClient,
): Promise<{
  summary: StaffClubFinanceSummary | null;
  transactions: StaffClubTransaction[];
}> {
  const [summaryResult, transactionsResult] = await Promise.all([
    supabase.rpc("staff_club_finance_summary"),
    supabase.rpc("staff_club_transactions"),
  ]);

  const summaryRow = summaryResult.data?.[0];
  return {
    summary: summaryRow
      ? {
          duesIncome: num(summaryRow.dues_income),
          otherIncome: num(summaryRow.other_income),
          expenses: num(summaryRow.expenses),
          balance: num(summaryRow.balance),
        }
      : null,
    transactions: (transactionsResult.data ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as "income" | "expense",
      amountNgn: num(row.amount_ngn),
      transactionDate: row.transaction_date as string,
      description: (row.description as string) ?? null,
      categoryName: (row.category_name_snapshot as string) ?? null,
      payerPayee: (row.payer_payee as string) ?? null,
      paymentMethod: (row.payment_method as string) ?? null,
      isOpeningBalance: Boolean(row.is_opening_balance),
      voidedAt: (row.voided_at as string) ?? null,
      createdAt: row.created_at as string,
    })),
  };
}

export async function loadStaffEventFinanceOverview(
  supabase: StaffClient,
): Promise<StaffEventFinanceRow[]> {
  const { data, error } = await supabase.rpc("staff_event_finance_overview");
  if (error || !data) return [];
  return data.map((row) => ({
    eventId: row.event_id as string,
    title: row.title as string,
    status: row.status as string,
    startsAt: row.starts_at as string,
    budgetNgn: row.budget_ngn === null ? null : num(row.budget_ngn),
    incomeNgn: num(row.income_ngn),
    expenseNgn: num(row.expense_ngn),
    ticketIncomeNgn: num(row.ticket_income_ngn),
    ticketsSold: num(row.tickets_sold),
    netResultNgn: num(row.net_result_ngn),
  }));
}

export async function loadStaffEventFinance(
  supabase: StaffClient,
  eventId: string,
): Promise<{
  transactions: StaffEventLedgerRow[];
  sales: StaffTicketSaleRow[];
  tiers: StaffTicketTierRow[];
}> {
  const [transactionsResult, salesResult, tiersResult] = await Promise.all([
    supabase.rpc("staff_event_transactions", { p_event_id: eventId }),
    supabase.rpc("staff_event_ticket_sales", { p_event_id: eventId }),
    supabase.rpc("staff_event_ticket_tiers", { p_event_id: eventId }),
  ]);

  const transactions: StaffEventLedgerRow[] = (
    transactionsResult.data ?? []
  ).map((row) => ({
    id: row.id as string,
    kind: row.kind as string,
    amount_ngn: num(row.amount_ngn),
    transaction_date: row.transaction_date as string,
    description: (row.description as string) ?? null,
    payer_payee: (row.payer_payee as string) ?? null,
    payment_status: row.payment_status as string,
    verification_status: (row.verification_status as string) ?? null,
    voided_at: (row.voided_at as string) ?? null,
  }));

  const sales: StaffTicketSaleRow[] = (salesResult.data ?? []).map((row) => ({
    id: row.id as string,
    buyer_name: row.buyer_name as string,
    quantity: num(row.quantity),
    unit_price_ngn: num(row.unit_price_ngn),
    amount_ngn: num(row.amount_ngn),
    payment_method: row.payment_method as string,
    verification_status: (row.verification_status as string) ?? null,
    refunded_at: (row.refunded_at as string) ?? null,
  }));

  const tiers: StaffTicketTierRow[] = (tiersResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    price_ngn: num(row.price_ngn),
    capacity: num(row.capacity),
    retired_at: (row.retired_at as string) ?? null,
  }));

  return { transactions, sales, tiers };
}
```

- [ ] **Step 4: Extend the roster**

In `src/components/staff/staff-member-table.tsx`, widen the exported row type and render two more columns. Add above `StaffMemberRow`:

```ts
export interface StaffMemberDues {
  unpaidMonths: number;
  overdueMonths: number;
  openAmountNgn: number;
}
```

and inside `StaffMemberRow` after `requestedAt`:

```ts
  clubRole: string;
  dues: StaffMemberDues | null;
```

In the row markup, immediately after the existing status badge cell, add:

```tsx
<td className="px-4 py-3 align-top text-sm text-[#514943]">
  {member.clubRole}
</td>
<td className="px-4 py-3 align-top text-sm text-[#514943]">
  {member.dues ? (
    <>
      {member.dues.unpaidMonths} unpaid
      {member.dues.overdueMonths > 0
        ? ` · ${member.dues.overdueMonths} overdue`
        : ""}
      <span className="block text-xs text-[#60451C]">
        NGN {member.dues.openAmountNgn.toLocaleString("en-NG")} open
      </span>
    </>
  ) : (
    "No dues record"
  )}
</td>
```

Add matching `<th>` labels `Club role` and `Dues` in the table head, keeping the existing column order.

- [ ] **Step 5: Wire the page**

In `src/app/(staff)/admin/members/page.tsx`, import the loaders, then replace the single `member_profiles` fetch so both maps are loaded in parallel with it:

```ts
const [data, emailState, duesStanding, clubRoles] = await Promise.all([
  supabase
    .from("member_profiles")
    .select("id, full_name, username, status, profile_completed_at, created_at")
    .neq("status", "staff")
    .order("created_at", { ascending: false }),
  loadEmailConfirmationState(supabase),
  loadStaffDuesStanding(supabase),
  loadStaffCurrentClubRoles(supabase),
]);
```

Note `.from("member_profiles")` destructures `{ data, error }` today; with the array form read it as `data.data` / `data.error` in the rows map below, or keep the existing call and `await` the two loaders separately. Either is fine; do not restructure the page beyond this.

and add the two fields where each `StaffMemberRow` is built:

```ts
clubRole: clubRoles.get(row.id) ?? "member",
dues: duesStanding.get(row.id) ?? null,
```

- [ ] **Step 6: Run tests and lint**

Run: `node --test tests/staff-dues-roster.test.mjs && npm run lint`
Expected: PASS and no Biome diagnostics.

- [ ] **Step 7: Commit**

```bash
git add src/lib/staff-money.server.ts src/app/\(staff\)/admin/members/page.tsx src/components/staff/staff-member-table.tsx tests/staff-dues-roster.test.mjs
git commit -m "feat(staff): show dues standing and club role in the member roster"
```

---

## Task 7: `/admin/finances` club overview (app)

**Files:**
- Create: `src/app/(staff)/admin/finances/page.tsx`
- Create: `src/components/staff/staff-finance-summary-cards.tsx`
- Create: `src/components/staff/staff-club-ledger-table.tsx`
- Modify: `src/components/staff/staff-nav.tsx:9-16`
- Modify: `src/app/(staff)/admin/page.tsx`
- Test: `tests/staff-finances-page.test.mjs`

**Interfaces:**
- Consumes: `requireStaffProfile()`, `loadStaffClubFinance()`, `formatNgn` (`src/lib/report-export.ts:258`).
- Produces: route `/admin/finances`; `StaffNav` link `{ href: "/admin/finances", label: "Finances" }`.

- [ ] **Step 1: Write the failing test**

Create `tests/staff-finances-page.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pagePath = "src/app/(staff)/admin/finances/page.tsx";
const nav = readFileSync("src/components/staff/staff-nav.tsx", "utf8");
const overview = readFileSync("src/app/(staff)/admin/page.tsx", "utf8");

test("staff finances page exists and guards first", () => {
  assert.ok(existsSync(pagePath), "/admin/finances must exist");
  const page = readFileSync(pagePath, "utf8");
  assert.match(page, /requireStaffProfile\(\)/);
  assert.match(page, /loadStaffClubFinance\(supabase\)/);
  assert.doesNotMatch(page, /staffMemberLifecycleAction/, "no writes on a read page");
});

test("staff navigation exposes Finances", () => {
  assert.match(nav, /\{ href: "\/admin\/finances", label: "Finances" \}/);
});

test("overview surfaces the club balance", () => {
  assert.match(overview, /loadStaffClubFinance/);
});

test("ledger table is read-only", () => {
  const table = readFileSync(
    "src/components/staff/staff-club-ledger-table.tsx",
    "utf8",
  );
  assert.doesNotMatch(table, /<form|onClick=\{.*Action/);
  assert.match(table, /voided/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/staff-finances-page.test.mjs`
Expected: FAIL — `/admin/finances must exist`.

- [ ] **Step 3: Write the components**

`src/components/staff/staff-finance-summary-cards.tsx`:

```tsx
import { formatNgn } from "@/lib/report-export";
import type { StaffClubFinanceSummary } from "@/lib/staff-money.server";

const cards = [
  { key: "duesIncome", label: "Dues income" },
  { key: "otherIncome", label: "Other income" },
  { key: "expenses", label: "Expenses" },
  { key: "balance", label: "Club balance" },
] as const;

export default function StaffFinanceSummaryCards({
  summary,
}: {
  summary: StaffClubFinanceSummary | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          className="rounded-xl border border-[#D9C8A5] bg-[#FBF7EF] p-4"
          key={card.key}
        >
          <p className="text-xs font-semibold uppercase text-[#60451C]">
            {card.label}
          </p>
          <p className="mt-1 text-lg font-extrabold text-[#3D291F]">
            {summary ? `NGN ${formatNgn(BigInt(summary[card.key]))}` : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}
```

`src/components/staff/staff-club-ledger-table.tsx`:

```tsx
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import { formatNgn } from "@/lib/report-export";
import type { StaffClubTransaction } from "@/lib/staff-money.server";

export default function StaffClubLedgerTable({
  transactions,
  receiptsById,
}: {
  transactions: StaffClubTransaction[];
  receiptsById: Map<string, { id: string; filename: string }[]>;
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-[#60451C]">No club transactions recorded yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#F5F0E5] text-xs uppercase text-[#60451C]">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2">Amount</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr className="border-t border-[#E5DDD3]" key={transaction.id}>
              <td className="px-4 py-3 align-top">{transaction.transactionDate}</td>
              <td className="px-4 py-3 align-top capitalize">{transaction.kind}</td>
              <td className="px-4 py-3 align-top tabular-nums">
                NGN {formatNgn(BigInt(transaction.amountNgn))}
                {transaction.voidedAt ? (
                  <span className="block text-xs text-[#76342D]">Voided</span>
                ) : null}
              </td>
              <td className="px-4 py-3 align-top">
                {transaction.description ?? transaction.payerPayee ?? "—"}
              </td>
              <td className="px-4 py-3 align-top">{transaction.categoryName ?? "—"}</td>
              <td className="px-4 py-3 align-top">
                {(receiptsById.get(transaction.id) ?? []).map((receipt) => (
                  <a
                    className="block text-[#204F3D] underline"
                    href={`/api/receipts/${receipt.id}`}
                    key={receipt.id}
                  >
                    {receipt.filename}
                  </a>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

`src/app/(staff)/admin/finances/page.tsx`:

```tsx
import StaffClubLedgerTable from "@/components/staff/staff-club-ledger-table";
import StaffEventFinanceTable from "@/components/staff/staff-event-finance-table";
import StaffFinanceSummaryCards from "@/components/staff/staff-finance-summary-cards";
import { requireStaffProfile } from "@/lib/staff-access.server";
import {
  loadStaffClubFinance,
  loadStaffEventFinanceOverview,
} from "@/lib/staff-money.server";

export const dynamic = "force-dynamic";

export default async function StaffFinancesPage() {
  const { supabase } = await requireStaffProfile();

  const [finance, events, receiptRows] = await Promise.all([
    loadStaffClubFinance(supabase),
    loadStaffEventFinanceOverview(supabase),
    supabase
      .from("finance_receipts")
      .select("id, club_transaction_id, original_filename")
      .eq("scope", "club"),
  ]);

  const receiptsById = new Map<
    string,
    { id: string; filename: string }[]
  >();
  for (const receipt of receiptRows.data ?? []) {
    if (!receipt.club_transaction_id) continue;
    const bucket = receiptsById.get(receipt.club_transaction_id as string) ?? [];
    bucket.push({ id: receipt.id as string, filename: receipt.original_filename });
    receiptsById.set(receipt.club_transaction_id as string, bucket);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          Club finances
        </h1>
        <p className="mt-1 text-sm text-[#60451C]">
          Read-only view of the shared ledger. Recording, corrections, and
          voiding stay with the president and executives.
        </p>
      </div>
      <StaffFinanceSummaryCards summary={finance.summary} />
      <section className="rounded-xl border border-[#E5DDD3] bg-white p-4 sm:p-6">
        <h2 className="text-sm font-extrabold text-[#3D291F]">
          Ledger, newest first
        </h2>
        <div className="mt-4">
          <StaffClubLedgerTable
            receiptsById={receiptsById}
            transactions={finance.transactions}
          />
        </div>
      </section>
      <section className="rounded-xl border border-[#E5DDD3] bg-white p-4 sm:p-6">
        <h2 className="text-sm font-extrabold text-[#3D291F]">Events</h2>
        <div className="mt-4">
          <StaffEventFinanceTable events={events} />
        </div>
      </section>
    </div>
  );
}
```

`src/components/staff/staff-event-finance-table.tsx` (created here because this page lists events, and Task 8 links into it):

```tsx
import Link from "next/link";
import { formatNgn } from "@/lib/report-export";
import type { StaffEventFinanceRow } from "@/lib/staff-money.server";

export default function StaffEventFinanceTable({
  events,
}: {
  events: StaffEventFinanceRow[];
}) {
  if (events.length === 0) {
    return <p className="text-sm text-[#60451C]">No events recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#F5F0E5] text-xs uppercase text-[#60451C]">
          <tr>
            <th className="px-4 py-2">Event</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Budget</th>
            <th className="px-4 py-2">Income</th>
            <th className="px-4 py-2">Expenses</th>
            <th className="px-4 py-2">Tickets</th>
            <th className="px-4 py-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr className="border-t border-[#E5DDD3]" key={event.eventId}>
              <td className="px-4 py-3 align-top">
                <Link
                  className="text-[#204F3D] underline"
                  href={`/admin/finances/${event.eventId}`}
                >
                  {event.title}
                </Link>
              </td>
              <td className="px-4 py-3 align-top capitalize">{event.status}</td>
              <td className="px-4 py-3 align-top tabular-nums">
                {event.budgetNgn === null
                  ? "—"
                  : `NGN ${formatNgn(BigInt(event.budgetNgn))}`}
              </td>
              <td className="px-4 py-3 align-top tabular-nums">
                NGN {formatNgn(BigInt(event.incomeNgn))}
              </td>
              <td className="px-4 py-3 align-top tabular-nums">
                NGN {formatNgn(BigInt(event.expenseNgn))}
              </td>
              <td className="px-4 py-3 align-top tabular-nums">
                {event.ticketsSold} sold · NGN{" "}
                {formatNgn(BigInt(event.ticketIncomeNgn))}
              </td>
              <td className="px-4 py-3 align-top tabular-nums">
                NGN {formatNgn(BigInt(event.netResultNgn))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Add the nav link and the overview card**

In `src/components/staff/staff-nav.tsx:9-16`, insert after the Members entry:

```ts
  { href: "/admin/finances", label: "Finances" },
```

In `src/app/(staff)/admin/page.tsx`, import `loadStaffClubFinance`, add it to the existing `Promise.all` block (around `:61-80`), and render the club balance into `StaffOverviewStats` as a new `clubBalance` prop; the summary is `null` when the RPC returns no rows, so fall back to `"—"`.

- [ ] **Step 6: Run tests, lint, and build**

Run: `node --test tests/staff-finances-page.test.mjs && npm run lint && npm run build`
Expected: PASS, no diagnostics, build succeeds.

- [ ] **Step 7: Verify in the browser**

Run `npm run build && npm run start -- --hostname 127.0.0.1 --port 3001` (kill any stale listener on 3001 first — it blocks the build). Sign in as staff, open `/admin/finances`, and confirm: summary cards show non-zero numbers, the ledger lists rows with evidence links, the events table links through, and no console errors. Screenshot to `screenshots/`.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(staff\)/admin/finances src/app/\(staff\)/admin/page.tsx src/components/staff/staff-club-ledger-table.tsx src/components/staff/staff-event-finance-table.tsx src/components/staff/staff-finance-summary-cards.tsx src/components/staff/staff-nav.tsx tests/staff-finances-page.test.mjs
git commit -m "feat(staff): add read-only club and event finance overview"
```

---

## Task 8: `/admin/finances/[eventId]` event detail (app)

**Files:**
- Create: `src/app/(staff)/admin/finances/[eventId]/page.tsx`
- Create: `src/components/staff/staff-event-ledger-table.tsx`
- Test: `tests/staff-event-finance-page.test.mjs`

**Interfaces:**
- Consumes: `loadStaffEventFinance(supabase, eventId)` and `loadStaffEventFinanceOverview(supabase)` (T6), `formatNgn`.
- Produces: route `/admin/finances/[eventId]` with three read-only sections — ticket tiers, ticket sales, ledger entries. Receipt evidence links are added to the ledger table in T9; this task renders no links.

- [ ] **Step 1: Write the failing test**

Create `tests/staff-event-finance-page.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pagePath = "src/app/(staff)/admin/finances/[eventId]/page.tsx";

test("event detail page guards and loads through the staff loader", () => {
  assert.ok(existsSync(pagePath), "event detail page must exist");
  const page = readFileSync(pagePath, "utf8");
  assert.match(page, /requireStaffProfile\(\)/);
  assert.match(page, /loadStaffEventFinance\(supabase, eventId\)/);
  assert.match(page, /if \(!event\) notFound\(\);/);
  assert.match(
    page,
    /uuidPattern|VALID_UUID_PATTERN|\/\^\[0-9a-f\]\{8\}/,
    "the event id param must be validated before the RPC",
  );
});

test("event ledger table renders verification state", () => {
  const table = readFileSync(
    "src/components/staff/staff-event-ledger-table.tsx",
    "utf8",
  );
  assert.match(table, /verification_status|verificationStatus/);
  assert.doesNotMatch(table, /<form|useMutation/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/staff-event-finance-page.test.mjs`
Expected: FAIL — `event detail page must exist`.

- [ ] **Step 3: Write the table component**

`src/components/staff/staff-event-ledger-table.tsx`:

```tsx
import { formatNgn } from "@/lib/report-export";
import type { StaffEventLedgerRow } from "@/lib/staff-money.server";

export default function StaffEventLedgerTable({
  rows,
}: {
  rows: StaffEventLedgerRow[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#60451C]">No entries for this event.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#F5F0E5] text-xs uppercase text-[#60451C]">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2">Amount</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Payment</th>
            <th className="px-4 py-2">Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-[#E5DDD3]" key={row.id}>
              <td className="px-4 py-3 align-top">{row.transaction_date}</td>
              <td className="px-4 py-3 align-top capitalize">{row.kind}</td>
              <td className="px-4 py-3 align-top tabular-nums">
                NGN {formatNgn(BigInt(row.amount_ngn))}
                {row.voided_at ? (
                  <span className="block text-xs text-[#76342D]">Voided</span>
                ) : null}
              </td>
              <td className="px-4 py-3 align-top">
                {row.description ?? row.payer_payee ?? "—"}
              </td>
              <td className="px-4 py-3 align-top capitalize">
                {row.payment_status}
              </td>
              <td className="px-4 py-3 align-top capitalize">
                {row.verification_status ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

`src/app/(staff)/admin/finances/[eventId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import StaffEventLedgerTable from "@/components/staff/staff-event-ledger-table";
import { formatNgn } from "@/lib/report-export";
import { requireStaffProfile } from "@/lib/staff-access.server";
import {
  loadStaffEventFinance,
  loadStaffEventFinanceOverview,
} from "@/lib/staff-money.server";

export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StaffEventFinancePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!uuidPattern.test(eventId)) redirect("/admin/finances");

  const { supabase } = await requireStaffProfile();
  const [overview, finance] = await Promise.all([
    loadStaffEventFinanceOverview(supabase),
    loadStaffEventFinance(supabase, eventId),
  ]);

  // The staff overview read is the only place staff learn which events exist,
  // so an id missing from it is treated as not found rather than rendered empty.
  const event = overview.find((row) => row.eventId === eventId);
  if (!event) notFound();

  return (
    <div className="space-y-6">
      <Link className="text-sm underline" href="/admin/finances">
        Back to club finances
      </Link>
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          {event.title}
        </h1>
        <p className="mt-1 text-sm text-[#60451C] capitalize">
          {event.status} · net NGN {formatNgn(BigInt(event.netResultNgn))}
        </p>
      </div>
      <section className="rounded-xl border border-[#E5DDD3] bg-white p-4 sm:p-6">
        <h2 className="text-sm font-extrabold text-[#3D291F]">Ticket tiers</h2>
        <ul className="mt-3 space-y-1 text-sm text-[#514943]">
          {finance.tiers.map((tier) => (
            <li key={tier.id}>
              {tier.name} · NGN {tier.price_ngn} · capacity {tier.capacity}
              {tier.retired_at ? " · retired" : ""}
            </li>
          ))}
          {finance.tiers.length === 0 ? <li>No tiers.</li> : null}
        </ul>
      </section>
      <section className="rounded-xl border border-[#E5DDD3] bg-white p-4 sm:p-6">
        <h2 className="text-sm font-extrabold text-[#3D291F]">Ticket sales</h2>
        <ul className="mt-3 space-y-1 text-sm text-[#514943]">
          {finance.sales.map((sale) => (
            <li key={sale.id}>
              {sale.buyer_name} · {sale.quantity} × NGN {sale.unit_price_ngn} = NGN{" "}
              {sale.amount_ngn} · {sale.payment_method} ·{" "}
              {sale.refunded_at ? "refunded" : (sale.verification_status ?? "pending")}
            </li>
          ))}
          {finance.sales.length === 0 ? <li>No sales.</li> : null}
        </ul>
      </section>
      <section className="rounded-xl border border-[#E5DDD3] bg-white p-4 sm:p-6">
        <h2 className="text-sm font-extrabold text-[#3D291F]">Ledger</h2>
        <div className="mt-4">
          <StaffEventLedgerTable rows={finance.transactions} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run tests, lint, and build**

Run: `node --test tests/staff-event-finance-page.test.mjs && npm run lint && npm run build`
Expected: PASS, no diagnostics, build succeeds.

- [ ] **Step 6: Verify in the browser**

From `/admin/finances`, click an event with known data. Confirm tiers, sales, and ledger all render, an empty event shows the three "No …" lines rather than a crash, and a bad URL (`/admin/finances/not-a-uuid`) redirects to `/admin/finances`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(staff)/admin/finances/[eventId]" src/components/staff/staff-event-ledger-table.tsx tests/staff-event-finance-page.test.mjs
git commit -m "feat(staff): add read-only event finance detail page"
```

---

## Task 9: Receipt links on the staff money pages (app)

**Files:**
- Create: `src/components/staff/staff-receipt-links.tsx`
- Modify: `src/components/staff/staff-club-ledger-table.tsx` (swap the inline anchors T7 created for the shared component)
- Modify: `src/components/staff/staff-event-ledger-table.tsx` (add the Evidence column)
- Modify: `src/app/(staff)/admin/finances/[eventId]/page.tsx` (fetch and group receipts)
- Test: `tests/staff-receipt-links.test.mjs`

**Interfaces:**
- Consumes: `finance_receipts` rows (staff-readable since T5) and the existing `GET /api/receipts/[receiptId]`.
- Produces: `StaffReceiptLinks({ receipts }: { receipts: { id: string; filename: string }[] })` rendering anchors to `/api/receipts/<id>`; the string `"None"` when empty. `StaffEventLedgerTable` gains a second prop, `receiptsById: Map<string, { id: string; filename: string }[]>`.

- [ ] **Step 1: Write the failing test**

Create `tests/staff-receipt-links.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const links = readFileSync(
  "src/components/staff/staff-receipt-links.tsx",
  "utf8",
);

test("receipt links point at the guarded download route", () => {
  assert.match(links, /href=\{`\/api\/receipts\/\$\{receipt\.id\}`\}/);
  assert.match(links, /target="_blank"/);
  assert.match(links, /rel="noreferrer"/);
  assert.match(links, /None/);
});

test("staff money pages use the shared link component", () => {
  const club = readFileSync(
    "src/components/staff/staff-club-ledger-table.tsx",
    "utf8",
  );
  const eventTable = readFileSync(
    "src/components/staff/staff-event-ledger-table.tsx",
    "utf8",
  );
  const eventPage = readFileSync(
    "src/app/(staff)/admin/finances/[eventId]/page.tsx",
    "utf8",
  );
  assert.match(club, /StaffReceiptLinks/);
  assert.match(eventTable, /StaffReceiptLinks/);
  assert.match(eventPage, /finance_receipts/);
  assert.match(eventPage, /receiptsById=\{receiptsById\}/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/staff-receipt-links.test.mjs`
Expected: FAIL — `ENOENT` for `staff-receipt-links.tsx`.

- [ ] **Step 3: Write the component**

`src/components/staff/staff-receipt-links.tsx`:

```tsx
export default function StaffReceiptLinks({
  receipts,
}: {
  receipts: { id: string; filename: string }[];
}) {
  if (receipts.length === 0) {
    return <span className="text-xs text-[#60451C]">None</span>;
  }

  return (
    <div className="space-y-1">
      {receipts.map((receipt) => (
        <a
          className="block text-[#204F3D] underline"
          href={`/api/receipts/${receipt.id}`}
          key={receipt.id}
          rel="noreferrer"
          target="_blank"
        >
          {receipt.filename}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Use it in both tables**

In `src/components/staff/staff-club-ledger-table.tsx`, replace the inline `<a>` mapping inside the Evidence cell with `<StaffReceiptLinks receipts={receiptsById.get(transaction.id) ?? []} />` and add the import. The `receiptsById` prop already exists from T7 — do not change the signature.

In `src/components/staff/staff-event-ledger-table.tsx`, add the same prop and a seventh column. Change the signature to:

```tsx
export default function StaffEventLedgerTable({
  receiptsById,
  rows,
}: {
  receiptsById: Map<string, { id: string; filename: string }[]>;
  rows: StaffEventLedgerRow[];
}) {
```

add `<th className="px-4 py-2">Evidence</th>` after the `Review` header, and add the cell before `</tr>`:

```tsx
<td className="px-4 py-3 align-top">
  <StaffReceiptLinks receipts={receiptsById.get(row.id) ?? []} />
</td>
```

In `src/app/(staff)/admin/finances/[eventId]/page.tsx`, fetch and group the event receipts, then pass the map down. Add `receiptRows` to the existing `Promise.all`:

```tsx
const [overview, finance, receiptRows] = await Promise.all([
  loadStaffEventFinanceOverview(supabase),
  loadStaffEventFinance(supabase, eventId),
  supabase
    .from("finance_receipts")
    .select(
      "id, event_transaction_id, event_ticket_sale_id, original_filename",
    )
    .in("scope", ["event", "event_ticket"]),
]);
```

and after the `if (!event) notFound();` guard:

```ts
const receiptsById = new Map<string, { id: string; filename: string }[]>();
for (const receipt of receiptRows.data ?? []) {
  const key = (receipt.event_transaction_id ??
    receipt.event_ticket_sale_id) as string | null;
  if (!key) continue;
  const bucket = receiptsById.get(key) ?? [];
  bucket.push({
    id: receipt.id as string,
    filename: receipt.original_filename,
  });
  receiptsById.set(key, bucket);
}
```

The `event_ticket_sale_id` key never matches a ledger row id, so sales receipts are grouped but only render where a transaction id matches — that is acceptable for this phase, and the ticket-sales list itself stays text-only. Change the table call to `<StaffEventLedgerTable receiptsById={receiptsById} rows={finance.transactions} />`.

- [ ] **Step 4b: Verify the event table test still matches**

`tests/staff-event-finance-page.test.mjs` asserts `assert.doesNotMatch(table, /<form|useMutation/)`. `StaffReceiptLinks` renders anchors, not a form, so no assertion changes. Add one line to that file so the Evidence column is pinned:

```js
assert.match(table, /StaffReceiptLinks/);
```

- [ ] **Step 5: Run tests, lint, and build**

Run: `node --test tests/staff-receipt-links.test.mjs && node --test tests/staff-finances-page.test.mjs && npm run lint && npm run build`
Expected: PASS. `tests/staff-finances-page.test.mjs` asserts `<form` is absent from the club ledger, so confirm the new component introduces no form.

- [ ] **Step 6: Verify one real download**

In the browser, as staff, click a receipt link on `/admin/finances`. Expect the file to open or download, never a 401. A 404 here means the download RPC still denies staff — stop and re-check Task 5 Step 4.

- [ ] **Step 7: Commit**

```bash
git add src/components/staff/staff-receipt-links.tsx src/components/staff/staff-club-ledger-table.tsx src/components/staff/staff-event-ledger-table.tsx "src/app/(staff)/admin/finances/[eventId]/page.tsx" tests/staff-receipt-links.test.mjs tests/staff-event-finance-page.test.mjs
git commit -m "feat(staff): link receipt evidence from the staff finance pages"
```

---

## Task 10: Staff CSV export (DB + app)

**Files:**
- Create: `supabase/migrations/20261101125000_staff_report_export_gate.sql`
- Create: `src/app/api/staff-reports/[report]/route.ts`
- Modify: `src/app/(staff)/admin/finances/page.tsx` (export buttons)
- Test: `supabase/tests/database/staff_money_read_test.sql` (append) + `tests/staff-report-export.test.mjs`

**Interfaces:**
- Consumes: `private.log_report_export(text, text)` (`20261003104000_report_exports.sql:156-190`), the T1/T2 reads, and helpers `toCsv`, `formatNgn`, `MAX_REPORT_ROWS` from `src/lib/report-export.ts`.
- Produces: `POST /api/staff-reports/finances` and `POST /api/staff-reports/dues`, each returning `text/csv` bytes; audit action `report_export_requested`.
- Deliberately **not** touched: `src/app/api/reports/[report]/route.ts` and its two SECURITY INVOKER data functions. Those return per-caller RLS-filtered rows and are covered by `tests/report-export-security.test.mjs`; a staff branch inside them would need new definer report builders. Staff export instead renders the rows the staff reads already produced, so the member path keeps its current security properties.

- [ ] **Step 1: Write the failing tests**

pgTAP, in the staff session block:

```sql
select lives_ok(
  $$select public.log_report_export('finances', 'csv')$$,
  'staff may record a report export'
);
select is(
  (select count(*) from public.audit_log
   where action = 'report_export_requested'
     and actor_id = '00000000-0000-0000-0000-000000000006'),
  1::bigint,
  'the staff export is written to the audit log'
);
```

and in the active-member session block, proving no behaviour change:

```sql
select lives_ok(
  $$select public.log_report_export('dues', 'csv')$$,
  'an active member still records a report export'
);
```

App test `tests/staff-report-export.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/staff-reports/[report]/route.ts", "utf8");

test("staff export route is same-site and staff-gated", () => {
  assert.match(route, /isSameSiteRequest/);
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /status !== "staff"/);
  assert.match(route, /Staff account required/);
  assert.match(route, /getSiteOrigin\(\)/);
  assert.match(route, /log_report_export/);
  assert.match(route, /MAX_REPORT_ROWS/);
  assert.match(route, /text\/csv; charset=utf-8/);
  assert.match(route, /no-store/);
});

test("only the two staff reports are accepted", () => {
  assert.match(route, /"finances"/);
  assert.match(route, /"dues"/);
  assert.doesNotMatch(route, /pdf/, "CSV only in this phase");
});
```

- [ ] **Step 2: Run both to verify they fail**

Run: `node --test tests/staff-report-export.test.mjs` → FAIL `ENOENT` for the route.
Run: `npx supabase test db --local supabase/tests/database/staff_money_read_test.sql` → FAIL `not ok … staff may record a report export` (`42501`, "An active member account is required.").

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261101125000_staff_report_export_gate.sql` — the current body of `private.log_report_export` (`20261003104000_report_exports.sql:156-190`) with only the actor branch changed:

```sql
-- Report exports are audit-logged for staff as well as members. The payload
-- validation, the 23514 rejection, and the audit columns are unchanged from
-- 20261003104000_report_exports.sql:156-188.
create or replace function private.log_report_export(
  p_report_type text,
  p_format text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null
     or not (
       (select private.is_active_club_member())
       or (select private.is_staff_administrator())
     ) then
    raise exception using errcode = '42501', message = 'An active member or staff account is required.';
  end if;
  if p_report_type is null or p_format is null
     or p_report_type not in ('finances', 'dues')
     or p_format not in ('csv', 'pdf') then
    raise exception using errcode = '23514', message = 'The report request is invalid.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, after_data, reason
  ) values (
    v_actor_id,
    'report_export_requested',
    'report',
    pg_catalog.gen_random_uuid(),
    pg_catalog.jsonb_build_object('report_type', p_report_type, 'format', p_format),
    'Report export requested.'
  );
end;
$function$;
```

The member path is untouched: an active member still writes the same audit shape, and the only new message text is on the denial branch that members never reach. `public.log_report_export` stays a security-invoker passthrough and needs no change.

- [ ] **Step 4: Write the route**

`src/app/api/staff-reports/[report]/route.ts`:

```ts
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_REPORT_ROWS, formatNgn, toCsv } from "@/lib/report-export";
import {
  loadStaffClubFinance,
  loadStaffDuesStanding,
} from "@/lib/staff-money.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORTS = new Set(["finances", "dues"]);
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "text/csv; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

// Mirrors isSameSiteRequest in src/app/api/reports/[report]/route.ts:499.
function isSameSiteRequest(request: Request, origin: string) {
  const referer = request.headers.get("referer");
  return referer !== null && referer.startsWith(`${origin}/`);
}

function errorResponse(status: number, message: string) {
  return new Response(message, { headers: RESPONSE_HEADERS, status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report } = await params;
  if (!REPORTS.has(report)) return errorResponse(404, "Unknown report");

  const origin = getSiteOrigin();
  if (!origin || !isSameSiteRequest(request, origin)) {
    return errorResponse(403, "Cross-origin request rejected");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return errorResponse(500, "Configuration error");
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse(401, "Unauthorized");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("status, staff_disabled_at")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profile?.status !== "staff" || profile?.staff_disabled_at !== null) {
    return errorResponse(403, "Staff account required");
  }

  const [finance, duesStanding] = await Promise.all([
    loadStaffClubFinance(supabase),
    loadStaffDuesStanding(supabase),
  ]);

  const rows =
    report === "finances"
      ? finance.transactions.length
      : duesStanding.size;
  if (rows > MAX_REPORT_ROWS) return errorResponse(413, "Report too large");

  const headers =
    report === "finances"
      ? [
          "Date",
          "Kind",
          "Amount NGN",
          "Description",
          "Category",
          "Payer or payee",
          "Status",
        ]
      : [
          "Member ID",
          "Unpaid months",
          "Overdue months",
          "Open amount NGN",
          "Last paid month",
        ];

  const rows: Array<Array<string | number>> =
    report === "finances"
      ? finance.transactions.map((transaction) => [
          transaction.transactionDate,
          transaction.kind,
          formatNgn(BigInt(transaction.amountNgn)),
          transaction.description ?? "",
          transaction.categoryName ?? "",
          transaction.payerPayee ?? "",
          transaction.voidedAt ? "Voided" : "Recorded",
        ])
      : [...duesStanding.entries()].map(([memberId, standing]) => [
          memberId,
          standing.unpaidMonths,
          standing.overdueMonths,
          formatNgn(BigInt(standing.openAmountNgn)),
          standing.lastPaidMonth ?? "",
        ]);

  // The audit row is written before the bytes leave, so a denied actor never
  // produces a download. A failed audit write aborts the export.
  const logResult = await supabase.rpc("log_report_export", {
    p_report_type: report,
    p_format: "csv",
  });
  if (logResult.error) return errorResponse(503, "Export could not be recorded");

  const filename = `${report}-staff-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(headers, rows), {
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    status: 200,
  });
}
```

Then add the two forms to `src/app/(staff)/admin/finances/page.tsx`, above the summary cards:

```tsx
<div className="flex flex-wrap gap-3">
  <form action="/api/staff-reports/finances" method="post">
    <button className="button-secondary" type="submit">
      Export ledger CSV
    </button>
  </form>
  <form action="/api/staff-reports/dues" method="post">
    <button className="button-secondary" type="submit">
      Export dues CSV
    </button>
  </form>
</div>
```

Note `tests/staff-finances-page.test.mjs` asserts the ledger **table** has no form; the buttons belong on the page, not in `staff-club-ledger-table.tsx`.

- [ ] **Step 5: Run all checks**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/staff_money_read_test.sql && node --test tests/staff-report-export.test.mjs && npm run lint && npm run build`
Expected: all PASS, zero `not ok` in the staff suite.

- [ ] **Step 6: Prove the member export is untouched**

Run: `node --test tests/report-export-security.test.mjs`
Expected: PASS with no edits to `src/app/api/reports/[report]/route.ts`.

- [ ] **Step 7: Verify a real download, then commit**

In the browser as staff, click both export buttons on `/admin/finances`. Confirm each downloads a CSV, `/admin/audit` shows a `report_export_requested` row attributed to you, and an officer's own export at `/finances` still works.

```bash
git add supabase/migrations/20261101125000_staff_report_export_gate.sql src/app/api/staff-reports supabase/tests/database/staff_money_read_test.sql tests/staff-report-export.test.mjs src/app/\(staff\)/admin/finances/page.tsx
git commit -m "feat(staff): add audited CSV export of the staff money view"
```

---

## Task 11: Full gate and record the new access matrix

**Files:**
- Modify: `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md` (append §8b)

**Interfaces:** none consumed; this task proves the phase and leaves the documentation truthful.

- [ ] **Step 1: Run the whole verification set**

```
npm run lint
npm test
npm run build
npx supabase db reset --local
npx supabase test db --local
```

Expected: lint clean; `npm test` fully green; build succeeds; in the pgTAP run, **zero `not ok` lines inside `staff_money_read_test.sql`** and no new `not ok` lines in `club_finances_test.sql`, `event_finance_ticketing_ledger_test.sql`, `finance_receipts_test.sql`, `report_exports_test.sql` compared with the pre-phase baseline. The seven documented stale-name failures in unrelated suites are drift, not your regression — record their count, do not chase them.

- [ ] **Step 2: Re-verify the isolation guarantees**

As staff in the browser: `/admin/finances` renders, `/dues` and `/finances` redirect or deny, no member notification bell appears, and `/admin/members` shows dues. As president: every officer screen renders exactly as before this phase. Record both as screenshots under `screenshots/`.

- [ ] **Step 3: Append §8b to the report**

Add after the §8 inventory table in `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md`:

```markdown
### 8b. Phase 2 result (2026-11-01)

Staff gained read-only money visibility and nothing else: dues standing
(`staff_dues_standing`), club summary and ledger (`staff_club_finance_summary`,
`staff_club_transactions`), event overview, ledger, sales and tiers
(`staff_event_finance_overview`, `staff_event_transactions`,
`staff_event_ticket_sales`, `staff_event_ticket_tiers`), receipt read and
download, and audited CSV export. Every read is a `private.*` SECURITY DEFINER
function gated on `private.is_staff_administrator()` behind a `public.*`
invoker wrapper; no money table gained an RLS policy or a column grant.

Still president-only: every write listed above in §8, all event lifecycle,
communications, attendance, settings writes, Executive grants, and report PDFs.
```

- [ ] **Step 4: Commit**

```bash
git add PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md
git commit -m "docs: record staff phase 2 money visibility access matrix"
```

---

## Deployment note

App merges deploy normally. The six new migrations reach production only through the operator-approved path: encrypted snapshot first, isolated restore drill, then `supabase db push` against the linked project **with explicit confirmation**. Phase 1 used that runbook (2026-10-31); this phase does not change it and must not shortcut it. Nothing in this plan converts accounts or touches `auth.users`.
