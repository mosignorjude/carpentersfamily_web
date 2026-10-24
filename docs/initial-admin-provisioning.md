# Initial primary Admin provisioning

Use this runbook exactly once for the first primary Admin, from the trusted
Supabase SQL editor or an operator database session. Never expose this operation
through a page, Server Action, public RPC, or service-role key in the browser.

## Preconditions

1. Create the intended account through the application and confirm its email.
2. Complete the member profile and username.
3. In the trusted SQL editor, identify the exact Auth UUID and verify the profile
   is still `pending`, complete, and has a non-null `email_confirmed_at`.
4. Confirm there is no current primary Admin assignment and that this member has
   no current elevated role. Stop if any check does not match.

Use this read-only query to inspect the account. Replace the email locally; do
not save the real address or query result in this repository.

```sql
select
  mp.id,
  mp.full_name,
  mp.username,
  mp.status,
  mp.profile_completed_at,
  au.email_confirmed_at
from auth.users as au
join public.member_profiles as mp on mp.id = au.id
where pg_catalog.lower(au.email) = pg_catalog.lower('<verified admin email>');

select member_id, revoked_at
from public.member_role_assignments
where role = 'admin' and revoked_at is null;
```

## Provision in one transaction

Replace the UUID and operator name with the verified values. The transaction
checks the preconditions again under the same administrative lock used by role
changes, activates the member, assigns `admin`, and records both changes. Any
failed check rolls everything back.

```sql
begin;

do $bootstrap$
declare
  v_member_id uuid := '<verified auth user UUID>';
  v_operator_name text := '<trusted Supabase project operator name>';
  v_reason text;
  v_status text;
  v_profile_completed_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_assignment_id uuid;
begin
  v_reason := 'Initial primary Admin provisioned by trusted Supabase operator: '
    || pg_catalog.btrim(v_operator_name);

  if v_member_id is null
     or pg_catalog.btrim(v_operator_name) = ''
     or pg_catalog.char_length(pg_catalog.btrim(v_operator_name)) > 120 then
    raise exception 'Replace the member UUID and operator name with verified values.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if exists (
    select 1
    from public.member_role_assignments
    where role = 'admin' and revoked_at is null
  ) then
    raise exception 'A current primary Admin assignment already exists.';
  end if;

  if exists (
    select 1
    from public.member_role_assignments
    where member_id = v_member_id and revoked_at is null
  ) then
    raise exception 'The initial Admin must not already have an elevated role.';
  end if;

  select mp.status, mp.profile_completed_at, au.email_confirmed_at
  into v_status, v_profile_completed_at, v_email_confirmed_at
  from public.member_profiles as mp
  join auth.users as au on au.id = mp.id
  where mp.id = v_member_id
  for update of mp;

  if not found
     or v_status <> 'pending'
     or v_profile_completed_at is null
     or v_email_confirmed_at is null then
    raise exception 'The selected member must have a pending, complete profile and confirmed email.';
  end if;

  update public.member_profiles
  set status = 'active'
  where id = v_member_id and status = 'pending';

  if not found then
    raise exception 'The selected member is no longer pending.';
  end if;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    v_member_id, 'admin', v_member_id, v_reason
  ) returning id into v_assignment_id;

  -- The audit schema requires an actor who is a member. For this one-time
  -- bootstrap, actor_id is the new Admin; the reason records the real operator.
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values
  (
    v_member_id,
    'member_approved',
    'member_profile',
    v_member_id,
    v_member_id,
    pg_catalog.jsonb_build_object('status', 'pending'),
    pg_catalog.jsonb_build_object('status', 'active'),
    v_reason
  ),
  (
    v_member_id,
    'club_role_granted',
    'member_role_assignment',
    v_assignment_id,
    v_member_id,
    null,
    pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
    v_reason
  );
end;
$bootstrap$;

commit;
```

After commit, sign in as the new Admin, verify the member administration screen,
and keep the local operator audit trail according to the club's record policy.
Do not use this runbook to replace an existing Admin; normal role procedures
require the current primary Admin to appoint a successor.
