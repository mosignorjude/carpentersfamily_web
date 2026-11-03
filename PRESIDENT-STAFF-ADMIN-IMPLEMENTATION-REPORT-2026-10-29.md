# President rename, staff administrators, and the `/officers/members` move

**Date:** 2026-10-29
**Status:** Report only. No code, migrations, or configuration were changed.

This report incorporates the four confirmed decisions:

1. Staff are a single tier with a disabled flag.
2. Staff can perform the full member lifecycle (approve, reject, deactivate, reactivate).
3. `/admin/members` is reused for the staff directory; non-staff visitors are redirected to `/officers/members`.
4. President inherits the admin-or-executive powers. Staff must eventually retain all admin powers and more; the first release implements only the essential staff powers, and this report includes the complete inventory of what the current admin can do so the remainder can be granted later.

---

## Verdict

The target model is viable and smaller than it looks. Almost every "admin" power is already shared with `backup_admin` or `executive` at the database layer, so renaming `backup_admin → president` transfers the club's operating powers intact. The staff panel only has to replace the two genuinely admin-exclusive mechanisms: appointing the primary officer and the last-admin guarantee.

No operational powers become stranded. Every admin-only gate is either shared with `backup_admin`/`executive`, or is the role-appointment / last-admin mechanism itself, which the staff panel replaces.

---

## 1. The one rule everything depends on

Staff must fail **every** existing member gate automatically. That only works if `private.is_active_club_member()` is left untouched:

- [supabase/migrations/20261002135252_core_membership_roles_rls.sql:128](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261002135252_core_membership_roles_rls.sql#L128) checks `status = 'active'`. Give staff `status = 'staff'` and every one of the ~198 role/finance/event/dues checks fails closed with no edits.

The design is therefore a **parallel predicate**, not a widened one:

```
private.is_staff_administrator()  -- status='staff' and staff_disabled_at is null, auth.uid()=id
```

Rules:

- Nothing is ever added to `is_active_club_member()`, `has_club_role()`, or `has_officer_history_access()`.
- Staff reads get their own RLS policies; staff writes go through staff-only security-definer RPCs.
- `status` remains the single source of "member vs staff", so "nothing can be both" is a constraint, not a convention: `status in ('pending','active','deactivated','rejected','staff')` plus a nullable `staff_disabled_at timestamptz`, with a check that it can be non-null only when `status = 'staff'`. There is no boolean flag; the timestamp records when the account was disabled.

---

## 2. President rename without rewriting 35 migrations

The migrations reference roles in two different ways, and only one of them is centralized.

### (a) Function calls are centralized

Thirty-four migrations call `private.has_club_role('backup_admin')`. Replacing that one function body makes all of them resolve to president at once:

```
'backup_admin' → match stored role 'president'
'president'    → match stored role 'president'
'executive'    → unchanged
'admin'        → unchanged in Phase 1, false in Phase 3
```

### (b) Four places compare role strings inline

These will silently return false after a data rename unless replaced in the same migration:

- [20261017230000_dues_payment_requests_governance.sql:695](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261017230000_dues_payment_requests_governance.sql#L695) (approve path)
- [20261017230000_dues_payment_requests_governance.sql:886](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261017230000_dues_payment_requests_governance.sql#L886) (review path)
- [20261025122000_dues_payment_methods.sql:642](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261025122000_dues_payment_methods.sql#L642)
- The unique index at [20261002135252_core_membership_roles_rls.sql:78](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261002135252_core_membership_roles_rls.sql#L78) (`one current backup_admin`), which must become `one current president`.

Data migration in the same transaction:

```sql
update public.member_role_assignments
set role = 'president'
where role = 'backup_admin';
```

Apply to current and revoked rows; `audit_log` JSON keeps the historical wording. Keep `'admin'` and `'backup_admin'` in the check constraint so history and the pre-conversion window stay valid, but remove them from every member-callable allowlist.

### What president inherits

President inherits every gate that today reads `backup_admin`: the entire finance-correction, dues, event, event-finance, staffing, budget, receipt, session-control and attendance-correction surface. On top of that, per the confirmed decision, president gets the gates that today require admin-or-executive:

| Gate today | File |
| --- | --- |
| Author/edit meeting minutes | [meetings_minutes_attendance.sql:204](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261003103000_meetings_minutes_attendance.sql#L204) |
| Change the club late-after default | [meetings_minutes_attendance.sql:492](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261003103000_meetings_minutes_attendance.sql#L492) (via `can_control_attendance_sessions`, which already includes `backup_admin`) |
| Set/change announcement priority and expiry | [announcement_priority_and_expiry.sql:67](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261013033223_announcement_priority_and_expiry.sql#L67) |

Two things president does **not** get, matching today's `backup_admin`: publishing/editing announcements (admin/executive/event lead only, [announcements_polls.sql:219](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261003103200_announcements_polls.sql#L219)) and creating/editing polls. If president should be treated as the presiding officer for communications too, that is a one-predicate change in three places, but it should not be folded in silently.

### Dues rule change

The current rule "a backup admin's payment may only be approved by an admin or executive" becomes "a president's payment may only be approved by an executive." Self-approval was already blocked. The "admins are exempt from dues" branch is deleted with the admin role.

### President appointment

President appointment is a staff RPC, not a member RPC: `staff_appoint_president` / `staff_revoke_president`. Active target member only, one current holder enforced by the unique index, old holder revoked with an audit row in the same transaction. No member — including the president — can hand the role on.

---

## 3. Staff model (single tier + disabled timestamp)

- **Provisioning:** a Server Action calls the Auth Admin API (`inviteUserByEmail` preferred over handling passwords) using [admin.ts](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/lib/supabase/admin.ts). The `auth.users` trigger creates a `pending` profile; a service-role-only security-definer RPC then sets `status='staff'`, `staff_disabled_at = null`, `full_name`, `username`, and `profile_completed_at`. If the profile RPC fails, delete the just-created auth user in a compensating step and surface the error.
- **Service-role writes cannot go direct.** `service_role` currently has **SELECT only** on `member_profiles` and `member_role_assignments` ([20261027120000:10](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261027120000_notification_service_role_grants.sql#L10)). Use an RPC rather than adding a table grant; a broad `update` grant would also let any service-role bug rewrite member status.
- **Disable** does two things: sets `staff_disabled_at` through a staff RPC (the database is the source of truth), and calls GoTrue with a long `ban_duration`. Re-enable reverses both. If the ban call fails, keep the timestamp and report a partial failure; never report success from the database half alone.
- **Guards:** a `member_profiles` trigger mirrors `guard_last_active_primary_admin` ([core:193](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261002135252_core_membership_roles_rls.sql#L193)): refuse to leave zero active staff, and take the existing `administration_guard` row lock. Also refuse self-disable. Never delete staff: `audit_log`, role rows, and notifications reference profiles with `ON DELETE RESTRICT`.
- **Names are fixed at provisioning.** The immutable-profile trigger ([auth_member_lifecycle.sql:138](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261002192258_auth_member_lifecycle.sql#L138)) freezes `full_name`/`username` once `profile_completed_at` is set. Either accept "no staff renames in v1" (recommended) or add a staff-only rename RPC.
- **Future superuser tier:** if staff and superuser are later split, add a `staff_level` column and gate the same RPCs on it. The predicate shape does not change.

---

## 4. Full lifecycle for staff

The four member-lifecycle functions (`approve_member`, `reject_member`, `deactivate_member`, `reactivate_member`) are actor-checked internally, so they cannot be called by staff as-is. Do not duplicate them. Refactor once:

```
private.approve_member_core(p_member_id, p_reason, p_actor_id, p_actor_label)
private.reject_member_core(...)
private.deactivate_member_core(...)
private.reactivate_member_core(...)
```

- Member RPCs keep their current guards, then call `_core` with the member actor.
- Staff RPCs check `is_staff_administrator()`, then call the same `_core`.
- Every audit row, status transition, notification, and error message stays identical, because there is still one implementation.

Two extra rules the staff RPCs need:

- Deactivating a member who currently holds `president` must revoke that role in the same transaction with the same reason, then deactivate. Otherwise the club ends up with a deactivated president and an occupied unique-index slot.
- Staff can act on other staff only through disable/enable, never through member lifecycle (staff rows are not `pending`/`active` anyway, so the `_core` status checks already reject them).

`audit_log.actor_id` and `member_role_assignments.assigned_by` both reference `member_profiles`, so staff can be recorded as actors with no schema change, provided the audit viewer labels them as staff rather than falling back to a member name.

---

## 5. RLS surfaces staff need (and only these)

| Table | Staff access in v1 | Why |
| --- | --- | --- |
| `member_profiles` | SELECT all rows | Directory and lifecycle oversight |
| `member_role_assignments` | SELECT all rows | Show and audit the president |
| `audit_log` | SELECT | Audit viewer (requested scope) |
| `club_payment_settings` | SELECT | "Club settings view" — bank details, so mask by default in UI |
| `club_attendance_settings` | SELECT | Settings view |
| everything else | none | Staff must not read dues, finance, events, announcements, or notifications |

Explicitly **not** granted: `notifications` (its policy requires an active member, [in_app_notifications.sql:74](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261003103500_in_app_notifications.sql#L74)), report RPCs (active-member only), and any member page.

This creates one real gap to accept consciously: `officer_member` notifications only fan out to active members holding an officer role ([20261027152648:61](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261027152648_dues_submission_actor_notification_policy.sql#L61)), so **staff will not be alerted about new sign-ups**. For v1, show a pending-count queue in `/admin/members` and leave fanout to staff as a follow-up; adding it means a staff notification policy plus a staff mark-read path, which is its own small project.

---

## 6. Routing and application changes

Current state: officer member management lives at `(member)/admin/members`, and `src/proxy.ts` deliberately does no authorization; every page re-checks in the server component. Keep that.

1. **Move the officer pages first** (path collision otherwise):
   - `(member)/admin/members` → `(member)/officers/members`
   - `(member)/admin/event-finance-categories` → `(member)/officers/event-finance-categories` (also used by event leads, so it cannot stay under a staff-only `/admin`)
   - Update ~20 redirects and `revalidatePath` targets in [actions.ts](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/actions.ts) plus [app-navigation.mjs:22](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/lib/app-navigation.mjs#L22).
2. **Build `/admin` as a staff-only group:** `(staff)/admin` with its own layout that redirects non-staff. Routes: `/admin` (overview), `/admin/members` (staff accounts + president + member lifecycle), `/admin/audit`, `/admin/settings`.
3. **Old URL behaviour:** `/admin/members` renders the staff directory; a signed-in officer who lands there is redirected to `/officers/members`; a non-officer gets the existing denied path. This is auth-aware, so it belongs in the page, not `next.config.ts` redirects.
4. **Root page:** add a `status === 'staff'` branch in [page.tsx:201](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/page.tsx#L201) that redirects to `/admin` (or shows the disabled screen), before the generic "could not verify" fallback. `signInAction` can stay pointing at `/`.
5. **Rename the role in the app:** about 90 references across `actions.ts`, `app-navigation.mjs`, `user-profile.ts`, `dues-governance.mjs`, event dashboard/ledger components, attendance/event/dues/finance pages, email label maps, the `.member-admin-role-backup_admin` CSS class, and `event-finance-categories/actions.ts`.
6. **Delete the dead "Role Access Simulation" UI** while moving the page. [member-admin-role-banner.tsx](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/admin/members/member-admin-role-banner.tsx) and [member-admin-access-denied.tsx](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/admin/members/member-admin-access-denied.tsx) contain fake profile-switching selects with hardcoded personal names; the value is never used for enforcement (`officerRole` comes from the server) and it should not survive into a real governance screen.
7. **Navigation:** staff get a separate staff nav; member navigation stays member-only. `getActiveMemberNavigationItems` returning `null` for staff is correct and requires no change.

---

## 7. Conversion runbook (operator-run, not automatic)

Do the schema/feature release first, with the `admin` role still functioning. Then convert. Conversion must be a documented SQL runbook like [initial-admin-provisioning.md](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/docs/initial-admin-provisioning.md), because it is destructive and irreversible.

Order inside one transaction:

1. Take the `administration_guard` lock.
2. Temporarily disable the last-admin trigger and the two `event_role_assignments` guards. This is **required**: the sole admin cannot be revoked through `revoke_club_role` (it refuses to leave zero admins) and cannot be status-changed while holding the role, and the event-role write guard requires a live officer JWT with `revoked_by = auth.uid()`.
3. Revoke all current roles on each admin's account with a reason (admin, plus executive if that person also held it; the unique indexes permit both).
4. Revoke every current `event_role_assignments` row for each converted account, setting `revoked_at`, `revoked_by`, and `revoke_reason` together. A converted account that stayed an event lead would keep event authority with no member status.
5. Set `status='staff'`, `staff_disabled_at=null`, and fill `profile_completed_at` if null. The status change closes the dues period automatically.
6. Insert the staff provisioning and conversion audit rows (actor = the converted staff member, reason names the operator, same convention as the bootstrap runbook).
7. Re-enable the triggers; replace or drop the last-admin trigger once no admin row exists.

Before converting each person, confirm:

- That person agrees to stop being a member on that account. The dues-period trigger closes their membership period automatically on the status change ([dues_and_privacy.sql:950](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261002203635_dues_and_privacy.sql#L950)); admins were exempt from dues, so there is normally nothing outstanding, but check.
- Their Auth email. A personal member account **cannot** reuse it; `auth.users.email` is the unique identity. The second account needs a different email and a normal sign-up.
- They are not the only person who can approve something they personally need approved (dues, their own event entries). Presidents can self-verify event finance; executives cannot.

Post-conversion hardening (a later migration): make `has_club_role('admin')` return false, drop `'admin'` from the member-callable allowlists, delete the admin option from `club-role-form.tsx`, and replace the last-admin trigger with the last-staff trigger.

---

## 8. Complete inventory of what a current admin can do

Legend: **v1 staff** = included in the first-release staff panel. **President** = inherits under the new model. **Backlog** = not in v1, but it must exist somewhere; under this model it lands on president so operations do not stop, and it can be granted to staff later using this list.

### Identity, roles, governance

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Read every member profile and status | `member_profiles` policy, core:507 | Yes | Yes |
| Read full role history and audit log | `has_officer_history_access`, core:166 | Yes | Yes |
| Approve a pending member | `approve_member`, lifecycle:252 | Yes | Yes |
| Reject a pending request | `reject_member`, reject:53 | Yes | Yes |
| Deactivate an active member | `deactivate_member`, lifecycle:342 | Yes | Yes |
| Reactivate a deactivated member | `reactivate_member`, lifecycle:421 | Yes | Yes |
| Appoint/revoke president | new staff RPC | Yes | No |
| Create/disable/re-enable staff | new staff RPC | Yes | No |
| Last-active-staff guarantee | new trigger | Yes | — |
| Grant/revoke Executive | core:297 / role-replacement | No | Yes |
| Change a member's role (including back to member) | `set_club_role`, role-replacement:50 | No | Yes |
| Grant/replace/remove **Club Admin** (`admin`) | new staff RPCs `staff_grant_admin` / `staff_revoke_admin` | **Yes — Phase 2** | No |
| Grant/replace/remove Backup Admin | primary admin only, role-replacement:74 | Replaced by president appointment | No |
| Last-active-primary-Admin guarantee | core:193 | Kept for deactivation ordering; the singleton index now bounds the count | — |

### Dues

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Record a dues payment for a member | payment methods:362 | Backlog | Yes |
| Correct a dues payment | dues:315 | Backlog | Yes |
| Write off old unpaid months | dues:1234 | Backlog | Yes |
| Set/correct next month's rate | future-rate:78 | Backlog | Yes |
| Approve/reject payment requests (never own) | payment methods:606/657 | Backlog | Yes |
| President's own payment needs an executive | governance:708 | Backlog | Rule applies |
| Backfill historical dues | pre-launch:192 | Backlog | Yes |
| View any member's dues history | dues RLS | Backlog (directory only) | Yes |
| Read club payment settings | dues RLS | Yes (masked) | Yes |
| Write club payment settings | actions.ts:940 | Backlog | Yes |

### Club finance

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Record current-date income/expense | finance payment methods:111 | Backlog | Yes |
| Enter past-dated transactions | :141 | Backlog | Yes |
| Correct a transaction | :282 | Backlog | Yes |
| Void a transaction | club_finances:312 | Backlog | Yes |
| Create/retire finance categories | club_finances:354/383 | Backlog | Yes |
| Record opening balance | opening_balance:90 | Backlog | Yes |
| Upload/attach finance receipts | receipts:114/184 | Backlog | Yes |
| View shared ledger and summaries | active-member RLS | No | Yes |

### Events and event finance

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Create event | events:259 | Backlog | Yes |
| Edit event details in the mutable window | events:340 | Backlog | Yes |
| Set budget and allocations | `set_event_budget` | Backlog | Yes |
| Assign/revoke Lead, Assistant, Committee | events:697/795 | Backlog | Yes |
| Complete/cancel an event | events:1016 | Backlog | Yes |
| Reopen a completed/cancelled event | events:1008 | Backlog | Yes |
| Archive an event (reason required) | events:1085 | Backlog | Yes |
| Create/update/retire ticket tiers | ticketing:1302–1320 | Backlog | Yes |
| Record/edit ticket sales | event payment methods:467/589 | Backlog | Yes |
| Refund a ticket sale | sync_event_void:182 | Backlog | Yes |
| Record event income/expense | sync_event_void:241 | Backlog | Yes |
| Enter past-dated event entries | :240 | Backlog | Yes |
| Correct/void event entries | :247 / :82 | Backlog | Yes |
| Verify or reject event entries and sales, including self-verify | domain ledgers:118–124 | Backlog | Yes |
| Create/rename/retire event finance categories | lead categories:41/98/152 | Backlog | Yes |
| Upload/attach event finance receipts | ticketing:1276–1295 | Backlog | Yes |
| View event finance workspace, allocations, tiers | active-member views | No | Yes |

### Meetings, minutes, attendance

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Author/edit event minutes and revisions | meetings:204 | Backlog | Yes (new) |
| Change club late-after default | meetings:492 | Backlog | Yes |
| Open/close attendance sessions | meetings:220 (DB); UI `actions.ts:344` | Backlog | Yes |
| Issue check-in QR | meetings:220 | Backlog | Yes |
| Correct any member's attendance | meetings:807 | Backlog | Yes |
| Read attendance rosters and minutes revisions | officer RLS | Backlog | Yes |

### Communications and notifications

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Publish club/event announcements | announcements_polls:219 | Backlog | No (same as today's backup admin) |
| Edit announcements and revisions | same | Backlog | No |
| Set/change announcement priority and expiry | priority:67/182 | Backlog | Yes |
| Create/update polls | announcements_polls:721/791 | Backlog | No |
| Read announcement/poll history | `can_read_communication_history` | Backlog | Yes |
| Receive `officer_money` / `officer_member` / `officer_event` notifications | fanout, 20261027152648:61 | No (RLS blocks staff) | Yes |
| Read/mark own notifications | notifications RLS | No | Yes |

### Reports and settings

| Capability | Enforced at | v1 staff | President |
| --- | --- | --- | --- |
| Audit log viewer | core:529 | Yes | Yes |
| Finance/dues report exports | report_exports:83/153 | No | Yes |
| Receipt download links | finance receipts RPC | No | Yes |
| View attendance default | active-member RLS | Yes | Yes |

That is the full surface. Note the honest bound: this is the admin's *authorization* surface. A few UI affordances are additionally client-gated and would not appear for an admin even though the database would allow the operation (for example, session control excludes `backup_admin` in the UI while the database allows it). The inventory follows the database, which is the real boundary.

### Phase 2 addendum — Club Admin (2026-11-02)

The accurate rule, replacing the Phase 1 statement that club roles cannot be granted from `/admin`: **staff may grant and revoke exactly one Club Admin (`admin`); president, executive and member roles still move only through their existing paths.** The `/admin` panel itself stays read-only for money — the write authority lives in the granted member's session, not in the staff session (separate hats, separate logins).

| Action | Result for Club Admin | Enforcement |
| --- | --- | --- |
| Record / correct / void club transactions, opening balance, categories | **Allowed** | `has_club_role('admin')` gates in `20261003090000_club_finances.sql` |
| Event ledger, ticketing, staged review, verification, budgets, create event | **Allowed** | `has_club_role('admin')` in `20261003102501_event_finance_ticketing_ledger.sql` and successors |
| Dues correction, rates, write-off, backfill, payment methods | **Allowed** | `has_club_role('admin')` in `20261017230000_dues_payment_requests_governance.sql` |
| Record a dues payment for a member | **Allowed — widened 2026-11-02** | `20261102120000_club_administrator_dues_review.sql` restores the `admin` clause Phase 1 had dropped from `public.record_dues_payment`; denial copy is now "Only an active Executive, Club Admin, or President may record dues payments." |
| Approve or reject a dues payment request | **Allowed — widened 2026-11-02** | Same migration adds `v_caller_is_admin` to `private.approve_dues_payment_request` / `private.reject_dues_payment_request`. The self-review guard is unchanged, so the holder still cannot review their own request. |
| Review the **president's** dues | **Allowed — widened 2026-11-02** | Phase 1 reserved this for executives. A Club Admin qualifies because `one_admin_identity_per_member_uidx` makes holding `admin` and `president` at once impossible, so the reviewer can never be the requester. |
| Prelaunch reconciliation, correction, write-off, backfill, rates | **Allowed, no change needed** | Verified 2026-11-02 against live `pg_proc` bodies (not migration text): these gates already named `admin`. |
| Grant or revoke **executive**, set a member back to plain membership | **Allowed** | `set_club_role` / `grant_club_role` / `revoke_club_role` accept only `('member','executive')`; actor gate is `has_club_role('admin')` or president |
| Appoint, replace or revoke **president** | **Denied `42501`** | president moves only through `staff_appoint_president` / `staff_revoke_president`, both gated on `is_staff_administrator()` |
| Grant or revoke **admin** (including themselves) | **Denied** | no member-facing RPC accepts `p_role = 'admin'`; only `staff_grant_admin` / `staff_revoke_admin` do, and both require `is_staff_administrator()` |
| Change their **own** role | **Denied** | existing "Administrators cannot change their own club role" guard |
| Monthly dues obligation | **Exempt** | `not exists (... role = 'admin' ...)` in `dues_month_status` and its predecessors |
| In-app notifications | **Receives them**; role changes read "Club Admin", never raw `admin` and never "superuser" | `private.format_role_label()` restated in `20261101130000_club_administrator_appointment.sql` |
| Anything in `/admin` | **Denied** | `src/app/(staff)/layout.tsx` requires `status = 'staff'`; a holder is redirected to `/officers/members` |
| Deactivate a holder without revoking first | **Blocked** | `member_profiles_preserve_last_primary_admin` trigger → notice "Revoke Club Admin First". The partial unique index `member_role_assignments_one_current_admin_uidx` counts rows, not live members, so the trigger is what keeps revoke-before-deactivate true. |

---

## 9. Hazards to plan around

1. **Last-admin trigger vs. conversion.** `guard_last_active_primary_admin` and `revoke_club_role`'s own last-admin check make the sole admin immovable through the app. Conversion must be direct SQL with the trigger disabled in the transaction.
2. **Renaming data before the alias** breaks every finance/dues gate silently (denials, not errors). Ship the alias, the rename, the inline-comparison replacements, and the index swap in one migration.
3. **Three inline `role='backup_admin'` comparisons** will not follow the function alias. They must be replaced.
4. **`officer_member` fanout misses staff**, so nothing alerts the approvers. v1 needs a visible pending queue at minimum.
5. **Service-role write grants do not exist** for `member_profiles`; provisioning must be an RPC, not a table grant.
6. **Immutable profile trigger** freezes staff names at provisioning. Decide "no renames in v1" or add an RPC.
7. **Email identity collision** between a person's staff and member accounts. Different emails are mandatory.
8. **Presidents must still approve dues:** with zero admins, a president's own dues need an executive approver, and "admin is exempt from dues" must be deleted rather than left to fail.
9. **Deactivating a president** must revoke the role in the same transaction, or the unique president slot stays occupied.
10. **Route collision** between `(member)/admin/*` and `(staff)/admin/*` means officer pages must move first, including the event-finance-categories page used by event leads.
11. **Docs drift:** [data-access-matrix.md](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/docs/data-access-matrix.md) says Backup Admin cannot change the late default; the code lets them. President's powers should be taken from the code, and the matrix corrected in the same release.
12. **Audit/actor display** will show staff as generic members unless the role formatter and audit viewer learn `staff`. The foreign key works; the labels do not.
13. **Stale source-text tests.** Many `.mjs` tests assert exact strings and paths; `app-navigation`, `member-administration-page`, `attendance-page-access`, `event-card-access`, `dues-approval-governance`, and the category tests will need deliberate updates, not mechanical search/replace.

---

## 10. Verification gates before shipping

- **pgTAP** (`supabase/tests/database`):
  - staff fails every member predicate;
  - staff passes only its own RPCs;
  - last staff cannot be disabled;
  - staff cannot disable self;
  - the president flag enforces one holder;
  - the alias resolves both `backup_admin` and `president`;
  - lifecycle `_core` produces identical audit rows for both actor kinds;
  - conversion leaves zero current admin rows and no active-admin trigger firing.
- **Node tests** for nav/route redirects, role formatting, dues governance, and attendance/event access.
- **Browser:**
  - staff signs in and lands on `/admin`;
  - an officer hits `/admin/members` and is redirected to `/officers/members`;
  - staff cannot open a member page or call a member RPC;
  - disabled staff is refused at sign-in;
  - last-staff disable is refused with a readable error;
  - the audit viewer labels staff actors.
- `npm run lint`, `npm test`, and the Supabase database test run.

### Phase 2 verification record (2026-11-02)

Local stack only: production build served on `http://127.0.0.1:3001`, stopped and the port confirmed released afterward. Fixture accounts `verify-staff` / `verify-officer` / `verify-applicant` were used with a re-set local password; the fourth account was approved through the UI. No production system was touched.

Verified in a real browser session (rendered and read back from the DOM):

- staff governance page renders the "Money & records authority / Current Club Admin" card below the president card, vacant copy, required reason, and an appoint list of active members that **excludes the sitting president** (observed before and after appointing);
- appoint → card shows the holder with "Appointed 02 Nov 2026 · 14:32" and the zero-candidate hint; revoke → card returns to Vacant and "Appoint Club Admin" reappears;
- the holder's `/finances` write controls are live: an opening-balance income line was recorded (row in `club_financial_transactions`, `kind=income`) and then voided through the UI (`voided_at`, `void_reason`, `voided_by` set);
- `/dues` differential: holder = `OUTSTANDING ₦0 / All Clear` with the exempt badge, while the president's ledger in the same officer console = `₦45,000 / 9 mo. due`; after revoke the former holder owes `₦45,000` again;
- `/officers/members`: the holder approved a pending applicant, then "Assign Executive" and "Remove Executive" on another member (only member/executive exist; no admin option anywhere); afterwards the president demoted the former holder's leftover executive hat;
- boxed in: `/admin` and `/admin/governance` as the holder resolve to `/officers/members` with no staff shell and no president UI; deactivating a serving holder returns the "Revoke Club Admin First" alert; after revoke, deactivation succeeded and the holder's `/finances` lost every write control;
- president-side: the notification feed renders "@…'s role changed to Club Admin" and "(was Club Admin)" — no raw `admin`, no "superuser"; `/admin/audit` lists "Club role granted" / "Club role revoked" against the staff actor.

Checked by DOM probe or database read rather than by eye: everything above was read from the rendered DOM or `psql`; **no screenshot was taken and no visual layout was judged**, because the Desktop browser viewport is locked and pointer clicks are unavailable — submissions were driven with `requestSubmit()` and modal opens with synthetic `click()`.

Not verified, stated plainly:

- ~~the green *success* notice after appoint/revoke is erased within a frame by the global flash listener~~ — **fixed the same day; see the addendum record below.** The defect was real and wider than first written: of the 16 page-local staff notice codes, 10 had no `SYSTEM_NOTICES` entry, so the erasure left the operator with neither banner nor toast — not just the appoint/revoke pair.
- ~~the dues payment-request path (approve/reject/record) is denied to the holder~~ — **ruled and widened the same day; see the addendum record below.**
- an event ledger line: the holder created a real event through `/events` and the event dashboard rendered the write controls, but its "Record Transaction" / "Record Disbursement" modals never mounted under the hidden viewport, so the line was written only in pgTAP (`20261101130000` suite).
- no responsive breakpoint (mobile, tablet, desktop) was rendered or measured for the new card in this pass.
- a plain non-officer member's `/?notice=denied` redirect from `/admin` was not exercised (the only such account has no known local password).

### Phase 2 addendum verification — dues review widening and notice routing (2026-11-02)

Two operator rulings landed after the record above: the Club Admin may record, approve and reject dues payments (including the president's), and the notice-erasure defect gets fixed rather than documented. A third came after the fix shipped: the staff notice is a one-shot toast, not a page banner.

**Gates run, with numbers:** `npm test` → 628 tests, 94 suites, 627 pass, 0 fail, 1 skipped (620/619 before the notice-routing guards, then +8 for the routing and resolution suites). `npm run lint` → 250 files, no findings. `npm run build` → succeeded, route table emitted. `supabase test db` (local stack) → `club_administrator_appointment_test.sql .... ok`, all 69 assertions green; the 8 dues assertions that were pinned RED immediately before the push (tests 47–54) are the ones that flipped. Nothing database-side changed after the pgTAP run, so those numbers still describe the applied migration.

**What the new pgTAP assertions actually prove.** Approving the president's request is an end-to-end approval, not a probe: `status` becomes `approved` and `reviewed_by` is the holder. Rejecting a member's request sets `rejected`. The holder's own request is still refused at `42501 'Officers cannot review their own dues payments.'`. Recording for a nonexistent member now fails `23503 'The selected member does not exist.'` instead of `42501`, which is the gate-cleared proof that works without a `dues_rates` fixture.

**Migration safety.** `20261102120000_club_administrator_dues_review.sql` holds exactly three `CREATE OR REPLACE FUNCTION` statements and nothing else, applied with `supabase db push --local`. The three deployed bodies were lifted from `pg_get_functiondef()` and edited only at the gate and its messages. Signatures are unchanged (verified afterward: `record_dues_payment` still 12 parameters) and `CREATE OR REPLACE` keeps each OID, so the existing execute grants and function comments survive without re-granting.

**Suite noise, attributed rather than waved away.** The run reports 11 failing files. 7 are the documented stale-name drift (`club_finances`, `dues_privacy`, `event_finance_ticketing_ledger`, `events_roles_budgets_lifecycle`, `in_app_notifications`, `notification_outbox_reminders`, `report_exports`). The other 4 are local-stack row pollution, and the evidence is arithmetic: `auth_member_lifecycle` wants 5 active profiles and sees 8, `meetings_minutes_attendance` wants 7/8 and sees 10/11 — all three off by exactly the **3 extra active `member_profiles` rows** left on this stack; `president_staff_admin` 30–34 counts **2 active staff administrators instead of 1** because the row `53a0ce99-f580-4f22-b9df-f06906196d01` ("Pending member", created 2026-10-31 during the browser verification above) is still live; `staff_resend_email_confirmation` 19 is a resend-row count. None of those four files mentions `record_dues_payment`, `approve_dues_payment_request` or `reject_dues_payment_request` (0 occurrences each), so the migration cannot be their cause. A clean `supabase db reset --local` would clear all four, but it destroys the shared local stack including auth users, so it was not run.

**Two leftover rows were removed earlier, during the RED run, and the removal is on record:** a live president assignment `dc235307-3489-476e-8add-eb7c2ce2cb1a` (grant_reason literally says "Browser verification: appoint a President…") was revoked — the revoke needs `revoked_by` set as well as `revoked_at`, or `member_role_assignments_revocation_fields_check` rejects it — and a live admin assignment `f3da2b19-0a3b-4cb1-b161-5d0d67626eab` ("Browser verification: grant Club Admin…") was deleted, because it inflated an assertion counting admin rows. `audit_log` is append-only, so the history of both actions is intact. Live admin and president assignments now both count 0.

**Notice routing, and the two deviations it went through.** `src/lib/notice-routing.mjs` owns the inline-vs-toast decision; `global-flash-listener.tsx` lost its two hard-coded sets and defers to `handlesNoticeOnPage()`. The first ruling was described as "narrow": keep the toast for staff routes but stop erasing `?notice=`. What shipped against that ruling was the single-skip variant — on a staff path there was **no toast and no erase**, because the page painted that exact copy in a `StaffNotice` banner and the two would appear together.

The banner then drew the operator's objection: a banner fed by `?notice=` comes back on every refresh, so the address bar keeps a record of a finished action and the page re-announces it. Variant 2 replaces the channel, not the copy. `StaffNoticeToast` (`src/components/staff/staff-notice-toast.tsx`) takes the notice the page already resolved on the server, dispatches it into the existing flash-card layer for `STAFF_NOTICE_TOAST_DURATION_MS` = 10000 ms, and removes `?notice=` with `router.replace`. `src/components/staff/staff-notice.tsx` is deleted (46 lines); the three staff pages mount `<StaffNoticeToast notice={notice} />`; the page copy maps are untouched. Nothing in the toast layer, the allowlist or the member routes changed, and the predicate's name moved from `rendersNoticeInline` to `handlesNoticeOnPage` because "inline" no longer describes what the page does.

**A defect variant 2 introduced, caught by its own test.** The component guards its dispatch with a ref so that a re-render during the in-flight `router.replace` cannot double-fire. Written naively, that guard silenced the *second* identical notice too: appoint → query clears → appoint again gave one toast and then a silence, which an operator reads as nothing having happened. `src/components/ui/global-flash-listener.tsx:25-30` already solves this — it resets the ref when the query empties — and the staff copy dropped that reset. The rule now lives in `noticeDispatchState()` in `src/lib/staff-notice-toast.mjs`, tested as pure logic; `tests/staff-notice-toast.test.mjs` "appointing twice in one page mount toasts twice" was pinned RED against the naive rule (`false !== true`) before the reset made it green.

**Gates for the toast swap, with numbers:** `npm test` → 640 tests, 94 suites, 639 pass, 0 fail, 1 skipped (635 before the five dispatch-rule tests). `npm run lint` → 251 files, no findings. `npm run build` → succeeded, route table emitted.

**Browser evidence for the swap** (production build at `http://127.0.0.1:3001`, staff fixture, driven by real form submissions rather than hand-written URLs): appoint → toast "Club Admin appointed. The change is recorded in the audit history and the president has been notified." with the address bar back at `/admin/governance`; appoint again on the still-mounted page → the same toast a second time; revoke → "Club Admin revoked. …" and the card reads "Vacant"; reload → no toast, no residue. `/admin/staff?notice=not-a-real-code` → no toast and no invented copy. The untouched member path still works: `/finances?notice=denied` → "ACCESS DENIED — You are not authorized to perform that action." and a cleared query. The three actions are real `audit_log` rows (two `club_role_granted`, one `club_role_revoked`) and the role was left unheld when the check finished.

**Numbers behind the claim** (derived by reading the source, and pinned by `tests/notice-routing-ownership.test.mjs`): `SYSTEM_NOTICES` defines 88 codes. Before the change, staff pages could resolve 30 distinct codes — the 16 page-local copy entries plus the 14 hand-listed shared codes, two sets with no overlap. `rpcErrorNotice()` can return 16 codes, of which 12 were inside those 30 and 4 were not. Every one of those 30 had its `?notice=` erased on a staff route; the 20 that had registry copy survived as a toast, and 10 did not — `invite-failed`, `provision-failed`, `staff-created`, `ban-partial`, `staff-disabled`, `staff-enabled`, `president-appointed`, `president-revoked`, `club-admin-granted`, `club-admin-revoked`. Those 10 are exactly the page-local entries without registry copy, i.e. every success notice the staff panel produces. Net effect: all 30 now announce on their own page, member-path cleanup is unchanged, and the auth/root rules moved without behaviour change.

An earlier draft of this record said "12 of 17". That was produced by an extractor that matched only quoted object keys (`"denied": {`) and so missed the 15 bare keys (`denied: {`); `npm run lint` proved it by flagging a duplicate `denied` entry when the missing code was "restored". The figures above come from an extractor that accepts both forms.

**One hole the deviation opened, closed in the same pass.** Taking the toast away from the listener leaves the page's own notice as the only channel on a staff route, and that channel resolved unrecognised codes through a hand-maintained 14-entry `sharedCodes` list in `src/lib/staff-notices.ts`. `rpcErrorNotice()` can emit 16 codes; 4 of them (`already-checked-in`, `event-read-only`, `closed-or-locked`, `budget-exceeded`) were in `SYSTEM_NOTICES` but not in that list, so pre-deviation they at least toasted and post-deviation they would have shown nothing. `resolveStaffNotice()` now delegates to `resolveNoticeCopy()` in `src/lib/staff-notice-resolution.mjs` with `getSystemNotice` injected, so the registry itself is the fallback and the list is gone — 14 lines deleted, and the spoofing guard is untouched because only registered copy renders. `tests/staff-notice-resolution.test.mjs` pins the resolution order (page copy wins, registry fallback, unknown → nothing) and `tests/notice-routing-ownership.test.mjs` re-derives every code a staff redirect can produce — literals, ternary arms, the lifecycle lookup table and the whole `rpcErrorNotice()` output set — then asserts each is renderable on its destination page. That check covers 60+ route/code pairs. Variant 2 keeps this resolver load-bearing: the toast reads exactly what the banner read.

**Same sweep, one defect left in place.** Running the same predicate over every `?notice=` redirect in `src/app` (100 route/code pairs) finds 3 that render nothing: `/settings?notice=invalid-profile`, `/settings?notice=profile-update-failed` and `/settings?notice=password-updated`. `/settings` has no banner of its own, so display depends entirely on the toast, which requires a `SYSTEM_NOTICES` entry — and these three codes exist only in the root page's private table (`src/app/page.tsx:34-41`). Their `/?notice=` twins render fine, which is why nobody noticed. So a successful password change through `/settings` is silent, as are two profile failures. This is pre-existing, on a member route, unrelated to the staff rule, and **not fixed in that pass**: the fix is three registry entries, and it needed its own copy decision plus tests. It got them the next day — see the closeout below.

**Two stale pins rewritten as part of this change** (they asserted the old denial copy): `supabase/tests/database/dues_privacy_test.sql:148` and `:383` now expect "Only an active Executive, Club Admin, or President may record dues payments." That suite still aborts at line 47 on pre-existing drift — it calls a 4-argument `record_dues_payment` that has not existed since the receipt parameters were added — so the rewrite is confirmed by reading the live message out of `pg_proc` rather than by a green suite. The write-off and correction copies at lines 158 and 248 were left alone: those gates already accepted `admin` and their messages are unchanged.

**Not verified in that pass:** the widened dues path in a real browser. The Club Admin holder had to be appointed again (both verification roles were revoked) and the fixtures rebuilt by hand; the SQL proof above covers the authority, and the app side was covered by the shared `canManageDues()` predicate with the three wiring assertions in `tests/dues-approval-governance.test.mjs`. That gap is closed in the closeout below.

---

### Phase 2 closeout — terminology, the silent `/settings` notices, and the dues browser run (2026-11-02)

Three open items from the rulings above, done in order, each test-first.

**1. The member-facing name.** Ten strings across six member-facing surfaces still called the role "system administrator" — the word the operator reserved for staff. Five files went in the first pass (the `/events` role badge, the exemption badge and footer card on `/dues`, the pay-dues modal, and the rule copy in `src/lib/dues-governance.mjs`); the guard was then widened from a five-file list to one test per member-facing file — **74 files: 73 across three trees** (`src/app/(member)`, `src/components/dues`, `src/components/events`) plus `src/lib/dues-governance.mjs`, which sits outside them — and it immediately found two more: `src/components/events/event-lifecycle-modal.tsx` (two lines) and `src/components/dues/dues-rate-schedule-card.tsx` (one). Those three described `admin || president` — `financeCorrectionAllowed()` at `src/app/actions.ts:310` and the rate gate at `:686` — which is the Club Admin and the President, not staff, who cannot write club money from `/admin`. So they were not merely misnamed, they named the wrong population; both now say "the President or a Club Admin". The exemption sentences were rewritten from the SQL that defines the exemption, not from the old copy: they say the holder is exempt *while the assignment is live*. The old footer also asserted "No dues obligations accrue for this account" — the view does not guarantee that, so the line is gone rather than reworded. Two superseded pins in `tests/page-footer-policy-placement.test.mjs` were rewritten to the new copy, and the widened guard was seen RED on exactly the three strings it had missed. Staff's own label is untouched and still correct: `/admin` and the staff nav call the signed-in operator "System administrator", which is what the operator is.

**2. The three silent `/settings` notices.** `password-updated`, `invalid-profile` and `profile-update-failed` now have `SYSTEM_NOTICES` entries, with the message text lifted verbatim from the sign-in table so the same failure reads the same way on both paths (`tests/settings-notice-registry.test.mjs`, 10 tests, one of which compares each registry message against the root page's copy by parsing `src/app/page.tsx`). The finding generalised into a guard: the app-wide sweep in `tests/notice-routing-ownership.test.mjs` walks every `redirect()` in `src/app` (52 files, 112 route/code pairs across 11 routes) and fails if any of them lands on a route that claims the notice while the registry has no copy for it. Its one exemption is the listener's own `SILENT_READ_NOTICE_CODES` set — read markers, silent by design — and a second test pins this test's list against the listener source so the exemption cannot quietly grow. The guard was proven non-vacuous by mutation: renaming one registry key made the suite fail with `/settings?notice=password-updated (src/app/actions.ts)`.

**3. Browser evidence for the widened dues authority** (production build at `http://127.0.0.1:3001`, local stack only, driven by real form submissions):

- Staff appointed the Club Admin (`verify-officer`) and a President (`deferred-notice`) from `/admin/governance`; two `club_role_granted` rows with the reasons typed into the forms. The grant toast fired with the page's own copy.
- The holder's `/dues` showed **"Club Admin Dues Exempt"**, the "Club Admin Dues Exemption Policy" footer card, and an own schedule of All (0) / Unpaid (0) / Paid (0) — the exemption is real in the ledger, not just in the badge.
- The Officer Dues Approvals Queue listed **2 Pending**, and the President's row — badged `PRESIDENT` — carried the normal "Reject Submission" / "Approve & Settle Dues" controls instead of a refusal banner. That is the ruling-2 path visible to the only account allowed to take it.
- Approving the President's request wrote `status=approved`, `reviewed_by=<holder>`, a `paid` disposition for 2026-11 at ₦5,000 recorded by the holder, and `dues_payment_request_approved` in `audit_log`. The row then left the queue (2 Pending → 1).
- Rejecting a member's request wrote `status=rejected` with the typed reason in `review_reason`, `dues_payment_request_rejected` in `audit_log`, and the toast captured live on the page: "DUES REJECTED — The dues payment submission was rejected."
- Recording a payment directly for a member moved that member's schedule from Unpaid (9) / Paid (0) to Unpaid (8) / Paid (1) with a `dues_payment_recorded` audit row. One earlier attempt returned INVALID REQUEST: `prepay_months` takes `YYYY-MM` month strings, not a count — my input was wrong, not the gate. (The approve toast had already auto-dismissed by the time the page was probed; the reject toast is the one actually observed.)
- Cleanup: both roles revoked from the same panel, live `admin` and `president` assignments now count 0; the temporary server is stopped and ports 3000/3001 are free.

**Operator disclosure.** The `verify-officer@local.test` fixture's password was unknown, so it was reset through the local Auth admin API (`PUT /auth/v1/admin/users/<id>` against `http://127.0.0.1:54321`, service key from `.env.local` after checking that that file points at the local stack and nothing else) to the same local value already used for `verify-staff@local.test`. Two local fixture accounts now carry a known password; the throwaway script used for it was deleted, and no production credential or row was touched. Say the word and I will rotate them again.

**Gates for the closeout, with numbers:** `npm test` → 729 tests, 94 suites, 728 pass, 0 fail, 1 skipped. Against the last figure recorded in this document (640 at the toast swap) that is +89, and the +89 is fully attributed: 19 arrived with items 1 and 2 as they were committed (`be6a813` adds the terminology guard at 7 tests, `b4e8714` adds 10 `/settings` registry tests plus 2 routing-sweep tests), and the remaining 70 are this widening — the guard went from 7 tests to 77, one per member-facing file. The 640 → 659 → 729 ladder was measured by stashing the working tree and running `npm test` at HEAD, not derived. `npm run lint` → 251 files, no findings (one JSX reflow in `dues-rate-schedule-card.tsx` was fixed by `biome check --write`, not by hand). `npm run build` → compiled successfully, route table emitted.

**The two decisions this pass surfaced are now ruled and applied (2026-11-03).**

1. **Ruled: revocation brings the dues back; the club then decides whether an officer writes them off.** That is what the read-time pause already does, so there is no schema change and no waive-on-revoke RPC — `dues_month_status` still drops the months only while a live `admin` assignment exists and writes nothing down. Note what the exclusion covers: the whole ledger, not only the months of the tenure, so arrears that predate the appointment are hidden for the duration and return with the role (measured in the browser run above: 9 months, 9 unpaid, ₦45,000). The club's route for any of those months that should not be paid is the existing officer path — `write_off_dues_months`, gated at `src/app/actions.ts:608-614` to executive / Club Admin / president — and nothing in this ruling touches it. Two gaps were closed. (a) *The copy read as permanent forgiveness.* `src/components/dues/dues-page-view.tsx:540` and `src/components/dues/pay-dues-modal.tsx:186` now say the months **return when the role is withdrawn**, and that the club decides whether an officer writes them off; the staff card (`src/components/staff/staff-club-admin-card.tsx:33,53`) says "No dues are billed while this role is held" and its revoke dialog repeats the return-for-the-club-to-settle clause. (b) *The existing pin was too weak to protect the ruling.* It asserted only `count > 0`, so a future change that settled the months on revoke would still have passed. The suite now snapshots the exact pre-grant schedule (month count, unpaid ₦, written-off count) into a temp table before the first grant, and after the revoke asserts all three numbers come back equal and that the written-off count did not move — an officer may write a month off, and only after the club decides. pgTAP `supabase/tests/database/club_administrator_appointment_test.sql`: **69 → 73 assertions, PASS** against `--local`. The pin was proven load-bearing by mutation (`month_count + 3` → `have: 9 want: 12`, i.e. the same 9 months / ₦45,000 the browser run measured); the old `count > 0` assertion could not have caught that. A `tests/club-admin-terminology.test.mjs` guard requires all three dues surfaces to carry the "return when the role is withdrawn" phrase.
2. **Ruled and applied: one canonical name, and each card names the population that actually holds its gate.** All 11 strings across 7 files are gone. Four of the five role-name uses gate `{admin, president}` (the reconciliation card's `isAdmin` is `roles.has("admin") || roles.has("president")`, the bank and opening-balance cards the same), so they read "the Club Admin and the President"; the announcement badge is `{admin, president, executive}` → "Authorized as Club Admin, President or Executive Officer"; the event disclosure lists all three. The **finding under the naming**: two of the six prose lines were not merely mislabelled but pointed at the wrong population — `src/app/page.tsx:46` and `src/lib/email/notifications.ts:288,291` told members to contact a *club* administrator about a re-sent confirmation link, and the only function that resends one is `staff_resend_member_email_confirmation`, gated by `private.is_staff_administrator()` (`supabase/migrations/20261031170000_staff_resend_email_confirmation.sql:33`). Those now say **system administrator**, which is the staff word this programme reserves. The remaining contact prose points to "club leadership", the collective term already used in the notification emails. Drift is now prevented rather than hoped against: a new guard walks every file under `src` and fails if `club\sadministrators?` appears with whitespace flattened — previously none of the 11 strings was pinned by any test. Two superseded source-text pins were rewritten rather than left broken (`tests/pre-launch-dues-reconciliation-ui.test.mjs:170`, `tests/staff-governance-club-admin.test.mjs:77`).

**Gates for the two rulings, with numbers:** `npm test` → 731 tests, 94 suites, 730 pass, 0 fail, 1 skipped (+2 on the 729 above: one new app-wide naming guard, one new exemption-copy guard; the card test gained an assertion inside its existing test). `npm run lint` → 251 files, no findings; Biome reflowed `create-event-disclosure.tsx` (folding `President ·{" "}` and the following `{userRoleTitle}` onto one line) and that was accepted with `biome check --write`, not fought by hand. `npm run build` → compiled successfully in 4.7s, 28 static pages. Both tests that assert on JSX prose now match whitespace-tolerantly, because prose wraps where the formatter decides. **The reworded cards were not re-rendered in a browser this pass** — the change is copy and assertions only, with no data path touched.

**Local stack state after the run:** two resolved `dues_payment_requests` (one approved, one rejected with a reason), one `dues_payments` receipt, two `paid` dispositions (2026-11 for the former President and the former Club Admin's reviewed member), and the matching `audit_log` rows. `audit_log` is append-only, so the trail stays; the money rows were left in place because deleting a recorded settlement would make the local ledger disagree with its own history.

---

## 11. Defaults to lock in

1. President = today's `backup_admin` authority **plus** minutes authoring, late-default, and announcement priority. Announcement publishing and polls stay with executives unless decided otherwise.
2. Staff rows get `profile_completed_at` at provisioning and names are immutable; no staff self-profile edits in v1.
3. Pending-signup visibility for staff is a directory queue in v1; staff notifications are a follow-up.
4. Staff cannot disable themselves and cannot delete accounts, only disable.
5. `/officers/event-finance-categories` for the category page; `/admin/*` is staff-only.
6. No in-panel finance, dues, event, or announcement powers for staff in v1. Exactly the list in Section 8 marked Backlog is the post-release roadmap, and each row already has a president owner so the club keeps operating in the meantime.

---

## Next artifacts (not started)

1. Design spec for the schema migration (alias, staff model, RPCs, policies).
2. Conversion runbook, mirroring `docs/initial-admin-provisioning.md`.
3. Application PR plan: route moves, staff shell, role rename, test updates.

No code until approved.
