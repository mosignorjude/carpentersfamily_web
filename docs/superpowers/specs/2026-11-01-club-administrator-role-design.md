# Club Admin Role Design — staff-appointed financial authority without membership dues

## 1. Intent & context

Phase 1 of the president/staff programme split club authority into two populations:

- **President** (and executives) — club *roles* held by active members, governing money, events, dues and communications.
- **Staff** — `member_profiles.status = 'staff'`, the system administrators who sign in and land on `/admin`. Structurally non-members: `private.is_active_club_member()` requires `status = 'active'` ([20261002135252_core_membership_roles_rls.sql:128-142](../../../supabase/migrations/20261002135252_core_membership_roles_rls.sql)), and every money, event, dues, attendance and communications write sits behind that one predicate — **187 occurrences across 47 migration files**.

That split left a real operational gap: staff can see governance state but cannot touch the ledger, and the only people who can record money are club members who also owe monthly dues. The club wants a records officer who can run the books without being financially subject to them.

Two ways to get there were considered at length: widen the staff status until it can write, or reinstate a grantable club role. **This spec selects the second and names the role `admin`.** The alternative label "superuser" was rejected because that term already describes staff in this programme's language, and using it for a member role would make every future conversation about authority ambiguous. No member-visible surface ever shows the word "superuser".

The decisive finding is that this role **already exists in the schema**. `admin` is still a permitted value of `member_role_assignments.role` ([20261029121000_president_role_and_alias.sql:8-9](../../../supabase/migrations/20261029121000_president_role_and_alias.sql)), `private.has_club_role('admin')` is consulted at **116 sites**, and dues obligations are already waived for its holders in **nine places**. Phase 1 did not delete the role; it converted the one legacy account holding it into staff, leaving the value with no way to be granted. What is missing is exactly one thing: a grant path.

## 2. Terminology

| Term | Technical identity | Where they sign in | Money writes | Dues |
| --- | --- | --- | --- | --- |
| Staff / system administrator | `member_profiles.status = 'staff'`, `private.is_staff_administrator()` | `/admin` | None (read-only, see Phase 2 plan) | Not liable (non-member) |
| President | club role `president`, alias `backup_admin` | member screens | All | Liable |
| **Club Admin** (this design) | club role `admin` | member screens | All | **Exempt** |
| Executive | club role `executive` | member screens | Officer subset | Liable |

## 3. Goals, non-goals, anti-goals

### Goals

- Give staff a way to grant and revoke the `admin` club role, one holder at a time, to an approved active member.
- Give that holder the full authority the `admin` role already carries — club ledger, dues governance, event finance, ticketing, attendance, communications, categories — with **no edits to any existing authorisation gate except the three named in §6**.
- Keep the holder exempt from dues, as the role already is.
- Allow that holder to grant and revoke `executive` and to return members to plain membership, which the current RPC surface already permits.
- Keep the president outside the club admin's reach: the club admin cannot appoint, replace or revoke a president.
- Leave the staff panel exactly as read-only as Phase 1 shipped it.

### Non-goals

- Giving `status = 'staff'` profiles any write capability. That is Approach B below and it is rejected.
- A second, distinct role value such as `superuser` or `bookkeeper`. `admin` already carries the authority; a new value would need aliasing work in `has_club_role()`, the nine dues exemptions and 49 app-side role literals for no gain.
- Making the club admin co-approve anything, or giving the president a veto over the appointment. Staff act alone and the record is audited and broadcast.
- Report PDF output, self-service role requests, or retiring the legacy `backup_admin` alias.

### Anti-goals

- **An inert admin assignment squatting the singleton slot.** A live `revoked_at is null` row belonging to a deactivated member would block all future appointments, so deactivation must be preceded by revocation (§8).
- **A silent authority change.** Every grant and revoke requires a written reason and produces an audit row; nothing changes implicitly.
- **A second money authority model.** Money writes keep flowing through `has_club_role('admin')`. No new predicate, no parallel check, no `OR is_staff_administrator()` anywhere near a money path.

## 4. Constraints

