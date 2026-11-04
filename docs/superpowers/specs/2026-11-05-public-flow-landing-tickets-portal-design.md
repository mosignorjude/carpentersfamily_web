# Public Flow: Landing Page, Box Office, Membership Intake, Member Portal

**Goal:** Give the club a public front door (`/` landing page), a real online till (`/tickets`)
that writes into the existing ticket-sales ledger, a staffed review path for those orders,
invitation-only account creation fed by two public intake forms, and a dedicated member
portal at `/portal`.

**Architecture:** One ledger, two admission doors. `public.event_ticket_sales` stays the single
source of truth for both officer-recorded and guest-purchased tickets, distinguished by a new
`source` column, and its existing `verification_status` column becomes the order lifecycle.
Everything that consumes capacity or moves money reads approved rows only, so a guest's
unverified transfer changes no balance. Public writes go through `security definer` RPCs
granted to `anon` — no table privileges, no RLS policies for strangers. The landing page is a
public read of the already-anon-granted `get_public_ticketed_events()` and never touches the
session.

**Date:** 2026-11-05 (brainstormed 2026-11-04)
**Status:** Approved by the human partner in conversation; awaiting written-spec review.

---

## 1. Problem statement

Today the site has no landing page. `/` is the auth-state router: an anonymous visitor is
shown the sign-in form and nothing else. `/tickets` renders a storefront that cannot be bought
from — there is no submit control and no server action behind "buy a ticket" — and its header
button sends a signed-in member to `/events` while sending a stranger to `/`, which is the same
sign-in form. There is no public path from interest to membership, and `/signup` lets any
stranger create an account and enter the officer review queue directly.

## 2. Decisions locked during brainstorming

Numbered so a later ruling can be traced. Superseded rulings are kept visible rather than
silently deleted.

1. `/` becomes the public landing page. Sign-in and every auth-state screen move to `/portal`.
2. Buying a ticket holds an order, then an officer confirms the transfer. No payment gateway.
3. Checkout is guest-run. The buyer gets an order reference; the portal does not link the order
   by email address. *(Superseded within this spec: see 4 — members do not buy tickets, so the
   email-matched "My tickets" view is dropped entirely.)*
4. Members do not buy tickets. Officers record tickets they sold physically and hand them over
   physically. Anyone buying online uses `/tickets`.
5. Online sales are **not** a new table. They are rows in `event_ticket_sales`, because that
   table already has the review lifecycle, receipts, audit trail, and the Inspect UI.
6. Only `approved` rows consume tier capacity or enter the cash totals — for online **and**
   officer-recorded sales alike.
7. Approval is blocked once an event closes.
8. `cancelled` is added as a fourth terminal status, separate from `rejected`. `rejected` means
   money arrived and must go back; `cancelled` means nothing must be returned.
9. Unpaid orders do not hold seats. Consequence: no expiry timer and no `pg_cron` sweep.
10. Guests upload proof of payment with the order; an officer verifies it and approves; the
    buyer is emailed at creation and at confirmation.
11. When an event closes, nothing may still await review — the close is blocked, not
    auto-cancelled. *(Supersedes the earlier ruling "auto-cancel open orders when the event
    closes": an officer cancels a dead order deliberately, so no stranger's payment evidence is
    voided by a clock. Also removes the planned "allow `recorded → cancelled` after close"
    exception in the write guard — with the gate nothing is in `recorded` after close.)*
12. Landing page content comes from the human partner's mockup
    (`C:\Users\HomePC\Downloads\carpenters_family_social_club_landing_page.html`), not from
    invented copy.
13. Request Membership is a public intake form, distinct from `/signup`. `/signup` is not
    public.
14. An approved request becomes an account through an emailed single-use invite link.
15. Invite senders are Admin, President, Executive (and Backup Admin — included deliberately;
    they already reopen events and self-verify sales). **Staff are excluded**, per the ruling
    on 2026-11-05.
16. Partner With Us / Book Services is its own public intake form.
17. The profit-sharing claim is removed from public copy. Everything else the mockup says stays.

## 3. Routes and flow

### Before → after

| Route | Today | After |
|---|---|---|
| `/` | auth-state router: sign-in form, staff → `/admin`, member → home dashboard | public landing page, no session read |
| `/portal` | does not exist | sign-in form + all auth-state screens + member home dashboard |
| `/tickets` | storefront, no write path | storefront + guest checkout |
| `/tickets/order` | does not exist | public order-status lookup (reference + email) |
| `/signup` | public self-registration | gated: valid invite token or the invitation-only notice + request form |
| `/forgot-password`, `/reset-password` | public | **unchanged** — closing signup must not lock out a member who forgot a password |

The member navigation in `src/lib/app-navigation.mjs:13` changes `{ href: "/", label: "Home" }`
to `/portal` and gains a "Box office" item pointing at `/tickets`. The storefront header button
in `src/components/tickets/tickets-storefront-view.tsx`, which today is
`href={isAuthenticatedMember ? "/events" : "/"}` labelled "Member Portal"/"Member Sign In",
points at `/portal` in both states.

### Redirect rewrites required by the move

`/` is currently the target of roughly fifty `/?notice=…` redirects and six `redirect("/")`
calls, including `signInAction` and `signOutAction` in `src/app/actions.ts:1315` and `:1670`, the
three staff notices emitted by `src/app/(staff)/layout.tsx:6` and `src/lib/staff-access.server.ts`,
and `googleSignInAction` at `src/app/actions.ts:1376`. Every one moves to `/portal`. There are no
test assertions on those strings today, so the rewrite is mechanical — but it must be complete,
because a stray `/?notice=denied` now lands a member on a marketing page.

**Blocking pre-flight audit, before any route moves:** query production for the distinct stored
values of `notification_outbox.cta_url`. The outbox requires a relative URL
(`20261027000000:344`), so any historical row holding bare `/` becomes a dead-end link the day
this ships; those rows need a corrective update or a mapping in the reader.

### The guest purchase, end to end

1. A stranger lands on `/`, reads the club, taps "Box office" → `/tickets`.
2. They pick an event and tier, choose a quantity, copy the account number and the suggested
   narration, and transfer the money through their own banking app. Nothing is reserved.
3. They complete the order form: buyer name, phone, email, and a proof-of-payment file
   (pdf/jpg/png, ≤ 4 MB).
4. The submit calls `submit_ticket_order`, which inserts one row: `source='online'`,
   `verification_status='recorded'`, `seller_id` null, a generated `public_reference`, and the
   receipt attached through the existing R2 receipt pipeline.
5. They immediately receive an acknowledgment email with the reference and what happens next.
6. An officer opens the event dashboard → Tickets tab → Inspect, compares the voucher against
   the bank statement, and approves, rejects, or cancels.
7. The buyer receives the outcome email. On approval the row enters capacity and both cash
   totals; on rejection or cancellation it enters neither.
