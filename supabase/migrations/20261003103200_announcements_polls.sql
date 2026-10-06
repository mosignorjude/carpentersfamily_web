-- Step 10: member-visible announcements and anonymous final polls.
-- Voter eligibility is retained separately from ballots. No ballot stores an
-- actor or vote timestamp, and application reads expose only option totals.

create table public.announcements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid references public.events (id) on delete restrict,
  title text not null,
  message text not null,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  revision_number integer not null default 1,
  constraint announcements_title_check check (
    pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 160
    and title = pg_catalog.btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  constraint announcements_message_check check (
    pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 10000
    and message = pg_catalog.btrim(message)
    and pg_catalog.translate(message, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint announcements_revision_check check (revision_number > 0)
);

create index announcements_newest_idx
  on public.announcements (created_at desc, id desc);
create index announcements_event_idx
  on public.announcements (event_id, created_at desc)
  where event_id is not null;

create table public.announcement_revisions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete restrict,
  event_id uuid references public.events (id) on delete restrict,
  revision_number integer not null,
  title text not null,
  message text not null,
  editor_id uuid not null references public.member_profiles (id) on delete restrict,
  edited_at timestamptz not null default pg_catalog.clock_timestamp(),
  reason text not null,
  constraint announcement_revisions_version_key unique (announcement_id, revision_number),
  constraint announcement_revisions_version_check check (revision_number > 0),
  constraint announcement_revisions_title_check check (
    pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 160
    and title = pg_catalog.btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  constraint announcement_revisions_message_check check (
    pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 10000
    and message = pg_catalog.btrim(message)
    and pg_catalog.translate(message, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint announcement_revisions_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
    and reason = pg_catalog.btrim(reason)
    and reason !~ '[[:cntrl:]]'
  )
);

create index announcement_revisions_history_idx
  on public.announcement_revisions (announcement_id, revision_number desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete restrict,
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  read_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (announcement_id, member_id)
);

create index announcement_reads_member_idx
  on public.announcement_reads (member_id, read_at desc);

create table public.announcement_polls (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid references public.events (id) on delete restrict,
  question text not null,
  poll_type text not null,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  closes_at timestamptz not null,
  locked_at timestamptz,
  revision_number integer not null default 1,
  constraint announcement_polls_question_check check (
    pg_catalog.char_length(pg_catalog.btrim(question)) between 1 and 300
    and question = pg_catalog.btrim(question)
    and pg_catalog.translate(question, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint announcement_polls_type_check check (poll_type in ('yes_no', 'multiple_choice')),
  constraint announcement_polls_duration_check check (
    closes_at > created_at
    and closes_at <= created_at + interval '30 days'
  ),
  constraint announcement_polls_lock_check check (locked_at is null or locked_at >= created_at),
  constraint announcement_polls_revision_check check (revision_number > 0)
);

create index announcement_polls_newest_idx
  on public.announcement_polls (created_at desc, id desc);
create index announcement_polls_event_idx
  on public.announcement_polls (event_id, created_at desc)
  where event_id is not null;
create index announcement_polls_closes_idx
  on public.announcement_polls (closes_at);

create table public.announcement_poll_options (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  poll_id uuid not null references public.announcement_polls (id) on delete restrict,
  position smallint not null,
  label text not null,
  constraint announcement_poll_options_position_check check (position between 1 and 8),
  constraint announcement_poll_options_label_check check (
    pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 120
    and label = pg_catalog.btrim(label)
    and pg_catalog.translate(label, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint announcement_poll_options_position_key unique (poll_id, position),
  constraint announcement_poll_options_poll_id_key unique (poll_id, id)
);

create index announcement_poll_options_poll_idx
  on public.announcement_poll_options (poll_id, position);

create table public.announcement_poll_revisions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  poll_id uuid not null references public.announcement_polls (id) on delete restrict,
  event_id uuid references public.events (id) on delete restrict,
  revision_number integer not null,
  question text not null,
  poll_type text not null,
  options jsonb not null,
  closes_at timestamptz not null,
  editor_id uuid not null references public.member_profiles (id) on delete restrict,
  edited_at timestamptz not null default pg_catalog.clock_timestamp(),
  reason text not null,
  constraint announcement_poll_revisions_version_key unique (poll_id, revision_number),
  constraint announcement_poll_revisions_version_check check (revision_number > 0),
  constraint announcement_poll_revisions_options_check check (
    case when pg_catalog.jsonb_typeof(options) = 'array'
      then pg_catalog.jsonb_array_length(options) between 2 and 8
      else false
    end
  ),
  constraint announcement_poll_revisions_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
    and reason = pg_catalog.btrim(reason)
    and reason !~ '[[:cntrl:]]'
  )
);

create index announcement_poll_revisions_history_idx
  on public.announcement_poll_revisions (poll_id, revision_number desc);

-- The identity ledger and anonymous ballots live outside exposed schemas.
create table private.poll_voter_eligibility (
  poll_id uuid not null references public.announcement_polls (id) on delete restrict,
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  cast_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (poll_id, member_id)
);

create index poll_voter_eligibility_member_idx
  on private.poll_voter_eligibility (member_id, cast_at desc);

create table private.poll_ballots (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  poll_id uuid not null,
  option_id uuid not null,
  constraint poll_ballots_poll_option_fk
    foreign key (poll_id, option_id)
    references public.announcement_poll_options (poll_id, id)
    on delete restrict
);

create index poll_ballots_poll_option_idx
  on private.poll_ballots (poll_id, option_id);

alter table public.announcements enable row level security;
alter table public.announcements force row level security;
alter table public.announcement_revisions enable row level security;
alter table public.announcement_revisions force row level security;
alter table public.announcement_reads enable row level security;
alter table public.announcement_reads force row level security;
alter table public.announcement_polls enable row level security;
alter table public.announcement_polls force row level security;
alter table public.announcement_poll_options enable row level security;
alter table public.announcement_poll_options force row level security;
alter table public.announcement_poll_revisions enable row level security;
alter table public.announcement_poll_revisions force row level security;
alter table private.poll_voter_eligibility enable row level security;
alter table private.poll_voter_eligibility force row level security;
alter table private.poll_ballots enable row level security;
alter table private.poll_ballots force row level security;

revoke all on table public.announcements, public.announcement_revisions,
  public.announcement_reads, public.announcement_polls,
  public.announcement_poll_options, public.announcement_poll_revisions
  from public, anon, authenticated, service_role;
revoke all on table private.poll_voter_eligibility, private.poll_ballots
  from public, anon, authenticated, service_role;

grant select (id, event_id, title, message, created_at, updated_at, revision_number)
  on public.announcements to authenticated;
grant select (announcement_id, event_id, revision_number, title, message, edited_at, reason)
  on public.announcement_revisions to authenticated;
grant select (announcement_id, member_id, read_at)
  on public.announcement_reads to authenticated;
grant select (id, event_id, question, poll_type, created_at, closes_at, locked_at, revision_number)
  on public.announcement_polls to authenticated;
grant select (id, poll_id, position, label)
  on public.announcement_poll_options to authenticated;
grant select (poll_id, event_id, revision_number, question, poll_type, options, closes_at, edited_at, reason)
  on public.announcement_poll_revisions to authenticated;

create or replace function private.can_publish_communications(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('executive'))
      or (
        p_event_id is not null
        and (select private.has_event_role(p_event_id, 'lead'))
      )
    );
$function$;

create or replace function private.can_read_communication_history(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.is_active_club_member())
    and (
      (select private.has_officer_history_access())
      or (
        p_event_id is not null
        and (select private.has_event_role(p_event_id, 'lead'))
      )
    );
$function$;

grant execute on function private.can_publish_communications(uuid) to authenticated;
grant execute on function private.can_read_communication_history(uuid) to authenticated;

create policy announcements_read_active_members
  on public.announcements for select to authenticated
  using ((select private.is_active_club_member()));
create policy announcement_revisions_read_scoped_officers
  on public.announcement_revisions for select to authenticated
  using ((select private.can_read_communication_history(event_id)));
create policy announcement_reads_read_self
  on public.announcement_reads for select to authenticated
  using (
    member_id = (select auth.uid())
    and (select private.is_active_club_member())
  );
create policy announcement_polls_read_active_members
  on public.announcement_polls for select to authenticated
  using ((select private.is_active_club_member()));
create policy announcement_poll_options_read_active_members
  on public.announcement_poll_options for select to authenticated
  using ((select private.is_active_club_member()));
create policy announcement_poll_revisions_read_scoped_officers
  on public.announcement_poll_revisions for select to authenticated
  using ((select private.can_read_communication_history(event_id)));

create or replace function private.guard_announcement_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.current_setting('app.communication_write', true) is distinct from 'on'
     or tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Announcements change only through checked procedures and are retained.';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.revision_number <> old.revision_number + 1
    or new.updated_at <= old.updated_at
  ) then
    raise exception using errcode = '42501', message = 'Announcement identity and revision history are retained.';
  end if;
  if tg_op = 'INSERT' and new.revision_number <> 1 then
    raise exception using errcode = '42501', message = 'Announcements start at revision one.';
  end if;
  return new;
end;
$function$;

create trigger announcements_write_guard
before insert or update or delete on public.announcements
for each row execute function private.guard_announcement_write();

create or replace function private.guard_announcement_revision_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.communication_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Announcement history is append-only.';
  end if;
  return new;
end;
$function$;

create trigger announcement_revisions_append_only
before insert or update or delete on public.announcement_revisions
for each row execute function private.guard_announcement_revision_write();

create or replace function private.guard_announcement_read_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.communication_read_write', true) is distinct from 'on'
     or new.member_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Read markers are private and self-managed.';
  end if;
  return new;
end;
$function$;

create trigger announcement_reads_write_guard
before insert or update or delete on public.announcement_reads
for each row execute function private.guard_announcement_read_write();

create or replace function private.guard_announcement_poll_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE'
     or pg_catalog.current_setting('app.communication_write', true) is distinct from 'on'
       and pg_catalog.current_setting('app.poll_vote_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Polls change only through checked procedures and are retained.';
  end if;
  if tg_op = 'INSERT' and (
    new.revision_number <> 1 or new.locked_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Polls begin unlocked at revision one.';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or (old.locked_at is not null and (
      new.question is distinct from old.question
      or new.poll_type is distinct from old.poll_type
      or new.closes_at is distinct from old.closes_at
      or new.revision_number is distinct from old.revision_number
      or new.updated_by is distinct from old.updated_by
      or new.updated_at is distinct from old.updated_at
    ))
    or (new.locked_at is distinct from old.locked_at and (
      old.locked_at is not null
      or new.locked_at is null
      or pg_catalog.current_setting('app.poll_vote_write', true) is distinct from 'on'
    ))
  ) then
    raise exception using errcode = '42501', message = 'Polls cannot be rewritten after voting begins.';
  end if;
  return new;
end;
$function$;

create trigger announcement_polls_write_guard
before insert or update or delete on public.announcement_polls
for each row execute function private.guard_announcement_poll_write();

create or replace function private.guard_announcement_poll_option_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_poll_id uuid := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
begin
  if tg_op = 'UPDATE'
     or pg_catalog.current_setting('app.communication_write', true) is distinct from 'on'
     or exists (
       select 1 from public.announcement_polls as p
       where p.id = v_poll_id and p.locked_at is not null
     ) then
    raise exception using errcode = '42501', message = 'Poll choices lock when voting starts.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger announcement_poll_options_write_guard
before insert or update or delete on public.announcement_poll_options
for each row execute function private.guard_announcement_poll_option_write();

create or replace function private.guard_announcement_poll_revision_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.communication_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Poll configuration history is append-only.';
  end if;
  return new;
end;
$function$;

create trigger announcement_poll_revisions_append_only
before insert or update or delete on public.announcement_poll_revisions
for each row execute function private.guard_announcement_poll_revision_write();

create or replace function private.guard_private_poll_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.poll_vote_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Poll vote records are immutable and procedure-managed.';
  end if;
  return new;
end;
$function$;

create trigger poll_voter_eligibility_write_guard
before insert or update or delete on private.poll_voter_eligibility
for each row execute function private.guard_private_poll_write();
create trigger poll_ballots_write_guard
before insert or update or delete on private.poll_ballots
for each row execute function private.guard_private_poll_write();

create or replace function private.append_communication_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_id uuid,
  p_before_data jsonb,
  p_after_data jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason, event_id
  ) values (
    p_actor_id, p_action, p_entity_type, p_entity_id,
    p_before_data, p_after_data, p_reason, p_event_id
  );
end;
$function$;

create or replace function private.validate_communication_text(
  p_title text,
  p_message text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $function$
begin
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 160
     or p_title <> pg_catalog.btrim(p_title) or p_title ~ '[[:cntrl:]]'
     or p_message is null or pg_catalog.char_length(pg_catalog.btrim(p_message)) not between 1 and 10000
     or p_message <> pg_catalog.btrim(p_message)
     or pg_catalog.translate(p_message, E'\n\r\t', '') ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Announcement title or message is invalid.';
  end if;
end;
$function$;

create or replace function private.validate_poll_configuration(
  p_question text,
  p_duration_minutes integer,
  p_poll_type text,
  p_options text[]
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_option text;
  v_seen text[] := array[]::text[];
begin
  if p_question is null or pg_catalog.char_length(pg_catalog.btrim(p_question)) not between 1 and 300
     or p_question <> pg_catalog.btrim(p_question)
     or pg_catalog.translate(p_question, E'\n\r\t', '') ~ '[[:cntrl:]]'
     or p_duration_minutes is null or p_duration_minutes not between 5 and 43200
     or p_poll_type is null
     or p_poll_type not in ('yes_no', 'multiple_choice')
     or p_options is null or pg_catalog.cardinality(p_options) not between 2 and 8 then
    raise exception using errcode = '22023', message = 'Poll question, duration, type or options are invalid.';
  end if;

  if p_poll_type = 'yes_no' and p_options is distinct from array['Yes', 'No']::text[] then
    raise exception using errcode = '22023', message = 'Yes/no polls use the fixed Yes and No choices.';
  end if;
  if p_poll_type = 'multiple_choice' and pg_catalog.cardinality(p_options) < 2 then
    raise exception using errcode = '22023', message = 'Multiple-choice polls require at least two options.';
  end if;

  foreach v_option in array p_options loop
    if v_option is null or pg_catalog.char_length(pg_catalog.btrim(v_option)) not between 1 and 120
       or v_option <> pg_catalog.btrim(v_option)
       or pg_catalog.translate(v_option, E'\n\r\t', '') ~ '[[:cntrl:]]'
       or pg_catalog.lower(v_option) = any(v_seen) then
      raise exception using errcode = '22023', message = 'Poll choices must be unique, bounded text.';
    end if;
    v_seen := pg_catalog.array_append(v_seen, pg_catalog.lower(v_option));
  end loop;
end;
$function$;

create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_event_id uuid := p_event_id;
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member())
     or not (select private.can_publish_communications(v_event_id)) then
    raise exception using errcode = '42501', message = 'Announcement publishing access is required.';
  end if;
  perform private.validate_communication_text(v_title, v_message);

  if v_event_id is not null then
    perform 1 from public.events as e
    where e.id = v_event_id and e.archived_at is null
    for share;
    if not found then
      raise exception using errcode = '22023', message = 'The event is unavailable for announcements.';
    end if;
  end if;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  insert into public.announcements (
    event_id, title, message, created_by, updated_by
  ) values (
    v_event_id, v_title, v_message, v_actor, v_actor
  ) returning id into v_id;
  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message, editor_id, reason
  ) values (
    v_id, v_event_id, 1, v_title, v_message, v_actor, 'Initial post'
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'announcement.created', 'announcement', v_id, v_event_id,
    null, pg_catalog.jsonb_build_object('title', v_title, 'message', v_message), 'Initial post'
  );
  return v_id;
end;
$function$;

create or replace function private.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
  v_reason text := pg_catalog.btrim(p_reason);
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  perform private.validate_communication_text(v_title, v_message);
  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Announcement edits require a valid reason.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event announcements are read-only.';
  end if;
  v_revision := v_old.revision_number + 1;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    title = v_title,
    message = v_message,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_announcement_id;
  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_title, v_message, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'announcement.edited', 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object('title', v_old.title, 'message', v_old.message),
    pg_catalog.jsonb_build_object('title', v_title, 'message', v_message), v_reason
  );
  return v_revision;
