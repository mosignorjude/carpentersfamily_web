-- Harden list_draft_announcements and list_archived_announcements to security invoker
-- (enforced cleanly by announcements_read_active_members RLS) and index archived_by FK.

create index if not exists announcements_archived_by_idx
  on public.announcements (archived_by);

create or replace function public.list_draft_announcements()
returns table (
  id uuid,
  event_id uuid,
  title text,
  message text,
  priority text,
  status text,
  duration_preset text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_by uuid,
  updated_at timestamptz,
  revision_number integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    a.id, a.event_id, a.title, a.message, a.priority, a.status,
    a.duration_preset, a.expires_at, a.created_by, a.created_at,
    a.updated_by, a.updated_at, a.revision_number
  from public.announcements as a
  where a.status = 'draft'
    and (select private.is_active_club_member())
    and (select private.can_publish_communications(a.event_id))
  order by a.updated_at desc, a.id desc;
$function$;

create or replace function public.list_archived_announcements()
returns table (
  id uuid,
  event_id uuid,
  title text,
  message text,
  priority text,
  status text,
  duration_preset text,
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  purge_after timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_by uuid,
  updated_at timestamptz,
  revision_number integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    a.id, a.event_id, a.title, a.message, a.priority, a.status,
    a.duration_preset, a.published_at, a.expires_at,
    a.archived_at, a.archived_by, a.archive_reason, a.purge_after,
    a.created_by, a.created_at, a.updated_by, a.updated_at, a.revision_number
  from public.announcements as a
  where a.status = 'archived'
    and (select private.is_active_club_member())
    and (select private.can_publish_communications(a.event_id))
  order by a.archived_at desc nulls last, a.id desc;
$function$;

notify pgrst, 'reload schema';