- **Never `supabase db push` without `--local`.** Plain push applies migrations to the production database.
- `member_role_assignments.role` is constrained to `('executive','admin','backup_admin','president')` and a staff profile can never be assigned a club role (`reject_staff_role_target`, [20261029121000:24](../../../supabase/migrations/20261029121000_president_role_and_alias.sql)). Targets are therefore always members.
- One *primary identity* per member: a unique partial index over `(member_id) where role in ('admin','president') and revoked_at is null` ([20261029121000:19-22](../../../supabase/migrations/20261029121000_president_role_and_alias.sql)). The sitting president can never also be the club admin.
- Audit `action` values must satisfy `check (action ~ '^[a-z][a-z0-9_.-]{0,79}$')` ([20261002135252:104](../../../supabase/migrations/20261002135252_core_membership_roles_rls.sql)). This design reuses `club_role_granted` and `club_role_revoked` and adds no new action names.
- Definer functions are written `set search_path = ''`, schema-qualify every object, and are fronted by `public.*` SECURITY INVOKER wrappers revoked from `public, anon, service_role` and granted to `authenticated` — the pattern of the Phase 1 staff RPC block ([20261029122000_staff_administration_rpcs.sql:1330-1357](../../../supabase/migrations/20261029122000_staff_administration_rpcs.sql)).
- Role changes serialise on `private.administration_guard` with `for update`, exactly as `staff_appoint_president` does ([20261029122000:636](../../../supabase/migrations/20261029122000_staff_administration_rpcs.sql)).
- pgTAP suites use `select no_plan();` and the local stack carries seven known stale-name failures. Gate on **zero `not ok` lines in the new suite file** plus no new failures in the finance suites, against a recorded baseline.
- App tests are Node built-in runner, flat `tests/*.test.mjs`, asserting on `readFileSync` source text.

## 5. Approaches considered

### Approach A — reinstate `admin` as a staff-granted club role (selected)

Grant the role to an active member and every existing gate accepts them, because `has_club_role()` requires `is_active_club_member()` *and* a matching live assignment ([20261029121000:50-72](../../../supabase/migrations/20261029121000_president_role_and_alias.sql)). Role holders are already inside the member population, so **zero** edits to the 187 member gates, the 116 admin checks, the nine dues exemptions, or the 49 app-side `"admin"` literals. The work is one unique index plus one staff-only grant/revoke RPC pair and a card in the staff panel.

- *Trade-off:* staff gain the ability to mint an account with full money-write authority. Contained by: singleton index, mandatory reason, active-member prerequisite (the grantee must already be an approved member known to the club), audit rows, and automatic notification of the president and executives.

### Approach B — make staff read and write like the old admin (rejected)

Either widen `is_active_club_member()` to include `'staff'` — a one-line change that also makes staff owe dues, appear in member rosters, attend meetings, receive member notifications and become assignable to event roles, and that invalidates the isolation assertions Phase 1 shipped — or OR `is_staff_administrator()` into all 187 gate sites and prove none was missed. It also makes an infrastructure account the author of ledger rewrites, which the void and staged-review trails are designed to attribute to an accountable officer.

- *Cost:* 187 sites, or a semantic inversion of the whole model. Rejected as both the most expensive and the least safe.

### Approach C — a new non-member status that holds officer authority (rejected)

Introduces a third profile status that passes officer checks but stays out of rosters and dues. This is Approach B's semantic inversion with extra columns: `has_club_role()` and every roster query would need to learn the new status, and the "who counts as a member" question becomes a three-way branch for the rest of the application's life.

**Decision:** the human partner selected **Approach A**, then specified the authority profile in §6 and the lockout rule in §8.

## 6. Authority profile

The requirement was "same authority as president, no financial obligation, may grant or revoke club roles except president, may not create another club admin". Almost all of that profile needs no new code — it is what the current RPC surface already does once a member holds `admin`. The exception is the dues trio, which the operator ruled on after this spec was first written; see the two rows marked **widened**.