8. At any time they can return to `/tickets/order` and enter reference + email to see status.

### The member/officer path (unchanged in shape)

An officer records a physical sale exactly as today through `recordEventTicketSaleAction`
(`src/app/actions.ts:2716`), the row lands as `recorded` with `source='manual'` and
`seller_id` = that officer, and a second officer approves it under the existing
segregation-of-duties rule.

## 4. Ticket ledger: schema and statuses

### `public.event_ticket_sales` additions

```sql
alter table public.event_ticket_sales
  add column source text not null default 'manual'
    constraint event_ticket_sales_source_check check (source in ('manual', 'online')),
  add column buyer_email text,
  add column buyer_phone text,
  add column public_reference text;

alter table public.event_ticket_sales alter column seller_id drop not null;

alter table public.event_ticket_sales
  add constraint event_ticket_sales_source_seller_check check (
    (source = 'manual' and seller_id is not null and created_by is not null)
    or (source = 'online' and seller_id is null and created_by is null
        and buyer_email is not null and buyer_phone is not null
        and public_reference is not null)
  );
```

`created_by` also becomes nullable, because an online row has no authoring member. The CHECK is
what keeps the two shapes from blurring: an online row that carries a seller is a constraint
violation, not a judgement call.

The existing `event_ticket_sales_verification_status_check`
(`supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql:34`) is dropped and
re-added with a fourth value, so the lifecycle is `recorded | approved | rejected | cancelled`.
`event_financial_transactions` keeps its three values — `cancelled` exists only for ticket sales.

`buyer_email` reuses the house normalization and validity rules already written for the outbox
(`20261027000000:109`): `lower(btrim(...))`, length 3–320, and the same single-@ pattern.
`buyer_phone` is normalized to digits with an optional leading `+`, checked 10–15 digits, and
`!~ '[[:cntrl:]]'` like `buyer_name`.

