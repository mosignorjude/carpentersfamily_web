# Staff Confirmation Resend + Deferred Applicant Notice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a staff administrator re-send an applicant's email-confirmation link, and make the applicant's "your registration is awaiting approval" email arrive only **after** the applicant confirms their email address.

**Architecture:** Two composable changes on the existing notification-outbox + staff-RPC rails. (1) The applicant receipt (`signup_receipt`) stops being queued at sign-up and is instead queued from the two in-app confirmation landing points — `/auth/callback` (Auth's own confirmation email) and a new `/auth/confirm` route (the re-sent link) — gated on `member_profiles.status = 'pending'`. (2) A new security-definer staff RPC validates the applicant, records an audit row, and enforces a 15-minute cooldown from that audit row; the server action then mints a single-use confirmation token with `auth.admin.generateLink()` and queues our own branded envelope email whose CTA is a **relative** path into `/auth/confirm`.

**Tech Stack:** Next.js App Router (server actions, route handlers), `@supabase/supabase-js` 2.117.2 (`auth.admin.generateLink`, `auth.verifyOtp`), Postgres 17 security-definer RPCs + pgTAP, `node --test` source-text and pure-function tests, Biome.

**Spec:** no separate spec file; the requirements are the user's two sentences of 2026-10-31 plus the existing policy in `docs/notification_system_design.md:146-148` (welcome/registration notice fires on the `email_confirmed_at` NULL → NOT NULL transition; the confirmation email itself belongs to Supabase Auth).

## Interpretation of the request

"Let staffs only be able to resend confirmation action" is read as: **add a "Resend confirmation email" action that only a staff administrator can perform** (officers and executives do **not** get it), and the second sentence defers the applicant notice until confirmation. If the intent was different, stop before Task 6 and re-ask.

## Global Constraints

- Raw database errors are never echoed to the browser; every RPC failure is translated by `rpcErrorNotice()` into an allowlisted notice code defined in `src/lib/system-notices.ts` / the page's own `pageNotices` map.
- Email copy lives only in `src/lib/email/notifications.ts` (typed `queueSingle` → `template_payload`). Do not author `notification_outbox` rows in SQL for membership emails.
- `notification_outbox.cta_url` must start with `/`, be ≤ 2048 chars, and contain no control characters — absolute URLs are rejected by a CHECK constraint (`20261027000000…sql:134-142`).
- `notification_outbox.idempotency_key` must match `^[a-z0-9][a-z0-9:_-]{0,254}$`; `trigger_type` must match `^[a-z][a-z0-9_]{1,63}$`.
- Confirmation and password-reset emails stay owned by Supabase Auth; the outbox may only carry an envelope that links to Auth's verification token. Never store a password, never call `auth.resend()` on behalf of another user (it only works for the signed-in caller — `GoTrueClient.js:2280`).
- Every staff write path is gated server-side by `private.is_staff_administrator()` inside the RPC; UI gating is presentation only.
- No new secrets, no new environment variables, no new npm dependencies.
- `supabase db push` **without `--local` applies migrations to PRODUCTION.** Local stack work always uses `--local` (and `--include-all` when a local file sorts before the newest remote version). Applying this plan's migration to production requires a separate explicit user approval.
- TDD: write the failing test, see it fail for the right reason, then implement. One commit per task.
- Staff roster pages redirect with `?notice=<code>`; never render an error string from a database message.

---

## File structure

**Created**

| File | Responsibility |
| --- | --- |
| `src/app/auth/confirm/route.ts` | GET-only route handler: exchange a `token_hash` from a re-sent confirmation link for an Auth verification, trigger the deferred applicant notice, redirect. |
| `src/lib/auth-email-verification.ts` | Pure, testable parsing/allowlisting of `/auth/confirm` query parameters. No Supabase, no Next imports. |
| `supabase/migrations/20261031170000_staff_resend_email_confirmation.sql` | `private`/`public` `staff_resend_member_email_confirmation()` + grants. |
| `supabase/tests/database/staff_resend_email_confirmation_test.sql` | pgTAP authorization, state, and cooldown tests. |
| `tests/registration-notice-deferral.test.mjs` | Node tests for the deferred applicant notice (copy, gating, wiring). |
| `tests/auth-confirm-route.test.mjs` | Node tests for `src/lib/auth-email-verification.ts`. |
| `tests/staff-confirmation-resend.test.mjs` | Node tests for the staff action, notices, audit label, and staff-only UI gating. |

**Modified**

| File | Change |
| --- | --- |
| `src/lib/email/notifications.ts` | Delete the sign-up-time `signup_receipt` block (:253-281); add `notifyRegistrationReceivedIfPending()` and `queueEmailConfirmationResend()`. |
| `src/lib/notifications/idempotency.ts` | Add `emailConfirmationResendKey()`. |
| `src/app/auth/callback/route.ts` | Call the deferred notice alongside `notifyWelcomeIfActive()` (:30-32). |
| `src/app/page.tsx` | Add `email-confirmed` and `confirm-link-invalid` notices (:28-51). |
| `src/app/(staff)/admin/actions.ts` | Add `staffResendConfirmationAction()`. |
| `src/app/(staff)/admin/members/page.tsx` | Add resend notices (:10-27). |
| `src/lib/staff-notices.ts` | Add shared codes for the new failure classes. |
| `src/lib/system-notices.ts` | Add notice copy. |
| `src/lib/rpc-error-notice.ts` | Map the three new curated database messages. |
| `src/lib/staff-presentation.mjs` | Add the audit action label. |
| `src/components/staff/staff-member-table.tsx` | Render the resend dialog for `profileState === "incomplete_email"` rows. |
| `tests/notification-trigger-matrix.test.mjs` | Document the new trigger type and the deferred notice markers. |
| `docs/notification_system_design.md` | Update the trigger table rows 1-2 and add the resend row. |

---

## Task 1: Platform spike — can staff mint a confirmation link for an existing unconfirmed user?

Everything in Tasks 5-8 assumes this answer. Do not continue on assumption.

**Files:**
- Create: `resend-spike.mjs` (repo root, so `@supabase/supabase-js` resolves — **throwaway: deleted in Step 5, never committed**)
- Modify temporarily: `supabase/config.toml` (`[auth.email] enable_confirmations`), reverted at the end of this task

**Interfaces:**
- Consumes: the local Supabase stack. `npx supabase start` prints the local API URL (`http://127.0.0.1:54321`) and the local `anon key` / `service_role key`; pass them to the probe as environment variables. Do not paste either key into chat, into a committed file, or into `.env.local`.
- Produces: a decision recorded in this plan file under "Spike result", and the exact `generateLink` + `verifyOtp` literals used by Tasks 4 and 6.

- [ ] **Step 1: Enable confirmations locally**

In `supabase/config.toml`, set `[auth.email] enable_confirmations = true` (currently `false` at :220-247). Then restart Auth:

```bash
npx supabase stop && npx supabase start
```

Expected: Auth starts at `http://127.0.0.1:54321`; note the printed `service_role key` and `anon key` (do not paste them into chat or commit them).

- [ ] **Step 2: Write the throwaway probe**

`resend-spike.mjs`:

```js
import { createClient } from "@supabase/supabase-js";

const url = process.env.SPIKE_URL;
const admin = createClient(url, process.env.SPIKE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const probe = createClient(url, process.env.SPIKE_ANON_KEY, {
  auth: { persistSession: false },
});

const email = `spike-${Date.now()}@example.test`;
const password = "spike-password-longer-than-12";

const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: false,
  user_metadata: { full_name: "Spike User", username: "spike_user" },
});
console.log(
  "created",
  created.data?.user?.id,
  "confirmed:",
  created.data?.user?.email_confirmed_at,
);

const tokens = {};
for (const type of ["magiclink", "invite"]) {
  const res = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: url },
  });
  console.log(type, "error:", res.error?.message ?? null);
  console.log(type, "props:", res.data?.properties);
  if (res.data?.properties?.hashed_token) {
    tokens[type] = res.data.properties.hashed_token;
  }
}

// The decisive safety check: the original password must still sign in.
const after = await probe.auth.signInWithPassword({ email, password });
console.log("password still works:", !after.error, after.error?.message ?? "");

console.log("tokens for step 4:", JSON.stringify(tokens));
```

- [ ] **Step 3: Run it and read the answers**

```bash
SPIKE_URL=http://127.0.0.1:54321 SPIKE_SERVICE_KEY=<local service key> SPIKE_ANON_KEY=<local anon key> \
  node resend-spike.mjs
```

Record, verbatim, in a new `## Spike result` section appended to this plan file:
1. Does `generateLink({ type: "magiclink" })` succeed for an **existing, unconfirmed** user, or error (`User already exists`, `password required`, 422)? What is `verification_type` and what does `hashed_token` look like (length, character set)?
2. Same question for `type: "invite"`.
3. Does the original password still sign in afterwards? (If **no**, the primitive destroys credentials — abandon it immediately.)

- [ ] **Step 4: Verify the token actually confirms**

Append to `resend-spike.mjs` (before re-running `node resend-spike.mjs`; note this creates a fresh user each run, which is what you want because tokens are single-use):

```js
for (const [type, hashedToken] of Object.entries(tokens)) {
  const verified = await probe.auth.verifyOtp({ token_hash: hashedToken, type });
  console.log(
    "verifyOtp",
    type,
    "confirmed_at:",
    verified.data?.user?.email_confirmed_at ?? null,
    "error:",
    verified.error?.message ?? null,
  );
}
```

Expected: for the winning variant, `confirmed_at` is non-null and `error` is null. Record the exact `type` literal that worked — Tasks 4 and 6 must use it. If `verifyOtp({ token_hash, type: "magiclink" })` fails but `type: "email"` succeeds for the same token, note that and use `"email"` in Tasks 4 and 6 (Task 4's pinned type, Task 6's `ctaPath`, and Task 7's test assertion must all change together).

- [ ] **Step 5: Clean up and revert**

```bash
rm resend-spike.mjs
git status --short   # must show no resend-spike.mjs
git checkout -- supabase/config.toml
npx supabase stop && npx supabase start
```

Then delete any spike auth users left in the local stack (Supabase Studio → Authentication, or `admin.auth.admin.deleteUser(id)` from a one-off `node -e` run with the same two environment variables).

- [ ] **Step 6: Gate**

- Both `generateLink` variants error, or the password check fails → **STOP.** Report the evidence and propose the alternative (an in-app self-service resend for the applicant, which cannot be staff-triggered). Do not proceed to Task 5.
- Exactly one variant works → proceed, and use that variant's literal `type` in Task 6/7.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-10-31-staff-confirmation-resend-and-deferred-welcome.md
git commit -m "docs(plans): record generateLink spike result for confirmation resend"
```

---

## Task 2: Stop emailing the applicant at sign-up; queue the notice on confirmation instead

**Files:**
- Modify: `src/lib/email/notifications.ts:253-281` (delete), and add one function after `notifyWelcomeIfActive` (:290-310)
- Test: `tests/registration-notice-deferral.test.mjs` (create)

**Interfaces:**
- Consumes: `signupReceiptKey(userId)` (unchanged), `resolveMemberContact(admin, memberId)`, `queueSingle(...)`.
- Produces: `notifyRegistrationReceivedIfPending(userId: string): Promise<void>` — returns silently unless the member profile exists with `status === "pending"`; idempotency key `signup_receipt:user:<id>`; trigger type `signup_receipt`.

- [ ] **Step 1: Write the failing test**

`tests/registration-notice-deferral.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/lib/email/notifications.ts", "utf8");

test("sign-up no longer emails the applicant before email confirmation", () => {
  const signUpBlock = source.match(
    /export async function notifyNewMemberSignUp\([\s\S]*?\n}\n/,
  );
  assert.ok(signUpBlock, "notifyNewMemberSignUp must exist");
  assert.doesNotMatch(
    signUpBlock[0],
    /triggerType: "signup_receipt"/,
    "the applicant receipt must not be queued at sign-up",
  );
  assert.match(signUpBlock[0], /triggerType: "member_signup_alert"/);
});

test("the deferred notice is queued only while the applicant is pending", () => {
  const block = source.match(
    /export async function notifyRegistrationReceivedIfPending\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "notifyRegistrationReceivedIfPending must be exported");
  assert.match(block[0], /\.select\("status"\)/);
  assert.match(block[0], /profile\?\.status !== "pending"/);
  assert.match(block[0], /idempotencyKey: signupReceiptKey\(/);
  assert.match(block[0], /triggerType: "signup_receipt"/);
});

test("the deferred copy confirms the email first and then states pending approval", () => {
  const block = source.match(
    /export async function notifyRegistrationReceivedIfPending\([\s\S]*?\n}\n/,
  );
  assert.ok(block);
  assert.match(block[0], /await queueSingle\(\{/);
  const copy = block[0];
  assert.doesNotMatch(copy, /Once you confirm your email address/);
  assert.match(copy, /Pending Approval/);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/registration-notice-deferral.test.mjs
```

Expected: test 1 FAILS on `the applicant receipt must not be queued at sign-up`; tests 2-3 FAIL with `notifyRegistrationReceivedIfPending must be exported`.

- [ ] **Step 3: Delete the sign-up-time applicant block**

Remove `src/lib/email/notifications.ts:253-281` — the whole `if (params.userId) { await queueSingle({ … triggerType: "signup_receipt" … }); }` block. `notifyNewMemberSignUp` keeps only the officer fan-out and stays `async` with the same signature (the `params.userId` field remains: it is still used by `memberSignupAlertKey`).

- [ ] **Step 4: Add the deferred function**

Immediately after `notifyWelcomeIfActive` (`:310`), insert:

```ts
export async function notifyRegistrationReceivedIfPending(
  userId: string,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return;
    const { data: profile } = await admin
      .from("member_profiles")
      .select("status, username")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.status !== "pending") return;

    const contact = await resolveMemberContact(admin, userId);
    if (!contact) return;

    await queueSingle({
      idempotencyKey: signupReceiptKey(userId),
      triggerType: "signup_receipt",
      contact,
      subject: "Carpenters Family — Email Confirmed. Approval Is Pending.",
      heading: "Your Membership Request Is Awaiting Club Approval",
      ctaLabel: "Visit Member Portal",
      ctaPath: "/",
      copy: {
        previewText:
          "Your email is confirmed and your membership request is with the club executives.",
        greeting: `Hello ${contact.name},`,
        intro:
          "Thank you for registering with the Carpenters Family Social Club portal. Your email address is now confirmed, so our club executives can review your registration and activate your membership. You will receive another email as soon as a decision is recorded.",
        detailsTitle: "Registration Summary",
        details: [
          { label: "Full Name", value: contact.name },
          { label: "Username", value: `@${profile.username ?? "member"}` },
          { label: "Status", value: "Pending Approval" },
        ],
        category: "membership",
      },
    });
  } catch (err) {
    reportNotificationError(
      "[Email Service] notifyRegistrationReceivedIfPending failed:",
      err,
    );
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
node --test tests/registration-notice-deferral.test.mjs
```

Expected: PASS (3/3).

- [ ] **Step 6: Prove the whole suite still agrees**

```bash
node --test tests/notification-trigger-matrix.test.mjs
```

Expected: PASS — `signup_receipt` stays in `SUPPLEMENTAL_TRIGGER_TYPES`, and trigger 1's markers (`welcomeKey(`, `notifyWelcomeIfActive(`) are untouched.

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/notifications.ts tests/registration-notice-deferral.test.mjs
git commit -m "feat(email): defer the applicant registration notice until email confirmation"
```

---

## Task 3: Fire the deferred notice from the confirmation callback

**Files:**
- Modify: `src/app/auth/callback/route.ts:1-37`
- Test: `tests/registration-notice-deferral.test.mjs` (append)

**Interfaces:**
- Consumes: `notifyRegistrationReceivedIfPending(userId)` from Task 2.
- Produces: nothing new; the confirmation landing point now queues the pending notice before checking the active case.

- [ ] **Step 1: Write the failing test**

Append to `tests/registration-notice-deferral.test.mjs`:

```js
test("the auth callback queues the pending notice before the welcome check", () => {
  const route = fs.readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(
    route,
    /import \{\s*notifyRegistrationReceivedIfPending,/,
    "the callback must import the deferred notice",
  );
  const branch = route.match(
    /if \(data\.user\?\.email_confirmed_at\) \{([\s\S]*?)\n {4}\}/,
  );
  assert.ok(branch, "the confirmed-email branch must exist");
  const deferred = branch[1].search(/notifyRegistrationReceivedIfPending\(/);
  const welcome = branch[1].search(/notifyWelcomeIfActive\(/);
  assert.notEqual(deferred, -1, "the branch must queue the pending notice");
  assert.ok(deferred < welcome, "the pending notice must be queued first");
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/registration-notice-deferral.test.mjs
```

Expected: FAIL — `the callback must import the deferred notice`.

- [ ] **Step 3: Implement**

In `src/app/auth/callback/route.ts`, extend the import at line 2 and the confirmed branch at :30-32:

```ts
import {
  notifyRegistrationReceivedIfPending,
  notifyWelcomeIfActive,
} from "@/lib/email/notifications";
```

```ts
    if (data.user?.email_confirmed_at) {
      await notifyRegistrationReceivedIfPending(data.user.id);
      await notifyWelcomeIfActive(data.user.id);
    }
```

- [ ] **Step 4: Run the tests**

```bash
node --test tests/registration-notice-deferral.test.mjs tests/notification-trigger-matrix.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/callback/route.ts tests/registration-notice-deferral.test.mjs
git commit -m "feat(auth): queue the pending-registration notice on email confirmation"
```

---

## Task 4: `/auth/confirm` route for the re-sent confirmation link

**Files:**
- Create: `src/lib/auth-email-verification.ts`
- Create: `src/app/auth/confirm/route.ts`
- Modify: `src/app/page.tsx:28-51`
- Test: `tests/auth-confirm-route.test.mjs` (create)

**Interfaces:**
- Consumes: `createSupabaseServerClient()`, `getSiteOrigin()`, `notifyRegistrationReceivedIfPending(userId)`.
- Produces:
  - `readConfirmRequest(params: URLSearchParams): { tokenHash: string; verificationType: "magiclink" } | null`
  - `confirmNotice(verified: boolean): string` → `"email-confirmed"` | `"confirm-link-invalid"`
  - Route `GET /auth/confirm?token_hash=<hashed_token>&type=magiclink`

- [ ] **Step 1: Write the failing test**

`tests/auth-confirm-route.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmNotice,
  readConfirmRequest,
} from "../src/lib/auth-email-verification.ts";

test("accepts a well-formed magiclink token hash", () => {
  const parsed = readConfirmRequest(
    new URLSearchParams("token_hash=abc123def456&type=magiclink"),
  );
  assert.deepEqual(parsed, { tokenHash: "abc123def456", verificationType: "magiclink" });
});

test("rejects missing, oversized, whitespace, or control-character hashes", () => {
  assert.equal(readConfirmRequest(new URLSearchParams("type=magiclink")), null);
  assert.equal(
    readConfirmRequest(new URLSearchParams(`token_hash=${"a".repeat(513)}&type=magiclink`)),
    null,
  );
  assert.equal(
    readConfirmRequest(new URLSearchParams("token_hash=ab%09cd&type=magiclink")),
    null,
  );
  assert.equal(
    readConfirmRequest(new URLSearchParams("token_hash=short&type=magiclink")),
    null,
  );
});

test("only ever treats the hash as a magiclink verification", () => {
  for (const type of ["signup", "recovery", "email_change", "sms", "", "MagicLink"]) {
    assert.equal(
      readConfirmRequest(new URLSearchParams(`token_hash=abc123def456&type=${type}`)),
      null,
      `${type} must not be verifiable through this route`,
    );
  }
});

test("notices are fixed strings chosen by outcome", () => {
  assert.equal(confirmNotice(true), "email-confirmed");
  assert.equal(confirmNotice(false), "confirm-link-invalid");
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/auth-confirm-route.test.mjs
```

Expected: FAIL — `Cannot find module … auth-email-verification.ts`.

- [ ] **Step 3: Write the pure module**

`src/lib/auth-email-verification.ts`:

```ts
const MIN_TOKEN_HASH_LENGTH = 8;
const MAX_TOKEN_HASH_LENGTH = 512;
const FORBIDDEN_HASH_CHARACTERS = /[\x00-\x20\x7F]/u;

/**
 * The re-sent confirmation link is the only flow that lands here, so the
 * verification type is pinned to "magiclink" rather than taken from the query
 * string: a stray "recovery" hash must not be exchangeable through this route.
 */
export function readConfirmRequest(
  params: URLSearchParams,
): { tokenHash: string; verificationType: "magiclink" } | null {
  const tokenHash = params.get("token_hash") ?? "";
  if (params.get("type") !== "magiclink") return null;
  if (tokenHash.length < MIN_TOKEN_HASH_LENGTH) return null;
  if (tokenHash.length > MAX_TOKEN_HASH_LENGTH) return null;
  if (FORBIDDEN_HASH_CHARACTERS.test(tokenHash)) return null;
  return { tokenHash, verificationType: "magiclink" };
}

export function confirmNotice(verified: boolean): string {
  return verified ? "email-confirmed" : "confirm-link-invalid";
}
```

- [ ] **Step 4: Run the tests**

```bash
node --test tests/auth-confirm-route.test.mjs
```

Expected: PASS (4/4).

- [ ] **Step 5: Write the route handler**

`src/app/auth/confirm/route.ts` — modelled on `src/app/auth/callback/route.ts`, same 503 / redirect discipline:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { notifyRegistrationReceivedIfPending } from "@/lib/email/notifications";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { confirmNotice, readConfirmRequest } from "@/lib/auth-email-verification";

export async function GET(request: NextRequest) {
  const origin = getSiteOrigin();
  if (!origin)
    return NextResponse.json(
      { error: "Email confirmation unavailable." },
      { status: 503 },
    );

  const params = readConfirmRequest(new URL(request.url).searchParams);
  if (!params)
    return NextResponse.redirect(
      new URL(`/?notice=${confirmNotice(false)}`, origin),
    );

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.verificationType,
    });
    if (error || !data.user)
      return NextResponse.redirect(
        new URL(`/?notice=${confirmNotice(false)}`, origin),
      );

    await notifyRegistrationReceivedIfPending(data.user.id);
    return NextResponse.redirect(
      new URL(`/?notice=${confirmNotice(true)}`, origin),
    );
  } catch {
    return NextResponse.redirect(
      new URL(`/?notice=${confirmNotice(false)}`, origin),
    );
  }
}
```

Keep the session that `verifyOtp` establishes: a pending applicant must be able to complete their profile, and every member feature is gated by database policies on `status = 'active'`, not by the absence of a session. This matches the existing `/auth/callback` behaviour, which also lands a newly confirmed applicant on `/`.

- [ ] **Step 6: Add the landing notices**

In `src/app/page.tsx`, add to the `notices` map (:28-43) and to `signInErrorNotices` (:45-51):

```ts
  "email-confirmed":
    "Your email address is confirmed. Your membership is now waiting for club approval.",
  "confirm-link-invalid":
    "This confirmation link is no longer valid. Sign in again or ask a club administrator to send a new link.",
```

and inside `signInErrorNotices`:

```ts
  "confirm-link-invalid",
```

- [ ] **Step 7: Verify build and lint**

```bash
npx biome check src/app/auth/confirm/route.ts src/lib/auth-email-verification.ts src/app/page.tsx
npm run build
```

Expected: Biome reports no violations; the build succeeds and lists `/auth/confirm` as a route.

- [ ] **Step 8: Commit**

```bash
git add src/app/auth/confirm/route.ts src/lib/auth-email-verification.ts src/app/page.tsx tests/auth-confirm-route.test.mjs
git commit -m "feat(auth): add token-hash email confirmation route"
```

---

## Task 5: Staff-only resend RPC (authorization, state checks, audit, cooldown)

**Files:**
- Create: `supabase/migrations/20261031170000_staff_resend_email_confirmation.sql`
- Create: `supabase/tests/database/staff_resend_email_confirmation_test.sql`

**Interfaces:**
- Consumes: `private.is_staff_administrator()`, `public.member_profiles`, `auth.users`, `public.audit_log (actor_id, action, entity_type, entity_id, target_member_id, before_data, after_data, reason, occurred_at)`.
- Produces: `public.staff_resend_member_email_confirmation(p_member_id uuid, p_reason text)` returning `table (member_id uuid, email text, full_name text, username text)`; audit action `member_email_confirmation_resent`; 15-minute cooldown measured from the newest matching audit row.

- [ ] **Step 1: Write the failing pgTAP suite**

`supabase/tests/database/staff_resend_email_confirmation_test.sql`, following the house shape used by `supabase/tests/database/member_email_confirmation_state_test.sql` — `begin; select no_plan(); … select * from finish(); rollback;`, fixtures insert `auth.users` rows with `'{}'::jsonb` metadata, then one UPDATE sets the identity columns (the `member_profiles_keep_completed_identity` trigger forbids touching an already-completed profile, and `enforce_member_profile_activation` forbids `status='active'` with an unconfirmed email, which is why every unconfirmed applicant fixture is `pending`).

```sql
begin;

select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'rs-admin@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'rs-exec@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'rs-member@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'rs-applicant@example.test', '', '{}'::jsonb, '{}'::jsonb, null),
  ('00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'rs-confirmed@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000306', 'authenticated', 'authenticated', 'rs-rejected@example.test', '', '{}'::jsonb, '{}'::jsonb, null);

update public.member_profiles
set full_name = case id
      when '00000000-0000-0000-0000-000000000301' then 'Resend Admin'
      when '00000000-0000-0000-0000-000000000302' then 'Resend Exec'
      when '00000000-0000-0000-0000-000000000303' then 'Resend Member'
      when '00000000-0000-0000-0000-000000000304' then 'Resend Applicant'
      when '00000000-0000-0000-0000-000000000305' then 'Resend Confirmed'
      else 'Resend Rejected'
    end,
    username = case id
      when '00000000-0000-0000-0000-000000000301' then 'rs_admin'
      when '00000000-0000-0000-0000-000000000302' then 'rs_exec'
      when '00000000-0000-0000-0000-000000000303' then 'rs_member'
      when '00000000-0000-0000-0000-000000000304' then 'rs_apply'
      when '00000000-0000-0000-0000-000000000305' then 'rs_conf'
      else 'rs_reject'
    end,
    status = case
      when id = '00000000-0000-0000-0000-000000000301' then 'staff'
      when id = '00000000-0000-0000-0000-000000000304' then 'pending'
      when id = '00000000-0000-0000-0000-000000000306' then 'rejected'
      else 'active'
    end,
    profile_completed_at = case
      when id in ('00000000-0000-0000-0000-000000000304',
                  '00000000-0000-0000-0000-000000000306') then null
      else now() - interval '30 days'
    end
where id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305',
  '00000000-0000-0000-0000-000000000306'
);

insert into public.member_role_assignments (member_id, role, started_at)
values ('00000000-0000-0000-0000-000000000302', 'executive', now() - interval '5 days');

-- Structural checks: the pair exists, the private half is a definer, and only
-- authenticated may execute either half.
select has_function('private', 'staff_resend_member_email_confirmation',
  array['uuid', 'text'], 'the internal resend write exists');
select has_function('public', 'staff_resend_member_email_confirmation',
  array['uuid', 'text'], 'the RPC wrapper is exposed to the API');
select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'staff_resend_member_email_confirmation'),
  'the internal resend write is security definer'
);
select ok(
  has_function_privilege('authenticated',
    'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'private.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE'),
  'authenticated can execute the wrapper and the gated write it forwards to'
);
select ok(
  not has_function_privilege('anon',
    'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE'),
  'anon and service_role hold no execute privilege'
);

-- A staff administrator gets the recipient details back and the audit row exists.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select is(
  (select array_agg(r.email) from public.staff_resend_member_email_confirmation(
     '00000000-0000-0000-0000-000000000304'::uuid,
     'Applicant reported the confirmation email was never delivered.') as r(email)),
  array['rs-applicant@example.test']::text[],
  'the recipient details are returned to the staff administrator'
);

reset role;

-- audit_log is FORCE ROW LEVEL SECURITY, so audit assertions run as postgres,
-- exactly as the existing suites do.
set local role postgres;

select ok(
  exists (select 1 from public.audit_log
          where target_member_id = '00000000-0000-0000-0000-000000000304'
            and action = 'member_email_confirmation_resent'
            and actor_id = '00000000-0000-0000-0000-000000000301'
            and reason = 'Applicant reported the confirmation email was never delivered.'),
  'the resend is recorded in the audit history'
);

reset role;

-- The cooldown blocks an immediate second attempt by the same or another actor.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'second attempt')$$,
  '23514',
  'A confirmation email was sent to this applicant less than 15 minutes ago. Try again later.',
  'the 15 minute cooldown blocks a repeated resend'
);

reset role;

-- Outside the window the same applicant can be re-sent.
set local role postgres;
update public.audit_log
set occurred_at = occurred_at - interval '20 minutes'
where action = 'member_email_confirmation_resent'
  and target_member_id = '00000000-0000-0000-0000-000000000304';
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'third attempt')$$,
  'the resend is allowed again once the window has passed'
);

reset role;

-- State refusals, checked before any email could be queued.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000305'::uuid, 'already verified')$$,
  '23514',
  'This applicant has already confirmed their email address.',
  'a confirmed applicant cannot be re-sent a confirmation email'
);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000306'::uuid, 'declined applicant')$$,
  '23514',
  'Only a pending applicant can be sent a confirmation email.',
  'a rejected applicant cannot be re-sent a confirmation email'
);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(null, 'no id')$$,
  '22023', null, 'a member id and a reason are required');

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, '   ')$$,
  '22023', null, 'a blank reason is refused');