| Action | Result for Club Admin | Why |
| --- | --- | --- |
| Record / correct / void club transactions, opening balance, categories | **Allowed** | gated on `has_club_role('admin')` — 6 such checks in [20261003090000_club_finances.sql](../../../supabase/migrations/20261003090000_club_finances.sql) |
| Event ledger, ticketing, staged review, verification, budgets | **Allowed** | `has_club_role('admin')` in [20261003102501_event_finance_ticketing_ledger.sql](../../../supabase/migrations/20261003102501_event_finance_ticketing_ledger.sql) and successors |
| Dues correction, rates, write-off, backfill, payment methods | **Allowed** | `has_club_role('admin')` in [20261017230000_dues_payment_requests_governance.sql](../../../supabase/migrations/20261017230000_dues_payment_requests_governance.sql) |
| **Record a dues payment** | **Allowed — widened** (2026-11-02 ruling) | Phase 1 narrowed this gate to president-or-executive in [20261029121000_president_role_and_alias.sql](../../../supabase/migrations/20261029121000_president_role_and_alias.sql) and never added `admin`. `20261102120000_club_administrator_dues_review.sql` restores the `admin` check, so the denial message now reads "Only an active Executive, Club Admin, or President may record dues payments." |
| **Approve or reject a dues payment request** | **Allowed — widened** (2026-11-02 ruling) | Same migration adds a `v_caller_is_admin` clause to `private.approve_dues_payment_request` and `private.reject_dues_payment_request`. The self-review guard is untouched: the holder still cannot review their own request (`42501`). |
| **Review the President's own dues** | **Allowed — widened** (2026-11-02 ruling) | Phase 1 reserved president requests for executives. A Club Admin is a sufficient second pair of eyes because `one_admin_identity_per_member_uidx` makes it structurally impossible for one member to hold both `admin` and `president`, so the reviewer can never be the requester. Message: "President dues payments can only be approved by an Executive or Club Admin." |
| Prelaunch reconciliation — correct, write off, backfill, set rates | **Already Allowed, verified 2026-11-02 against the live schema** | These functions already name `admin`; the ruling needed no change. Confirmed by reading `pg_proc` on the local stack rather than migration text. |
| Attendance, meetings/minutes, announcements, polls | **Allowed** | the Phase 1 officer gates accept `has_club_role('admin')` alongside president and executive ([20261029122500_president_attendance_session_gate.sql:14](../../../supabase/migrations/20261029122500_president_attendance_session_gate.sql), [20261029122600_president_communications_gate.sql:12](../../../supabase/migrations/20261029122600_president_communications_gate.sql)) |
| Grant or revoke **executive**, set a member back to plain membership | **Allowed** | `set_club_role`, `grant_club_role`, `revoke_club_role` accept only `('member','executive')` and their actor gate is `has_club_role('admin')` or president ([20261029122000:1007,1024-1049,1177,1266](../../../supabase/migrations/20261029122000_staff_administration_rpcs.sql)) |
| Appoint, replace or revoke **president** | **Denied `42501`** | president moves only through `staff_appoint_president` / `staff_revoke_president`, both gated on `is_staff_administrator()` |
| Grant or revoke **admin** | **Denied** | no member-facing RPC accepts `p_role = 'admin'`; only the new staff RPCs do |
| Change their **own** role | **Denied** | existing "Administrators cannot change their own club role" guard ([20261029122000:1036](../../../supabase/migrations/20261029122000_staff_administration_rpcs.sql)) |
| Monthly dues obligation | **Exempt** | `not exists (... role = 'admin' ...)` in [20261101010000:43,62](../../../supabase/migrations/20261101010000_fix_dues_report_and_role_notification_dedup.sql), [20261030130000:45,64](../../../supabase/migrations/20261030130000_include_prelaunch_dues_obligations.sql), [20261017230000:115,240,687](../../../supabase/migrations/20261017230000_dues_payment_requests_governance.sql), [20261025122000:380,634](../../../supabase/migrations/20261025122000_dues_payment_methods.sql), [20261025143000:264](../../../supabase/migrations/20261025143000_pre_launch_financial_onboarding.sql) |
| In-app notifications | **Receives them** | an active member; the member notification path applies unchanged |
| Anything in `/admin` | **Denied** | the staff layout requires `status = 'staff'` ([src/app/(staff)/layout.tsx:27-30](../../../src/app/(staff)/layout.tsx)); a club admin who opens `/admin` is redirected |

Because `has_club_role()` re-reads `member_profiles.status` on every call, revoking the role is not the only way to void authority: deactivating or suspending the member also voids it instantly. §8 still requires revoke-first, for a different reason — the singleton index.