`public_reference` is eight characters from an unambiguous alphabet
(`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, no I/O/0/1), generated inside the definer function from
`gen_random_bytes()` with a retry on collision, and protected by:

```sql
create unique index event_ticket_sales_public_reference_key
  on public.event_ticket_sales (public_reference)
  where public_reference is not null;
```

### Grants — the trap to avoid

Event finance tables grant `SELECT` **per column**, so an ungranted new column silently empties
whole dashboard reads rather than erroring. Every new column on `event_ticket_sales` must be
granted to `authenticated` explicitly in the same migration: `source`, `buyer_email`,
`buyer_phone`, `public_reference`. `anon` and `service_role` receive no table privileges at all,
matching the pre-existing posture where `service_role` cannot select `event_ticket_sales` or
`public.events` columns.

### Read sites that must change, together, in one migration

| Site | Today | After |
|---|---|---|
| `private.event_cash_totals(uuid)` in `supabase/migrations/20261102150000_club_event_shared_balance.sql` | inflow sums `event_ticket_sales where refunded_at is null`; income sums transactions with no verification filter; neither leg filters `verification_status` | both legs additionally require `verification_status = 'approved'` |
| the capacity check inside `private.guard_event_ticket_sale_write` (`20261003102501`) | `sum(quantity) where tier_id = new.tier_id and refunded_at is null` | additionally `verification_status = 'approved'` |
| `public.record_event_ticket_sale` pre-check (`20261003102501`) | same sold-vs-capacity arithmetic | same additional filter |
| `public.get_public_ticketed_events()` (`20261101010000:428`) | `tier_sales` sums `where refunded_at is null and coalesce(verification_status,'approved') <> 'rejected'` | `where refunded_at is null and verification_status = 'approved'` |
| `src/app/(member)/events/page.tsx:83` | `.select("event_id,quantity").is("refunded_at", null)` | add `.eq("verification_status", "approved")` |
| `src/app/(member)/events/[eventId]/dashboard/page.tsx:352` | `const activeSales = allSales.filter((s) => !s.refunded_at)` drives `soldCount` at `:357` and projected revenue at `:530` | approved-only for the arithmetic |
| `src/lib/home-dashboard.mjs:463` `countTicketsSold` | `.is("refunded_at", null)` club-wide | add approved filter |
| `private.event_finance_report_summary(uuid, date, date)` (`20261013040328:484`) | **three** ticket-sales aggregates — `ticket_income_ngn` (`:514`), `tickets_sold` (`:526`) and the sales half of `net_result_ngn` (`:545`) — plus five transaction sums; none filters `verification_status` | every leg additionally requires `verification_status = 'approved'`; see "The date-range branches" in this section |
| `src/app/api/events/[eventId]/finance-report/route.ts:171` | streams sale rows for the report document, filtered by `refunded_at is null` when no date range | the row list keeps its shape and gains `verification_status` in the select so the reader can see staged rows; its totals come from the RPC above, not from JS |

The dashboard **row fetch** at `dashboard/page.tsx:227` deliberately stays whole-ledger: that
array is the officer review queue, and `recorded` and `cancelled` rows must be visible in it.
Only the derived numbers narrow. The three-value casts at `:696` and `:731-735`
(`"recorded" | "approved" | "rejected"`) and the `status: s.refunded_at ? "voided" : "posted"`
mapping gain `cancelled`, which renders as its own state rather than borrowing "voided".

Why one migration: the club balance is computed live from these helpers. Applying the schema in
one deploy and the arithmetic in another would leave a window where production sums a set nobody
approved. Production currently holds **zero** `recorded` rows, verified on 2026-11-04, so moving
to approved-only shifts no existing balance — the change is safe on deploy day precisely because
the staged queue is empty today.

### The date-range branches

`private.event_finance_report_summary` does not use a flat `refunded_at is null` filter when a
date range is supplied. Each of its three sales aggregates has two shapes: with no range it counts
a sale unless `refunded_at` is set; with a range it adds sales created inside the window and
subtracts sales *refunded* inside the window, so a refund lands in the period the money actually
left. Adding an approved-only rule there means touching both branches of all three `CASE`
expressions, and the two branches are not symmetric:

* the **add** branch gains `and s.verification_status = 'approved'`;
* the **subtract** branch gains the same filter — and this is the part that matters. A `rejected`
  row carries both `verification_status = 'rejected'` and `refunded_at`, because the review
  function writes them together. If the subtract branch kept matching it, a sale created *before*
  the window and rejected *inside* it would subtract money that was never added, understating that
  period by its full amount. Only approved money ever entered the totals, so only approved rows
  may leave them.
* a genuine refund of an approved sale keeps `verification_status = 'approved'` and sets
  `refunded_at`, so it still subtracts in both shapes. `cancelled` rows touch neither branch,
  having never counted and never having been refunded.

The pgTAP suite for this function must cover the four combinations — approved-before/refunded-in,
created-and-rejected-in-range, cancelled-in-range, approved-and-live — across both the ranged and
un-ranged shapes.

## 5. The close gate

Lives in `private.set_event_status` (`supabase/migrations/20261003101500_events_roles_budgets_lifecycle.sql:978`),
inserted after the `for update` lock on the event row (`:1020`) and before the status `update`
(`:1034`). Only for `p_status in ('completed', 'cancelled')`.

```sql
if p_status in ('completed', 'cancelled') then
  select
    (select pg_catalog.count(*) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.verification_status = 'recorded'),
    (select pg_catalog.count(*) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.verification_status = 'recorded')
  into v_pending_sales, v_pending_transactions;

  if v_pending_sales > 0 or v_pending_transactions > 0 then
    raise exception using errcode = '22000',
      message = 'Ticket sales or transactions still await review on this event.';
  end if;
end if;
```

The message is deliberately phrase-stable rather than count-bearing: raw database messages never
reach the browser. `rpcErrorNotice` (`src/lib/rpc-error-notice.ts:52`) pattern-matches them into
allowlisted notice codes, so a count in the message would be discarded anyway, and putting an
addressable number on screen leaks nothing useful. The counts go into the audit log entry.

Because the gate runs before the update, an event cannot be closed while anything is staged, and
therefore nothing can be in `recorded` after close. That is why the write guard needs no
post-close cancel exception: its existing rule — refuse any write when
`events.status <> 'scheduled'` — stays exactly as it is.

Reopening stays admin/backup-admin only (`:1003-1009`), and the same-status early return at
`:1025` runs before the gate, so re-submitting the current status remains a no-op rather than an
error.

## 6. Guest till: write path, throttling, receipts, email

### The RPC

```sql
create or replace function public.submit_ticket_order(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_idempotency_key uuid,
  p_receipt_file_name text,
  p_receipt_object_key text,
  p_receipt_content_type text,
  p_receipt_size_bytes bigint,
  p_receipt_sha256 text
) returns text  -- the public_reference
```

`security definer`, `set search_path = ''`, `revoke all from public, anon, authenticated,
service_role`, then `grant execute ... to anon`. Only this function can create an online row;
`anon` holds no `INSERT` on the table, and the guard's new branch (below) only accepts a row that
already matches the online shape.

The function validates, in this order: quantity 1–1000 and buyer-name rules matching the table
CHECKs; `private.is_valid_email(p_buyer_email)`; phone shape; tier belongs to the event and is
not retired; event is `scheduled`, unarchived, `ticketing_enabled`; `unit_price_ngn` equals
`tier.price_ngn`; the throttle counts; the idempotency key has not already produced an order.
It locks the event row `for update`, generates `public_reference`, inserts, appends the audit
entry, and returns the reference. A duplicate `p_idempotency_key` returns the existing row's
reference instead of raising, so a double-clicked submit cannot create two orders and the client
still gets a reference to show.

### The write guard branch

`private.guard_event_ticket_sale_write` currently requires, for INSERT, an active-member session
and `new.seller_id = auth.uid()`. It gains a row-shape-only branch taken **before** those checks:

```sql
if new.source = 'online' then
  if v_actor_id is not null then
    raise exception ... 'Online ticket orders cannot be recorded by a signed-in member.';
  end if;
  -- no seller/created_by, status must be recorded, refunded_at must be null,
  -- unit_price must equal the tier price, event must be scheduled
  return new;
end if;
```

An authenticated actor is forbidden from creating an `online` row: officers have their own path
with their own attribution, and letting them mint unattributed sales would defeat the ledger's
accountability. The event-status check that already runs for both INSERT and UPDATE applies
unchanged, so the till closes the moment the event does.

UPDATE is untouched. No one edits an online order except through the review function, which is
how `recorded → approved | rejected | cancelled` happens.

### Throttling

Enforced in the definer function, because that is the only place a stranger cannot bypass. The
database cannot see an IP address, so the authoritative guards are email- and event-scoped, with
the server action adding the cheap front-of-house defences.

* at most **3** live (`recorded`) online orders per normalized email per event;
* at most **20** live online orders per event in total, so a flood cannot pile up an officer's
  queue faster than they can clear it;
* at most **5** live online orders per normalized email across all events;
* in the server action: a hidden honeypot field, a minimum elapsed-time check between form render
  and submit, and the existing 4 MB file / 4.5 MB request byte ceilings
  (`src/lib/finance-receipt-validation.ts:1`).

Each limit raises a distinct, phrase-stable message and gets its own notice code (§13), so a
blocked buyer is told to try a different address or contact the club rather than shown
"something went wrong".

### Receipts

Reuse what already exists and is already strong: `validateReceiptBytes` enforces size, extension
allowlist (pdf/jpg/jpeg/png), exact MIME match, magic-byte signatures, and filename sanitization
— adequate for a stranger's upload with no changes. Storage goes through the same
`runReceiptEntry` + `getR2StorageAdapter()` path as officer-recorded sales, with
`scope: "event_ticket"` and the new row's id as `targetId`.

**Guests never see the stored file.** Receipt viewing is an active-session, DB-resolved route
(`docs/threat-model.md:180`), and it stays that way. The status lookup returns order state, not
evidence.

### Email

Two new helpers in `src/lib/email/notifications.ts`, following the existing `queueSingle` +
`triggerType` shape, and needing **no schema change**: `notification_outbox.recipient_email` is
`not null` while `recipient_user_id` is nullable (`20261027000000:82`), so a non-member address is
already supported; `trigger_type` is a free-form pattern (`:326`), not an allowlist.

| trigger type | sent when | contains |
|---|---|---|
| `ticket_order_received` | the order row is created | reference, event title and date, tier, quantity, amount, the account number and narration to use, "awaiting confirmation", the `/tickets/order` link |
| `ticket_order_reviewed` | an officer approves, rejects or cancels | the decision, ticket details on approval, the officer's reason on rejection or cancellation, the status-lookup link |

Enqueued from the server action after a successful RPC, matching the existing pattern
(`notifyEventCancelled` after `set_event_status`). Accepted tradeoff, same as today: an action
whose database write succeeds but whose enqueue fails loses that email; the idempotency key makes
a retry safe rather than duplicating.

Idempotency keys are derived, not random: `ticket-order-received:<sale id>` and
`ticket-order-reviewed:<sale id>:<decision>`, so the second approval click of a double-submitted
review cannot send two emails.

### Status lookup

`GET /tickets/order?ref=…&email=…` renders from a `stable` definer function
`public.lookup_ticket_order(p_reference text, p_email text)`, granted to `anon`, that returns a
single row's event title, tier name, quantity, amount, reference, created date, status, and —
for rejected or cancelled — the stored reason. Both inputs must match; any mismatch returns no
rows rather than an error, so the endpoint cannot be used to confirm that a reference exists.
Returns exactly the fields above, never the receipt, never the buyer's phone, never another
buyer's row. 128 bits of reference space behind an email match is not enumerable.

The page itself is a plain form with no session dependency, and its results are never cached.

## 7. Officer review queue

No new page. `src/components/events/dashboard/tab-tickets.tsx` already renders the ticket ledger
and already opens `voucher-inspection-drawer.tsx`, which already calls
`verifyEventTicketSaleAction` (`:80`, `:113`).

**Ledger row, online shape** — the columns as specified by the human partner:

| Ref & Date | Description & Counterparty | Category | Amount (NGN) | Voucher Evidence | Review Status | Actions |
|---|---|---|---|---|---|---|
| `K7M2QX9B` · 5 Nov 2026 | `3 × Standard — Chidi Obi` | Online sales | ₦45,000 | View uploaded receipt | Pending | Inspect |

Manual rows keep today's "Sold by <member>" attribution
(`dashboard/page.tsx:708` reads `sellerId`); online rows read "Online", because `seller_id` is
null and the authorizing officer is already recorded in `verified_by`. Category reads the `source`
column, not a new table.

**Decisions.** `verify_event_ticket_sale` gains `cancelled` alongside `approved` and `rejected`,
so one review function owns the whole lifecycle and the audit action stays
`event_ticket_sale_verified` with the decision in `after_data`. Reason rules: approved optional;
rejected requires ≥ 5 characters (existing); cancelled requires ≥ 5 characters — a stranger is
waiting on that email, so it gets the same bar as rejection. State effects:

* `approved` → sets `verified_by`, `verified_at`, clears `rejection_reason`; now counts toward
  capacity and both cash totals.
* `rejected` → also sets `refunded_at`, `verified_at`, `refund_reason` = the reason. Money
  arrived and must go back.
* `cancelled` → sets `verified_by`, `verified_at`, `rejection_reason`; touches **neither**
  `refunded_at` nor `refund_reason`. Nothing arrived, so there is nothing to return.

Both `rejected` and `cancelled` are terminal, and neither consumes capacity.

**Who may act** is unchanged: active member holding `admin`, `backup_admin` or `executive`, or an
event lead (`20261028000000`). The existing segregation-of-duties rule compares the actor to the
row's author — for online rows that value is null, so the comparison can never match and any
authorised officer may approve any online order. That is intended: no officer owns a stranger's
transfer.

**Email on review** goes through `ticket_order_reviewed`, fired from the same action
(`verifyEventTicketSaleAction` in `src/app/(member)/events/[eventId]/dashboard/actions.ts:61`,
which must widen its `decision` union and add the ≥ 5-character rule for `cancelled` at `:71`).

## 8. Membership intake and invitation-only signup

### 8.1 `public.membership_requests`

```sql
create table public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(first_name)) between 1 and 80
    and first_name !~ '[[:cntrl:]]'
  ),
  last_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(last_name)) between 1 and 80
    and last_name !~ '[[:cntrl:]]'
  ),
  email text not null check (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    and pg_catalog.char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  phone text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  why text not null check (pg_catalog.char_length(pg_catalog.btrim(why)) between 20 and 2000),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'invited', 'converted', 'dismissed')),
  assigned_to uuid references public.member_profiles (id) on delete set null,
  handled_by uuid references public.member_profiles (id) on delete set null,
  handled_at timestamptz,
  dismissal_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
