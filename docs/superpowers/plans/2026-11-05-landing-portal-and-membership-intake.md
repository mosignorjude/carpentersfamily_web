# Public Landing Page, Portal Route Migration, Membership Intake & Invitation-Only Access Implementation Plan (Combined Plan B + C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the club's public front door at `/` with the approved landing page design, migrate existing auth and dashboard routing to `/portal`, gate `/signup` behind cryptographic single-use invitation tokens, and introduce public intake forms for membership requests and partnership enquiries with staff review queues.

**Architecture:** The root route `/` becomes a purely public, unauthenticated landing page rendering dynamic event feeds from `get_public_ticketed_events()`, static self-hosted photography from `public/landing/`, and accessible intake modals. The existing auth-state router and member home dashboard move to `/portal`, with all 81 root-targeting internal redirects and notices updated to target `/portal`. Two new public intake tables (`membership_requests`, `partnership_enquiries`) and one token table (`member_invites`) are created via a single hardened migration, accessible to anonymous visitors exclusively through `security definer` RPCs with rate limiting and input sanitization.

**Tech Stack:** Next.js 16.4.3 App Router (React Server Components, Server Actions, `searchParams` Promise resolution), Supabase PostgreSQL (`security definer` RPCs, RLS, pgTAP), Tailwind CSS + custom tokens, Biome, Node.js built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-05-public-flow-landing-tickets-portal-design.md` (commit `0eca6c4`). Specifically implements §3 (routes and flow), §8 (membership intake & invitation-only signup), §9 (landing page port), §10 (copy edits), §11 (photo manifest), §13 (notice codes), §14 (security & access matrix), and §15 (testing).

## Global Constraints

- **Never run `supabase db push` without `--local`.** Remote database migrations are strictly operator-gated. Replaying local migrations is `npx supabase db reset --local`.
- **Migrations push before merge.** Schema and RPCs must be in place before any code calling them lands on `main`.
- **pgTAP runs only through `npx supabase test db`.** New pgTAP suites use `select no_plan();`, not `plan(N)`.
- **`npm test` is `node --test`** and runs the whole `tests/` directory. Individual tests are run via `npm test -- tests/<file>.test.mjs`.
- **Next.js 16 App Router asynchronous `searchParams`:** `searchParams` is a `Promise` and must always be awaited in server components.
- **Stage files by exact path.** Never `git add -A` or `git add .`.
- **Copy Rule (§2.17 & §10):** The 60% / "60/40" event profit-sharing claim is strictly removed from all public copy, modals, and previews. Buyer-facing ticket nouns use "tickets", not "passes".
- **Design Source of Truth:** `C:\Users\HomePC\Downloads\carpenters_family_social_club_landing_page.html` governs landing layout, typography hierarchy, and copy. Images come strictly from self-hosted assets under `public/landing/`.
- **Touch Target Accessibility:** All buttons and interactive links must respect the minimum 44px touch-target height.
- **Anonymous Security Boundary:** `anon` gets NO direct table grants (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on `membership_requests`, `partnership_enquiries`, or `member_invites`. Writes happen only through security definer RPCs.

## Review Focus

1. **Active session access at `/` vs `/portal`:** A logged-in member or officer visiting `/` must see a clear "Member Portal" CTA leading to `/portal`, and navigating to `/portal` must immediately render their dashboard without requiring re-authentication.
2. **Expired / consumed invite token on `/signup`:** A visitor loading `/signup?token=INVALID` or an already-consumed token must be presented with a clear "Invitation Required" barrier explaining vetted membership and offering a direct link to the "Request Membership" intake form, preventing account enumeration or 500 errors.
3. **Phone number sanitization:** Applicants entering Nigerian phone numbers with leading zeros (`080...`), international prefixes (`+234...`), or spacing/dashes must have their phone number normalized to standard E.164 format before storage.
4. **Outbox failure resilience:** If `createSupabaseAdminClient()` or notification outbox enqueueing encounters a transient error, the intake RPC or action must NOT fail the user's submission after the database row has been created.
5. **No profit-sharing leakage:** Verification tests must assert the complete absence of "60%" or "profit-sharing" in the rendered landing page, cards, and modal components.

---

## Task 1: The `/portal` Route Relocation & Notice Routing

**Files:**
- Create: `src/app/portal/page.tsx`
- Modify: `src/lib/notice-routing.mjs:13-45`
- Test: `tests/portal-route-relocation.test.mjs`

**Interfaces:**
- Consumes: `src/app/page.tsx` (existing auth router & member dashboard logic), `src/lib/notice-routing.mjs`
- Produces: `src/app/portal/page.tsx` handling sign-in, account review states, staff redirection to `/admin`, and active member home dashboard. Updates `INLINE_NOTICE_PATHS` and `ROOT_INLINE_NOTICE_CODES` to route through `/portal`.

- [ ] **Step 1: Write the failing test for notice routing and portal page export**

```javascript
// tests/portal-route-relocation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isInlineNoticePath,
  handlesNoticeOnPage,
} from "../src/lib/notice-routing.mjs";

test("notice routing recognizes /portal as an inline notice destination", () => {
  assert.equal(isInlineNoticePath("/portal"), true);
  assert.equal(isInlineNoticePath("/portal/"), true);
  assert.equal(handlesNoticeOnPage("/portal", "credentials"), true);
  assert.equal(handlesNoticeOnPage("/portal", "sign-in"), true);
  assert.equal(handlesNoticeOnPage("/portal", "profile-locked"), true);
});