## 7. Database surface

One migration for the grant path — `supabase/migrations/20261101130000_club_administrator_appointment.sql`, three new objects and no edits to existing ones — plus the dues-review widening in §7.5, which does replace three existing bodies.

### 7.1 Singleton ceiling

```sql
create unique index member_role_assignments_one_current_admin_uidx
  on public.member_role_assignments (role)
  where role = 'admin' and revoked_at is null;
```

Mirrors `member_role_assignments_one_current_president_uidx`. Note the index cannot see member status — only `revoked_at` — which is why §8 exists.

**Pre-flight check, run before creating the index:** `select count(*) from public.member_role_assignments where role = 'admin' and revoked_at is null;` If the result is 0 the index is created as written. If it is 1, the index is still created and the holder simply becomes the incumbent. If it is 2 or more the migration aborts and the duplicates are reconciled by hand first; creating the index over live duplicates would fail the push.

### 7.2 `staff_grant_admin`

```sql
create or replace function private.staff_grant_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_existing record;
  v_assignment_id uuid;
begin
  if v_actor_id is null or not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  if exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status <> 'active'
  ) then
    raise exception using errcode = '23514',
      message = 'The club administrator must be an active member.';
  end if;

  if not exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status = 'active'
  ) then
    raise exception using errcode = '23514',
      message = 'That account does not exist.';
  end if;

  if exists (
    select 1 from public.member_role_assignments
    where member_id = p_member_id and role = 'president' and revoked_at is null
  ) then
    raise exception using errcode = '23514',
      message = 'Revoke the president role before granting Club Admin.';
  end if;

  for v_existing in
    select mra.id, mra.member_id
    from public.member_role_assignments as mra
    where mra.role = 'admin' and mra.revoked_at is null
    for update
  loop
    update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = v_actor_id,
        revoke_reason = v_reason
    where id = v_existing.id;

    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      v_actor_id, 'club_role_revoked', 'member_role_assignment',
      v_existing.id, v_existing.member_id,
      pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
      pg_catalog.jsonb_build_object('role', 'admin', 'active', false),
      v_reason
    );
  end loop;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    p_member_id, 'admin', v_actor_id, v_reason
  ) returning id into v_assignment_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_granted', 'member_role_assignment',
    v_assignment_id, p_member_id, null,
    pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
    v_reason
  );
end;
$function$;
```

The revoke loop normally handles at most one row because of §7.1; it stays a loop so a hand-edited duplicate cannot break the appointment. A staff account can never be its own grantee — it is not `status = 'active'` — so no self-grant guard is needed. Ordering of the profile checks matters: reject a known-but-not-active account with the specific message, and only then report "does not exist", so staff never learn about an account by probing.

### 7.3 `staff_revoke_admin`

Same gate, same reason validation, same guard lock. Finds the live `admin` assignment `for update`; if none exists raises `P0002 'No active club administrator assignment exists.'`; otherwise sets `revoked_at / revoked_by / revoke_reason` and writes the `club_role_revoked` audit row.

**No floor check.** The existing "at least one active primary Admin must remain active" guards ([20261002135252:397-415](../../../supabase/migrations/20261002135252_core_membership_roles_rls.sql), [:205-228](../../../supabase/migrations/20261002135252_core_membership_roles_rls.sql)) protect against *officers* locking themselves out of role administration; they do not apply here because staff are the only granters and must always be able to withdraw authority. Ending with zero club admins is a legal state: every money gate that accepts `has_club_role('admin')` also accepts `has_club_role('backup_admin')`, which the alias resolves to the president — so the president alone keeps the books open. What a zero-admin club loses is the ability to change executive and member roles, which is precisely the thing reserved to this role.

### 7.4 Wrappers and grants

`public.staff_grant_admin(uuid, text)` and `public.staff_revoke_admin(uuid, text)` as `language sql security invoker set search_path = ''` one-line delegates, then `revoke all on function private.* / public.* from public, anon, service_role;` followed by `grant execute … to authenticated;` for all four, appended in the same block style as the president pair.

### 7.5 `20261102120000_club_administrator_dues_review.sql`