```

The 20-character minimum on `why` is the cheapest filter that actually works: it stops "test"
submissions and gives an officer something to open a conversation about.

Write path: `public.submit_membership_request(p_first_name, p_last_name, p_email, p_phone,
p_why)` — definer, granted to `anon` and `authenticated`, validating with
`private.is_valid_email` (`20261027000000:242`) and the phone pattern, then throttled to **one
live request per normalized email** (any status other than `converted` or `dismissed`) and a
**global 40-per-day ceiling** so a flood cannot bury the queue. A duplicate live request returns
the existing id silently rather than raising, so the applicant is told "we already have your
request" instead of an error.

Officers are notified through the pattern that already exists: `notifyNewMemberSignUp`
(`src/lib/email/notifications.ts:215`) fans out to `resolveOfficerContacts()`
(`src/lib/notifications/outbox-service.ts:237`) with a CTA. The new `notifyMembershipRequest`
uses trigger type `membership_request`, subject `New membership request — <First Last>`, a
details block of name/email/phone/reason, and CTA "Open Membership Requests" →
`/officers/membership-requests`.

Read path: `public.list_membership_requests(p_status text, p_search text)` and one function per
transition — `assign`, `mark_contacted`, `dismiss(p_reason)`, `invite`. All definer, all gated by
the sender predicate in §8.5, all auditing. No `SELECT` policy is granted on the table itself:
officers reach it through functions, consistent with the hardened `public` schema.

### 8.2 `public.partnership_enquiries`

```sql
create table public.partnership_enquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(full_name)) between 1 and 120
    and full_name !~ '[[:cntrl:]]'
  ),
  company text check (
    company is null
    or (pg_catalog.char_length(pg_catalog.btrim(company)) between 1 and 120
        and company !~ '[[:cntrl:]]')
  ),
  subject text not null check (
    pg_catalog.char_length(pg_catalog.btrim(subject)) between 20 and 2000
    and subject !~ '[[:cntrl:]]'
  ),
  email text not null check (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    and pg_catalog.char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  phone text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'closed')),
  assigned_to uuid references public.member_profiles (id) on delete set null,
  handled_by uuid references public.member_profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
