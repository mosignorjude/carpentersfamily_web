-- Automatically synchronize event budget allocations with event finance categories and compute allocation_percent

create or replace function private.sync_budget_allocation_category_and_percent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_budget_total bigint;
  v_cat_id uuid;
begin
  select total_ngn into v_budget_total from public.event_budgets where event_id = new.event_id;
  if v_budget_total is not null and v_budget_total > 0 then
    new.allocation_percent := pg_catalog.round(new.amount_ngn::numeric * 100.0 / v_budget_total, 12);
  else
    new.allocation_percent := 0;
  end if;

  if new.category_id is null and new.allocation_name is not null then
    -- Try to match existing active budget_allocation category
    select id into v_cat_id from public.event_finance_categories
    where category_type = 'budget_allocation'
      and pg_catalog.lower(name) = pg_catalog.lower(new.allocation_name)
      and retired_at is null
    limit 1;

    -- If not found, try to match existing expense category
    if v_cat_id is null then
      select id into v_cat_id from public.event_finance_categories
      where category_type = 'expense'
        and pg_catalog.lower(name) = pg_catalog.lower(new.allocation_name)
        and retired_at is null
      limit 1;
    end if;

    -- If still not found, create new category in event_finance_categories
    if v_cat_id is null and pg_catalog.char_length(pg_catalog.btrim(new.allocation_name)) between 2 and 80 then
      insert into public.event_finance_categories (
        category_type, name, created_by
      ) values (
        'budget_allocation', pg_catalog.btrim(new.allocation_name),
        coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001'::uuid)
      ) returning id into v_cat_id;

      -- Also ensure a corresponding expense category exists for recording transactions
      if not exists (
        select 1 from public.event_finance_categories
        where category_type = 'expense'
          and pg_catalog.lower(name) = pg_catalog.lower(new.allocation_name)
          and retired_at is null
      ) then
        insert into public.event_finance_categories (
          category_type, name, created_by
        ) values (
          'expense', pg_catalog.btrim(new.allocation_name),
          coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001'::uuid)
        );
      end if;
    end if;

    new.category_id := v_cat_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists event_budget_allocations_sync_category_and_percent on public.event_budget_allocations;

create trigger event_budget_allocations_sync_category_and_percent
before insert on public.event_budget_allocations
for each row execute function private.sync_budget_allocation_category_and_percent();
