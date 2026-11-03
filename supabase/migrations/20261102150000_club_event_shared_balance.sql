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