```

`membership_requests.email` and `partnership_enquiries.email` carry the identical normalized-address
CHECK, written out in both tables from the outbox rule (`20261027000000:109`) rather than derived
from a shared function, so neither constraint can change underneath the other. The `subject`
minimum of 20 characters is the same anti-noise rule as `why`.

Fields exactly as specified: full name, company/brand optional, a subject/description free-text
field for what they want to partner for or book, and contact email + phone. Same definer write
function (`submit_partnership_enquiry`), same email-dedupe throttle, same officer fan-out with
trigger type `partnership_enquiry` and a CTA to `/officers/enquiries`. Read and transition
functions mirror §8.1.

### 8.3 `/signup` becomes invitation-only

The page reads `?token=` and calls a `stable` definer `public.lookup_signup_invite(p_token)`
that returns only whether a live, unexpired, unconsumed invite exists and the address it was
issued to. With no valid token the page renders the invitation-only notice — the mockup's "By
Invitation & Vetted Merit" language — plus the Request Membership form. The registration
fields are not in the HTML at all for a gated visitor.

`signUpAction` (`src/app/actions.ts:1328`) enforces the same rule on POST, because a server action
is reachable without ever rendering the page: it requires `p_token`, resolves the invite, and
refuses anything invalid before calling `supabase.auth.signUp`.

### 8.4 `public.member_invites` and the redemption dance

```sql
create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.membership_requests (id) on delete restrict,
  email text not null,
  token_hash text not null unique,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz
);
```

`request_id` is `not null`: an invite exists only for someone who came through the form.
Walk-in invites for people who never submitted are a separate spec, and a nullable FK plus a
second UI for it would be designed-for-hypothetical work.

Token: 32 hex characters from `encode(gen_random_bytes(16), 'hex')` generated inside the
creating function. Only `encode(digest(raw, 'sha256'), 'hex')` is stored — the raw token exists
for one transaction and is never written to a column. `expires_at` is 72 hours. Issuing a new
invite sets `revoked_at` on any live invite for that email first, and the notification
idempotency key is derived from the invite id, so a double-clicked button cannot send two links.

Redemption is claim-then-finalize rather than check-then-signup, across two functions:

1. `public.claim_signup_invite(p_token, p_email)` — verifies the hash, expiry, and that the
   submitted address **equals** the invite address; sets `claimed_at` if older than 15 minutes or
   null; returns the invite id and the address.
2. `supabase.auth.signUp(...)` is then called with the **invited address**, never the typed one.
   Accepting arbitrary input alongside a valid token would let that mint an account for someone
   else. The action's existing `email` field is dropped from the invite path.
3. `public.finalize_signup_invite(p_invite_id)` sets `consumed_at` and moves the request to
   `converted`. If step 2 fails — most likely an address collision with an existing account —
   the claim is released by clearing `claimed_at`, so the applicant can retry or an officer can
   re-issue. Burning an invite on a collision would strand a legitimate applicant.

An invited person who signs up still lands as `pending`, exactly as today, because officer
approval at `/officers/members` is the second gate and the existing approval, dues, and SoD
paths assume it. **The invite grants the right to register, not membership.** The request's
`invited → converted` transition tracks the funnel; `assigned_to` records who is handling it.

### 8.5 The sender predicate — staff excluded

Club roles are exactly `executive | admin | backup_admin | president`
(`supabase/migrations/20261029121000_president_role_and_alias.sql:9`). "Staff" is not a role: it
is a `member_profiles.status` value (`20261029120000:8`), and that migration's own header states
*"Staff are a non-member population. They never satisfy the member gates."*
`private.is_active_club_member()` (`20261002135252:128`) returns false for a staff account, and a
staff account holds no club-role rows.

Per the ruling of 2026-11-05, staff are **excluded** from sending invites. The predicate is
therefore the plain member-gate form, and `private.is_staff_administrator()` is deliberately not
consulted:

```sql
if not (select private.is_active_club_member()) then raise ... end if;
if not (   (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))
        or (select private.has_club_role('president'))
        or (select private.has_club_role('executive')) ) then
  raise exception using errcode = '42501', message = 'Not authorized to issue membership invites.';
end if;
```

`backup_admin` is included on the reasoning in §2.15; strike it from this list if the intent was
strictly the three named roles. The same predicate governs every read and transition function on
`membership_requests` and `partnership_enquiries`, so the officer-queue surface and the invite
surface cannot drift apart.

## 9. Landing page port

Source of truth: `carpenters_family_social_club_landing_page.html` in Downloads. Its layout,
section order, copy and palette are the design; the app's design system already contains its
tokens.

### Palette: already the app's design system

| mockup class token | existing `@theme` variable (`src/app/globals.css:58`) | hex |
|---|---|---|
| `forest` | `--color-forest` | #174c37 |
| `deep` | `--color-deep-forest` | #0c3325 |
| `cream` | `--color-warm-canvas` | #faf6f0 |
| `linen` | `--color-linen` | #e5ddd3 |
| `espresso` | `--color-espresso` | #3d291f |
| `body` | `--color-body` | #5c4638 |
| `umber` | `--color-muted` | #7a685d |
| `ochre` | `--color-ochre` | #d6a23a |
| `terra` | `--color-terracotta` | #ba3c2a |

All nine exist today, so the port renames classes (`bg-deep` → `bg-deep-forest`, `text-cream` →
`text-warm-canvas`, `text-umber` → `text-muted`, `bg-terra` → `bg-terracotta`) and **deletes** the
`<script src="https://cdn.tailwindcss.com">` tag and the inline `tailwind.config` object. The app
is Tailwind v4 (`tailwindcss ^4.3.3`, `@import "tailwindcss"` at `globals.css:1`, `@theme` at
`:53`) and the CDN runtime is not a shipping option.

**The mockup palette and the storefront palette are the same palette, duplicated.**
`src/components/tickets/tickets-storefront-view.tsx` hardcodes `#FAF6F0`, `#3D291F`, `#174C37`,
`#E5DDD3`; those move to the tokens as part of this work, since it is the file the new till flow
edits anyway.

### Typography

DM Sans is already self-hosted through `next/font/local`
(`src/app/layout.tsx:9`, woff2 subsets in `src/fonts/`). The Google Fonts `<link>` block goes.
**Fraunces is the only genuine font addition**: the mockup sets every heading in it, no serif
token exists in `@theme`, and `font-serif` currently resolves to Tailwind's default stack (only
one component uses it today). Add `--font-serif` to `@theme`, a `localFont` entry mirroring
`dmSans`, and the `Fraunces-*.woff2` files (SIL OFL, weights 500 and 700, plus italic 500 for the
hero tagline) in `src/fonts/`.

### Structure and section inventory

`src/app/page.tsx` becomes a public server component that **never calls
`supabase.auth.getUser()`** — today it branches on the session at `:88`, `:210`, `:231`, `:307`,
`:327`, `:415`; all of that moves to `/portal` intact, including the staff redirect. Blocks live
in `src/components/landing/`. Section ids are preserved verbatim because the nav, the CTA anchors
and the constitution modal depend on them:

| block | id | static or data |
|---|---|---|
| announcement ribbon (next gathering, countdown, ticket CTA) | — | **data** (see "Data-driven parts") |
| sticky header: crest, nav, portal button, 4 social icons | — | static, portal button → `/portal` |
| mobile slide-over drawer | `drawer` | static |
| hero "Rooted in Family. Driven by the Vibe." | `about` | static + photo |
| Vision / Mission / Values, three inline-SVG columns | `vision` | static |
| What We Do, collage + 3 numbered pillars | `what-we-do` | static + 2 photos |
| Events & Lifestyle: 4 tiles + filter tabs + 3 cards | `events` | tiles static, **cards data** |
| Financial Integrity & Stewardship, Charter of Values accordion | `leadership` | static |
| Membership 3-step timeline + Voices of the Family | `membership` | static |
| full-width CTA band | — | static + photo |
| green footer | `footer` | static |

Nine inline SVG illustrations (eye, trophy, orbits, three numbered markers, footer marks) port
verbatim — they are already markup, not assets.