end;
$function$;

create or replace function private.mark_announcement_read(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if not exists (select 1 from public.announcements as a where a.id = p_announcement_id) then
    raise exception using errcode = '42501', message = 'Announcement is unavailable.';
  end if;
  perform pg_catalog.set_config('app.communication_read_write', 'on', true);
  insert into public.announcement_reads (announcement_id, member_id)
  values (p_announcement_id, v_actor)
  on conflict (announcement_id, member_id) do nothing;
  perform pg_catalog.set_config('app.communication_read_write', 'off', true);
end;
$function$;

create or replace function private.create_announcement_poll(
  p_event_id uuid,
  p_question text,
  p_duration_minutes integer,
  p_poll_type text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_poll_id uuid;
  v_event_id uuid := p_event_id;
  v_question text := pg_catalog.btrim(p_question);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_option text;
  v_position integer := 0;
  v_options_json jsonb;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member())
     or not (select private.can_publish_communications(v_event_id)) then
    raise exception using errcode = '42501', message = 'Poll publishing access is required.';
  end if;
  perform private.validate_poll_configuration(v_question, p_duration_minutes, p_poll_type, p_options);
  if v_event_id is not null then
    perform 1 from public.events as e
    where e.id = v_event_id and e.archived_at is null
    for share;
    if not found then
      raise exception using errcode = '22023', message = 'The event is unavailable for polls.';
    end if;
  end if;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  insert into public.announcement_polls (
    event_id, question, poll_type, created_by, updated_by, created_at, updated_at, closes_at
  ) values (
    v_event_id, v_question, p_poll_type, v_actor, v_actor, v_now, v_now,
    v_now + pg_catalog.make_interval(mins => p_duration_minutes)
  ) returning id into v_poll_id;
  foreach v_option in array p_options loop
    v_position := v_position + 1;
    insert into public.announcement_poll_options (poll_id, position, label)
    values (v_poll_id, v_position, v_option);
  end loop;
  select pg_catalog.jsonb_agg(o.label order by o.position) into v_options_json
  from public.announcement_poll_options as o where o.poll_id = v_poll_id;
  insert into public.announcement_poll_revisions (
    poll_id, event_id, revision_number, question, poll_type, options, closes_at, editor_id, reason
  ) values (
    v_poll_id, v_event_id, 1, v_question, p_poll_type, v_options_json,
    v_now + pg_catalog.make_interval(mins => p_duration_minutes), v_actor, 'Initial poll setup'
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'poll.created', 'announcement_poll', v_poll_id, v_event_id, null,
    pg_catalog.jsonb_build_object(
      'question', v_question, 'poll_type', p_poll_type,
      'options', v_options_json, 'duration_minutes', p_duration_minutes
    ), 'Initial poll setup'
  );
  return v_poll_id;
end;
$function$;

create or replace function private.update_announcement_poll(
  p_poll_id uuid,
  p_question text,
  p_duration_minutes integer,
  p_poll_type text,
  p_options text[],
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcement_polls%rowtype;
  v_question text := pg_catalog.btrim(p_question);
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_option text;
  v_position integer := 0;
  v_options_json jsonb;
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Poll editing access is required.';
  end if;
  perform private.validate_poll_configuration(v_question, p_duration_minutes, p_poll_type, p_options);
  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Poll edits require a valid reason.';
  end if;

  select p.* into v_old from public.announcement_polls as p
  where p.id = p_poll_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Poll editing access is required.';
  end if;
  if v_old.locked_at is not null
     or v_old.closes_at <= v_now
     or v_old.created_at + pg_catalog.make_interval(mins => p_duration_minutes) <= v_now
     or exists (select 1 from private.poll_ballots as b where b.poll_id = p_poll_id) then
    raise exception using errcode = '42501', message = 'Poll configuration is locked after voting starts or the poll closes.';
  end if;
  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event polls are read-only.';
  end if;
  v_revision := v_old.revision_number + 1;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcement_polls set
    question = v_question,
    poll_type = p_poll_type,
    closes_at = v_old.created_at + pg_catalog.make_interval(mins => p_duration_minutes),
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = v_now
  where id = p_poll_id;
  delete from public.announcement_poll_options where poll_id = p_poll_id;
  foreach v_option in array p_options loop
    v_position := v_position + 1;
    insert into public.announcement_poll_options (poll_id, position, label)
    values (p_poll_id, v_position, v_option);
  end loop;
  select pg_catalog.jsonb_agg(o.label order by o.position) into v_options_json
  from public.announcement_poll_options as o where o.poll_id = p_poll_id;
  insert into public.announcement_poll_revisions (
    poll_id, event_id, revision_number, question, poll_type, options, closes_at, editor_id, reason
  ) values (
    p_poll_id, v_old.event_id, v_revision, v_question, p_poll_type, v_options_json,
    v_old.created_at + pg_catalog.make_interval(mins => p_duration_minutes), v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'poll.edited', 'announcement_poll', p_poll_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'question', v_old.question, 'poll_type', v_old.poll_type,
      'closes_at', v_old.closes_at
    ),
    pg_catalog.jsonb_build_object(
      'question', v_question, 'poll_type', p_poll_type,
      'options', v_options_json,
      'closes_at', v_old.created_at + pg_catalog.make_interval(mins => p_duration_minutes)
    ), v_reason
  );
  return v_revision;
end;
$function$;

create or replace function private.cast_announcement_poll_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_poll public.announcement_polls%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  perform 1 from public.member_profiles as mp
  where mp.id = v_actor and mp.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;

  select p.* into v_poll from public.announcement_polls as p
  where p.id = p_poll_id for update;
  if not found or v_poll.closes_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501', message = 'This poll is unavailable or closed.';
  end if;
  if not exists (
    select 1 from public.announcement_poll_options as o
    where o.poll_id = p_poll_id and o.id = p_option_id
  ) then
    raise exception using errcode = '22023', message = 'The selected poll option is invalid.';
  end if;
  if exists (
    select 1 from private.poll_voter_eligibility as v
    where v.poll_id = p_poll_id and v.member_id = v_actor
  ) then
    raise exception using errcode = '23505', message = 'A member may vote once and votes are final.';
  end if;

  perform pg_catalog.set_config('app.poll_vote_write', 'on', true);
  if v_poll.locked_at is null then
    update public.announcement_polls
    set locked_at = pg_catalog.clock_timestamp()
    where id = p_poll_id;
  end if;
  insert into private.poll_voter_eligibility (poll_id, member_id)
  values (p_poll_id, v_actor);
  insert into private.poll_ballots (poll_id, option_id)
  values (p_poll_id, p_option_id);
  perform pg_catalog.set_config('app.poll_vote_write', 'off', true);
end;
$function$;

create or replace function private.get_announcement_poll_results(p_poll_id uuid)
returns table (option_id uuid, option_position smallint, label text, votes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if not exists (select 1 from public.announcement_polls as p where p.id = p_poll_id) then
    raise exception using errcode = '42501', message = 'Poll is unavailable.';
  end if;
  return query
    select o.id, o.position, o.label, count(b.id)::bigint
    from public.announcement_poll_options as o
    left join private.poll_ballots as b
      on b.poll_id = o.poll_id and b.option_id = o.id
    where o.poll_id = p_poll_id
    group by o.id, o.position, o.label
    order by o.position;
end;
$function$;

create or replace function private.get_my_announcement_poll_status(p_poll_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if not exists (select 1 from public.announcement_polls as p where p.id = p_poll_id) then
    raise exception using errcode = '42501', message = 'Poll is unavailable.';
  end if;
  return exists (
    select 1 from private.poll_voter_eligibility as v
    where v.poll_id = p_poll_id and v.member_id = v_actor
  );
end;
$function$;

create or replace function private.can_manage_announcement(p_announcement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.is_active_club_member())
    and exists (
      select 1 from public.announcements as a
      where a.id = p_announcement_id
        and (select private.can_publish_communications(a.event_id))
    );
$function$;

create or replace function private.can_manage_announcement_poll(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.is_active_club_member())
    and exists (
      select 1 from public.announcement_polls as p
      where p.id = p_poll_id
        and p.locked_at is null
        and p.closes_at > pg_catalog.clock_timestamp()
        and (select private.can_publish_communications(p.event_id))
    );
$function$;

create or replace function public.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.create_announcement(p_event_id, p_title, p_message);
$function$;

create or replace function public.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text
)
returns integer language sql security invoker set search_path = '' as $function$
  select private.update_announcement(p_announcement_id, p_title, p_message, p_reason);
$function$;

create or replace function public.mark_announcement_read(p_announcement_id uuid)
returns void language sql security invoker set search_path = '' as $function$
  select private.mark_announcement_read(p_announcement_id);
$function$;

create or replace function public.create_announcement_poll(
  p_event_id uuid,
  p_question text,
  p_duration_minutes integer,
  p_poll_type text,
  p_options text[]
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.create_announcement_poll(
    p_event_id, p_question, p_duration_minutes, p_poll_type, p_options
  );
$function$;

create or replace function public.update_announcement_poll(
  p_poll_id uuid,
  p_question text,
  p_duration_minutes integer,
  p_poll_type text,
  p_options text[],
  p_reason text
)
returns integer language sql security invoker set search_path = '' as $function$
  select private.update_announcement_poll(
    p_poll_id, p_question, p_duration_minutes, p_poll_type, p_options, p_reason
  );
$function$;

create or replace function public.cast_announcement_poll_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns void language sql security invoker set search_path = '' as $function$
  select private.cast_announcement_poll_vote(p_poll_id, p_option_id);
$function$;

create or replace function public.get_announcement_poll_results(p_poll_id uuid)
returns table (option_id uuid, option_position smallint, label text, votes bigint)
language sql security invoker set search_path = '' as $function$
  select * from private.get_announcement_poll_results(p_poll_id);
$function$;

create or replace function public.get_my_announcement_poll_status(p_poll_id uuid)
returns boolean language sql security invoker set search_path = '' as $function$
  select private.get_my_announcement_poll_status(p_poll_id);
$function$;

create or replace function public.can_manage_announcement(p_announcement_id uuid)
returns boolean language sql security invoker set search_path = '' as $function$
  select private.can_manage_announcement(p_announcement_id);
$function$;

create or replace function public.can_manage_announcement_poll(p_poll_id uuid)
returns boolean language sql security invoker set search_path = '' as $function$
  select private.can_manage_announcement_poll(p_poll_id);
$function$;

revoke execute on function private.guard_announcement_write() from public, anon, authenticated, service_role;
revoke execute on function private.guard_announcement_revision_write() from public, anon, authenticated, service_role;
revoke execute on function private.guard_announcement_read_write() from public, anon, authenticated, service_role;
revoke execute on function private.guard_announcement_poll_write() from public, anon, authenticated, service_role;
revoke execute on function private.guard_announcement_poll_option_write() from public, anon, authenticated, service_role;
revoke execute on function private.guard_announcement_poll_revision_write() from public, anon, authenticated, service_role;
revoke execute on function private.guard_private_poll_write() from public, anon, authenticated, service_role;
revoke execute on function private.append_communication_audit(uuid, text, text, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated, service_role;
revoke execute on function private.validate_communication_text(text, text) from public, anon, authenticated, service_role;
revoke execute on function private.validate_poll_configuration(text, integer, text, text[]) from public, anon, authenticated, service_role;
revoke execute on function private.can_publish_communications(uuid) from public, anon, service_role;
revoke execute on function private.can_read_communication_history(uuid) from public, anon, service_role;
revoke execute on function private.create_announcement(uuid, text, text) from public, anon, service_role;
revoke execute on function private.update_announcement(uuid, text, text, text) from public, anon, service_role;
revoke execute on function private.mark_announcement_read(uuid) from public, anon, service_role;
revoke execute on function private.create_announcement_poll(uuid, text, integer, text, text[]) from public, anon, service_role;
revoke execute on function private.update_announcement_poll(uuid, text, integer, text, text[], text) from public, anon, service_role;
revoke execute on function private.cast_announcement_poll_vote(uuid, uuid) from public, anon, service_role;
revoke execute on function private.get_announcement_poll_results(uuid) from public, anon, service_role;
revoke execute on function private.get_my_announcement_poll_status(uuid) from public, anon, service_role;
revoke execute on function private.can_manage_announcement(uuid) from public, anon, service_role;
revoke execute on function private.can_manage_announcement_poll(uuid) from public, anon, service_role;

grant execute on function private.can_publish_communications(uuid) to authenticated;
grant execute on function private.can_read_communication_history(uuid) to authenticated;
grant execute on function private.create_announcement(uuid, text, text) to authenticated;
grant execute on function private.update_announcement(uuid, text, text, text) to authenticated;
grant execute on function private.mark_announcement_read(uuid) to authenticated;
grant execute on function private.create_announcement_poll(uuid, text, integer, text, text[]) to authenticated;
grant execute on function private.update_announcement_poll(uuid, text, integer, text, text[], text) to authenticated;
grant execute on function private.cast_announcement_poll_vote(uuid, uuid) to authenticated;
grant execute on function private.get_announcement_poll_results(uuid) to authenticated;
grant execute on function private.get_my_announcement_poll_status(uuid) to authenticated;
grant execute on function private.can_manage_announcement(uuid) to authenticated;
grant execute on function private.can_manage_announcement_poll(uuid) to authenticated;

revoke execute on function public.create_announcement(uuid, text, text) from public, anon, service_role;
revoke execute on function public.update_announcement(uuid, text, text, text) from public, anon, service_role;
revoke execute on function public.mark_announcement_read(uuid) from public, anon, service_role;
revoke execute on function public.create_announcement_poll(uuid, text, integer, text, text[]) from public, anon, service_role;
revoke execute on function public.update_announcement_poll(uuid, text, integer, text, text[], text) from public, anon, service_role;
revoke execute on function public.cast_announcement_poll_vote(uuid, uuid) from public, anon, service_role;
revoke execute on function public.get_announcement_poll_results(uuid) from public, anon, service_role;
revoke execute on function public.get_my_announcement_poll_status(uuid) from public, anon, service_role;
revoke execute on function public.can_manage_announcement(uuid) from public, anon, service_role;
revoke execute on function public.can_manage_announcement_poll(uuid) from public, anon, service_role;

grant execute on function public.create_announcement(uuid, text, text) to authenticated;
grant execute on function public.update_announcement(uuid, text, text, text) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;
grant execute on function public.create_announcement_poll(uuid, text, integer, text, text[]) to authenticated;
grant execute on function public.update_announcement_poll(uuid, text, integer, text, text[], text) to authenticated;
grant execute on function public.cast_announcement_poll_vote(uuid, uuid) to authenticated;
grant execute on function public.get_announcement_poll_results(uuid) to authenticated;
grant execute on function public.get_my_announcement_poll_status(uuid) to authenticated;
grant execute on function public.can_manage_announcement(uuid) to authenticated;
grant execute on function public.can_manage_announcement_poll(uuid) to authenticated;