The 2026-11-02 ruling added a second migration, and it is the only place in this programme that edits an existing object. It contains exactly three `CREATE OR REPLACE FUNCTION` statements — `public.record_dues_payment`, `private.approve_dues_payment_request`, `private.reject_dues_payment_request` — and nothing else.

Each body was lifted verbatim from the deployed definition via `pg_get_functiondef()` and changed only at the role gate and its user-facing messages, because a `CREATE OR REPLACE` cannot patch one clause in place; the whole body has to be restated. Replacing rather than dropping also preserves the function OID, so the existing `grant execute` rows and `comment on function` entries survive the push untouched — which is why this migration re-grants nothing.

Two consequences to keep in mind when reading the diff: the record gate lives on the `public` wrapper, where its role check sits, while approve and reject live in `private` behind thin public delegates, so their widened gates appear in the `private` bodies; and the `admin` clause uses the same `has_club_role('admin')` select form the prelaunch functions already use, so the role is still read from the assignment table rather than a stale JWT claim.

## 8. Deactivation ordering

Because the singleton index counts rows, not live members, a deactivated member holding an unreoked `admin` assignment would occupy the slot and block every future appointment. The rule is therefore: **revoke the role before deactivating the account.**

This is enforced by the guard that already exists — the `member_profiles` status trigger raises `23514 'At least one active primary Admin must remain active.'` when an active admin with no peer is moved off `active` ([20261002135252:205-228](../../../supabase/migrations/20261002135252_core_membership_roles_rls.sql)). The staff UI surfaces that failure as an actionable message, **"Revoke Club Admin before deactivating this member."**, rather than a raw database error. The same ordering applies to the `staff` conversion path if a club admin is ever promoted to staff.

The alternative — auto-revoking inside `staff_deactivate_member` — was rejected: one click would silently strip officer authority and the single reason string would have to justify two different actions in the audit trail.

The trigger fires on *any* move away from `active`, so the same ordering applies if a club admin is later converted to staff by hand through `provision_staff_profile` (which is service-role only; no UI path exists for it today).

## 9. Application surface

- **`src/lib/staff-panel.server.ts`** — `loadClubAdmin(supabase): Promise<OfficerHolder | null>` as a one-line sibling of `loadPresident` (:53-58), calling the existing `loadHolders(supabase, "admin")`.
- **`src/components/staff/staff-club-admin-card.tsx`** — mirrors `staff-president-card.tsx`: props `{ clubAdmin: OfficerHolder | null; candidates: ClubAdminCandidate[] }`, shows the incumbent (name, `@username`, "Since …") or "No club admin appointed", a reason-gated select-and-submit form, and a one-line explainer: *"Runs the club's records — finances, dues, events and attendance. Cannot change the president and cannot appoint another Club Admin. Does not pay dues while holding this role."*
- **`src/app/(staff)/admin/governance/page.tsx`** — render the card directly under `StaffPresidentCard`. Candidates are active members excluding the incumbent club admin **and the sitting president**, because the one-identity index makes that appointment impossible; excluding them in the UI converts a database error into an unavailable option.
- **`src/app/(staff)/admin/actions.ts`** — `staffGrantClubAdminAction` / `staffRevokeClubAdminAction`, same shape as the existing `staff_appoint_president` call (:160): `requireStaffActor()`, server-side reason length validation, `supabase.rpc(...)`, `redirect("/admin/governance?notice=…")`.
- **Notices** — `club-admin-granted` and `club-admin-revoked` added to the page's notice map alongside `president-appointed` / `president-revoked`, with copy that names the audited change rather than the mechanics.
- **`private.format_role_label`** — `when 'admin' then 'Admin'` becomes `'Club Admin'` ([20261029121000:908](../../../supabase/migrations/20261029121000_president_role_and_alias.sql)). Display-only; the plan must first check that no existing test pins the string `Admin`.
- **No authority edits on member screens.** The 49 `roles.has("admin")`-style literals already admit the holder.

Eyebrow copy for the new card is **"Money & records authority"**, because `staff-president-card.tsx` already uses the phrase "Club administration" as its own eyebrow and the two must not read as the same thing.

## 10. Notifications and audit trail