### Data-driven parts

The ribbon's "Next gathering" text, its `#count` countdown, and the Upcoming cards all read
`public.get_public_ticketed_events()` — already granted to `anon` and `authenticated`
(`20261101010000:428`), already filtered to `status='scheduled'` and `ticketing_enabled` and
ordered by `starts_at`. **No new RPC and no new grant.** After §4 its `sold` counts are
approved-only, so the landing page and the till agree with the ledger.

Dates and times go through `src/lib/event-times.mjs` (Africa/Lagos, `en-GB`, shared 12-hour clock)
and the multi-day span helpers, so a `duration_days = 3` gala renders as a span and every clock
reads `6:00 PM`, not `18:00`.

The landing page is statically regenerated (`revalidate`, target 300 seconds) so the countdown
and availability are near-live without a per-request database round trip; `/tickets` keeps
`dynamic = "force-dynamic"`. Which exact Next 16 API expresses this is confirmed against
`node_modules/next/dist/docs/` during planning — repo instructions require reading those docs
before writing code, and this block must not be written from memory of an older Next.

### Links that change meaning

Hardcoded event cards ("Annual End-of-Year Gala · Dec 2026", "The SLK Rave") are fiction once the
till is live, so:

* ribbon "RSVP / Tickets" → `/tickets` (was `#events`);
* each upcoming card's "View Schedule & Details" → `/tickets`. No public event-detail page is
  invented — the storefront already lists that event with its tiers, and a `/events/[id]` public
  route would sit confusingly beside the member route group;
* past/lifestyle tiles keep their detail popup, ported as a typed React modal (title, meta,
  badge, description props) instead of parsing `data-open="A|B|C|D"` pipe-delimited strings;
* "Explore Past Events →" stays `#events`.

### Modals

| modal | decision |
|---|---|
| `portalModal` (fake credential form) | **deleted**. Replaced by `<a href="/portal">` in header, drawer and footer. A second sign-in form would drift from the real one (Google OAuth, password reset, cookie refresh in `src/proxy.ts:90`), and its `handleModalSubmit` prints "✓ Verification link sent to your registered member phone/email" for a request that never left the browser — that fake confirmation must not ship. |
| `memberModal` (Request Membership) | becomes the real form of §8.1. |
| `partnerModal` (Partner / Book services) | becomes the real form of §8.2. |
| `constitutionModal` | kept as static content, minus the profit-sharing clause (§10). |

### Interaction

Drawer open/close, event filter tabs, modal open/close, Escape and backdrop dismissal become small
client components. A11y properties are already met by the mockup and must survive the port: 44px
minimum hit targets, `:focus-visible` 3px ochre outline, `prefers-reduced-motion` killing all
transitions, `scroll-padding-top: 84px` under the sticky header, `aria-expanded` on the drawer
trigger, `role="tablist"`/`aria-selected` on the filter tabs.

### Metadata is new, not ported

The mockup's `<head>` carries a Tailwind CDN script, an inline `tailwind.config`, a Google Fonts
`<link>` and no social preview at all — none of which ports. `src/app/layout.tsx:40` exports a
`metadata` object containing nothing but `title: clubBrand.name`, and no `openGraph` or `twitter`
key appears anywhere in `src/app` or `src/lib`. So the landing page's metadata is a new capability
rather than a ported one: `title`, `description`, and an `openGraph` + `twitter` pair pointing at
`https://www.carpentersfamily.com.ng/landing/og-share.jpg` with `alt` naming the club. Absolute URLs
are mandatory here; a root-relative `og:image` renders a blank preview card. The icon set that
already exists — `src/app/icon.png`, `apple-icon.png` — keeps working unchanged.

There is likewise no `robots.ts` or `sitemap.ts` in the project, which means every route is
crawlable today. That is harmless while the whole app is a sign-in wall, and not harmless once a
marketing page with a public till goes live: Plan B adds a `sitemap.ts` listing the public routes
explicitly and a `robots.ts` disallowing the authenticated areas. Neither is generated as a
side effect of the port.

## 10. Copy edits

Remove the profit-sharing claim from public copy wherever it appears — three places, not one:

1. `#what-we-do` pillar 03 "Family Welfare & Shared Prosperity": drop "—and share 60% of event
   profits with active participating members", keep the welfare-milestone sentence.
2. `constitutionModal`, "Stewardship & Shared Returns": keep "Dual-signatory bank authorization",
   drop "60% / 40% event profit sharing for active participating members".
3. `portalModal` subtitle "60/40 event profit ratings": gone with the modal.

Everything else the mockup asserts stays, including "Every naira recorded, with dual-signatory
bank authorization", "Open books and periodic financial reports for every active member", and the
membership timeline's 3-month probation and majority-vote induction.

## 11. Photo manifest

The eight photographs the mockup hotlinked are Unsplash stock images, sourced from the asset list
the club supplied; all eight are now on disk under `public/landing/`, and `og-share.jpg` is derived
from the hero. Their `placehold.co` `onerror` fallbacks stay deleted: a production page must not
break because a third-party CDN is unreachable, and a broken-image fallback that calls out to
another vendor is worse than no image.

| filename | slot | on disk | source `photo-` id |
|---|---|---|---|
| `hero-family.jpg` | hero band background | 1600×1067 · 439 KB | `1511632765486-a01980e01a18` |
| `what-we-do-main.jpg` | main collage photo | 1200×801 · 258 KB | `1492684223066-81342ee5ff30` |
| `what-we-do-inset.jpg` | overlapping "One Family!" card | 800×450 · 64 KB | `1529156069898-49953e39b3ac` |
| `tile-raves.jpg` | tile "Crowd Energy & Nightlife" | 900×601 · 131 KB | `1533174072545-7a4b6ad7a6c3` |
| `tile-djs-hype.jpg` | tile "Pro DJs, MCs & Hype" | 900×675 · 209 KB | `1514525253161-7a46d19cd819` |
| `tile-brand-activation.jpg` | tile "Beverage & Lifestyle Sales" | 900×546 · 73 KB | `1551024709-8f23befc6f87` |
| `tile-family-galas.jpg` | tile "Galas, Weddings & Outings" | 900×600 · 72 KB | `1519671482749-fd09be7ccebf` |
| `cta-band.jpg` | "Experience the Vibe" band | 1600×1067 · 308 KB | `1528605248644-14dd04022da1` |
| `og-share.jpg` | social link preview | 1200×630 · 171 KB | hero, centre-cropped |

Width is the binding constraint, not height: every slot renders `object-cover`, so the design
crops vertically rather than letterboxing, and the crop the photographer chose survives. `fit=max`
preserves each source's natural aspect; only `og-share.jpg` is force-cropped to 1200×630, because a
`<meta property="og:image">` has no CSS to crop it and preview consumers assume that ratio.