test("src/app/portal/page.tsx exists and exports default async PortalPage component", () => {
  assert.equal(fs.existsSync("src/app/portal/page.tsx"), true);
  const content = fs.readFileSync("src/app/portal/page.tsx", "utf8");
  assert.match(content, /export\s+default\s+async\s+function\s+PortalPage/);
  assert.match(content, /searchParams:\s*Promise<\{/);
  assert.match(content, /AuthPageLayout/);
  assert.match(content, /HomeDashboardView/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal-route-relocation.test.mjs`
Expected: FAIL with module/file not found or notice path mismatch.

- [ ] **Step 3: Relocate auth router to `src/app/portal/page.tsx` and update `notice-routing.mjs`**

1. Copy `src/app/page.tsx` to `src/app/portal/page.tsx`, renaming the default export to `PortalPage`.
2. In `src/lib/notice-routing.mjs`, update `INLINE_NOTICE_PATHS` to replace `"/"` with `"/portal"` (keeping both during the transition if needed, but `/portal` must return true). Update `handlesNoticeOnPage` so `pathname.startsWith("/portal")` checks `ROOT_INLINE_NOTICE_CODES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal-route-relocation.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/page.tsx src/lib/notice-routing.mjs tests/portal-route-relocation.test.mjs
git commit -m "feat(portal): relocate auth-state router and member dashboard to /portal"
```

---

## Task 2: Root-Targeting Redirects and Links Migration (The 81 Sites Sweep)

**Files:**
- Modify: `src/app/actions.ts:150-1680, 3200-3810`
- Modify: `src/app/auth/confirm/route.ts:15-45`
- Modify: `src/app/auth/callback/route.ts:20-40`
- Modify: `src/app/api/receipts/route.ts:10-15`
- Modify: `src/lib/app-navigation.mjs:13-25`
- Modify: `src/lib/email/notifications.ts:190-560`
- Modify: `src/components/app-header.tsx:240-250`
- Modify: `src/components/app-shell.tsx:45-55`
- Test: `tests/portal-redirects-sweep.test.mjs`

**Interfaces:**
- Consumes: Server actions, auth routes, email notifications
- Produces: Updated redirects pointing to `/portal?notice=...`, updated navigation items `{ href: "/portal", label: "Home" }` and `{ href: "/tickets", label: "Box office" }`.

- [ ] **Step 1: Write the failing test checking key redirect and navigation sites**

```javascript
// tests/portal-redirects-sweep.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getNavigationItems } from "../src/lib/app-navigation.mjs";

test("app navigation provides /portal for Home and /tickets for Box office", () => {
  const items = getNavigationItems(["member"]);
  const homeItem = items.find((i) => i.label === "Home");
  assert.ok(homeItem, "Home navigation item must exist");
  assert.equal(homeItem.href, "/portal");

  const ticketsItem = items.find((i) => i.label === "Box office");
  assert.ok(ticketsItem, "Box office navigation item must exist");
  assert.equal(ticketsItem.href, "/tickets");
});

test("server actions default redirect points to /portal?notice=configuration", () => {
  const actionsContent = fs.readFileSync("src/app/actions.ts", "utf8");
  assert.match(
    actionsContent,
    /clientOrRedirect\(destination\s*=\s*"\/portal\?notice=configuration"\)/,
  );
  assert.match(actionsContent, /redirect\("\/portal\?notice=credentials"\)/);
  assert.match(actionsContent, /redirect\("\/portal"\)/);
});

test("auth confirm and callback routes redirect to /portal with notice", () => {
  const confirmContent = fs.readFileSync("src/app/auth/confirm/route.ts", "utf8");
  assert.match(confirmContent, /\/portal\?notice=/);

  const callbackContent = fs.readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(callbackContent, /\/portal\?notice=auth-failed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal-redirects-sweep.test.mjs`
Expected: FAIL with old `"/"` links or navigation items.

- [ ] **Step 3: Update all root-targeting redirects, actions, and navigation items**

1. In `src/app/actions.ts`:
   - Change `clientOrRedirect` default destination from `"/?notice=configuration"` to `"/portal?notice=configuration"`.
   - Update actor guards to use `"/portal?notice=configuration"` and `"/portal?notice=sign-in"`.
   - In `signInAction`, redirect to `"/portal?notice=credentials"` and `"/portal"`.
   - In `signOutAction`, redirect to `"/portal"`.
   - In `updatePasswordAction` and `completeProfileAction`, redirect to `"/portal?notice=..."`.
   - In `notificationNotice`, return `` `/portal?notice=${encodeURIComponent(notice)}` ``.
2. In `src/app/auth/confirm/route.ts` & `src/app/auth/callback/route.ts`:
   - Replace root redirects with `/portal`.
3. In `src/lib/app-navigation.mjs`:
   - Update `{ href: "/", label: "Home" }` to `{ href: "/portal", label: "Home" }`.
   - Add `{ href: "/tickets", label: "Box office" }`.
4. In `src/lib/email/notifications.ts`:
   - Update default `ctaPath: "/"` occurrences to `ctaPath: "/portal"`.
5. In `src/components/app-header.tsx` and `src/components/app-shell.tsx`:
   - Update logo brand home link from `"/"` to `"/portal"` for authenticated application views.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal-redirects-sweep.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/app/auth/confirm/route.ts src/app/auth/callback/route.ts src/app/api/receipts/route.ts src/lib/app-navigation.mjs src/lib/email/notifications.ts src/components/app-header.tsx src/components/app-shell.tsx tests/portal-redirects-sweep.test.mjs
git commit -m "feat(portal): sweep 81 root-targeting redirects and navigation items to /portal"
```

---

## Task 3: Database Migration: Intake and Invites Schema

**Files:**
- Create: `supabase/migrations/20261105140000_public_intake_and_invites.sql`
- Create: `supabase/tests/database/public_intake_schema_test.sql`

**Interfaces:**
- Consumes: Postgres core schemas
- Produces: Tables `public.membership_requests`, `public.partnership_enquiries`, and `public.member_invites` with strict RLS and zero direct `anon` grants.

- [ ] **Step 1: Write pgTAP schema tests**

```sql
-- supabase/tests/database/public_intake_schema_test.sql
begin;
select no_plan();

-- Verify tables exist
select has_table('public', 'membership_requests', 'public.membership_requests table must exist');
select has_table('public', 'partnership_enquiries', 'public.partnership_enquiries table must exist');
select has_table('public', 'member_invites', 'public.member_invites table must exist');

-- Verify RLS is enabled
select row_security_active('public.membership_requests');
select row_security_active('public.partnership_enquiries');
select row_security_active('public.member_invites');

-- Verify anon has NO table-level grants
select table_privs_are(
  'public', 'membership_requests', 'anon', ARRAY[]::text[],
  'anon must have NO direct privileges on membership_requests'
);
select table_privs_are(
  'public', 'partnership_enquiries', 'anon', ARRAY[]::text[],
  'anon must have NO direct privileges on partnership_enquiries'
);
select table_privs_are(
  'public', 'member_invites', 'anon', ARRAY[]::text[],
  'anon must have NO direct privileges on member_invites'
);

-- Verify status check constraints
select col_has_check('public', 'membership_requests', 'status', 'membership_requests status has check constraint');
select col_has_check('public', 'partnership_enquiries', 'status', 'partnership_enquiries status has check constraint');

select * from finish();
rollback;
```

- [ ] **Step 2: Write migration `20261105140000_public_intake_and_invites.sql`**

```sql
-- supabase/migrations/20261105140000_public_intake_and_invites.sql

-- 1. Membership Requests
create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone text not null check (char_length(trim(phone)) between 7 and 25),
  profession text not null check (char_length(trim(profession)) between 2 and 120),
  reason_for_joining text not null check (char_length(trim(reason_for_joining)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.membership_requests enable row level security;
revoke all on public.membership_requests from public, anon, authenticated;

-- 2. Partnership Enquiries
create table if not exists public.partnership_enquiries (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  organization_name text not null check (char_length(trim(organization_name)) between 2 and 160),
  email text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone text not null check (char_length(trim(phone)) between 7 and 25),
  enquiry_type text not null check (enquiry_type in ('brand_activation', 'sponsorship', 'corporate_booking', 'general')),
  message text not null check (char_length(trim(message)) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'closed')),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.partnership_enquiries enable row level security;
revoke all on public.partnership_enquiries from public, anon, authenticated;

-- 3. Member Invites (Single-use Cryptographic Tokens)
create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  token text not null unique check (token ~* '^[a-f0-9]{32,64}$'),
  role text not null default 'member' check (role in ('member', 'executive', 'admin')),
  request_id uuid references public.membership_requests(id) on delete set null,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.member_invites enable row level security;
revoke all on public.member_invites from public, anon, authenticated;

-- Grant select on membership_requests and partnership_enquiries to authenticated officers
grant select on public.membership_requests to authenticated;
grant select on public.partnership_enquiries to authenticated;
grant select on public.member_invites to authenticated;
```

- [ ] **Step 3: Apply locally and run pgTAP test**

Run:
```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/database/public_intake_schema_test.sql
```
Expected: PASS with all schema and privilege checks green.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261105140000_public_intake_and_invites.sql supabase/tests/database/public_intake_schema_test.sql
git commit -m "feat(intake): add membership_requests, partnership_enquiries, and member_invites tables"
```

---

## Task 4: Database RPCs: Intake Submissions, Review, and Invite Lifecycle

**Files:**
- Modify: `supabase/migrations/20261105140000_public_intake_and_invites.sql`
- Create: `supabase/tests/database/public_intake_rpcs_test.sql`

**Interfaces:**
- Consumes: Tables created in Task 3, `private.is_active_member()`
- Produces:
  - `submit_membership_request(...)` (granted to `anon, authenticated`)
  - `submit_partnership_enquiry(...)` (granted to `anon, authenticated`)
  - `review_membership_request(...)` (granted to `authenticated`)
  - `create_member_invite(...)` (granted to `authenticated`)
  - `validate_invite_token(...)` (granted to `anon, authenticated`)
  - `consume_invite_token(...)` (internal security definer)

- [ ] **Step 1: Write pgTAP RPC tests**

```sql
-- supabase/tests/database/public_intake_rpcs_test.sql
begin;
select no_plan();

-- Anon execution tests
set local role anon;

-- Test submit_membership_request
select lives_ok(
  $$ select public.submit_membership_request(
       'Amaka Okonjo', 'amaka@example.com', '+2348031234567', 'Architect',
       'Passionate about club values and community welfare.'
     ) $$,
  'Anon can submit membership request'
);

-- Test submit_partnership_enquiry
select lives_ok(
  $$ select public.submit_partnership_enquiry(
       'Tunde Balogun', 'Apex Brands', 'tunde@apex.ng', '+2348029876543',
       'brand_activation', 'We would like to sponsor the upcoming Gala.'
     ) $$,
  'Anon can submit partnership enquiry'
);

-- Switch to postgres/admin to create an invite
reset role;

-- Create an invite as service role
select lives_ok(
  $$ select public.create_member_invite('invited@example.com', 'member', null) $$,
  'Officer can create member invite'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Append RPC definitions to `20261105140000_public_intake_and_invites.sql`**

1. `submit_membership_request`: validates inputs, deduplicates pending requests for the same email (raises notice if already submitted within 30 days), inserts row, returns `uuid`.
2. `submit_partnership_enquiry`: validates inputs, inserts row, returns `uuid`.
3. `create_member_invite`: verifies caller has `admin`, `president`, `executive`, or `backup_admin` role (strictly forbids `staff` per §2.15); generates 32-byte hex token (`encode(gen_random_bytes(32), 'hex')`), inserts into `member_invites`, returns `token`.
4. `review_membership_request`: verifies caller role; if `decision = 'approved'`, calls `create_member_invite` and stores token; updates status.
5. `validate_invite_token`: takes `p_token text`, checks if token exists, `consumed_at is null`, and `expires_at > now()`. Returns `jsonb` `{ "valid": true, "email": "...", "role": "..." }` or `{ "valid": false }`.
6. `consume_invite_token`: marks `consumed_at = now()` and `consumed_by = p_user_id`.

- [ ] **Step 3: Apply locally and run pgTAP test**

Run:
```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/database/public_intake_rpcs_test.sql
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261105140000_public_intake_and_invites.sql supabase/tests/database/public_intake_rpcs_test.sql
git commit -m "feat(intake): implement submission, review, and invite lifecycle RPCs"
```

---

## Task 5: Server Actions & Notice Mappings for Intake & Invites

**Files:**
- Modify: `src/lib/system-notices.ts:150-180`
- Modify: `src/lib/rpc-error-notice.ts:25-50`
- Modify: `src/app/actions.ts`
- Test: `tests/public-intake-actions.test.mjs`

**Interfaces:**
- Consumes: RPCs from Task 4, notice system
- Produces:
  - `submitMembershipRequestAction(formData: FormData)`
  - `submitPartnershipEnquiryAction(formData: FormData)`
  - Notice codes: `membership-request-submitted`, `partnership-enquiry-submitted`, `request-already-pending`, `invite-invalid`, `invite-expired`

- [ ] **Step 1: Write failing test for server actions and notice codes**

```javascript
// tests/public-intake-actions.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_NOTICES } from "../src/lib/system-notices.ts";
import { rpcErrorNotice } from "../src/lib/rpc-error-notice.ts";

test("intake notices are registered in SYSTEM_NOTICES", () => {
  assert.ok(SYSTEM_NOTICES["membership-request-submitted"]);
  assert.ok(SYSTEM_NOTICES["partnership-enquiry-submitted"]);
  assert.ok(SYSTEM_NOTICES["request-already-pending"]);
  assert.ok(SYSTEM_NOTICES["invite-invalid"]);
  assert.ok(SYSTEM_NOTICES["invite-expired"]);
});

test("rpcErrorNotice maps duplicate intake requests to request-already-pending", () => {
  const notice = rpcErrorNotice(new Error("A pending membership request already exists for this email"));
  assert.equal(notice, "request-already-pending");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/public-intake-actions.test.mjs`
Expected: FAIL

- [ ] **Step 3: Register notices and implement actions in `src/app/actions.ts`**

1. In `src/lib/system-notices.ts`, add:
   - `"membership-request-submitted"`: "Your membership application has been received and is currently under review by the Executive Committee."
   - `"partnership-enquiry-submitted"`: "Thank you for reaching out. A club representative will review your proposal and respond promptly."
   - `"request-already-pending"`: "A membership request with this email is already awaiting review."
   - `"invite-invalid"`: "This invitation link is invalid or has already been used."
   - `"invite-expired"`: "This invitation link has expired. Please submit a new membership request."
2. In `src/lib/rpc-error-notice.ts`, map database duplicate and constraint raises.
3. In `src/app/actions.ts`, implement `submitMembershipRequestAction` and `submitPartnershipEnquiryAction`. Sanitize inputs, enforce string lengths, format phone numbers, invoke `supabase.rpc(...)`, and redirect to `/?notice=...` with modal acknowledgment.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/public-intake-actions.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/system-notices.ts src/lib/rpc-error-notice.ts src/app/actions.ts tests/public-intake-actions.test.mjs
git commit -m "feat(intake): add intake notice codes, rpc error mapping, and server actions"
```

---

## Task 6: Invitation-Only Signup Gating (`/signup`)

**Files:**
- Modify: `src/app/signup/page.tsx`
- Modify: `src/app/actions.ts:1328-1373` (`signUpAction`)
- Test: `tests/invitation-signup-gating.test.mjs`

**Interfaces:**
- Consumes: `validate_invite_token` RPC, `consume_invite_token` RPC
- Produces: Gated `/signup` route requiring valid `?token=...`; displays barrier screen when token is absent/invalid.

- [ ] **Step 1: Write failing test for signup gating**

```javascript
// tests/invitation-signup-gating.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("src/app/signup/page.tsx validates token before rendering form", () => {
  const content = fs.readFileSync("src/app/signup/page.tsx", "utf8");
  assert.match(content, /validate_invite_token/);
  assert.match(content, /Invitation Required/i);
  assert.match(content, /Request Membership/i);
  assert.match(content, /href="\/portal"/); // Link to sign in
});

test("signUpAction rejects submission without valid invite token", () => {
  const content = fs.readFileSync("src/app/actions.ts", "utf8");
  assert.match(content, /token.*validate_invite_token/);
  assert.match(content, /consume_invite_token/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/invitation-signup-gating.test.mjs`
Expected: FAIL

- [ ] **Step 3: Update `src/app/signup/page.tsx` and `signUpAction`**

1. In `src/app/signup/page.tsx`:
   - Await `searchParams` and extract `token`.
   - If no token, render `SignupInvitationRequired` component explaining that membership is by invitation & vetted merit, offering a button to "Request Membership" (linking to `/?modal=membership`) and a link to `/portal` ("Already a member? Sign in").
   - If token is present, call `validate_invite_token(token)`. If invalid or expired, render the appropriate error notice with link to request access.
   - If token is valid, render the signup form with the email pre-populated and locked (read-only), passing `token` as a hidden field.
2. In `signUpAction` (`src/app/actions.ts`):
   - Extract `token` from `formData`.
   - Validate token via `validate_invite_token`. If invalid, `redirect("/signup?notice=invite-invalid")`.
   - After `supabase.auth.signUp()` succeeds, invoke `consume_invite_token(token, user.id)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/invitation-signup-gating.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/signup/page.tsx src/app/actions.ts tests/invitation-signup-gating.test.mjs
git commit -m "feat(signup): gate account registration behind cryptographic invitation tokens"
```

---

## Task 7: Officer & Admin Review Queues for Intake & Invites

**Files:**
- Create: `src/app/(staff)/admin/membership-requests/page.tsx`
- Create: `src/app/(staff)/admin/partnerships/page.tsx`
- Modify: `src/app/(staff)/admin/actions.ts`
- Test: `tests/intake-admin-queues.test.mjs`

**Interfaces:**
- Consumes: Tables `membership_requests`, `partnership_enquiries`
- Produces: Staff/Admin review queue UI for approving or rejecting membership requests and handling partnership leads.

- [ ] **Step 1: Write failing test for admin queue page exports and actions**

```javascript
// tests/intake-admin-queues.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("admin membership requests page exists and exports default async page", () => {
  assert.equal(fs.existsSync("src/app/(staff)/admin/membership-requests/page.tsx"), true);
  const content = fs.readFileSync("src/app/(staff)/admin/membership-requests/page.tsx", "utf8");
  assert.match(content, /membership_requests/);
  assert.match(content, /reviewMembershipRequestAction/);
});

test("admin partnerships page exists and exports default async page", () => {
  assert.equal(fs.existsSync("src/app/(staff)/admin/partnerships/page.tsx"), true);
  const content = fs.readFileSync("src/app/(staff)/admin/partnerships/page.tsx", "utf8");
  assert.match(content, /partnership_enquiries/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/intake-admin-queues.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement admin review pages and server actions**

1. In `src/app/(staff)/admin/actions.ts`:
   - Add `reviewMembershipRequestAction(formData)`: checks caller authorization, calls `review_membership_request` RPC, and if approved, enqueues the invitation email with token link.
   - Add `handlePartnershipEnquiryAction(formData)`: updates enquiry status to `contacted` or `closed` with notes.
2. Build `src/app/(staff)/admin/membership-requests/page.tsx` with filter tabs (`Pending`, `Approved`, `Rejected`), card/table view displaying applicant details, profession, reasoning, and approve/reject controls.
3. Build `src/app/(staff)/admin/partnerships/page.tsx` displaying organization name, enquiry type, message, and contact details.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/intake-admin-queues.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/(staff)/admin/membership-requests/page.tsx src/app/(staff)/admin/partnerships/page.tsx src/app/(staff)/admin/actions.ts tests/intake-admin-queues.test.mjs
git commit -m "feat(admin): add membership requests and partnership enquiries management queues"
```

---

## Task 8: Intake & Invitation Email Templates & Outbox Enqueueing

**Files:**
- Create: `src/lib/email/templates/membership-request-received.ts`
- Create: `src/lib/email/templates/membership-invite.ts`
- Create: `src/lib/email/templates/partnership-enquiry-received.ts`
- Modify: `src/lib/email/notifications.ts`
- Test: `tests/intake-email-templates.test.mjs`

**Interfaces:**
- Consumes: Email notification config & layout helpers
- Produces: HTML & plain text templates for intake acknowledgments and invitation tokens with secure links.

- [ ] **Step 1: Write failing test for intake email templates**

```javascript
// tests/intake-email-templates.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("membership invite email contains canonical domain and token query param", () => {
  const content = fs.readFileSync("src/lib/email/templates/membership-invite.ts", "utf8");
  assert.match(content, /\/signup\?token=/);
  assert.match(content, /Carpenters Family/);
  assert.match(content, /valid for 7 days/i);
});

test("membership request confirmation informs applicant of executive review", () => {
  const content = fs.readFileSync("src/lib/email/templates/membership-request-received.ts", "utf8");
  assert.match(content, /Executive Committee/i);
  assert.match(content, /received/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/intake-email-templates.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement email templates and outbox integration**

1. Create `membership-request-received.ts`: acknowledges application receipt, provides estimated turnaround, sets professional expectations.
2. Create `membership-invite.ts`: congratulates applicant on vetted admission, includes button with link `${siteUrl}/signup?token=${token}`, notes 7-day expiration.
3. Create `partnership-enquiry-received.ts`: confirms receipt of business proposal.
4. Integrate with `enqueueNotificationEmail` in `src/lib/email/notifications.ts`, wrapping outbox calls in try/catch to ensure database transactions are not blocked if email delivery fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/intake-email-templates.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/membership-request-received.ts src/lib/email/templates/membership-invite.ts src/lib/email/templates/partnership-enquiry-received.ts src/lib/email/notifications.ts tests/intake-email-templates.test.mjs
git commit -m "feat(email): add templates and outbox handlers for membership intake and invites"
```

---

## Task 9: Design System Tokens, Typography & Asset Integration for Landing

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts` (or CSS token definitions)
- Test: `tests/landing-design-tokens.test.mjs`

**Interfaces:**
- Consumes: Landing mockup design specifications, `public/landing/` assets
- Produces: CSS color tokens (`forest`, `deep`, `cream`, `linen`, `espresso`, `body`, `umber`, `ochre`, `terra`), typography classes, smooth scrolling, and 44px touch targets.

- [ ] **Step 1: Write failing test verifying tokens and assets**

```javascript
// tests/landing-design-tokens.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("required landing images exist in public/landing", () => {
  const files = [
    "cta-band.jpg", "hero-family.jpg", "og-share.jpg",
    "tile-brand-activation.jpg", "tile-djs-hype.jpg",
    "tile-family-galas.jpg", "tile-raves.jpg",
    "what-we-do-inset.jpg", "what-we-do-main.jpg"
  ];
  for (const file of files) {
    assert.equal(fs.existsSync(`public/landing/${file}`), true, `Missing ${file}`);
  }
});

test("globals.css defines landing theme color variables and 44px touch targets", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /#174C37|--color-forest/i);
  assert.match(css, /#FAF6F0|--color-cream/i);
  assert.match(css, /#D6A23A|--color-ochre/i);
  assert.match(css, /min-height:\s*44px/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/landing-design-tokens.test.mjs`
Expected: FAIL

- [ ] **Step 3: Define landing styles and utilities**

1. In `src/app/globals.css`:
   - Add landing color custom properties:
     - `--landing-forest: #174C37;`
     - `--landing-deep: #0C3325;`
     - `--landing-cream: #FAF6F0;`
     - `--landing-linen: #E5DDD3;`
     - `--landing-espresso: #3D291F;`
     - `--landing-body: #5C4638;`
     - `--landing-umber: #7A685D;`
     - `--landing-ochre: #D6A23A;`
     - `--landing-terra: #BA3C2A;`
   - Add `.btn-landing` and `.btn-pill` classes enforcing `min-height: 44px`, focus-visible outline `#D6A23A`, and hover lifts (`transform: translateY(-2px)`).
   - Add `@media (prefers-reduced-motion: reduce)` rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/landing-design-tokens.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tailwind.config.ts tests/landing-design-tokens.test.mjs
git commit -m "feat(landing): establish color tokens, typography, and accessibility utilities"
```

---

## Task 10: Landing Page Components (Navigation, Hero, Values, What We Do, Events)

**Files:**
- Create: `src/components/landing/landing-ribbon.tsx`
- Create: `src/components/landing/landing-nav.tsx`
- Create: `src/components/landing/landing-hero.tsx`
- Create: `src/components/landing/landing-vision.tsx`
- Create: `src/components/landing/landing-what-we-do.tsx`
- Create: `src/components/landing/landing-events.tsx`
- Create: `src/components/landing/landing-footer.tsx`
- Test: `tests/landing-components.test.mjs`

**Interfaces:**
- Consumes: Public event types, mockup copy verbatim (excluding profit-sharing)
- Produces: Modular, accessible landing page components with Next/Image integration.

- [ ] **Step 1: Write failing test verifying copy and profit-sharing exclusion**

```javascript
// tests/landing-components.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("landing hero has verbatim copy and no profit sharing claim", () => {
  const hero = fs.readFileSync("src/components/landing/landing-hero.tsx", "utf8");
  assert.match(hero, /Rooted in Family\./);
  assert.match(hero, /Driven by the Vibe\./);
  assert.doesNotMatch(hero, /60%/);
  assert.doesNotMatch(hero, /profit.?sharing/i);
});

test("what-we-do component omits 60% profit-sharing claim in card 03", () => {
  const whatWeDo = fs.readFileSync("src/components/landing/landing-what-we-do.tsx", "utf8");
  assert.match(whatWeDo, /Family Welfare & Shared Prosperity/);
  assert.doesNotMatch(whatWeDo, /share 60% of event profits/);
});

test("landing nav provides links to Box Office /tickets and Member Portal /portal", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /href="\/tickets"/);
  assert.match(nav, /href="\/portal"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/landing-components.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement landing components**

1. `landing-ribbon.tsx`: Renders top announcement banner. Accepts optional `nextEvent` prop from `get_public_ticketed_events()`. If present, renders title and date with link to `/tickets`; otherwise fallback to Gala announcement.
2. `landing-nav.tsx`: Sticky navigation with logo, anchor links (`#about`, `#vision`, `#what-we-do`, `#events`, `#leadership`), "Box Office" button linking to `/tickets`, and "Member Portal" button linking to `/portal`. Includes mobile hamburger menu and accessible slide-out drawer.
3. `landing-hero.tsx`: Hero banner with eyebrow `"Asaba · Delta State · Nigeria"`, headline, subhead, "Join the Family" button (triggers membership modal), and "Explore Events" button (`#events`). Uses `next/image` on `hero-family.jpg`.
4. `landing-vision.tsx`: Vision, Mission, Values cards with inline SVGs and clean typography.
5. `landing-what-we-do.tsx`: Photo collage using `what-we-do-main.jpg` and `what-we-do-inset.jpg`. Three numbered cards:
   - `01 Shows, DJ, Hype & Event Hosting`
   - `02 Beverage & Lifestyle Brand Promotion`
   - `03 Family Welfare & Shared Prosperity` (Verbatim copy *without* the 60% clause).
6. `landing-events.tsx`: Flagship gatherings section with filter tabs, event cards, and CTA button to `/tickets`.
7. `landing-footer.tsx`: Clean footer with navigation links, contact info, and copyright.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/landing-components.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/ tests/landing-components.test.mjs
git commit -m "feat(landing): implement ribbon, nav, hero, vision, what-we-do, events, and footer"
```

---

## Task 11: Landing Page Modals & Forms (Membership Intake, Partner Enquiry, Constitution)

**Files:**
- Create: `src/components/landing/membership-intake-modal.tsx`
- Create: `src/components/landing/partnership-enquiry-modal.tsx`
- Create: `src/components/landing/constitution-modal.tsx`
- Test: `tests/landing-modals.test.mjs`

**Interfaces:**
- Consumes: Server actions `submitMembershipRequestAction`, `submitPartnershipEnquiryAction`
- Produces: Accessible dialog components with trap focus, Esc key close, and clean validation states.

- [ ] **Step 1: Write failing test for modal forms and copy constraints**

```javascript
// tests/landing-modals.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("membership intake modal renders form fields and submits to action", () => {
  const content = fs.readFileSync("src/components/landing/membership-intake-modal.tsx", "utf8");
  assert.match(content, /name="full_name"/);
  assert.match(content, /name="email"/);
  assert.match(content, /name="phone"/);
  assert.match(content, /name="profession"/);
  assert.match(content, /name="reason_for_joining"/);
  assert.match(content, /submitMembershipRequestAction/);
});

test("constitution modal omits 60/40 profit sharing mention", () => {
  const content = fs.readFileSync("src/components/landing/constitution-modal.tsx", "utf8");
  assert.doesNotMatch(content, /60%\s*\/\s*40%/);
  assert.doesNotMatch(content, /profit.?sharing/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/landing-modals.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement accessible modals**

1. Build `membership-intake-modal.tsx`: renders dialog with backdrop blur, accessible ARIA attributes (`role="dialog"`, `aria-labelledby`), form inputs with proper validation and client feedback.
2. Build `partnership-enquiry-modal.tsx`: renders partner dialog with organization, contact, dropdown for enquiry type (`Brand Activation`, `Sponsorship`, `Corporate Booking`, `General Enquiry`), and message textarea.
3. Build `constitution-modal.tsx`: renders club principles, governance, and membership standards (strictly omitting the 60/40 profit-sharing claim).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/landing-modals.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/membership-intake-modal.tsx src/components/landing/partnership-enquiry-modal.tsx src/components/landing/constitution-modal.tsx tests/landing-modals.test.mjs
git commit -m "feat(landing): implement membership intake, partnership, and constitution modals"
```

---

## Task 12: Landing Page Assembly at `src/app/page.tsx` & SEO / Metadata (`sitemap.ts`, `robots.ts`)

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Test: `tests/landing-page-metadata.test.mjs`

**Interfaces:**
- Consumes: Landing components from Tasks 10 & 11, `get_public_ticketed_events` RPC
- Produces: Public marketing root page `/`, dynamic XML sitemap, and search engine crawler instructions.

- [ ] **Step 1: Write failing test for landing root page and robots/sitemap**

```javascript
// tests/landing-page-metadata.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("src/app/page.tsx is a public landing page with metadata and no session read", () => {
  const content = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(content, /export\s+const\s+metadata/);
  assert.match(content, /Carpenters Family Social Club/);
  assert.match(content, /og-share\.jpg/);
  assert.doesNotMatch(content, /supabase\.auth\.getUser\(\)/); // No session read on marketing landing
});

test("robots.ts allows public routes and disallows protected routes", () => {
  assert.equal(fs.existsSync("src/app/robots.ts"), true);
  const content = fs.readFileSync("src/app/robots.ts", "utf8");
  assert.match(content, /disallow:\s*\[.*"\/admin".*"\/portal".*\]/s);
});

test("sitemap.ts generates valid URLs for canonical site", () => {
  assert.equal(fs.existsSync("src/app/sitemap.ts"), true);
  const content = fs.readFileSync("src/app/sitemap.ts", "utf8");
  assert.match(content, /https:\/\/carpentersfamily\.com\.ng/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/landing-page-metadata.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement landing page at `src/app/page.tsx`, `robots.ts`, and `sitemap.ts`**

1. In `src/app/page.tsx`:
   - Replace old auth router with `LandingPage` server component.
   - Fetch public event feed via `createSupabaseServerClient().rpc("get_public_ticketed_events")` safely inside a `try/catch`.
   - Export rich `Metadata` object:
     - Title: `"Carpenters Family Social Club · Asaba, Nigeria"`
     - Description: `"Asaba's premier family and entertainment collective—creating landmark shows, elevating lifestyle brands, and standing together for life."`
     - OpenGraph: `images: ["/landing/og-share.jpg"]`, `type: "website"`, `url: "https://carpentersfamily.com.ng"`.
   - Assemble Ribbon, Header/Nav, Hero, Vision, What We Do, Events, Testimonials, Leadership, CTA Banner, Modals, and Footer.
2. In `src/app/robots.ts`:
   - Return `{ rules: { userAgent: "*", allow: ["/", "/tickets"], disallow: ["/portal", "/admin", "/officers", "/settings", "/api/"] }, sitemap: "https://carpentersfamily.com.ng/sitemap.xml" }`.
3. In `src/app/sitemap.ts`:
   - Return entries for `https://carpentersfamily.com.ng/` and `https://carpentersfamily.com.ng/tickets`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/landing-page-metadata.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/robots.ts src/app/sitemap.ts tests/landing-page-metadata.test.mjs
git commit -m "feat(landing): assemble public landing page at / with SEO metadata, robots, and sitemap"
```

---

## Task 13: End-to-End Verification, Cross-Surface Guards & Access Matrix Delta

**Files:**
- Modify: `docs/data-access-matrix.md`
- Test: `tests/public-flow-cross-surface.test.mjs`

**Interfaces:**
- Consumes: All modules built across Tasks 1–12
- Produces: Green test suite, green typecheck, green linter, updated access matrix, and verified production build.

- [ ] **Step 1: Write cross-surface guard test**

```javascript
// tests/public-flow-cross-surface.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("landing page and components contain zero occurrences of 60% profit sharing", () => {
  const files = [
    "src/app/page.tsx",
    "src/components/landing/landing-hero.tsx",
    "src/components/landing/landing-what-we-do.tsx",
    "src/components/landing/constitution-modal.tsx"
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /60%\s*\/\s*40%/, `Found profit sharing in ${f}`);
    assert.doesNotMatch(text, /60%\s*of\s*event\s*profits/i, `Found profit sharing in ${f}`);
  }
});

test("portal page handles all auth states and notices", () => {
  const portalText = fs.readFileSync("src/app/portal/page.tsx", "utf8");
  assert.match(portalText, /AuthPageLayout/);
  assert.match(portalText, /HomeDashboardView/);
});
```

- [ ] **Step 2: Update `docs/data-access-matrix.md`**

Record the new tables (`membership_requests`, `partnership_enquiries`, `member_invites`), the absence of direct `anon` table grants, and the five new security definer RPCs.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: ALL test suites PASS.

- [ ] **Step 4: Run typecheck and linter**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: 0 errors across TypeScript and Biome.

- [ ] **Step 5: Run production build**

Run: `npm run build`
Expected: Successful build with `/`, `/portal`, `/tickets`, and `/signup` properly compiled.

- [ ] **Step 6: Commit**

```bash
git add docs/data-access-matrix.md tests/public-flow-cross-surface.test.mjs
git commit -m "docs(intake): update data access matrix and record full verification pass"
```

---

## Task 14: Production Apply Runbook (Operator-Gated)

### 1. Migrations Added on Branch
- `supabase/migrations/20261105140000_public_intake_and_invites.sql`

### 2. Operator Production Commands
The operator runs the following commands against the production Supabase project (`kgihmudjdvwrvteclodl`):

```bash
npx supabase db push            # operator only — applies intake & invites migration to PRODUCTION
npx supabase test db            # operator only — runs pgTAP against production
```

Post-apply production verifications:
```bash
# Verify anon has NO table grants on intake tables
npx supabase db query "
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_name in ('membership_requests', 'partnership_enquiries', 'member_invites');
"
# Expected: 0 rows (empty)

# Verify RPC execute grants
npx supabase db query "
select routine_name from information_schema.routine_privileges
where grantee = 'anon' and routine_name in ('submit_membership_request', 'submit_partnership_enquiry', 'validate_invite_token');
"
# Expected: 3 rows
```

### 3. Agent Execution Boundary
**No agent runs the production apply command.** Remote database application is strictly operator-gated.