reset role;

-- Everyone else is refused before any row is read or any audit row is written.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000302', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'executive probe')$$,
  '42501',
  'An active staff administrator account is required.',
  'an executive may not resend a confirmation email'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000303', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'member probe')$$,
  '42501',
  'An active staff administrator account is required.',
  'an ordinary member may not resend a confirmation email'
);

reset role;

set local role anon;
select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'anon probe')$$,
  '42501', null, 'anon cannot execute the resend RPC');

reset role;

-- An authorization refusal must never leave an audit row behind.
set local role postgres;
select ok(
  (select count(*)::integer from public.audit_log
   where action = 'member_email_confirmation_resent') = 2,
  'only the two successful resends are recorded'
);
reset role;

select * from finish();
rollback;
```

Notes the implementer needs: the `set local role anon` block expects `permission denied for schema public` if anon has no schema usage — if `throws_ok` reports that instead of the function's own 42501, assert `'42501', null` with the message left as `null` (the 4-argument form) and keep the code, matching what the existing suite does for anon.

- [ ] **Step 2: Run it and see it fail**

```bash
npx supabase db reset --local
npx supabase test db --local
```

Expected: this suite fails with `function public.staff_resend_member_email_confirmation(uuid, text) does not exist`; the previously-green suites stay green (the seven pre-existing stale-name failures are unrelated drift — do not chase them).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261031170000_staff_resend_email_confirmation.sql`:

```sql
-- Staff-only resend of the email-confirmation link.
--
-- approve_member_core refuses an applicant whose email is unconfirmed, so when
-- the Auth confirmation email is lost the club is stuck. This records the
-- staff decision (audit_log) and returns the recipient details the app needs
-- to mint a single-use confirmation link through the Supabase Auth admin API.
-- The cooldown is measured from the audit row itself, so no new table is
-- required and every resend is already traceable.

create or replace function private.staff_resend_member_email_confirmation(
  p_member_id uuid,
  p_reason text
)
returns table (member_id uuid, email text, full_name text, username text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_status text;
  v_full_name text;
  v_username text;
  v_email text;
  v_confirmed_at timestamptz;
  v_last_sent timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  select mp.status, mp.full_name, mp.username, au.email, au.email_confirmed_at
  into v_status, v_full_name, v_username, v_email, v_confirmed_at
  from public.member_profiles as mp
  join auth.users as au on au.id = mp.id
  where mp.id = p_member_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'That applicant account was not found.';
  end if;

  if v_confirmed_at is not null then
    raise exception using
      errcode = '23514',
      message = 'This applicant has already confirmed their email address.';
  end if;

  if v_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Only a pending applicant can be sent a confirmation email.';
  end if;

  select pg_catalog.max(al.occurred_at)
  into v_last_sent
  from public.audit_log as al
  where al.target_member_id = p_member_id
    and al.action = 'member_email_confirmation_resent';

  if v_last_sent is not null
     and v_last_sent > pg_catalog.now() - pg_catalog.interval '15 minutes' then
    raise exception using
      errcode = '23514',
      message = 'A confirmation email was sent to this applicant less than 15 minutes ago. Try again later.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id,
    'member_email_confirmation_resent',
    'member_profile',
    p_member_id,
    p_member_id,
    pg_catalog.jsonb_build_object('email_confirmed', false),
    pg_catalog.jsonb_build_object('confirmation_link_queued', true),
    v_reason
  );

  return query
  select p_member_id, v_email, v_full_name, v_username;
end;
$function$;

create or replace function public.staff_resend_member_email_confirmation(
  p_member_id uuid,
  p_reason text
)
returns table (member_id uuid, email text, full_name text, username text)
language sql
security invoker
set search_path = ''
as $function$
  select member_id, email, full_name, username
  from private.staff_resend_member_email_confirmation(p_member_id, p_reason);
$function$;

revoke all on function private.staff_resend_member_email_confirmation(uuid, text)
  from public, anon, service_role;
revoke all on function public.staff_resend_member_email_confirmation(uuid, text)
  from public, anon, service_role;

-- The public wrapper is security invoker, so the caller must also be able to
-- execute the gated write it forwards to. PostgREST exposes only the public
-- schema, so this grant never makes the private function callable over REST.
grant execute on function private.staff_resend_member_email_confirmation(uuid, text) to authenticated;
grant execute on function public.staff_resend_member_email_confirmation(uuid, text) to authenticated;
```