**These are placeholders, and the page must look right when they change.** Replacing a stock image
with the club's own is a like-for-like filename swap — no component, layout or spec text moves. Two
rules apply to any real member photo before it is committed: strip EXIF (GPS metadata in an uploaded
photo would leak the assembly venue) and treat any identifiable member as having consented to appear
on a publicly browsable site. Re-sourcing a file at a different size is
`https://images.unsplash.com/photo-<id>?fm=jpg&fit=max&w=<n>`; `fm=jpg` rather than `auto=format`, so
the bytes on disk match the `.jpg` the filename claims.

The three line-art icons in the Vision/Mission/Values band are not files. They are already inline in
the mockup at `:229`, `:246`, `:262` with `stroke="currentColor"`, which is the form to port: an
`<img>`-referenced SVG cannot inherit the palette token, and `next/image` refuses SVG sources without
an explicit dangerous config. The asset document's copies of these icons hardcode `#174C37` and
`#D6A23A`; use the mockup's `currentColor` versions, not the document's.

## 12. Error handling

Fail closed everywhere, and tell a stranger what to do next rather than that something failed.

* **Guest submit** — validation failures return to `/tickets` with a notice; the event being closed
  between page render and submit is a normal race, not an error, and reads "This event is no
  longer accepting orders"; throttle messages name their own codes (§13); receipt failures reuse
  the existing `finance-receipt-validation` reasons, already surfaced by the officer flow.
* **Never a partial order.** The row insert, its audit entry, the receipt metadata and the email
  enqueue each live in the transaction they already use; a receipt upload that succeeds and an RPC
  that fails leaves an orphan object and no row, which the existing officer flow already tolerates
  and which the storage bucket lifecycle reaps.
* **The review drawer** keeps its current behaviour of returning `error.message` inline to the
  officer — that surface is a member-authenticated form, not the public funnel.
* **The close gate** refuses with a notice that names the blocking counts in the audit row and
  points the officer at the queue, never with the raw database message.
* **The storefront's silent failure.** `src/app/tickets/page.tsx` currently wraps its RPC in
  `catch {}` and renders an empty storefront. A public till that quietly shows "no events" when
  the database is unreachable loses sales invisibly; this spec replaces it with an explicit
  "box office temporarily unavailable" state, keeping the empty-and-open state distinct from the
  failed state.
* **Invite redemption** distinguishes four outcomes with different copy: no token, token
  invalid/expired/consumed, address mismatch, and address-collision (that email already has an
  account) — the last pointing at password recovery rather than a dead end.
* **Intake forms** never reveal whether an email already submitted a request; the success message
  is the same whether a new row was created or a live one was found.

## 13. Notice codes

Each new refusal needs a visible, actionable message. Four of them are database raises that must
be translated by a `MESSAGE_RULES` entry in `src/lib/rpc-error-notice.ts:14` (the matcher at `:52`
never echoes raw text); three are decided in a server action. Every one gets an entry in
`src/lib/system-notices.ts` alongside the existing codes at `:409`-`:438`. New codes:

| notice code | trigger | officer/buyer sees |
|---|---|---|
| `pending-review-blocks-close` | §5 close gate | "Tickets and transactions still await review. Approve, reject or cancel them before closing this event." |
| `ticket-order-limit-reached` | per-email throttle | asks them to try again or contact the club |
| `box-office-closed` | event stopped accepting orders at submit time | event is no longer taking orders |
| `box-office-at-capacity` | per-event live-order ceiling | try again shortly |
| `invite-invalid` | no/expired/consumed token | invitation-only notice + request form |
| `invite-email-mismatch` | claim address ≠ invite address | use the address the invite was sent to |
| `invite-email-taken` | auth collision at signup | password recovery, then contact an officer |

Two different mechanisms, which matters for what gets built. The first four codes are produced by
`rpcErrorNotice` matching a raised database message, so the SQL and the `MESSAGE_RULES` regex have
to be pinned together — a reworded message silently degrades the notice back to
`operation-failed`:

| notice code | raised as `message =` | matched by |
|---|---|---|
| `pending-review-blocks-close` | `Ticket sales or transactions still await review on this event.` | `/still await review/i` |
| `ticket-order-limit-reached` | `This email address has too many pending ticket orders.` / `This email address has too many pending ticket orders for this event.` | `/too many pending ticket orders/i` (covers both the per-event and the all-events cap) |
| `box-office-closed` | `This event is no longer accepting ticket orders.` | `/no longer accepting ticket orders/i` |
| `box-office-at-capacity` | `The box office has reached its limit of pending orders for this event.` | `/box office has reached its limit/i` |

The remaining three codes are **not** RPC-message mappings. `lookup_signup_invite` is a read that
returns a shape, and an address mismatch or an email collision is decided by the server action, so
those notices are set directly by `redirect("/signup?notice=…")`. A test must not assert a regex
for them; it asserts the redirect. A duplicate membership request raises nothing at all — the
function returns the existing id silently and the action shows its normal success message, which is
what keeps §12's no-enumeration rule true.

## 14. Security and access-matrix deltas

`docs/data-access-matrix.md` and `docs/threat-model.md` gain rows for every new surface. The
invariants this design holds to:

* `anon` receives `EXECUTE` on exactly seven functions — `submit_ticket_order`,
  `lookup_ticket_order`, `submit_membership_request`, `submit_partnership_enquiry`,
  `lookup_signup_invite`, `claim_signup_invite`, `finalize_signup_invite` — and no table
  privileges anywhere. The three invite functions must be anon-callable because the applicant has
  no session yet, which is why they are keyed by token and by invite id rather than by
  `auth.uid()`. `get_public_ticketed_events()` was already anon-granted and is unchanged in
  signature.
* Stranger PII (`buyer_email`, `buyer_phone`, request and enquiry rows) is readable only through
  officer-gated functions. No `SELECT` policy on `membership_requests` or `partnership_enquiries`
  for `authenticated` — a passing member must not be able to list other people's requests, and
  the column-level-grant pattern on event finance tables has already bitten this project once.
* The receipt bucket gains a write path initiated by an anonymous session, but the object is
  written by the server action through `getR2StorageAdapter()` with `validateReceiptBytes`
  applied; the guest never holds a storage credential, and viewing stays session-gated
  (`docs/threat-model.md:180`).
* An unauthenticated insert into the financial ledger is the highest-risk change in this spec.
  Mitigations: the shape CHECK, the guard's online branch refusing any row that carries a seller
  or a non-`recorded` status, the price forced from the tier, `refunded_at` forced null, the
  event-status check that already applies to both INSERT and UPDATE, and no UPDATE path for anon.
  Approved-only arithmetic means an unreviewed row cannot move a balance even if every other
  control were bypassed.
* Invite tokens appear in URLs and therefore in platform request logs. High entropy (128 bits),
  72-hour life, single use, and nothing on the other side but the right to register.
