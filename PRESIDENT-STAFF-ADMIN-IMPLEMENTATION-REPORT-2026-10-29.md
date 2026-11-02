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
| **Approve, reject or record a dues payment request** | **Denied `42501` — contradicts "same authority as president"; open operator decision** | Phase 1 narrowed these three gates to president/executive in `20261029121000_president_role_and_alias.sql` and never added `admin`. Pinned by an assertion in `supabase/tests/database/club_administrator_appointment_test.sql` so a future widening is a visible change. |
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

- the green *success* notice after appoint/revoke is server-rendered (confirmed in the raw HTML, `bg-forest/5` + copy) but is erased within a frame by `src/components/ui/global-flash-listener.tsx:80-86`, which strips `?notice=` with `router.replace()`. Because page-local codes are absent from `system-notices.ts`, no toast replaces it, so staff see no confirmation. **This predates Phase 2** — the Phase 1 `president-appointed` notice behaves identically — and is left unfixed as a product decision.
- the dues payment-request path (approve/reject/record) is denied to the holder, so no end-to-end approval was attempted in the browser; it is pinned by pgTAP instead.
- an event ledger line: the holder created a real event through `/events` and the event dashboard rendered the write controls, but its "Record Transaction" / "Record Disbursement" modals never mounted under the hidden viewport, so the line was written only in pgTAP (`20261101130000` suite).
- no responsive breakpoint (mobile, tablet, desktop) was rendered or measured for the new card in this pass.
- a plain non-officer member's `/?notice=denied` redirect from `/admin` was not exercised (the only such account has no known local password).

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