- [ ] **Step 4: Apply locally and re-run pgTAP**

```bash
npx supabase db push --local --include-all
npx supabase test db --local
```

Expected: `npx supabase test db --local` prints no `not ok` lines for `staff_resend_email_confirmation_test.sql` (the suite uses `no_plan()`, so assert zero failures rather than a fixed count), and the suites that passed before are unchanged.

- [ ] **Step 5: Confirm the API surface is exactly what the house pattern requires**

```bash
npx supabase db query --local "
select n.nspname as schema,
       pg_catalog.has_function_privilege('anon',
         'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE') as anon_execute,
       pg_catalog.has_function_privilege('authenticated',
         n.nspname || '.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE') as caller_execute
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where p.proname = 'staff_resend_member_email_confirmation'
order by 1;"
```

Expected: two rows — `private` with `anon_execute = f`, `caller_execute = t`; `public` with the same. The `authenticated` grant on the **private** half is required (the wrapper is security invoker) and is not a REST leak, because PostgREST exposes only the `public` schema. If the private row shows `caller_execute = f`, production rosters would fail closed exactly the way the previous migration nearly did — fix the grant before continuing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261031170000_staff_resend_email_confirmation.sql supabase/tests/database/staff_resend_email_confirmation_test.sql
git commit -m "feat(db): add staff-only email confirmation resend RPC with cooldown and audit"
```

---

## Task 6: Staff server action + resend email builder

**Files:**
- Modify: `src/lib/notifications/idempotency.ts`
- Modify: `src/lib/email/notifications.ts`
- Modify: `src/app/(staff)/admin/actions.ts`
- Modify: `src/lib/rpc-error-notice.ts:14-40`, `src/lib/staff-notices.ts` (sharedCodes), `src/lib/system-notices.ts`, `src/lib/staff-presentation.mjs:3-16`
- Test: `tests/staff-confirmation-resend.test.mjs` (create)

**Interfaces:**
- Consumes: `public.staff_resend_member_email_confirmation()` (Task 5) returning `member_id, email, full_name, username`; `getSiteOrigin()`; `admin.auth.admin.generateLink()` (Task 1's winning variant).
- Produces:
  - `emailConfirmationResendKey(params: { userId: string; occurredAt: Date }): string`
  - `queueEmailConfirmationResend(params: { memberId: string; email: string; fullName: string; tokenHash: string }): Promise<void>`
  - `staffResendConfirmationAction(formData: FormData)` reading `member_id` and `reason`
  - notice codes `confirmation-resent`, `already-confirmed`, `not-pending`, `resend-cooldown`, `confirmation-send-failed`

- [ ] **Step 1: Write the failing test**

`tests/staff-confirmation-resend.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const actions = fs.readFileSync("src/app/(staff)/admin/actions.ts", "utf8");
const email = fs.readFileSync("src/lib/email/notifications.ts", "utf8");
const keys = fs.readFileSync("src/lib/notifications/idempotency.ts", "utf8");