* Authorization stays in RLS, RPCs and server actions. `src/proxy.ts:90` remains routing-agnostic;
  no route protection is added to middleware.

## 15. Testing

pgTAP carries the load-bearing rules, because the rules live in the database:

* approved-only arithmetic: an `online` row in `recorded` moves neither `event_cash_totals` leg
  nor tier capacity; approving it moves both; rejecting and cancelling move neither.
* `cancelled` is terminal, frees nothing it had not already freed, and does not set
  `refunded_at`/`refund_reason`; `rejected` does.
* guard online branch: accepts a correct anon-shaped row; refuses with a seller id, refuses
  `created_by`, refuses a status other than `recorded`, refuses a non-matching unit price, refuses
  `refunded_at` set, refuses a closed/archived/unticketed event, refuses an authenticated actor.
* close gate: fires with pending sales only, pending transactions only, both; passes with neither;
  no-op when the status is unchanged; reopen unaffected.
* `submit_ticket_order`: shape validation, price taken from tier, reference uniqueness and format,
  idempotency returning the original reference, each throttle ceiling, and no row for a closed
  event.
* `lookup_ticket_order`: both inputs required, mismatch returns nothing, and the returned field
  set excludes the receipt object key and the buyer phone.
* intake: request/enquiry validation, one-live-request dedupe, `backup_admin`/admin/president/
  executive pass and a plain active member and a staff account are refused.
* invites: creation revokes the previous live invite, expiry refuses, claim requires the matching
  address, finalize consumes exactly once, and releasing a claim on failure allows a retry.
* grants: `has_column_privilege` assertions for each new `event_ticket_sales` column and negative
  assertions that `anon` holds no table privileges.

Node tests (`npm test` = `node --test`; a single file is `npm test -- tests/x.test.mjs`):
`rpc-error-notice` maps every new phrase to its code; the landing page source contains no
`cdn.tailwindcss.com`, no `images.unsplash.com`, no `placehold.co` and no Google Fonts link;
`get_public_ticketed_events` result shaping for the ribbon and cards; the storefront's
"no events" versus "temporarily unavailable" states. Source-text assertions are kept few and
targeted — they break across refactors, which this project has already been bitten by.

Manual verification before merge: the production build at `127.0.0.1:3001`, an anonymous browser
session through the whole guest purchase with a real receipt file, the officer approve/reject/
cancel loop with a second officer account, the close gate tripping and then clearing, an invite
round trip end to end including the expired-token path, and a signed-in member confirming the
moved routes still carry their notices.

## 16. Migration and deployment ordering

One migration file for the ledger and till (§4–§7), a second for intake and invites (§8). Both
follow the house style: `create or replace` with `set search_path = ''`, explicit
`pg_catalog`-qualified function calls, `revoke all` then narrow `grant`, audit rows for every
state change, and `select * from finish(); rollback;` at the end of each pgTAP suite.

Non-negotiables learned the hard way in this repository:

* **Migrations push before merge.** The standing ruling, and the reason production event editing
  broke on 2026-11-04. Any task whose code sends a new RPC argument must land after the schema
  that accepts it.
* **Never plain `supabase db push`.** It targets production. `--local` is mandatory for
  stack-only work, `--linked` resolves only from the repository root, and a `db push --local`
  silently skips edits to an already-applied migration — replay is `npx supabase db reset --local`.
* PostgREST resolves RPCs **by argument name**. `verify_event_ticket_sale` keeps its signature
  (a new value, not a new parameter), so old deployed code keeps working against the new schema;
  the new functions are additions, not changes.
* pgTAP needs a clean `db reset`, and seven stale-name suites are the accepted drift baseline —
  a `+N` count failure means leftover rows, not new breakage.
* CI does not run `npm test` or pgTAP, so a green pipeline is not evidence.
* `tests/tickets-canonical-url.test.mjs` pins the canonical box-office URL
  `carpentersfamily.com.ng/tickets` and asserts there is no tickets-subdomain rewrite. This spec
  keeps `/tickets` on the same host, so the test must keep passing unchanged.
* The `/portal` route move happens **after** the `cta_url` production audit in §3.

### Plan decomposition

This spec is too large for one implementation plan and splits along three seams that are each
independently shippable and independently reviewable:

* **Plan A — ledger and till** (§4–§7, plus §13's four mapped codes and §15's pgTAP rules): the
  schema, approved-only arithmetic across all nine read sites, the guard branch, the close gate,
  `submit_ticket_order`, the review drawer's third decision, the two buyer emails, and the status
  lookup. Nothing here depends on the landing page or the intake forms. Highest risk, highest
  value — do it first.
* **Plan B — routes and landing** (§3, §9, §10, §11): the `/` → `/portal` move with its redirect
  and `cta_url` audit, the landing port onto the already-committed `public/landing/` assets, and the
  copy edits. Depends on nothing in
  Plan A except that the ribbon's ticket CTA is nicer once the till can actually take an order.
* **Plan C — intake and invitations** (§8 (all of 8.1-8.5), §13's three action notices): both public forms, the
  officer queues, invite lifecycle, and gating `/signup`. Independent of A and B, and the last one
  that changes who can reach the app.

B and C can run in parallel after A. A must not be split further: shipping the schema without the
approved-only arithmetic, or the arithmetic without the close gate, leaves the ledger in a state
where unreviewed money counts.

## 17. Out of scope

* No payment gateway, no card processing, no auto-confirmation. Approval is a human with a bank
  statement.
* No seat reservation. Unpaid orders hold nothing, hence no expiry timer and no `pg_cron` sweep.
* No public event detail page and no tickets subdomain.
* No "My tickets" member view — members do not buy tickets (§2.4).
* No self-service password-setting by an officer and no service-role auth-admin path (§2.14).
* No photo-management UI; club photos are committed files.
* No rewrite of the member dashboard beyond the route move and the approved-only filters.

## 18. Open items

1. **Club photographs** — the nine `public/landing/` files are already committed (§11), but they are
   Unsplash stock imagery, not the club. Someone with authority should confirm that generic party
   crowds are acceptable for a first public launch; when real photos arrive they replace the files
   of the same name, EXIF-stripped.
2. **Fraunces woff2 files** — one download step (SIL OFL); the plan lists it as a task rather
   than assuming the files exist.
3. **Officer routing for intake emails** — `resolveOfficerContacts()` currently fans out to all
   officers. If membership requests should reach one designated role rather than everyone, that
   is a one-line filter in the notification helper; the default is the existing fan-out.
4. **`backup_admin` in the invite sender set** — included per §2.15; strike it if the intent was
   strictly Admin, President and Executive.
5. **Existing pending accounts** — people who already self-registered sit in `pending` with auth
   users. They keep flowing through today's approval UI untouched; no migration touches them.