No new notification code. `club_role_granted` and `club_role_revoked` audit rows already drive the officer fanout ([20261024210000_detailed_notifications_and_deletion.sql:415-441](../../../supabase/migrations/20261024210000_detailed_notifications_and_deletion.sql)) producing "Club role updated — *X*'s role changed to Club Admin." to officers and a self-notification to the appointee, and the officer recipient set is `role in ('executive','admin','president')` ([20261029121000:880](../../../supabase/migrations/20261029121000_president_role_and_alias.sql)) — so the president learns of every appointment and revocation without staff doing anything.

An appointment therefore produces: two audit rows when a handover occurs (revoke of the incumbent, grant of the successor), one to three notifications, and one role assignment — all inside one transaction, serialised behind `administration_guard`.

## 11. Failure modes

| Situation | Behaviour |
| --- | --- |
| Non-staff user calls either RPC | `42501 'An active staff administrator account is required.'` |
| Disabled staff (`staff_disabled_at` set) | Same `42501` — `is_staff_administrator()` is the single predicate |
| Empty or 500+ character reason | `22023`, rejected before any write |
| Target is pending, staff or deactivated | `23514`, with the not-active message for known accounts and "does not exist" for unknown ones |
| Target is the sitting president | `23514 'Revoke the president role before granting Club Admin.'`, never an opaque `23505` |
| Second grant while an admin exists | Succeeds by design: incumbent revoked, successor granted, both audited |
| Revoke with no incumbent | `P0002 'No active club administrator assignment exists.'` |
| Deactivating a member who still holds admin | Blocked by the existing status trigger; staff UI says revoke first |
| Two admins somehow created by hand | Grant loop revokes all live rows, then the index reasserts one |
| Staff session attempts any money write | Still denied — Phase 1 and Phase 2 invariants unchanged |

## 12. Testing

**pgTAP — `supabase/tests/database/club_administrator_appointment_test.sql`** (`select no_plan();`, fixtures in the `president_staff_admin_test.sql` id style):

1. Staff grant succeeds; exactly one live `admin` assignment exists afterwards.
2. A second grant moves the slot: old holder revoked, new holder live, two audit rows.
3. `president`, `executive`, plain member and `anon` sessions all fail with `42501`.
4. Disabled-staff session fails with `42501`.
5. Pending and staff targets fail with `23514`; the president target fails with the conflict message, not `23505`.
6. Reason shorter than 1 or longer than 500 characters fails with `22023` and writes nothing.
7. `staff_revoke_admin` succeeds and leaves zero live admin assignments; a second revoke raises `P0002`.
8. After a grant, the holder's session **records a club transaction, voids one, approves a dues payment request and writes an event ledger entry** — the authority claim, proved rather than assumed.
9. The same session cannot call `set_club_role` with `p_role = 'admin'`, cannot call `staff_appoint_president`, and cannot change its own role.
10. The holder has **zero rows** in `dues_month_status` while an executive member in the same fixture has unpaid months — the exemption, proved.
11. A staff session still cannot perform any write in (8) — the regression that matters most.
12. Deactivating the incumbent admin without revoking first raises the trigger error.
13. **Dues review, added by the 2026-11-02 ruling** (`supabase/tests/database/club_administrator_appointment_test.sql`, 8 assertions). The holder's session inserts three pending `dues_payment_requests` rows (president, plain member, self) and then: approving the president's request **flips `status` to `approved` and records `reviewed_by` as the holder** — a real end-to-end approval, not a gate probe, because approve's disposition insert uses a lateral join on `dues_rates` and simply contributes zero rows when no rate exists; rejecting the member's request flips `status` to `rejected`; the holder's own request is still refused with `42501 'Officers cannot review their own dues payments.'`; and recording for a nonexistent member fails `23503 'The selected member does not exist.'` rather than `42501`, which proves the role gate was cleared without inventing a `dues_rates` fixture.

**App test — `tests/staff-governance-club-admin.test.mjs`**, source-text assertions in the established style: the card exists and renders the grant and revoke forms; the actions file calls `staff_grant_admin` and `staff_revoke_admin`; the governance page wires `loadClubAdmin` and filters out the president; the notice keys are present.