test("the resend action is staff-gated, audited, and mints a token hash", () => {
  const block = actions.match(
    /export async function staffResendConfirmationAction\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "staffResendConfirmationAction must be exported");
  assert.match(block[0], /await requireStaffActor\(\)/);
  assert.match(block[0], /uuidPattern\.test\(memberId\)/);
  assert.match(
    block[0],
    /supabase\.rpc\(\s*"staff_resend_member_email_confirmation",/,
  );
  assert.match(block[0], /admin\.auth\.admin\.generateLink\(\{/);
  assert.match(block[0], /queueEmailConfirmationResend\(\{/);
  assert.match(
    block[0],
    /redirect\("\/admin\/members\?notice=confirmation-resent"\)/,
  );
});

test("the resend CTA is a relative path into the confirm route", () => {
  const block = email.match(
    /export async function queueEmailConfirmationResend\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "queueEmailConfirmationResend must be exported");
  assert.match(block[0], /triggerType: "email_confirmation_resend"/);
  assert.match(
    block[0],
    /ctaPath: `\/auth\/confirm\?token_hash=\$\{encodeURIComponent\(/,
    "the CTA must be a relative path into the confirmation route",
  );
  assert.match(block[0], /&type=magiclink`/);
  assert.match(block[0], /idempotencyKey: emailConfirmationResendKey\(/);
});

test("resend keys are unique per minute so a later resend is not deduped", () => {
  assert.match(
    keys,
    /export function emailConfirmationResendKey\([\s\S]*?userKey\(\s*"email_confirmation_resend"/,
  );
});

test("the three new database messages map to specific notices", () => {
  const rules = fs.readFileSync("src/lib/rpc-error-notice.ts", "utf8");
  assert.match(rules, /\balready confirmed their email\b[\s\S]*"already-confirmed"/);
  assert.match(rules, /\bless than 15 minutes ago\b[\s\S]*"resend-cooldown"/);
  assert.match(rules, /\bonly a pending applicant\b[\s\S]*"not-pending"/);
  const staff = fs.readFileSync("src/lib/staff-notices.ts", "utf8");
  for (const code of [
    "already-confirmed",
    "not-pending",
    "resend-cooldown",
    "confirmation-send-failed",
  ]) {
    assert.ok(staff.includes(`"${code}"`), `${code} must be a shared staff notice`);
  }
});

test("the audit action has a human label", () => {
  const presentation = fs.readFileSync("src/lib/staff-presentation.mjs", "utf8");
  assert.match(
    presentation,
    /member_email_confirmation_resent: "Confirmation email resent"/,
  );
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/staff-confirmation-resend.test.mjs
```

Expected: FAIL — `staffResendConfirmationAction must be exported`.

- [ ] **Step 3: Add the idempotency key**

In `src/lib/notifications/idempotency.ts`, after `signupReceiptKey` (:32-34):

```ts
export function emailConfirmationResendKey(params: {
  userId: string;
  occurredAt: Date;
}): string {
  return userKey(
    "email_confirmation_resend",
    params.userId,
    `:${minuteStamp(params.occurredAt)}`,
  );
}
```

Add `emailConfirmationResendKey` to the import block in `src/lib/email/notifications.ts:8-32` (alphabetical, matching the existing ordering — it sorts after `duesRequestSubmittedKey`).

- [ ] **Step 4: Add the email builder**

In `src/lib/email/notifications.ts`, after `notifyNewMemberSignUp`:

```ts
export async function queueEmailConfirmationResend(params: {
  memberId: string;
  email: string;
  fullName: string;
  tokenHash: string;
}): Promise<void> {
  await queueSingle({
    idempotencyKey: emailConfirmationResendKey({
      userId: params.memberId,
      occurredAt: new Date(),
    }),
    triggerType: "email_confirmation_resend",
    contact: {
      email: params.email.toLowerCase(),
      userId: params.memberId,
      name: params.fullName,
    },
    subject: "Confirm your Carpenters Family email address",
    heading: "Your Confirmation Link Is Ready",
    ctaLabel: "Confirm My Email Address",
    ctaPath: `/auth/confirm?token_hash=${encodeURIComponent(
      params.tokenHash,
    )}&type=magiclink`,
    copy: {
      previewText: "A fresh link to confirm your email address is waiting.",
      greeting: `Hello ${params.fullName},`,
      intro:
        "A club administrator has re-sent your Carpenters Family email confirmation link. Open the link below to confirm your address — it works for this attempt only and expires soon. Once confirmed, your membership moves ahead to approval.",
      bodyLabel: "Need Help?",
      bodyText:
        "If the link reports that it is no longer valid, sign in and request a new confirmation link, or contact a club administrator.",
      category: "membership",
    },
  });
}
```

- [ ] **Step 5: Add the server action**

In `src/app/(staff)/admin/actions.ts`: extend the imports and append the action after `staffMemberLifecycleAction` (:229).

```ts
import {
  notifyMemberLifecycleChanged,
  queueEmailConfirmationResend,
} from "@/lib/email/notifications";
import { getSiteOrigin } from "@/lib/supabase/config";
```

```ts
export async function staffResendConfirmationAction(formData: FormData) {
  const { supabase } = await requireStaffActor();

  const memberId = formString(formData, "member_id", 36);
  const reason = formString(formData, "reason", 500);

  if (!memberId || !uuidPattern.test(memberId) || !reason) {
    redirect("/admin/members?notice=invalid-request");
  }

  const { data, error } = await supabase.rpc(
    "staff_resend_member_email_confirmation",
    { p_member_id: memberId, p_reason: reason },
  );
  if (error) redirect(`/admin/members?notice=${rpcErrorNotice(error)}`);

  const recipient = (data ?? [])[0] as
    | { email?: string; full_name?: string }
    | undefined;
  if (!recipient?.email) {
    redirect("/admin/members?notice=operation-failed");
  }

  const origin = getSiteOrigin();
  const admin = createSupabaseAdminClient();
  if (!origin || !admin) {
    redirect("/admin/members?notice=confirmation-send-failed");
  }

  // Task 1 decides the variant: "magiclink" is the expected answer. Swap the
  // literal only if the spike proved a different verification type works, and
  // keep Task 4's pinned type and Task 6's ctaPath in step.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: recipient.email,
    options: { redirectTo: origin },
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    redirect("/admin/members?notice=confirmation-send-failed");
  }

  try {
    await queueEmailConfirmationResend({
      memberId,
      email: recipient.email,
      fullName: recipient.full_name ?? "member",
      tokenHash,
    });
  } catch {
    redirect("/admin/members?notice=confirmation-send-failed");
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  redirect("/admin/members?notice=confirmation-resent");
}
```

`createSupabaseAdminClient()` returns `null` when `SUPABASE_SECRET_KEY` is absent, so the guard above must stay before `generateLink` — the same shape `createStaffAction` uses at `:84-85`.

- [ ] **Step 6: Map the database messages to notices**

`src/lib/rpc-error-notice.ts` — insert these three rules at the top of `MESSAGE_RULES` (:14), because they are more specific than the generic `only a pending …` rule already present:

```ts
  [/already confirmed their email/i, "already-confirmed"],
  [/less than 15 minutes ago/i, "resend-cooldown"],
  [/only a pending applicant/i, "not-pending"],
```

`src/lib/staff-notices.ts` — extend `sharedCodes` with `"already-confirmed"`, `"not-pending"`, `"resend-cooldown"`, `"confirmation-send-failed"`.

`src/lib/system-notices.ts` — add, in the membership block next to the existing `email-confirmation-required` entry:

```ts
  "already-confirmed": {
    type: "info",
    title: "Email Already Confirmed",
    message: "This applicant has already confirmed their email address.",
  },
  "not-pending": {
    type: "info",
    title: "Applicant Is Not Pending",
    message: "Only a pending applicant can be sent a confirmation email.",
  },
  "resend-cooldown": {
    type: "warning",
    title: "Confirmation Email Already Sent",
    message:
      "A confirmation email was sent to this applicant less than 15 minutes ago. Try again later.",
  },
  "confirmation-send-failed": {
    type: "error",
    title: "Confirmation Email Not Sent",
    message:
      "The confirmation link could not be generated. No email was sent. Try again or contact the platform administrator.",
  },
```

`src/lib/staff-presentation.mjs:3-16` — add to `knownActions`:

```ts
  member_email_confirmation_resent: "Confirmation email resent",
```

- [ ] **Step 7: Run the tests**

```bash
node --test tests/staff-confirmation-resend.test.mjs
```

Expected: PASS (5/5). `"warning"` is a valid `FlashCardType` (`src/components/ui/flash-card.tsx:14-19`), so the cooldown card needs no variant change.

- [ ] **Step 8: Commit**

```bash
git add src/lib/notifications/idempotency.ts src/lib/email/notifications.ts "src/app/(staff)/admin/actions.ts" src/lib/rpc-error-notice.ts src/lib/staff-notices.ts src/lib/system-notices.ts src/lib/staff-presentation.mjs tests/staff-confirmation-resend.test.mjs
git commit -m "feat(staff): resend applicant confirmation email from the member roster"
```

---

## Task 7: Staff roster UI — the Resend button, staff only

**Files:**
- Modify: `src/components/staff/staff-member-table.tsx:129-200`
- Modify: `src/app/(staff)/admin/members/page.tsx:10-27`
- Test: `tests/staff-confirmation-resend.test.mjs` (append)

**Interfaces:**
- Consumes: `StaffMemberRow.profileState` values from `getMemberProfileReadiness()` — `complete | incomplete_email | incomplete_bio | verification_unknown`; `staffResendConfirmationAction`.
- Produces: a `StaffActionDialog` on each pending row whose `profileState === "incomplete_email"`; new page notices `confirmation-resent`.

- [ ] **Step 1: Write the failing test**

Append to `tests/staff-confirmation-resend.test.mjs`:

```js
test("the roster offers resend only for a known unconfirmed email", () => {
  const table = fs.readFileSync(
    "src/components/staff/staff-member-table.tsx",
    "utf8",
  );
  assert.match(table, /staffResendConfirmationAction/);
  assert.match(
    table,
    /member\.profileState === "incomplete_email"/,
    "resend must be gated on a confirmed-negative email state",
  );
  assert.doesNotMatch(
    table.slice(table.search(/staffResendConfirmationAction/)),
    /officers/,
    "the officer roster must not reuse the staff resend action",
  );
});

test("verification unknown never offers a resend", () => {
  const table = fs.readFileSync(
    "src/components/staff/staff-member-table.tsx",
    "utf8",
  );
  const resendBlock = table.match(
    /profileState === "incomplete_email"[\s\S]*?\/StaffActionDialog>/,
  );
  assert.ok(resendBlock, "resend dialog must exist");
  assert.doesNotMatch(resendBlock[0], /verification_unknown/);
});

test("the members page reports a successful resend", () => {
  const page = fs.readFileSync("src/app/(staff)/admin/members/page.tsx", "utf8");
  assert.match(page, /"confirmation-resent": \{/);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/staff-confirmation-resend.test.mjs
```

Expected: FAIL — `staffResendConfirmationAction` not found in the table.

- [ ] **Step 3: Render the dialog**

In `src/components/staff/staff-member-table.tsx`, extend the import at line 4 and replace the `else` branch of the pending block (:147-151) so an email-blocked applicant gets the action instead of only the explanation:

```ts
import {
  staffMemberLifecycleAction,
  staffResendConfirmationAction,
} from "@/app/(staff)/admin/actions";
```

```tsx
                        {member.profileState === "complete" ? (
                          <StaffActionDialog
                            action={staffMemberLifecycleAction}
                            confirmLabel="Approve membership"
                            description="Member access is enabled immediately and the decision is recorded in the audit history."
                            fields={{
                              member_id: member.id,
                              operation: "approve",
                            }}
                            reasonHelp="Required. This reason is recorded against the approved membership."
                            reasonLabel="Reason for approval"
                            title={`Approve ${member.fullName}?`}
                            triggerLabel="Approve"
                          />
                        ) : member.profileState === "incomplete_email" ? (
                          <>
                            <p className="max-w-56 text-[#8B261E]">
                              {member.profileStateDescription}
                            </p>
                            <StaffActionDialog
                              action={staffResendConfirmationAction}
                              confirmLabel="Send confirmation email"
                              description="The applicant receives a fresh link to confirm their email address. This attempt is recorded in the audit history and can be repeated after 15 minutes."
                              fields={{ member_id: member.id }}
                              reasonHelp="Required. Explain why the link is being re-sent, for example that the applicant reported never receiving the confirmation email."
                              reasonLabel="Reason for resending"
                              title={`Resend the confirmation email to ${member.fullName}?`}
                              triggerLabel="Resend confirmation"
                            />
                          </>
                        ) : (
                          <p className="max-w-56 text-[#8B261E]">
                            {member.profileStateDescription}
                          </p>
                        )}
```

`verification_unknown` (email-state lookup failed) and `incomplete_bio` fall to the plain explanation branch — no resend, no approve. Fail closed.

- [ ] **Step 4: Add the page notice**

In `src/app/(staff)/admin/members/page.tsx`, extend `pageNotices` (:10-27):

```ts
  "confirmation-resent": {
    message:
      "A fresh confirmation link was queued for the applicant and the resend is recorded in the audit history.",
    isError: false,
  },
```

- [ ] **Step 5: Run the tests and lint**

```bash
node --test tests/staff-confirmation-resend.test.mjs
npx biome check src/components/staff/staff-member-table.tsx "src/app/(staff)/admin/members/page.tsx"
```

Expected: PASS; no Biome violations.

- [ ] **Step 6: Confirm the officer roster is untouched**

```bash
grep -rn "staffResendConfirmationAction" src/components/admin src/app/\(member\)/officers
```

Expected: no output — officers keep the read-only email-state badge and gain no resend path.

- [ ] **Step 7: Commit**

```bash
git add src/components/staff/staff-member-table.tsx "src/app/(staff)/admin/members/page.tsx" tests/staff-confirmation-resend.test.mjs
git commit -m "feat(staff): expose the confirmation resend action for email-blocked applicants"
```

---

## Task 8: Policy docs, trigger matrix, and full verification

**Files:**
- Modify: `tests/notification-trigger-matrix.test.mjs:198-207`
- Modify: `docs/notification_system_design.md:146-148`
- No production changes in this task.

**Interfaces:**
- Consumes: nothing new.
- Produces: a green `npm test`, a green build, and a branch ready for the user's integration decision.

- [ ] **Step 1: Declare the new trigger type**

In `tests/notification-trigger-matrix.test.mjs`, add to `SUPPLEMENTAL_TRIGGER_TYPES` (:198-207):

```js
  "email_confirmation_resend",
```

and extend trigger 1 so the deferred notice is pinned to the callback (`app` array at :30):

```js
    app: [
      "triggerType: \"welcome\"",
      "welcomeKey(",
      "notifyWelcomeIfActive(",
      "notifyRegistrationReceivedIfPending(",
    ],
```

- [ ] **Step 2: Run the matrix and see it pass without further edits**

```bash
node --test tests/notification-trigger-matrix.test.mjs
```

Expected: PASS. If `has no undocumented outbox trigger types` fails, the app is emitting a type that was not declared — fix the type string, not the test list.

- [ ] **Step 3: Update the policy table**

In `docs/notification_system_design.md`, rows 1-2 (:146-148): keep the Auth-owns-confirmation sentence, and record the two new rules —

- Registration notice (`signup_receipt`, key `signup_receipt:user:{user_id}`): queued when the applicant's `email_confirmed_at` becomes non-null and `member_profiles.status = 'pending'`; never queued at sign-up.
- Confirmation link re-send (`email_confirmation_resend`, key `email_confirmation_resend:user:{user_id}:{minute}`): staff-administrator action; Supabase Auth still mints the single-use token, the club only sends the envelope; one resend per applicant per 15 minutes, recorded as `member_email_confirmation_resent` in `audit_log`.

- [ ] **Step 4: Full local verification**

```bash
npm test
npx biome check .
npm run build
npx supabase db reset --local
npx supabase test db --local
```

Expected: all Node tests pass (previous baseline 585 + the new files); Biome clean; build succeeds; the new pgTAP suite passes and the previously-passing suites are unchanged (the seven pre-existing stale-name/stale-signature failures remain and are not this feature's regression).

- [ ] **Step 5: Manual verification, in a browser, on the production build**

Start the built app on `127.0.0.1:3001` (per the local verification memory: kill any stale server on that port first), then as a staff administrator on `/admin/members`:

1. A pending applicant with an unconfirmed email shows the email-blocked explanation **and** a `Resend confirmation` button.
2. The dialog requires a reason; submitting lands on `/admin/members?notice=confirmation-resent` with a success banner.
3. Submitting again within 15 minutes lands on `?notice=resend-cooldown` with the "Already Sent" card, not a generic failure.
4. An applicant whose email is confirmed shows Approve as before and has no resend button.
5. `/officers/members` shows the email state but no resend control.
6. `/admin/audit` renders the new row as "Confirmation email resent".
7. In the local outbox, inspect the queued row and confirm the CTA is the relative `/auth/confirm?token_hash=…&type=magiclink` path and that `&` is not truncated by the template renderer.

If the local stack cannot deliver email, verify the outbox row and the `/auth/confirm` handler by calling the route with a token minted in Task 1, and state plainly in the completion report which steps were verified live and which could not be.

- [ ] **Step 6: Commit**

```bash
git add tests/notification-trigger-matrix.test.mjs docs/notification_system_design.md
git commit -m "docs(notifications): record deferred registration notice and staff confirmation resend policy"
```

- [ ] **Step 7: Stop and hand the integration decision to the user**

Run `superpowers:finishing-a-development-branch` (verify the suite on the final tree first) and present the merge/PR/keep menu. **Applying `20261031170000_staff_resend_email_confirmation.sql` to production requires a separate explicit approval** — `supabase db push` without `--local` writes to the hosted database.

---

## Known accepted gaps (state these in the completion report)

1. Confirming an applicant's email from the Supabase dashboard or with `email_confirm: true` bypasses both in-app landing points, so that applicant never receives the "awaiting approval" notice. They do receive the `welcome` email when approved. A `auth.users` trigger was rejected for this plan because email copy would then live in two places.
2. An applicant who already received the pre-change sign-up receipt is deduped by the unchanged `signup_receipt:user:{id}` key and will not get the new confirmation-triggered copy.
3. The re-sent link is a single-use `magiclink` verification token, so it both confirms the email and starts a session, exactly like Auth's own magic-link mail. `/verify` is IP rate-limited by Supabase (360 requests per hour) and the club-side resend is cooldown-limited (15 minutes per applicant).

---

## Spike result (Task 1, executed 2026-10-31 on the local stack)

All Task 1 steps completed: `[auth.email] enable_confirmations` was temporarily set to
`true`, the stack restarted, `resend-spike.mjs` run, then the script was deleted,
`supabase/config.toml` reverted (`enable_confirmations = false` at :227) and the stack
restarted. `git status --short` shows no spike artifacts. Three spike auth users plus the
`member_profiles` rows created by the local `handle_new_user` trigger were deleted from the
local database (`auth.admin.deleteUser` fails on those rows because `member_profiles_id_fkey`
is RESTRICT — a RESTRICT FK, so cleanup needed SQL).

1. **`generateLink({ type: "magiclink" })` on an existing, unconfirmed user: succeeds.**
   `error: null`, `verification_type: "magiclink"`, `hashed_token` is **56 lowercase hex
   characters** (`/^[0-9a-f]{56}$/`), plus a 6-digit `email_otp` we do not use.
   `action_url` is `null`; only `action_link` is returned, and it is an **absolute**
   `http://127.0.0.1:54321/auth/v1/verify?token=…&type=magiclink&redirect_to=…` URL — which
   `notification_outbox.cta_url like '/%'` rejects. This confirms Task 4's `/auth/confirm`
   route is required rather than a nice-to-have.
2. **`generateLink({ type: "invite" })` also succeeds** with the same shape
   (`verification_type: "invite"`), but `invite` is the wrong semantic for an applicant who
   already owns the account, so it is not used.
3. **Credentials are not destroyed.** With confirmations enabled, `signInWithPassword` before
   verification returns `Email not confirmed` — that is the confirmation gate, not a
   password reset. After `verifyOtp` the same password authenticated successfully
   (`password intact after confirmation: true`), proving `generateLink` leaves
   `encrypted_password` untouched.
4. **`verifyOtp({ token_hash, type: "magiclink" })` confirms the address** —
   `email_confirmed_at` becomes non-null and `error` is null. `type: "invite"` behaved the
   same for an invite token.

**Decision: proceed.** Tasks 4, 6 and 7 use the literal `"magiclink"` (Task 4's pinned
`verificationType`, Task 6's `ctaPath` query parameter, Task 7's assertion) and
`token_hash` values matching `/^[0-9a-f]{8,512}$/`. Task 4's `readConfirmRequest` length
window (8–512) already admits a 56-char hex token.

Deviation from the plan's Step 2/4 ordering: the two token variants were verified in
separate runs (one fresh user per variant) rather than both against one user, because
verification tokens are single-use and the second variant would have been tested against an
already-confirmed address. Same evidence, one extra user (also deleted).
