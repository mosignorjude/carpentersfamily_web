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