**App tests for the 2026-11-02 ruling:** `tests/dues-approval-governance.test.mjs` covers the widened `canReviewDuesRequest` / `canManageDues` predicates as behaviour (club admin reviews member, executive and president dues; cannot review their own; the denial copy names Club Admin) and then proves the wiring by source text — `canManageDues(actor.roles)` appears exactly three times in `src/app/actions.ts`, the old inline executive-and-president gate is gone, and the dues page uses `const canRecord = canManageDues(roles);`. Two tests that asserted the *old* behaviour ("a system administrator cannot review dues", "a system administrator cannot approve any dues") were deleted, not left to fail. `tests/staff-notice-url-preservation.test.mjs` covers `src/lib/notice-routing.mjs`: staff paths render inline, member paths still clear `?notice=`, and the auth and root rules are unchanged.

**Full gate:** `npm run lint`, `npm test`, `npm run build`, `npx supabase db reset --local`, `npx supabase test db --local` — with the finance suites (`club_finances_test`, `event_finance_ticketing_ledger_test`, `finance_receipts_test`, `report_exports_test`, `president_staff_admin_test`) compared against a pre-change baseline; the seven documented stale-name failures elsewhere are drift, recorded not chased.

**Browser, both logins:** staff appoints a member at `/admin/governance`; that member signs in and sees the officer finance and dues screens with working write controls; the president receives the role-change notification; staff then attempts to deactivate that member and reads the revoke-first message; after revoking, deactivation succeeds and the former holder's officer screens revert to member read-only.

## 13. Relationship to the Phase 2 plan

[`docs/superpowers/plans/2026-11-01-staff-phase2-money-visibility.md`](../plans/2026-11-01-staff-phase2-money-visibility.md) is unaffected and stays as written: `/admin` gains read-only money visibility for staff. This design is additive and parallel — the reads staff need for triage, the writes a person needs to keep the books. Neither migration touches the other's objects, so they can be implemented in either order or in parallel branches.

## 14. Rollout

1. Merge the app changes; they are inert until the role exists.
2. Pre-flight the admin-row count (§7.1) against production before any push.
3. Apply both migrations to production through the operator-approved path only — encrypted snapshot, isolated restore drill, then `supabase db push` against the linked project with explicit confirmation. No data conversion, no `auth.users` change, no account conversion.
4. Staff appoint the intended holder at `/admin/governance`; the new holder confirms they can record a transaction and that `/dues` shows the **"Club Admin Dues Exempt"** badge with an own schedule of All (0). The earlier wording here — "reads *not liable*" — is not copy any page produces; it was corrected after the 2026-11-02 browser run.
5. Append the resulting authority matrix to §8 of `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md`, replacing the Phase 1 line that says club roles cannot be granted from `/admin` — that becomes true again, deliberately, for one role.

## 15. Decisions record

