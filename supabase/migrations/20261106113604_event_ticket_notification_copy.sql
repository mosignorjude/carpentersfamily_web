create or replace function private.build_audit_notification_copy(
  p_audit public.audit_log
)
returns table (
  title text,
  officer_body text,
  self_title text,
  self_body text,
  self_category text,
  self_source_type text,
  resolved_event_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_target_username text;
  v_actor_username text;
  v_event_id uuid := coalesce(
    p_audit.event_id,
    case
      when (p_audit.after_data ->> 'event_id') ~ '^[0-9a-fA-F-]{36}$'
        then (p_audit.after_data ->> 'event_id')::uuid
      when (p_audit.before_data ->> 'event_id') ~ '^[0-9a-fA-F-]{36}$'
        then (p_audit.before_data ->> 'event_id')::uuid
      when p_audit.entity_type in ('event', 'event_role_assignment', 'event_budget', 'attendance_session')
        then p_audit.entity_id
      else null
    end
  );
  v_event_title text;
  v_role_label text;
  v_amount_ngn bigint;
  v_months_count integer;
  v_months_label text;
  v_fin_kind text;
  v_fin_desc text;
  v_ticket_quantity text;
  v_ticket_name text;
  v_decision text;
  v_title text;
  v_body text;
  v_self_title text := null;
  v_self_body text := null;
  v_self_category text := null;
  v_self_source_type text := null;
begin
  if p_audit.target_member_id is not null then
    select '@' || mp.username
    into v_target_username
    from public.member_profiles as mp
    where mp.id = p_audit.target_member_id;
  end if;
  v_target_username := coalesce(v_target_username, 'A member');

  if p_audit.actor_id is not null then
    select '@' || mp.username
    into v_actor_username
    from public.member_profiles as mp
    where mp.id = p_audit.actor_id;
  end if;
  v_actor_username := coalesce(v_actor_username, 'an officer');

  if v_event_id is not null then
    select e.title
    into v_event_title
    from public.events as e
    where e.id = v_event_id;
  end if;
  v_event_title := coalesce(
    v_event_title,
    p_audit.after_data ->> 'title',
    p_audit.before_data ->> 'title',
    'the event'
  );

  -- A. Announcements
  if p_audit.action = 'announcement.created' then
    v_title := 'New announcement: ' || coalesce(p_audit.after_data ->> 'title', 'Club circular');
    v_body := coalesce(p_audit.after_data ->> 'message', 'A new club announcement has been published.');

  -- B. Polls
  elsif p_audit.action = 'poll.created' then
    v_title := 'New poll: ' || coalesce(p_audit.after_data ->> 'question', 'Club vote');
    v_body := 'Cast your vote on "' || private.sanitize_notification_text(coalesce(p_audit.after_data ->> 'question', 'the new poll'), 220) || '" before the poll closes.';

  -- C. Attendance session opened
  elsif p_audit.action = 'attendance.session_opened' then
    v_title := 'Attendance open: ' || v_event_title;
    v_body := 'Check in now for ' || v_event_title || ' while the attendance session is open.';

  -- D. Event lifecycle updates
  elsif p_audit.action in (
    'event_created', 'event_details_updated', 'event_completed',
    'event_cancelled', 'event_reopened', 'event_archived'
  ) then
    case p_audit.action
      when 'event_created' then
        v_title := 'New event: ' || v_event_title;
        v_body := v_event_title || ' has been scheduled' || coalesce(' at ' || (p_audit.after_data ->> 'location'), '') || '.';
      when 'event_details_updated' then
        v_title := 'Event updated: ' || v_event_title;
        v_body := 'Schedule or details for ' || v_event_title || ' were updated.';
      when 'event_completed' then
        v_title := 'Event completed: ' || v_event_title;
        v_body := v_event_title || ' was marked as completed.';
      when 'event_cancelled' then
        v_title := 'Event cancelled: ' || v_event_title;
        v_body := v_event_title || ' was cancelled' || coalesce(': ' || p_audit.reason, '.');
      when 'event_reopened' then
        v_title := 'Event reopened: ' || v_event_title;
        v_body := v_event_title || ' was reopened as scheduled.';
      else
        v_title := 'Event archived: ' || v_event_title;
        v_body := v_event_title || ' was archived by ' || v_actor_username || '.';
    end case;

  -- E. Event role assignments & removals
  elsif p_audit.action in ('event_role_assigned', 'event_role_granted', 'event_role_revoked') then
    v_role_label := private.format_role_label(
      coalesce(p_audit.after_data ->> 'role', p_audit.before_data ->> 'role')
    );
    v_self_category := 'event_activity';
    v_self_source_type := 'event';
    if p_audit.action = 'event_role_revoked' then
      v_title := 'Event role removed: ' || v_role_label;
      v_body := v_target_username || '''s ' || v_role_label || ' role for ' || v_event_title || ' was removed.';
      v_self_title := v_title;
      v_self_body := 'Your ' || v_role_label || ' role for ' || v_event_title || ' was removed.';
    else
      v_title := 'Event role assigned: ' || v_role_label;
      v_body := v_target_username || ' was assigned as ' || v_role_label || ' for ' || v_event_title || '.';
      v_self_title := v_title;
      v_self_body := 'You were assigned as ' || v_role_label || ' for ' || v_event_title || '.';
    end if;

  -- F. Membership status & Club role changes
  elsif p_audit.action in (
    'member_approved', 'member_deactivated', 'member_reactivated',
    'member_rejected', 'member_request_rejected',
    'club_role_granted', 'club_role_revoked'
  ) then
    if p_audit.action = 'member_approved' then
      v_title := 'Member approved';
      v_body := v_target_username || '''s membership request was approved by ' || v_actor_username || '.';
      v_self_title := 'Membership approved';
      v_self_body := 'Your Carpenters Family membership was approved and is now active.';
      v_self_category := 'officer_member';
      v_self_source_type := 'audit';
    elsif p_audit.action = 'member_reactivated' then
      v_title := 'Member reactivated';
      v_body := v_target_username || '''s membership was reactivated by ' || v_actor_username || '.';
      v_self_title := 'Membership reactivated';
      v_self_body := 'Your Carpenters Family membership has been reactivated.';
      v_self_category := 'officer_member';
      v_self_source_type := 'audit';
    elsif p_audit.action = 'member_deactivated' then
      v_title := 'Member deactivated';
      v_body := v_target_username || '''s membership was deactivated by ' || v_actor_username || '.';
    elsif p_audit.action in ('member_rejected', 'member_request_rejected') then
      v_title := 'Membership request declined';
      v_body := v_target_username || '''s membership request was declined by ' || v_actor_username || '.';
    elsif p_audit.action = 'club_role_granted' then
      v_role_label := private.format_role_label(p_audit.after_data ->> 'role');
      v_title := 'Club role updated';
      v_body := v_target_username || '''s role changed to ' || v_role_label || '.';
      v_self_title := 'Club role updated';
      v_self_body := 'Your role changed to ' || v_role_label || '.';
      v_self_category := 'officer_member';
      v_self_source_type := 'audit';
    elsif p_audit.action = 'club_role_revoked' then
      v_role_label := private.format_role_label(
        coalesce(p_audit.before_data ->> 'role', p_audit.after_data ->> 'role')
      );
      v_title := 'Club role updated';
      v_body := v_target_username || '''s role changed to Member (was ' || v_role_label || ').';
      v_self_title := 'Club role updated';
      v_self_body := 'Your role changed to Member (was ' || v_role_label || ').';
      v_self_category := 'officer_member';
      v_self_source_type := 'audit';
    end if;

  -- G. Dues & Financial records
  else
    begin
      v_amount_ngn := coalesce(
        (p_audit.after_data ->> 'amount_ngn')::bigint,
        (p_audit.after_data ->> 'monthly_amount_ngn')::bigint,
        (p_audit.after_data ->> 'total_ngn')::bigint,
        (p_audit.after_data ->> 'price_ngn')::bigint,
        (p_audit.before_data ->> 'amount_ngn')::bigint,
        (p_audit.before_data ->> 'total_ngn')::bigint
      );
    exception when others then
      v_amount_ngn := null;
    end;

    if pg_catalog.jsonb_typeof(p_audit.after_data -> 'covered_months') = 'array' then
      v_months_count := pg_catalog.jsonb_array_length(p_audit.after_data -> 'covered_months');
    elsif pg_catalog.jsonb_typeof(p_audit.after_data -> 'coverage') = 'array' then
      v_months_count := pg_catalog.jsonb_array_length(p_audit.after_data -> 'coverage');
    else
      v_months_count := null;
    end if;

    v_months_label := case
      when v_months_count = 1 then '1 month'
      when v_months_count > 1 then v_months_count::text || ' months'
      else null
    end;

    if p_audit.action = 'dues_payment_request_submitted' then
      v_title := 'Dues payment request';
      v_body := v_target_username || ' submitted a dues request of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'dues')
        || coalesce(' (' || v_months_label || ')', '') || '.';

    elsif p_audit.action = 'dues_payment_request_approved' then
      v_title := 'Dues payment approved';
      v_body := v_target_username || ' paid dues of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'dues')
        || coalesce(' (' || v_months_label || ')', '') || '.';
      v_self_title := 'Dues payment approved';
      v_self_body := 'Your dues payment of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'dues')
        || coalesce(' (' || v_months_label || ')', '') || ' was approved.';
      v_self_category := 'dues_reminder';
      v_self_source_type := 'dues';

    elsif p_audit.action = 'dues_payment_recorded' then
      v_title := 'Dues payment recorded';
      v_body := v_target_username || ' paid dues of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'dues')
        || coalesce(' (' || v_months_label || ')', '') || '.';
      v_self_title := 'Dues payment recorded';
      v_self_body := 'Your dues payment of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'dues')
        || coalesce(' (' || v_months_label || ')', '') || ' was recorded.';
      v_self_category := 'dues_reminder';
      v_self_source_type := 'dues';

    elsif p_audit.action = 'dues_payment_request_rejected' then
      v_title := 'Dues request declined';
      v_body := v_target_username || '''s dues payment request was declined by ' || v_actor_username || '.';
      v_self_title := 'Dues request declined';
      v_self_body := 'Your dues payment request was declined: ' || coalesce(p_audit.reason, 'Please review your payment details.');
      v_self_category := 'dues_reminder';
      v_self_source_type := 'dues';

    elsif p_audit.action = 'dues_payment_corrected' then
      v_title := 'Dues payment updated';
      v_body := v_target_username || '''s dues payment was updated to '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'a revised amount')
        || coalesce(' (' || v_months_label || ')', '') || '.';
      v_self_title := 'Dues payment updated';
      v_self_body := 'Your dues payment record was updated to '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'a revised amount')
        || coalesce(' (' || v_months_label || ')', '') || '.';
      v_self_category := 'dues_reminder';
      v_self_source_type := 'dues';

    elsif p_audit.action = 'dues_month_written_off' then
      v_title := 'Dues month written off';
      v_body := v_target_username || '''s dues for '
        || coalesce(p_audit.after_data ->> 'covered_month', 'a billing month')
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' were written off.';
      v_self_title := 'Dues month waived';
      v_self_body := 'Your dues for '
        || coalesce(p_audit.after_data ->> 'covered_month', 'a billing month')
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' were written off.';
      v_self_category := 'dues_reminder';
      v_self_source_type := 'dues';

    elsif p_audit.action = 'dues_rate_changed' then
      v_title := 'Monthly dues rate updated';
      v_body := 'Monthly dues rate set to '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'a new rate')
        || ' effective ' || coalesce(p_audit.after_data ->> 'effective_month', 'upcoming month') || '.';

    elsif p_audit.action in ('club_finance_recorded', 'club_finance_corrected', 'club_finance_voided') then
      v_fin_kind := case
        when coalesce(p_audit.after_data ->> 'kind', p_audit.before_data ->> 'kind') = 'income' then 'income'
        else 'expense'
      end;
      v_fin_desc := coalesce(
        p_audit.after_data ->> 'description',
        p_audit.after_data ->> 'source_note',
        p_audit.after_data ->> 'category_name',
        p_audit.before_data ->> 'description',
        p_audit.before_data ->> 'source_note'
      );
      v_title := 'Club ' || v_fin_kind || case
        when p_audit.action = 'club_finance_voided' then ' voided'
        when p_audit.action = 'club_finance_corrected' then ' updated'
        else ' recorded'
      end;
      v_body := 'Club ' || v_fin_kind || ' of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'an amount')
        || coalesce(' (' || v_fin_desc || ')', '')
        || case
          when p_audit.action = 'club_finance_voided' then ' was voided.'
          when p_audit.action = 'club_finance_corrected' then ' was updated.'
          else ' was recorded.'
        end;

    elsif p_audit.action in ('event_finance_recorded', 'event_finance_corrected', 'event_finance_voided') then
      v_fin_kind := case
        when coalesce(p_audit.after_data ->> 'kind', p_audit.before_data ->> 'kind') = 'income' then 'income'
        else 'expense'
      end;
      v_fin_desc := coalesce(
        p_audit.after_data ->> 'description',
        p_audit.after_data ->> 'category_name',
        p_audit.before_data ->> 'description'
      );
      v_title := 'Event ' || v_fin_kind || case
        when p_audit.action = 'event_finance_voided' then ' voided'
        when p_audit.action = 'event_finance_corrected' then ' updated'
        else ' recorded'
      end;
      v_body := 'Event ' || v_fin_kind || ' of '
        || coalesce(private.format_naira_amount(v_amount_ngn), 'an amount')
        || coalesce(' (' || v_fin_desc || ')', '')
        || ' for ' || v_event_title
        || case
          when p_audit.action = 'event_finance_voided' then ' was voided.'
          when p_audit.action = 'event_finance_corrected' then ' was updated.'
          else ' was recorded.'
        end;

    elsif p_audit.action = 'event_ticket_sale_recorded' then
      v_title := 'Ticket sale recorded';
      v_body := coalesce((p_audit.after_data ->> 'quantity') || ' ticket(s)', 'Ticket sale')
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' recorded for ' || v_event_title || '.';

    elsif p_audit.action = 'event_ticket_sale_verified' then
      v_ticket_quantity := coalesce(
        nullif(p_audit.after_data ->> 'quantity', ''),
        nullif(p_audit.before_data ->> 'quantity', '')
      );
      v_decision := case
        when p_audit.after_data ->> 'decision' in ('approved', 'cancelled', 'rejected')
          then p_audit.after_data ->> 'decision'
        else 'reviewed'
      end;
      v_title := 'Ticket sale ' || v_decision;
      v_body := coalesce(v_ticket_quantity || ' ticket(s)', 'Ticket sale')
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' for ' || v_event_title
        || case when v_ticket_quantity = '1' then ' was ' else ' were ' end
        || v_decision
        || case
          when p_audit.after_data ->> 'decision' in ('cancelled', 'rejected')
            and nullif(p_audit.after_data ->> 'reason', '') is not null
            then ': ' || p_audit.after_data ->> 'reason' || '.'
          else '.'
        end;

    elsif p_audit.action = 'event_ticket_sale_refunded' then
      v_ticket_quantity := coalesce(
        nullif(p_audit.after_data ->> 'quantity', ''),
        nullif(p_audit.before_data ->> 'quantity', '')
      );
      v_title := 'Ticket sale refunded';
      v_body := coalesce(v_ticket_quantity || ' ticket(s)', 'Ticket sale')
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' for ' || v_event_title
        || case when v_ticket_quantity = '1' then ' was refunded' else ' were refunded' end
        || coalesce(': ' || nullif(p_audit.reason, ''), '.')
        || case when nullif(p_audit.reason, '') is not null then '.' else '' end;

    elsif p_audit.action = 'event_ticket_sale_edited' then
      v_ticket_quantity := nullif(p_audit.after_data ->> 'quantity', '');
      v_title := 'Ticket sale updated';
      v_body := 'Ticket sale for ' || v_event_title || ' was updated'
        || case
          when nullif(p_audit.before_data ->> 'quantity', '') is not null
            and v_ticket_quantity is not null
            then ' from ' || (p_audit.before_data ->> 'quantity')
              || ' to ' || v_ticket_quantity || ' ticket(s)'
          else ''
        end
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || '.';

    elsif p_audit.action = 'event_ticket_tier_created' then
      v_ticket_name := coalesce(p_audit.after_data ->> 'name', 'Ticket tier');
      v_title := 'Ticket tier created';
      v_body := 'Ticket tier "' || v_ticket_name || '"'
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' was created for ' || v_event_title || '.';

    elsif p_audit.action = 'event_ticket_tier_updated' then
      v_ticket_name := coalesce(p_audit.after_data ->> 'name', p_audit.before_data ->> 'name', 'Ticket tier');
      v_title := 'Ticket tier updated';
      v_body := 'Ticket tier "' || v_ticket_name || '"'
        || coalesce(' (' || private.format_naira_amount(v_amount_ngn) || ')', '')
        || ' was updated for ' || v_event_title || '.';

    elsif p_audit.action = 'event_ticket_tier_retired' then
      v_ticket_name := coalesce(p_audit.before_data ->> 'name', p_audit.after_data ->> 'name', 'Ticket tier');
      v_title := 'Ticket tier retired';
      v_body := 'Ticket tier "' || v_ticket_name || '" was retired for ' || v_event_title || '.';

    elsif p_audit.action like 'event_ticket_%' then
      v_title := 'Event ticketing updated';
      v_body := 'Ticketing settings for ' || v_event_title || ' were updated.';

    elsif p_audit.action in ('event_budget_created', 'event_budget_updated') then
      v_title := case
        when p_audit.action = 'event_budget_created' then 'Event budget created'
        else 'Event budget updated'
      end;
      v_body := 'Budget of ' || coalesce(private.format_naira_amount(v_amount_ngn), 'an amount')
        || ' set for ' || v_event_title || '.';

    elsif p_audit.action in (
      'finance_category_created', 'finance_category_retired',
      'event_finance_category_created', 'event_finance_category_renamed', 'event_finance_category_retired'
    ) then
      v_title := 'Finance category updated';
      v_body := 'Finance category "' || coalesce(p_audit.after_data ->> 'name', p_audit.before_data ->> 'name', 'Category')
        || '" was '
        || case
          when p_audit.action like '%created' then 'created.'
          when p_audit.action like '%renamed' then 'renamed.'
          else 'retired.'
        end;

    else
      v_title := 'Financial record updated';
      v_body := coalesce(p_audit.reason, 'A club or event financial record was updated.');
    end if;
  end if;

  return query select
    private.sanitize_notification_text(v_title, 120),
    private.sanitize_notification_text(v_body, 300),
    case when v_self_title is not null then private.sanitize_notification_text(v_self_title, 120) else null end,
    case when v_self_body is not null then private.sanitize_notification_text(v_self_body, 300) else null end,
    v_self_category,
    v_self_source_type,
    v_event_id;
end;
$function$;