- Money capability for staff must not be read-only → the gap is real and this design answers it.
- A grantable member role beats widening staff status (Approach A over B and C).
- The holder is an approved active member, with separate hats and separate logins; `/admin` itself stays read-only.
- Label is `admin` / display **"Club Admin"**; "superuser" is reserved for staff and never appears in UI.
- Authority = everything the `admin` role already grants, including executive and member role changes; excludes president and excludes creating another club admin.
- One club admin at a time, appointed and revoked by staff alone, reason mandatory, president notified.
- Revoke before deactivate, enforced by the existing status trigger and surfaced as actionable staff copy.
- **2026-11-02 ruling 1:** the club admin can record, approve and reject dues payments after all. The three Phase 1 gates that omitted `admin` were widened in `20261102120000_club_administrator_dues_review.sql`; prelaunch reconciliation, correction, write-off, backfill and rates needed no change, which was verified against the live `pg_proc` bodies rather than migration text.
- **2026-11-02 ruling 2:** the club admin may also review the president's dues, which Phase 1 reserved for executives. Safe because the singleton index makes the two hats mutually exclusive on one member.
- **2026-11-02 defect fix:** a staff action's `?notice=` was erased by the global flash listener, so the staff page lost its own notice state. Of the 16 page-local staff notice codes, 10 had no `SYSTEM_NOTICES` entry, so those 10 — every success notice the panel produces — showed neither banner nor toast. Inline-vs-toast routing now lives in `src/lib/notice-routing.mjs`, and staff routes are declared page-owned so the listener stays out entirely.
- **2026-11-02 follow-on:** because a staff route now has exactly one display channel, that channel must not depend on a hand-maintained list. `resolveStaffNotice()` dropped its 14-entry `sharedCodes` allowlist and resolves unrecognised codes straight through `getSystemNotice()`; the shared decision is pure logic in `src/lib/staff-notice-resolution.mjs`. The registry is the allowlist — which is also what kept the branded-toast-spoofing guarantee, since only registered copy is ever rendered.
- **2026-11-02 channel ruling:** that single channel is a flash card, not a banner. A banner driven by `?notice=` survives a refresh, so the address bar kept announcing a finished action; `StaffNoticeToast` now dispatches the page's resolved copy into the existing toast layer for 10 s and clears the query through `router.replace`. The repeat-guard is a tested pure rule (`noticeDispatchState()`), because a ref that only ever remembers the last code silences the second identical notice. Routing predicate renamed `handlesNoticeOnPage` — "inline" no longer describes what the staff page does.
- **2026-11-02 closeout, naming:** ten member-facing strings still called the Club Admin a "system administrator", in six files. The guard in `tests/club-admin-terminology.test.mjs` is now one test per member-facing file (74: 73 across `src/app/(member)`, `src/components/dues`, `src/components/events`, plus `src/lib/dues-governance.mjs`) rather than a hand-listed five, which is how the last three were found. Those three described the `admin || president` gate as staff authority, so they named the wrong population, not merely the wrong label. Staff's own label is unchanged: `/admin` calls the signed-in operator "System administrator", which is correct.
- **2026-11-02 closeout, notices:** `password-updated`, `invalid-profile` and `profile-update-failed` were reachable from `/settings` with no registry entry and no page banner, so those actions were silent. They now reuse the sign-in copy verbatim. The one-off finding became a guard: `tests/notice-routing-ownership.test.mjs` walks every `redirect()` in `src/app` (52 files, 112 route/code pairs, 11 routes) and fails on any notice a destination claims without registry copy, exempting only the listener's own `SILENT_READ_NOTICE_CODES` — a list pinned against the listener source so the exemption cannot grow in the test.
- **2026-11-02 closeout, verified in the browser:** ruling 1 and ruling 2 were exercised live on the local stack through real form submissions — the holder approved the president's request (`status=approved`, `reviewed_by`, a ₦5,000 `paid` disposition for 2026-11), rejected a member's request with the typed reason stored in `review_reason`, and recorded a payment that moved a member's schedule from Unpaid (9) / Paid (0) to Unpaid (8) / Paid (1), each with its `audit_log` row. The holder's own ledger read All (0) while the role was live. Both roles were revoked afterwards.
- **2026-11-03 ruling 3, dues on revocation:** the exemption *pauses*, and that is the ruling — revocation brings the months back and the club then decides whether an authorized officer writes them off. No schema change, no waive-on-revoke RPC; the club's route is the existing `write_off_dues_months`, gated to executive / Club Admin / president. What was wrong was the copy and the pin. The dues page, the pay-dues modal and the staff card now say the months **return when the role is withdrawn**, rather than reading as permanent forgiveness. The pgTAP suite previously asserted only `count > 0` after the revoke, which a future waive-on-revoke change would have passed; it now snapshots the exact pre-grant schedule (months, unpaid ₦, written-off count) and requires all three back unchanged, with nothing newly written off — 69 → 73 assertions. Proven load-bearing by mutation: `have: 9 want: 12`, the same 9 months / ₦45,000 the browser run measured, including arrears that pre-date the appointment.
- **2026-11-03 ruling 4, naming:** all eleven "club administrator(s)" strings are retired, and each surface now names the population that actually holds its gate — four are `{admin, president}` ("the Club Admin and the President"), the announcement badge is `{admin, president, executive}`, the event disclosure lists all three, and contact prose points to "club leadership", the collective term the notification emails already use. Two of the eleven were a wrong-population bug rather than a label: the re-send-confirmation lines told members to contact a *club* administrator, but the only function that can resend is `staff_resend_member_email_confirmation`, gated by `private.is_staff_administrator()`, so they now say **system administrator**. A new guard walks every file under `src` and fails on `club\sadministrators?` (whitespace flattened, because JSX prose wraps where the formatter decides), so the old plural cannot come back; previously none of the eleven was tested.
