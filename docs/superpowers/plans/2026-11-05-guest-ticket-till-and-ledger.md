# Guest Ticket Till & Approved-Only Ledger Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an anonymous visitor buy event tickets on `/tickets` — order, upload proof of transfer, get a reference — and make only officer-approved rows count toward tier capacity and cash totals, at every layer that computes money.

**Architecture:** One migration owns the whole ledger change: four new columns on `event_ticket_sales`, `cancelled` as a fourth review status, and the approved-only filter applied simultaneously to every SQL aggregate that reads the sales table. Two new `security definer` functions — `submit_ticket_order` and `lookup_ticket_order` — are the only paths an anonymous session can take, and both are granted to `anon` with no table privileges anywhere. The buyer's position in the checkout lives in the URL, parsed and clamped by one pure module (`src/lib/ticket-order-state.mjs`) that the storefront, the redirect builder and the node tests all import, so the address bar contract is logic with tests rather than markup with hopes.

**Tech Stack:** Next.js 16.4.3 App Router (async `searchParams`, server actions, `revalidatePath` before `redirect`), Supabase Postgres with `security definer` RPCs and pgTAP, Cloudflare R2 through `@aws-sdk/client-s3` for receipt objects, Node's built-in test runner, Biome.

**Spec:** `docs/superpowers/specs/2026-11-05-public-flow-landing-tickets-portal-design.md` (commit `0eca6c4`). Read §3–§7, §12–§15 before starting; this plan argues from them. The spec's §8 (intake/invites) and §9–§11 (landing page) are Plans C and B and are **not** in scope here.

## Global Constraints

- **Never run `supabase db push` without `--local`.** A plain `supabase db push` applies migrations to the PRODUCTION database. The only sanctioned form here is `npx supabase db push --local --include-all`; replay after editing an applied migration is `npx supabase db reset --local`.
- **Migrations push before merge**, per the standing project ruling — the reason production event editing broke on 2026-11-04. Task 18 is the runbook that applies this migration to production, and it is operator-run. **Do not execute it.**
- **pgTAP runs only through `npx supabase test db`** (README.md:13) and needs a clean `db reset --local` first. Seven stale-name suites are the accepted drift baseline; a `+N` count failure means leftover rows, not new breakage. There is no npm script for pgTAP.
- **New pgTAP suites use `select no_plan();`, not `plan(N)`.** Eighteen of the twenty-two suites in `supabase/tests/database/` do; only four count assertions up front. Counting is a self-inflicted failure source when an executor adds one more assertion — which this plan expects.
- **`npm test` is `node --test`** and runs the whole `tests/` directory. A single file is `npm test -- tests/<file>.test.mjs` — never `node --test tests/`.
- **Event finance tables grant `SELECT` per column.** A new column that is not explicitly granted silently empties an entire dashboard read rather than erroring. Task 3 grants the new columns in the same migration that adds them.
- **`service_role` cannot select `event_ticket_sales`** today, and `anon` gets no table privileges in this plan. Stranger data is reachable only through the two new definer functions.
- **Raw database messages never reach the browser.** `rpcErrorNotice` (`src/lib/rpc-error-notice.ts:46`) pattern-matches raised messages into allowlisted codes; an unmapped message degrades to `operation-failed`. Every new raise in this plan is paired with a `MESSAGE_RULES` entry — those are all written first, in Task 2 — and Task 2's test pins each raise text to its code.
- **PostgREST resolves RPCs by argument name.** `verify_event_ticket_sale` keeps its existing signature — `cancelled` is a new *value*, not a new parameter.
- **This is NOT the Next.js you know.** Before writing form actions, `searchParams` reads, or revalidation, read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `01-app/03-api-reference/04-functions/redirect.md`. This version's `searchParams` is a **Promise** and must be awaited (`src/app/page.tsx:59-65` is the in-repo example). `redirect()` throws, so all `revalidatePath` calls go before it (`server-actions.md:72`).
- **`.mjs` modules imported from `.ts`/`.tsx`** need JSDoc typedefs for TypeScript narrowing (`allowJs: true`, `moduleResolution: "bundler"`) and are imported **with** the extension: `@/lib/ticket-order-state.mjs`.
- **Node test style in `tests/*.test.mjs`:** behavioural import tests for `src/lib/*.mjs`; `readFileSync` + `assert.match` source-text tests for components. Keep source-text assertions few and targeted — they break across refactors, which has already bitten this project. Note that `node --test` *can* import `.ts` (type stripping) — `tests/member-approval-notices.test.mjs:3-4` proves it — but anything importing `src/lib/email/notifications.ts` cannot, because that file opens with `import "server-only"`. Email tests are source-text tests by necessity.
- **Stage files by name.** Never `git add -A`. `tests/club-admin-terminology.test.mjs` was another contributor's uncommitted work at the time this plan was written; if it reappears as modified, leave it out of every commit. The same applies to the currently-dirty `.env.example` and `src/lib/email/config.ts`.
- **Copy rule (§2.20):** the things a buyer buys are **tickets** — "Buy tickets", "Select ticket tier", "Number of tickets", "Check ticket status", "Continue to checkout". The transaction is still an **order** — "Order submitted", "Order reference", "Submit Order" stay. No "pass" survives in buyer-facing copy; the storefront currently says `pass`/`passes` at `tickets-storefront-view.tsx:252` and the dashboard says `Pass`/`Passes` at `dashboard/page.tsx:714`. Task 11 fixes the first, Task 15 the second.
- **`MAX_ONLINE_QUANTITY = 10` at every layer** — URL clamp, form, server action, RPC. The table's own CHECK stays `between 1 and 1000` (`20261003102501:116`) because an officer recording 30 chairs is a different path.
- Time zone `Africa/Lagos`, locale `en-NG`, 12-hour clock via `formatEventTime` (`src/lib/event-times.mjs`), currency via `formatNaira` (`src/lib/format.ts:8`).
- Lint with `npm run lint` (= `biome check next.config.ts src`); format with `npx biome check --write <paths>`.
- Browser verification runs against the **production build** at `127.0.0.1:3001`. A stale process holding `:3001` silently serves the previous build — check it before trusting a screenshot.

## Intentional Deviations From The Spec

Nineteen refinements found by reading the source this plan touches. They are
decisions, not oversights; implement them as written here. Deviations 7–11 and 17–19 are **defects
in the spec**, discovered by reading the migration history and the helper modules the spec assumed —
each would have produced a broken build, a broken deploy, or a silently broken feature if
implemented as written. Read deviation 17 first: it reverses a spec ruling rather than correcting
one.

1. **`submit_ticket_order` gains a 13th parameter, `p_sale_id uuid`.** The spec lists twelve. `runReceiptEntry` builds the object key as `receipts/${scope}/${targetId}/${receiptId}.${ext}` (`src/lib/receipt-rules.mjs:40`) and `buildReceiptObjectKey` throws `"Receipt target and receipt IDs must be UUIDs."` (`:36`) — so the sale's id must exist *before* the upload, and `runReceiptEntry` uploads before its `commit` callback runs the RPC. The officer path already solves this by generating `targetId = existingSaleId || randomUUID()` in the action (`src/app/actions.ts:2770`) and passing `p_sale_id` to `record_event_ticket_sale` (`:2794`). The online path does the same. It cannot borrow the officer's dedupe helper: `find_finance_entry_id` returns `null` without an active-member session (`20261025121000_finance_payment_methods.sql:30-32`) and is granted to `authenticated` only (`:59`), so an anonymous caller gets nothing from it — dedupe lives entirely inside `submit_ticket_order`, and a deduplicated submit leaves the second upload as an orphan for the existing receipt-orphan sweep, exactly as a failed officer insert does today (`receipt-entry.mjs:67`).
2. **`p_receipt_filename`, not `p_receipt_file_name`.** PostgREST resolves by argument name, and the existing family is `p_receipt_filename` (`src/app/actions.ts:2797`). The spec's spelling was a typo; matching the neighbours is what makes the two paths greppable.
3. **The four new notice codes are appended to `MESSAGE_RULES`, not inserted.** `MESSAGE_RULES` is a flat `ReadonlyArray<readonly [RegExp, string]>` whose first match wins (`src/lib/rpc-error-notice.ts:14-43`, loop at `:52`), and the ordering is load-bearing. Each of this plan's four raise texts was checked against all **fourteen** existing patterns and matches none of them — `budget-exceeded` tests `exceeds the allowed limit`, which the near-miss `box-office-at-capacity` text ("has reached its limit of pending orders") does not satisfy. Appending at the end is therefore safe, and appending keeps the diff to two lines per rule. Task 2's test asserts the specific pairings so a future reword that *would* collide fails loudly.
4. **`src/app/(member)/events/[eventId]/dashboard/page.tsx` arithmetic narrows; its row fetch does not.** Spec §4 says the same, and the file's structure confirms it is possible: the array fetched at `:227` is the officer review queue and must keep showing `recorded` and `cancelled` rows, while `soldCount` (`:357`) and projected revenue (`:530`) derive from the `activeSales` filter at `:352`. Only the derived filter gains `verification_status === "approved"`.
5. **The `cancelled` status renders as its own state, not as "voided".** Spec §4 requires it. The existing mapping is `status: s.refunded_at ? "voided" : "posted"`, and a cancelled row has `refunded_at IS NULL`, so it would read "posted" — which is not merely cosmetic, it is a wrong statement about money. Task 15 replaces the ternary with an explicit four-way map instead of bolting a `refunded_at`-shaped shortcut onto it.
6. **No `metadata`, no `layout.tsx` and no `loading.tsx` exist for `/tickets`** (`src/app/tickets/page.tsx` is 47 lines, `catch {` at `:36`, `export const dynamic = "force-dynamic"` at `:8`), and the shared `PublicTicketedEvent` types are exported from the *component* file (`src/components/tickets/tickets-storefront-view.tsx:20-42`), not a types module. Task 11 moves them to `src/components/tickets/ticket-types.ts` because the new overlay and status components both need them and a component importing its props from a sibling component is how circular imports start. Spec §9's "Metadata is new, not ported" belongs to Plan B; this plan does not touch `src/app/layout.tsx`.
7. **There is no `created_by` column on `event_ticket_sales`.** Spec §4's shape CHECK reads `(source = 'manual' and seller_id is not null and created_by is not null)` and its prose says "`created_by` also becomes nullable". It does not exist: the table (`20261003102501:98-135`) has `seller_id`, `buyer_name`, `payment_method`, `idempotency_key`, `refunded_at/by/reason`, plus the four verification columns added at `20261028000000:25-29` — no authoring column of any name, and nothing later adds one. Implementing the spec verbatim fails the migration with `column "created_by" does not exist`. The CHECK therefore drops both `created_by` clauses:

   ```sql
   (source = 'manual' and seller_id is not null)
   or (source = 'online' and seller_id is null
       and buyer_email is not null and buyer_phone is not null
       and public_reference is not null)
   ```

   and only `seller_id` gains `drop not null`. Spec §6's guard-branch comment "no seller/created_by" reduces to "no seller", which the CHECK above already enforces.
8. **The existing idempotency unique index does not cover online rows.** `event_ticket_sales_seller_idempotency_uidx on (seller_id, idempotency_key)` (`20261003102501:137-138`) is what makes an officer's double-click safe. `seller_id` becomes nullable in this migration, and Postgres treats NULLs as distinct in a unique index — so *every* online row could reuse the same key without violating it. Without a replacement, §6's "a double-clicked submit cannot create two orders" is unenforced, and the race between two concurrent double-clicked submits is exactly the case a `SELECT … then INSERT` cannot close. Task 3 adds a companion partial index and Task 5 catches the violation:

   ```sql
   create unique index event_ticket_sales_online_idempotency_uidx
     on public.event_ticket_sales (idempotency_key)
     where seller_id is null;
   ```

   A `23505` inside `submit_ticket_order` is not an error: the function catches it in a subtransaction, re-reads the winning row, and returns *its* reference. That is the only way two simultaneous submits produce one order and two identical screens.
9. **`submit_ticket_order` returns `jsonb`, not `text`.** Spec §6 signs it `returns text -- the public_reference`. `runReceiptEntry`'s commit contract is `async (receipt) => ({ kind: "ok", id, deduplicated })` (`receipt-entry.mjs:54-71`), and the uploaded object is *deleted* unless the returned `id` equals `input.targetId` (`:67`). A bare reference string gives the helper no id and no dedupe flag, so every successful guest order would have its receipt erased as a mismatch. The officer twin proves the shape: `record_event_ticket_sale` returns a row the action reads as `row?.sale_id` / `row?.deduplicated` (`src/app/actions.ts:2804-2809`). So:

   ```sql
   returns jsonb  -- {"sale_id": uuid, "public_reference": text, "deduplicated": boolean}
   ```

   The action shows the buyer the reference from this json; nothing else changes.
10. **The guest path passes `paymentStatus: "paid"` into `runReceiptEntry`, and `receipt-rules.mjs` is not touched.** `receiptRequirement("bank_transfer", undefined, …)` returns `"forbidden"` because of `if (paymentStatus !== "paid") return "forbidden"` (`src/lib/receipt-rules.mjs:22`), and `runReceiptEntry` then rejects the file with `receipt-not-allowed` (`:50-52`). The officer path already resolves this by hardcoding `paymentStatus: "paid"` (`src/app/actions.ts:2777`) — there, as here, it asserts "the buyer says the money moved", not "an officer approved it". The guest action passes the identical literal. Relaxing the rule module would change club and dues receipt behaviour for no reason; this plan does not open it.
11. **The approved-only site set is ten SQL functions, and the closing ledger posting is not one of them.** Spec §4's table names nine. Reading every live definition (the latest `create or replace` wins — several of these were redefined across `20261003102501`, `20261013032242`, `20261013040328`, `20261025123000`, `20261028014047`, `20261101010000`, `20261102150000`) gives:
    - `private.event_cash_totals(uuid)` — `20261102150000:7` (two legs)
    - `private.event_finance_summary(uuid)` — `20261013032242:541` (sales sums at `:553`, `:555`, `:562`)
    - `private.event_finance_budget_summary(uuid)` — `20261013032242:567` (sales sums at `:582`, `:584`, `:591`)
    - `private.event_ticket_tier_status(uuid)` — `20261003102501:1058` (`left join … and s.refunded_at is null` at `:1064`)
    - `private.event_finance_ticket_tier_summary(uuid, date, date)` — `20261013040328:423` (`:434`, `:445`, join filter `:457`)
    - `private.event_finance_report_summary(uuid, date, date)` — `20261013040328:484` (three aggregates; §4's branch asymmetry)
    - `public.get_public_ticketed_events()` — `20261101010000:428` (`tier_sales` CTE at `:445-452`)
    - `private.guard_event_ticket_sale_write()` — `20261028014047:113` (capacity sum at `:190-193`)
    - `public.record_event_ticket_sale` — `20261025123000:420` (pre-check at `:494`)
    - **`private.guard_event_ticket_tier_write` — `20261003102501:245`, the capacity-lowering guard at `:289-294`** — the site the spec's table omits. It refuses `new.capacity < v_sold`. Left unfiltered, an officer could be blocked from lowering a tier by a stranger's *unapproved* order — a staged row that counts nothing. It gains the filter.
    - *Not* a site: the closing snapshot. `private.sync_event_status_to_ledger()` was rewritten at `20261102150000:43` and now reads `select cash.net::numeric(30, 0) into v_signed_amount from private.event_cash_totals(new.id) as cash;` (`:53-54`), so the inline `sum(s.amount_ngn) … where s.refunded_at is null` at `20261013040328:316` is dead text in an older migration. Editing it would change nothing and would mislead the next reader.
12. **`verify_event_ticket_sale` must check capacity itself when it approves.** The write guard's capacity block sits at `20261028014047:190-196`, but the `app.event_verification_active` branch `return new;` at `:137` runs *before* it. So an approval that flips `recorded → approved` bypasses the only capacity rule in the database, and with §6's throttles deliberately not seat-aware (3 per email per event, 5 per email overall, 20 per event — none of which is `tier.capacity`) the till can oversell by design. Task 6 adds an explicit pre-check to the `approved` branch, reusing the guard's own raise text and error code (`23514`, `'Ticket tier capacity has been reached.'`) so the message stays one thing in one place.
13. **`get_public_ticketed_events()` returns `jsonb`, and has no date window.** Spec §3 calls it "the already-anon-granted public read"; it is one `returns jsonb` function emitting `{bank, events[]}` (`20261101010000:428-516`), so the approved-only edit is one CTE, not a `WHERE` on a view. Its filter is `e.ticketing_enabled = true and e.status = 'scheduled' and e.archived_at is null order by e.starts_at asc limit 20` (`:480-484`) with **no `starts_at > now()`** predicate: a past-but-still-`scheduled` event is returned. This plan does not change it, and Plan B must not assume "upcoming".
14. **No schema change is needed to email a stranger, and the outbox key regex allows `_`.** `notification_outbox.recipient_email` is `not null` while `recipient_user_id` is nullable (`20261027000000:82`), and `trigger_type` is checked against a *pattern* `^[a-z][a-z0-9_]{1,63}$` (`:326`), not an allowlist. The idempotency-key pattern is `^[a-z0-9][a-z0-9:_-]{0,254}$` (`:103`) — underscore **is** permitted, so a `ticket-order-received:<uuid>` key is legal as spec §6 writes it. Task 13 adds two helpers and zero DDL.
15. **`receipt-required`, `receipt-upload-failed` and `receipt-storage-unavailable` are emitted but undefined.** `runReceiptEntry` returns all three as notices (`:21`, `:23`, `:48`) and the officer action forwards them straight into the URL (`src/app/actions.ts:2813-2817`), but `src/lib/system-notices.ts` defines only `receipt-invalid`, `receipt-too-large` and `receipt-failed` (`:151-164`). A buyer whose upload fails today gets the generic fallback. Because guest-facing failure is the whole point of Task 10, Task 2 defines these three alongside the four §13 codes — seven `SYSTEM_NOTICES` entries, four `MESSAGE_RULES` entries.
16. **The overlay reads the URL client-side; only `/tickets/order` awaits `searchParams`.** Spec §3 makes the address bar the session, and the draft is `sessionStorage` — both browser-only. `/tickets` is a server component that cannot read `window`; making it await `searchParams` would suggest the server knows the buyer's step when it cannot (the overlay uses `history.replaceState`, which never hits the server). So `/tickets/page.tsx` passes the *event list* down and the overlay parses its own location on mount; `/tickets/order/page.tsx` awaits `searchParams` because `?ref=` must be present on first paint, before any client JS runs. This is §3's contract applied to the one page where the URL is server-readable at the right moment.

17. **Approved-only applies to ticket *sales*, not to `event_financial_transactions` — this
    reverses spec §4.** Four of §4's rows (and its `event_cash_totals` row explicitly) say both
    legs of a money sum gain `verification_status = 'approved'`. The sales leg is the till's
    business: a stranger's unreviewed order must count as nothing. The transaction leg is not, and
    applying the rule there collides with a shipped design:
    `20261028000000:53-54` set `event_financial_transactions.verification_status` to default
    `'recorded'`, and `20261102150000:7` then defined event cash as *"did the money move"* —
    `payment_status in ('paid','deposit') and voided_at is null`, no review filter — because the
    club and the event share one bank account and an officer's paid expense has to show in the club
    balance the moment it is entered. Gating transactions on `approved` would take that feature
    away: every newly recorded expense would vanish from the live balance until a second officer
    approved it, and the queue is not staffed for that. There is also no anonymous write path to
    transactions, so no stranger can exploit the gap. Task 4 therefore filters every **sales** sum
    and leaves the five transaction sums alone, and its pgTAP case pins the asymmetry in both
    directions so a later reader cannot "tidy" it into a regression either way. If the club decides
    it wants officer transactions staged too, that is a separate change with its own
    re-baseline of `club_event_shared_balance_test.sql`.
18. **`finance_receipts.uploaded_by` must become nullable.** Spec §6 routes the guest's proof of
    payment through the existing receipt pipeline, and that table declares
    `uploaded_by uuid not null references public.member_profiles(id)`
    (`supabase/migrations/20261025120000_finance_receipts_r2.sql:55`). An anonymous buyer has no
    profile, so the insert fails before the order ever lands — and without the row, the officer's
    "View uploaded receipt" (§7) has nothing to open, because `/api/receipts` resolves the object
    key from `finance_receipts`. Task 3 adds `alter table public.finance_receipts alter column
    uploaded_by drop not null;`. Nothing authorizes on it: `private.can_read_finance_receipt`
    grants any active member read for scope `event_ticket`
    (`20261025120000:137-139`) and never looks at `uploaded_by`, and the legacy
    `club_financial_receipts` / `event_financial_receipts` tables that *did* check it
    (`20261003100000:199`, `20261003102501:1224`) are not the ones this path writes.
19. **`submit_ticket_order` appends no audit row.** Spec §6 says the function "inserts, appends the
    audit entry, and returns the reference". `audit_log.actor_id` is `uuid not null references
    public.member_profiles (id)` (`20261002135252:95`, and `20261003102501:172` adds only
    `event_id`), so a definer function running with no session cannot write one at all. Relaxing
    that constraint would weaken the accountability of the entire governance log to give the till
    one row — the wrong trade. Instead the order's provenance *is* its row
    (`source='online'`, `created_at`, `public_reference`, `buyer_email/phone`), and every
    transition that a person causes — approve, reject, cancel — is audited by
    `verify_event_ticket_sale` with a real actor, which is exactly what an audit log is for. A
    stranger's POST is a data event, not a governance event. The alternative considered and
    refused: mint a synthetic "Box Office" member profile to attribute anonymous actions, which
    would put a non-person in the membership table that `private.is_active_club_member()` reads.

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `src/lib/ticket-order-state.mjs` | create | The address-bar contract, pure: `CHECKOUT_PARAM_KEYS`, `MAX_ONLINE_QUANTITY`, `parseCheckoutState`, `buildCheckoutQuery`, `buildSubmitFailureUrl`, `DRAFT_STORAGE_KEY` |
| `src/lib/ticket-order-intake.mjs` | create | Server-side form parsing the action shares with tests: `parseTicketOrderForm`, `HONEYPOT_FIELD`, `MIN_SUBMIT_SECONDS`, `isHoneypotClean`, `isElapsedEnough` |
| `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql` | create | §4 columns/constraints/grants + `cancelled`, §4 approved-only arithmetic (all ten SQL sites), §5 close gate, §6 guard branch + `submit_ticket_order` + `lookup_ticket_order`, §7 `verify_event_ticket_sale` third decision. Written across Tasks 3–6, applied at Task 7. |
| `supabase/tests/database/public_ticket_till_and_ledger_test.sql` | create | pgTAP for all of the above |
| `supabase/tests/database/event_finance_ticketing_ledger_test.sql` | modify | assertions that pin the old three-value status CHECK and the pre-cancel `verify_event_ticket_sale` behaviour |
| `supabase/tests/database/club_event_shared_balance_test.sql` | modify | `private.event_cash_totals` cases gain the approved-only expectation |
| `src/app/tickets/page.tsx` | modify | passes the event list + the availability flag to the view, replaces the silent `catch {}` with an explicit unavailable state |
| `src/app/tickets/order/page.tsx` | create | awaits `searchParams` for `?ref=`, renders lookup + acknowledgement |
| `src/components/tickets/ticket-types.ts` | create | `PublicTicketedEvent`, `PublicTicketTier`, `PublicBankInfo`, `TicketOrderStatusView`, `CheckoutState` |
| `src/components/tickets/tickets-storefront-view.tsx` | modify | hex literals → `@theme` tokens, id lookups instead of array position, "pass" → "ticket", renders the checkout overlay, `unavailable` state |
| `src/components/tickets/ticket-checkout-overlay.tsx` | create | the overlay port: `z-[60]` dialog, two steps, scroll-lock, Escape/backdrop, URL sync, sessionStorage draft, receipt upload |
| `src/components/tickets/ticket-status-view.tsx` | create | the lookup form, the acknowledgement band, the status card, the reason panel for rejected/cancelled |
| `src/app/actions.ts` | modify | new `submitTicketOrderAction`: receipt path, honeypot/elapsed, RPC call, `revalidatePath` then `redirect` to `/tickets/order?ref=…` |
| `src/app/(member)/events/[eventId]/dashboard/actions.ts` | modify | `VerifyTicketSaleParams.decision` gains `"cancelled"`; the ≥ 5-character rule covers it |
| `src/lib/email/notifications.ts` | modify | `notifyTicketOrderReceived`, `notifyTicketOrderReviewed` |
| `src/lib/notifications/idempotency.ts` | modify | `ticketOrderReceivedKey`, `ticketOrderReviewedKey` |
| `src/lib/rpc-error-notice.ts` | modify | four `MESSAGE_RULES` entries |
| `src/lib/system-notices.ts` | modify | seven `SYSTEM_NOTICES` entries (four §13 codes + three receipt codes) |
| `src/components/events/dashboard/voucher-inspection-drawer.tsx` | modify | third decision button + its reason rule |
| `src/components/events/dashboard/event-domain-ledger.tsx` | modify | `cancelled` joins the status union, the pill ladder and the review-status badge |
| `src/app/(member)/events/page.tsx` | modify | `:83` sold-sum select gains `.eq("verification_status","approved")` |
| `src/app/(member)/events/[eventId]/dashboard/page.tsx` | modify | approved-only arithmetic, `cancelled` rendering, two new columns in the row select |
| `src/lib/home-dashboard.mjs` | modify | `countTicketsSold` (`:463`) gains the filter |
| `src/app/api/events/[eventId]/finance-report/route.ts` | modify | `:171` row select gains `verification_status` |
| `docs/superpowers/specs/assets/carpenters_family_box_office.tsx` | create | the prototype, copied out of Downloads so the port is reproducible |
| `tests/ticket-order-state.test.mjs` | create | clamp, unknown ids, query building, failure-redirect shape, no-PII-in-URL |
| `tests/ticket-order-intake.test.mjs` | create | field parsing, honeypot, elapsed time |
| `tests/ticket-notice-mapping.test.mjs` | create | each raise text → its code, and no regression against the existing fourteen |
| `tests/ticket-order-emails.test.mjs` | create | trigger types, derived idempotency keys, non-member recipient |
| `tests/home-dashboard.test.mjs` | modify | `countTicketsSold` asserts the approved filter reaches the query builder |
| `tests/till-ledger-surfaces.test.mjs` | create | source-text guards: approved-only filters present, `pass` gone, overlay stacking |
| `docs/data-access-matrix.md` | modify | the new columns, both new RPCs, the approved-only rule |
| `docs/threat-model.md` | modify | the anonymous-write boundary and the reference/email separation |

---

## Task 1: The address-bar contract — `src/lib/ticket-order-state.mjs`

Spec §3 makes the query string the buyer's whole session. That is a contract with five rules
(restore by id, clamp quantity, `step ∈ {1,2}`, `replaceState` never `pushState`, no PII in the
URL), so it lives in one pure module the overlay, the storefront and the tests all import — not in
JSX.

**Files:**
- Create: `src/lib/ticket-order-state.mjs`
- Test: `tests/ticket-order-state.test.mjs`

**Interfaces:**
- Consumes: nothing (pure). The event shape it parses is the `get_public_ticketed_events()` row:
  `{ id, tiers: [{ id, capacity: number | null, sold: number }] }` (`src/components/tickets/tickets-storefront-view.tsx:20-33`).
- Produces: `CHECKOUT_PARAM_KEYS`, `MAX_ONLINE_QUANTITY`, `DRAFT_STORAGE_KEY`, `tierRemaining(tier)`,
  `maxQuantityForTier(remaining)`, `clampQuantity(raw, remaining)`, `parseCheckoutState(search, events)`,
  `buildCheckoutQuery(search, state)`, `checkoutHref(pathname, search, state)`, `buildSubmitFailureUrl({eventId, tierId, quantity, notice})`.
  Task 11 renders the storefront with it, Task 12 syncs the overlay to it, Task 10 builds failure
  redirects with it, Task 14 reuses `DRAFT_STORAGE_KEY`.

- [ ] **Step 1: Write the failing test**

Create `tests/ticket-order-state.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKOUT_PARAM_KEYS,
  MAX_ONLINE_QUANTITY,
  buildCheckoutQuery,
  buildSubmitFailureUrl,
  checkoutHref,
  clampQuantity,
  maxQuantityForTier,
  parseCheckoutState,
  tierRemaining,
} from "../src/lib/ticket-order-state.mjs";

const events = [
  {
    id: "evt-rave",
    tiers: [
      { id: "tpr-standard", capacity: 100, sold: 96 },
      { id: "tpr-vip", capacity: null, sold: 4 },
    ],
  },
  { id: "evt-gala", tiers: [{ id: "tpr-table", capacity: 40, sold: 0 }] },
];

test("a missing or unknown event id restores no overlay", () => {
  assert.equal(parseCheckoutState("", events), null);
  assert.equal(parseCheckoutState("?tier=tpr-vip&qty=3", events), null);
  assert.equal(parseCheckoutState("?event=evt-from-an-old-bookmark", events), null);
});

test("restores by id, not by position", () => {
  const reordered = [events[1], events[0]];
  const state = parseCheckoutState("?event=evt-rave&tier=tpr-vip&qty=2&step=2", reordered);
  assert.equal(state.eventId, "evt-rave");
  assert.equal(state.tierId, "tpr-vip");
  assert.equal(state.quantity, 2);
  assert.equal(state.step, 2);
});

test("an unknown tier id falls back to the event's first tier", () => {
  const state = parseCheckoutState("?event=evt-rave&tier=tpr-retired", events);
  assert.equal(state.tierId, "tpr-standard");
});

test("step is 1 or 2 and nothing else", () => {
  for (const raw of ["", "3", "0", "two", "2"]) {
    const step = parseCheckoutState(`?event=evt-gala&step=${raw}`, events).step;
    assert.ok(step === 1 || step === 2, `step=${raw} produced ${step}`);
  }
  assert.equal(parseCheckoutState("?event=evt-gala&step=2", events).step, 2);
});

test("quantity clamps to the online ceiling and to what the tier has left", () => {
  assert.equal(MAX_ONLINE_QUANTITY, 10);
  assert.equal(clampQuantity("500", 40), 10);
  assert.equal(clampQuantity("500", 3), 3);
  assert.equal(clampQuantity("0", null), 1);
  assert.equal(clampQuantity("-4", null), 1);
  assert.equal(clampQuantity("abc", null), 1);
  assert.equal(clampQuantity(null, null), 1);
  assert.equal(maxQuantityForTier(null), MAX_ONLINE_QUANTITY);
  assert.equal(maxQuantityForTier(0), 1);
});

test("tier remaining is null when the tier is open-ended and never negative", () => {
  assert.equal(tierRemaining({ capacity: null, sold: 4 }), null);
  assert.equal(tierRemaining({ capacity: 100, sold: 96 }), 4);
  assert.equal(tierRemaining({ capacity: 40, sold: 55 }), 0);
});

test("the checkout writes over the state and clears exactly its four keys", () => {
  const state = parseCheckoutState("?event=evt-rave&tier=tpr-standard&qty=4&step=1", events);
  assert.equal(
    buildCheckoutQuery("?notice=box-office-closed", state),
    "notice=box-office-closed&event=evt-rave&tier=tpr-standard&qty=4&step=1",
  );
  assert.equal(checkoutHref("/tickets", "?event=evt-rave", null), "/tickets");
  assert.equal(
    buildCheckoutQuery("?ref=CF-K7M2QX9B&event=evt-rave&tier=tpr-standard", null),
    "ref=CF-K7M2QX9B",
  );
  for (const key of CHECKOUT_PARAM_KEYS) assert.ok(["event", "tier", "qty", "step"].includes(key));
});

test("a rejected submit returns the buyer to the overlay with one allowlisted notice", () => {
  const url = buildSubmitFailureUrl({
    eventId: "evt-rave",
    tierId: "tpr-standard",
    quantity: 3,
    notice: "box-office-at-capacity",
  });
  assert.equal(url, "/tickets?notice=box-office-at-capacity&event=evt-rave&tier=tpr-standard&qty=3&step=2");
});

test("no buyer PII ever enters a checkout URL", () => {
  const urls = [
    checkoutHref("/tickets", "", parseCheckoutState("?event=evt-rave&qty=2", events)),
    buildSubmitFailureUrl({ eventId: "evt-rave", tierId: "tpr-standard", quantity: 2, notice: "invalid-request" }),
  ];
  for (const url of urls) {
    assert.doesNotMatch(url, /email|phone|name|@/i, url);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/ticket-order-state.test.mjs`
Expected: `Cannot find module '../src/lib/ticket-order-state.mjs'` — the module does not exist yet.

- [ ] **Step 3: Write the module**

Create `src/lib/ticket-order-state.mjs`:

```js
/**
 * The checkout address bar IS the buyer's session (spec §3): it survives a reload, a back
 * gesture and a pasted link, which nothing else on the page can. Pure — no `window`, no React —
 * so the contract has tests instead of hopes.
 */

export const CHECKOUT_PARAM_KEYS = ["event", "tier", "qty", "step"];
export const MAX_ONLINE_QUANTITY = 10;
export const DRAFT_STORAGE_KEY = "cf-box-office-draft";

/** @typedef {{ id: string, name?: string, price_ngn?: number, capacity: number | null, sold: number }} CheckoutTier */
/** @typedef {{ id: string, tiers: CheckoutTier[] }} CheckoutEvent */
/** @typedef {{ eventId: string, tierId: string, quantity: number, step: 1 | 2, remaining: number | null }} CheckoutState */

/**
 * Seats left, or `null` for an open-ended tier (`capacity is null`).
 * @param {CheckoutTier | null | undefined} tier
 * @returns {number | null}
 */
export function tierRemaining(tier) {
  if (!tier || tier.capacity === null) return null;
  return Math.max(0, tier.capacity - (tier.sold ?? 0));
}

/**
 * @param {number | null} remaining
 * @returns {number} the ceiling the till will offer; a sold-out tier still yields 1 so the
 *   overlay can render "sold out" instead of an arithmetic impossibility.
 */
export function maxQuantityForTier(remaining) {
  if (remaining === null) return MAX_ONLINE_QUANTITY;
  return Math.max(1, Math.min(MAX_ONLINE_QUANTITY, remaining));
}

/**
 * @param {string | number | null | undefined} raw
 * @param {number | null} remaining
 * @returns {number} always within 1..maxQuantityForTier(remaining)
 */
export function clampQuantity(raw, remaining) {
  const wanted = Number.parseInt(String(raw ?? "1"), 10);
  const base = Number.isFinite(wanted) ? wanted : 1;
  return Math.min(Math.max(base, 1), maxQuantityForTier(remaining));
}

/**
 * @param {string} search — with or without the leading `?`
 * @param {CheckoutEvent[]} events — the list the storefront is rendering
 * @returns {CheckoutState | null} `null` means "render the storefront with no overlay", which is
 *   what a stale id from an old bookmark must do (§3).
 */
export function parseCheckoutState(search, events) {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const eventId = params.get("event");
  if (!eventId) return null;
  const event = (events ?? []).find((candidate) => candidate.id === eventId);
  if (!event) return null;
  const tiers = Array.isArray(event.tiers) ? event.tiers : [];
  if (tiers.length === 0) return null;
  const requestedTier = params.get("tier");
  const tier =
    (requestedTier ? tiers.find((candidate) => candidate.id === requestedTier) : null) ??
    tiers[0];
  const remaining = tierRemaining(tier);
  return {
    eventId: event.id,
    tierId: tier.id,
    quantity: clampQuantity(params.get("qty"), remaining),
    step: params.get("step") === "2" ? 2 : 1,
    remaining,
  };
}

/**
 * Foreign parameters (a `notice`, a `ref`) survive; the four checkout keys are set or deleted.
 * @param {string} search
 * @param {CheckoutState | null} state
 */
export function buildCheckoutQuery(search, state) {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (state) {
    params.set("event", state.eventId);
    params.set("tier", state.tierId);
    params.set("qty", String(state.quantity));
    params.set("step", String(state.step));
  } else {
    for (const key of CHECKOUT_PARAM_KEYS) params.delete(key);
  }
  return params.toString();
}

/** @returns {string} a path + query to hand to `history.replaceState` */
export function checkoutHref(pathname, search, state) {
  const query = buildCheckoutQuery(search, state);
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Where a refused submit lands: back inside the overlay, on step 2, with one allowlisted notice.
 * The signature has no name, phone or email parameter on purpose — §14 keeps stranger PII out of
 * Vercel request logs, and a URL is the one place this repo cannot delete after the fact.
 */
export function buildSubmitFailureUrl({ eventId, tierId, quantity, notice }) {
  const params = new URLSearchParams({ notice });
  if (eventId) {
    params.set("event", eventId);
    if (tierId) params.set("tier", tierId);
    params.set("qty", String(clampQuantity(quantity, null)));
    params.set("step", "2");
  }
  return `/tickets?${params.toString()}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- tests/ticket-order-state.test.mjs`
Expected: 9 tests, 0 fail. Then `npm test` — the whole suite still passes.

- [ ] **Step 5: Lint, then commit**

```bash
npx biome check --write src/lib/ticket-order-state.mjs tests/ticket-order-state.test.mjs
git add src/lib/ticket-order-state.mjs tests/ticket-order-state.test.mjs
git commit -m "feat(tickets): put the checkout address-bar contract in one tested module"
```

---

## Task 2: Notice codes and the raise-text mapping

Four §13 codes come from database raises and must be matched by `MESSAGE_RULES`; three receipt
codes are already emitted by `runReceiptEntry` with no definition at all (deviation 15). All
seven land here, before any SQL exists, because the mapping test pins the raise *text* and the
text is written in Tasks 3–6 — so the text this task asserts becomes the contract those tasks
must hit.

**Files:**
- Modify: `src/lib/rpc-error-notice.ts:43` (append four tuples before the closing `]`)
- Modify: `src/lib/system-notices.ts` (four codes after `revoke-club-admin-first` at `:444-449`,
  three receipt codes after `receipt-unavailable` at `:166-170`)
- Test: `tests/ticket-notice-mapping.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: notice codes `pending-review-blocks-close`, `ticket-order-limit-reached`,
  `box-office-closed`, `box-office-at-capacity`, `receipt-required`, `receipt-upload-failed`,
  `receipt-storage-unavailable`. Task 10 redirects to the first four; Task 17 asserts each one is
  defined.

- [ ] **Step 1: Write the failing test**

Create `tests/ticket-notice-mapping.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { rpcErrorNotice } from "../src/lib/rpc-error-notice.ts";
import { getSystemNotice } from "../src/lib/system-notices.ts";

// One entry per raise text a buyer or officer can see from this feature, copied verbatim from
// the SQL in Tasks 3-6. A reworded message with no matching rule degrades to `operation-failed`,
// which is exactly the silent failure this test exists to catch.
const RAISES = [
  [
    "Ticket sales or transactions still await review on this event.",
    "pending-review-blocks-close",
  ],
  [
    "This email address has too many pending ticket orders.",
    "ticket-order-limit-reached",
  ],
  [
    "This email address has too many pending ticket orders for this event.",
    "ticket-order-limit-reached",
  ],
  [
    "This event is no longer accepting ticket orders.",
    "box-office-closed",
  ],
  [
    "The box office has reached its limit of pending orders for this event.",
    "box-office-at-capacity",
  ],
  [
    "Online ticket orders cannot be recorded by a signed-in member.",
    "denied",
  ],
  ["Ticket tier capacity has been reached.", "budget-exceeded"],
];

test.each(RAISES)("maps %j to %j", (message, expected) => {
  assert.equal(rpcErrorNotice({ message }), expected);
});

test("the new codes never fall through to the generic failure", () => {
  for (const [message] of RAISES.slice(0, 5)) {
    assert.notEqual(rpcErrorNotice({ message }), "operation-failed");
  }
});

test("capacity wording does not get swallowed by budget-exceeded", () => {
  // `budget-exceeded` matches "exceeds the allowed limit"; the near-miss text must not.
  assert.equal(
    rpcErrorNotice({ message: "The box office has reached its limit of pending orders." }),
    "box-office-at-capacity",
  );
});

test("every mapped code has buyer-facing copy", () => {
  const codes = [
    ...new Set(RAISES.map(([, code]) => code)),
    "receipt-required",
    "receipt-upload-failed",
    "receipt-storage-unavailable",
  ];
  for (const code of codes) {
    const notice = getSystemNotice(code);
    assert.ok(notice, `no SYSTEM_NOTICES entry for "${code}"`);
    assert.ok(notice.title.length > 0);
    assert.ok(notice.message.length > 0);
  }
});

test("runReceiptEntry's three receipt notices are the codes now defined", () => {
  for (const notice of ["receipt-required", "receipt-upload-failed", "receipt-storage-unavailable"]) {
    assert.ok(getSystemNotice(notice));
  }
});

test("the existing fourteen mappings are untouched", () => {
  const unchanged = [
    ["This member already confirmed their email.", "already-confirmed"],
    ["A confirmation was sent less than 15 minutes ago.", "resend-cooldown"],
    ["Only a pending applicant can be approved.", "not-pending"],
    ["The member must confirm their email.", "email-confirmation-required"],
    ["The member must complete their profile.", "profile-incomplete"],
    ["You cannot approve their own account.", "self-action-denied"],
    ["This member already checked in.", "already-checked-in"],
    ["This event is archived.", "event-read-only"],
    ["Attendance is already closed.", "closed-or-locked"],
    ["Allocations exceed the allowed limit.", "budget-exceeded"],
    ["This payment was already reviewed.", "already-processed"],
    ["The name is already in use.", "duplicate-record"],
    ["Ticket sales require a scheduled event.", "invalid-state"],
    ["The primary Admin must remain active.", "revoke-club-admin-first"],
  ];
  for (const [message, code] of unchanged) {
    assert.equal(rpcErrorNotice({ message }), code);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/ticket-notice-mapping.test.mjs`
Expected: FAIL — the five §13 messages return `operation-failed`, and `getSystemNotice` returns
undefined for the receipt codes.

- [ ] **Step 3: Append the four `MESSAGE_RULES` tuples**

In `src/lib/rpc-error-notice.ts`, insert immediately before the closing `];` at `:44`:

```ts
  [/still await review/i, "pending-review-blocks-close"],
  [/too many pending ticket orders/i, "ticket-order-limit-reached"],
  [/no longer accepting ticket orders/i, "box-office-closed"],
  [/box office has reached its limit/i, "box-office-at-capacity"],
```

Also extend the doc comment at the top with one line:

```
 * The four ticket-till rules map raise texts written in
 * `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql`; the tests pin them
 * together, so changing a message in SQL without changing it here degrades the notice to
 * `operation-failed` and fails `tests/ticket-notice-mapping.test.mjs`.
```

- [ ] **Step 4: Define the seven notices**

In `src/lib/system-notices.ts`, add after `revoke-club-admin-first` (ends `:449`):

```ts
  // Public box office (guest ticket till)
  "pending-review-blocks-close": {
    type: "error",
    title: "Review Still Open",
    message:
      "Tickets and transactions still await review. Approve, reject or cancel them before closing this event.",
  },
  "ticket-order-limit-reached": {
    type: "error",
    title: "Too Many Pending Orders",
    message:
      "This email address already has several ticket orders awaiting confirmation. Try again after an officer reviews them, or contact the club.",
  },
  "box-office-closed": {
    type: "error",
    title: "Box Office Closed",
    message: "This event is no longer accepting ticket orders.",
  },
  "box-office-at-capacity": {
    type: "error",
    title: "Box Office Busy",
    message:
      "Too many orders for this event are awaiting review. Please try again shortly.",
  },
```

and after `receipt-unavailable` (ends `:170`) — these three are the codes `runReceiptEntry`
already emits (`src/lib/receipt-entry.mjs:21,23,48`):

```ts
  "receipt-required": {
    type: "error",
    title: "Receipt Needed",
    message: "Attach the proof of transfer before submitting this order.",
  },
  "receipt-upload-failed": {
    type: "error",
    title: "Upload Failed",
    message:
      "The proof of transfer could not be saved. Check the file and try again.",
  },
  "receipt-storage-unavailable": {
    type: "error",
    title: "Storage Unavailable",
    message:
      "Receipt storage is not configured or is temporarily unavailable. Try again later.",
  },
```

- [ ] **Step 5: Run everything**

Run: `npm test -- tests/ticket-notice-mapping.test.mjs` → 0 fail.
Run: `npm test` → the notice-registry suites (`tests/settings-notice-registry.test.mjs`,
`tests/notice-methods-verification.test.mjs`) must still pass; they enumerate codes and a new
entry that they reject means the registry expects a different shape — read their assertion before
changing yours.

- [ ] **Step 6: Commit**

```bash
npx biome check --write src/lib/rpc-error-notice.ts src/lib/system-notices.ts tests/ticket-notice-mapping.test.mjs
git add src/lib/rpc-error-notice.ts src/lib/system-notices.ts tests/ticket-notice-mapping.test.mjs
git commit -m "feat(notices): map the till's refusals and give the receipt failures their own copy"
```

---

## Task 3: Migration, part 1 — the online row's shape

This and the next three tasks write **one** file:
`supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql`. Tasks 3–6 append to it in
order (schema → arithmetic → guest write path → review), and Task 7 is the first time it is
applied. Do not run `db push` before Task 7.

**Files:**
- Create: `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql`
- Test: `supabase/tests/database/public_ticket_till_and_ledger_test.sql` (begins here, grows in Tasks 4–6)

**Interfaces:**
- Consumes: `public.event_ticket_sales` as defined at `supabase/migrations/20261003102501_event_finance_ticketing_ledger.sql:98-142`
  plus the four verification columns from `20261028000000:25-40`.
- Produces: columns `source`, `buyer_email`, `buyer_phone`, `public_reference`; a fourth
  `verification_status` value `cancelled`; the partial unique indexes Tasks 5 and 7 depend on;
  `authenticated` column grants.

- [ ] **Step 1: Write the failing pgTAP assertions**

Create `supabase/tests/database/public_ticket_till_and_ledger_test.sql`. The house sequence is
`begin;` → `no_plan();` → fixtures → `set local role` → `reset role;` → `finish();` → `rollback;`
(seventeen existing suites use `no_plan()`; `supabase/tests/database/club_event_shared_balance_test.sql:1-27`
is the copy to imitate). This first block tests only the shape rules, so it passes before the RPC
exists — the shape is enforced by the table, which is the point.

```sql
begin;

select no_plan();

-- Fixtures. These UUID blocks belong to this suite alone: 7a7a7a7a-… for auth.users,
-- 7b7b7b7b-… for club rows. Nothing else in supabase/tests/database/ uses either prefix.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('7a7a7a7a-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'till-admin@example.test', '', '{}'::jsonb, '{"full_name":"Till Admin","username":"till_admin"}'::jsonb, now()),
  ('7a7a7a7a-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'till-seller@example.test', '', '{}'::jsonb, '{"full_name":"Till Seller","username":"till_seller"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id in (
  '7a7a7a7a-0000-0000-0000-000000000001'::uuid,
  '7a7a7a7a-0000-0000-0000-000000000002'::uuid
);
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('7a7a7a7a-0000-0000-0000-000000000001', 'admin', '7a7a7a7a-0000-0000-0000-000000000001', 'Till test primary Admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000001', true);

select set_config('test.till_event', public.create_event(
  'Box Office Test Gala', 'party', pg_catalog.clock_timestamp() + interval '21 days',
  'Club Hall', null, false, false, true, true, true, true
)::text, true);
select set_config('test.till_tier', public.create_event_ticket_tier(
  current_setting('test.till_event')::uuid, 'Standard', 15000, 20, 'Test capacity'
)::text, true);

-- 1. The four new columns exist, and the manual default keeps every old row manual.
select has_column('public', 'event_ticket_sales', 'source', 'source column exists');
select has_column('public', 'event_ticket_sales', 'buyer_email', 'buyer_email column exists');
select has_column('public', 'event_ticket_sales', 'buyer_phone', 'buyer_phone column exists');
select has_column('public', 'event_ticket_sales', 'public_reference', 'public_reference column exists');

select is(
  (select pg_catalog.count(*) from public.event_ticket_sales),
  0::bigint,
  'suite starts with an empty sales table'
);

-- 2. cancelled is a legal fourth review status.
select lives_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    '7a7a7a7a-0000-0000-0000-000000000002', 'Cancelled Probe', 1, 15000,
    'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000a1', 'cancelled'
  )
$$, 'cancelled is accepted by the status check');

-- 3. The online shape CHECK (deviation 7: there is no created_by column, so the rule is about
--    the seller and the buyer's own contact details).
select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, source, buyer_email, buyer_phone
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    '7a7a7a7a-0000-0000-0000-000000000002', 'Blurred Row', 1, 15000,
    'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000a2', 'online',
    'blurred@example.test', '08031234567'
  )
$$, '23514', 'an online row may not carry a seller');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a3', 'online',
    'noseller@example.test', '08031234567'
  )
$$, '23514', 'an online row without a reference is refused');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a4', 'online',
    'badreference@example.test', '08031234567', 'CF-2026-8492'
  )
$$, '23514', 'the prototype reference shape is refused: no separators, eight unambiguous chars');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a5', 'online',
    'MixedCase@Example.Test', '08031234567', 'CF-K7M2QX9B'
  )
$$, '23514', 'buyer_email is stored normalized, not as typed');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a6', 'online',
    'good@example.test', 'call me', 'CF-K7M2QX9C'
  )
$$, '23514', 'buyer_phone must be digits with an optional leading +');

-- 4. Two online rows may not reuse one idempotency key (deviation 8).
select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000b1', 'online',
    'double@click.example.test', '08031234567', 'CF-K7M2QX9D'
  ), (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000b1', 'online',
    'double@click.example.test', '08031234567', 'CF-K7M2QX9E'
  )
$$, '23505', 'a repeated online idempotency key violates the partial unique index');

-- 5. The seller-scoped index still treats NULL sellers as distinct: it must not be "fixed" by
--    dropping it, because manual rows keep relying on it.
select lives_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, quantity, unit_price_ngn, payment_method,
    idempotency_key
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    '7a7a7a7a-0000-0000-0000-000000000002', 1, 15000, 'cash',
    '7b7b7b7b-0000-0000-0000-0000000000b2'
  )
$$, 'a manual row with a null-source default still inserts');

select * from finish();

reset role;
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db reset --local` then `npx supabase test db`
Expected: the new suite fails on `has_column(... 'source')` and every `lives_ok`/`throws_ok`
because the columns and the fourth status do not exist. The other 22 suites keep their existing
result — record the pass/fail count before you write any SQL, so you can tell your breakage from
the accepted drift baseline.

- [ ] **Step 3: Write the schema**

Create `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql` with this header and
section. Every later task appends after it.

```sql
-- An anonymous buyer may now order a ticket: source='online', a buyer's own contact details, a
-- generated reference, and no seller. Only officer-approved rows count as money or capacity, at
-- every site that computes either, so a staged order cannot move a balance even if every other
-- control were bypassed. Design: docs/superpowers/specs/2026-11-05-public-flow-landing-tickets-portal-design.md
-- §3-§7. This one migration holds the schema, the arithmetic, the guest write path and the review
-- rules together: splitting them would leave a deploy where production sums a set nobody approved.

-- 1. Columns on the sales table.
alter table public.event_ticket_sales
  add column if not exists source text not null default 'manual',
  add column if not exists buyer_email text,
  add column if not exists buyer_phone text,
  add column if not exists public_reference text;

-- An online row has no authoring member. Manual rows keep supplying one; nothing but the shape
-- CHECK below keeps the two from blurring.
alter table public.event_ticket_sales alter column seller_id drop not null;

-- 2. Constraints, guarded the way 20261028000000:29-41 does so a re-run is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_source_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_source_check
      check (source in ('manual', 'online'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_source_shape_check'
  ) then
    -- No created_by clause: the column does not exist on this table (plan deviation 7).
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_source_shape_check
      check (
        (source = 'manual' and seller_id is not null)
        or (source = 'online' and seller_id is null
            and buyer_email is not null and buyer_phone is not null
            and public_reference is not null)
      );
  end if;

  -- The house email rules, copied from notification_outbox_recipient_email_check
  -- (20261027000000:108-112): stored normalized, so the lookup's comparison cannot be
  -- case-tricked and one address has one spelling in the database.
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_buyer_email_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_buyer_email_check
      check (
        buyer_email is null
        or (buyer_email = pg_catalog.lower(pg_catalog.btrim(buyer_email))
            and pg_catalog.char_length(buyer_email) between 3 and 320
            and buyer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_buyer_phone_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_buyer_phone_check
      check (
        buyer_phone is null
        or (buyer_phone ~ '^\+?[0-9]{10,15}$' and buyer_phone !~ '[[:cntrl:]]')
      );
  end if;

  -- CF- + eight characters from an alphabet with no I/O/0/1. The prototype's `CF-2026-8492`
  -- is refused: 9000 values by Math.random() is brute-forceable, and a year baked into a stored
  -- column goes stale on 1 January.
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_public_reference_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_public_reference_check
      check (
        public_reference is null
        or public_reference ~ '^CF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
      );
  end if;
end $$;

-- 3. `cancelled` exists for ticket sales only. event_financial_transactions keeps its three
--    values: only a ticket can be cancelled without any money having moved.
do $$
begin
  alter table public.event_ticket_sales
    drop constraint event_ticket_sales_verification_status_check;
  alter table public.event_ticket_sales
    add constraint event_ticket_sales_verification_status_check
    check (verification_status in ('recorded', 'approved', 'rejected', 'cancelled'));
end $$;

-- 4. Indexes.
create unique index if not exists event_ticket_sales_public_reference_uidx
  on public.event_ticket_sales (public_reference)
  where public_reference is not null;

-- event_ticket_sales_seller_idempotency_uidx (20261003102501:137) cannot see a NULL seller:
-- NULLs are distinct in a unique index, so every online row could reuse one key. This is the
-- half that makes a double-clicked guest submit safe (deviation 8).
create unique index if not exists event_ticket_sales_online_idempotency_uidx
  on public.event_ticket_sales (idempotency_key)
  where seller_id is null;

-- The capacity scans now lead with the status they filter on.
create index if not exists event_ticket_sales_tier_approved_idx
  on public.event_ticket_sales (tier_id, created_at, id)
  where refunded_at is null and verification_status = 'approved';

-- 5. Grants. Event finance tables grant SELECT per column, so an ungranted new column silently
--    empties a whole dashboard read rather than erroring (20261003102501:234-241). anon and
--    service_role get nothing here, as elsewhere in this migration.
grant select (source, buyer_email, buyer_phone, public_reference)
  on public.event_ticket_sales to authenticated;

-- 6. A guest's proof of payment has no uploader. finance_receipts.uploaded_by is `not null`
--    (20261025120000:55) and nothing authorizes on it — can_read_finance_receipt grants any active
--    member read for scope 'event_ticket' (20261025120000:137-139). Deviation 18.
alter table public.finance_receipts alter column uploaded_by drop not null;
```

- [ ] **Step 4: Apply locally and run the suite**

```bash
npx supabase db reset --local        # clean replay; `db push` without --local hits PRODUCTION
npx supabase test db
```
Expected: this suite passes fully. `supabase/tests/database/event_finance_ticketing_ledger_test.sql`
may now fail where it asserts the three-value status CHECK — fix it in Step 5.

- [ ] **Step 5: Update the assertions the schema legitimately supersedes**

In `supabase/tests/database/event_finance_ticketing_ledger_test.sql`, find every `throws_ok` that
pins `'recorded', 'approved', 'rejected'` as the whole vocabulary and change it to assert
`cancelled` is accepted while a fifth value such as `'void'` still raises `23514`. Keep the rest
of that suite untouched.

- [ ] **Step 6: Re-run and commit**

```bash
npx supabase db reset --local && npx supabase test db
git add supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql supabase/tests/database/public_ticket_till_and_ledger_test.sql supabase/tests/database/event_finance_ticketing_ledger_test.sql
git commit -m "feat(tickets): give the sales ledger an online shape and a cancelled review status"
```

---

## Task 4: Approved-only arithmetic and the close gate

Nine SQL functions and `private.set_event_status` change in this task. Each sales sum gains one
predicate; no CASE branch is rewritten, because filtering in the subquery's `WHERE` (or the left
join's `ON`) removes a row from the add branch and the subtract branch at once — which is exactly
§4's branch-asymmetry rule: only approved money ever entered the totals, so only approved rows may
leave them. Deviation 17: `event_financial_transactions` sums are **not** touched.

**Files:**
- Modify: `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql` (append section 7)
- Modify: `supabase/tests/database/public_ticket_till_and_ledger_test.sql`
- Modify: `supabase/tests/database/club_event_shared_balance_test.sql`

**Interfaces:**
- Consumes: the `cancelled` status and the new columns from Task 3.
- Produces: the approved-only semantics every JS site in Tasks 15–16 must agree with, and the
  `pending-review-blocks-close` raise Task 2 already maps.

- [ ] **Step 1: Write the failing pgTAP assertions**

Insert before `select * from finish();` in
`supabase/tests/database/public_ticket_till_and_ledger_test.sql`. These insert sales directly (as
the trigger-tested rows in Task 3 already do) and then read the aggregates, because the aggregate
*is* the product being changed.

```sql
-- ── Approved-only arithmetic ────────────────────────────────────────────────────────────
-- A staged online sale and an approved one, side by side, on a tier with capacity 20.
select set_config('test.till_staged', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    3, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c1', 'online',
    'staged@example.test', '08031234567', 'CF-K7M2QX9F', 'recorded'
  ) returning id)::text, true);

select set_config('test.till_ok', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    2, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c2', 'online',
    'approved@example.test', '08031234568', 'CF-K7M2QX9G', 'approved'
  ) returning id)::text, true);

-- 6. The club balance and the per-event cash totals count the approved sale only.
is(
  (select net from private.event_cash_totals(current_setting('test.till_event')::uuid)),
  30000::numeric,
  'event_cash_totals counts approved ticket sales only');
is(
  (select net from private.event_cash_totals(null)),
  30000::numeric,
  'the club-wide balance sees the same approved-only event cash');

-- 7. Every reporting aggregate agrees with it.
select is((select ticket_income_ngn from private.event_finance_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'event_finance_summary counts approved sales only');
select is((select tickets_sold from private.event_finance_summary(
  current_setting('test.till_event')::uuid)), 2::bigint,
  'event_finance_summary counts approved quantity only');
select is((select ticket_income_ngn from private.event_finance_budget_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'event_finance_budget_summary counts approved sales only');
select is((select sold_quantity from private.event_ticket_tier_status(
  current_setting('test.till_event')::uuid)), 2::bigint,
  'tier status sells only what an officer approved');
select is((select sold_quantity from private.event_ticket_tier_status(null)), 0::bigint,
  'tier status stays gated for a null event');

select is((select ticket_income_ngn from private.event_finance_ticket_tier_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'tier summary counts approved sales with no date range');
select is((select ticket_income_ngn from private.event_finance_ticket_tier_summary(
  current_setting('test.till_event')::uuid,
  ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date - 1),
  ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + 1))),
  30000::numeric, 'tier summary counts approved sales inside a date range');

select is((select ticket_income_ngn from private.event_finance_report_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'report summary counts approved sales with no date range');
select is((select tickets_sold from private.event_finance_report_summary(
  current_setting('test.till_event')::uuid)), 2::bigint,
  'report summary counts approved quantity with no date range');

-- 8. §4's branch asymmetry. A rejected row carries refunded_at as well as its status; if the
--    ranged subtract branch could still see it, a sale created before the window and rejected
--    inside it would subtract money that was never added.
select set_config('test.till_rej', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status,
    refunded_at, refunded_by, refund_reason
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    4, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c3', 'online',
    'rejected@example.test', '08031234569', 'CF-K7M2QX9H', 'rejected',
    pg_catalog.clock_timestamp(), '7a7a7a7a-0000-0000-0000-000000000001',
    'No matching transfer'
  ) returning id)::text, true);

select set_config('test.till_cancel', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    5, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c4', 'online',
    'cancelled@example.test', '08031234570', 'CF-K7M2QX9J', 'cancelled'
  ) returning id)::text, true);

is((select ticket_income_ngn from private.event_finance_report_summary(
    current_setting('test.till_event')::uuid)), 30000::numeric,
  'a rejected and a cancelled sale move the un-ranged total by nothing');
is((select ticket_income_ngn from private.event_finance_report_summary(
    current_setting('test.till_event')::uuid,
    ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date - 1),
    ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + 1))),
  30000::numeric,
  'the ranged subtract branch ignores a rejected row, so nothing is over-subtracted');
is((select net from private.event_cash_totals(current_setting('test.till_event')::uuid)),
  30000::numeric, 'club balance ignores rejected and cancelled');

-- 9. Deviation 17 pinned from the other side: an officer transaction that is staged but paid
--    STILL moves event cash, because 20261102150000 defines event money as "did cash move".
--    This assertion exists so nobody applies the sales rule to transactions by accident.
select set_config('test.till_txn', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.till_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 10000,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => null, p_payer_payee => 'Sound hire', p_source_note => 'Staged but paid',
  p_payment_method => 'cash',
  p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000c5'::uuid
) as summary;

is((select net from private.event_cash_totals(current_setting('test.till_event')::uuid)),
  20000::numeric,
  'a paid but unreviewed event transaction still counts as cash that moved');

-- 10. §5 close gate. The event cannot close while a sale is staged.
select throws_ok($$
  select public.set_event_status(
    current_setting('test.till_event')::uuid, 'completed', 'Wrapping up'
  )
$$, '22000', 'Ticket sales or transactions still await review on this event.',
  'closing is refused while a ticket sale awaits review');

-- Cancelling the staged rows, then the same close succeeds.
update public.event_ticket_sales set verification_status = 'cancelled'
where verification_status = 'recorded';

select lives_ok($$
  select public.set_event_status(
    current_setting('test.till_event')::uuid, 'completed', 'Wrapping up'
  )
$$, 'closing works once nothing is staged');

-- The same-status call is still a no-op, gate or no gate (20261003101500:1025).
select lives_ok($$
  select public.set_event_status(
    current_setting('test.till_event')::uuid, 'completed', 'Again'
  )
$$, 're-submitting the current status stays a no-op');

-- 11. The public tier list agrees: `sold` is approved quantity. get_public_ticketed_events()
--     returns one jsonb; route it through a setting, as event_duration_12hour_test.sql does.
select set_config('test.till_public', public.get_public_ticketed_events()::text, true);
select is(
  (select (current_setting('test.till_public')::jsonb #>> '{events,0,tiers,0,sold}')),
  '2',
  'the public storefront sells approved tickets only');
```

`'2'` is the approved sale's quantity — the staged 3, the rejected 4 and the cancelled 5 must not
appear. If the assertion returns `NULL`, the event is missing from the payload rather than the
count being wrong: the suite's event is `scheduled`, unarchived and `ticketing_enabled`, so check
`limit 20` (`20261101010000:484`) before doubting the fixture. If the element order surprises you,
`{events,0,…}` is the payload's own order (`order by e.starts_at asc`), not insertion order.

- [ ] **Step 2: Run to verify they fail**

Run: `npx supabase db reset --local && npx supabase test db`
Expected: this suite fails at `event_cash_totals counts approved ticket sales only` (it returns
`75000`: staged 45 000 + approved 30 000) and at the close-gate `throws_ok` (no gate yet).

- [ ] **Step 3: Write the arithmetic**

Append to the migration. Each `create or replace` is a **full** copy of the live definition —
which is the one at the line noted, not an earlier one — with the sales filter added. Changing
only the filter is the whole diff; do not reformat the rest.

```sql
-- 7. Approved-only arithmetic. The rule lives at every site that sums event_ticket_sales, in one
--    migration, so no deploy can leave a window where production sums a set nobody approved.
--    event_financial_transactions keeps its 20261102150000 "did cash move" rule (plan deviation 17).

-- 7a. private.event_cash_totals — the live club balance AND the closing snapshot both read this.
create or replace function private.event_cash_totals(p_event_id uuid)
returns table (inflow numeric, outflow numeric, net numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select totals.v_inflow, totals.v_outflow, totals.v_inflow - totals.v_outflow
  from (
    select
      (
        coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
          from public.event_financial_transactions as t
          where t.kind = 'income' and t.payment_status = 'paid'
            and t.voided_at is null
            and (p_event_id is null or t.event_id = p_event_id)), 0::numeric)
        + coalesce((select pg_catalog.sum(s.amount_ngn::numeric)
          from public.event_ticket_sales as s
          where s.refunded_at is null
            and s.verification_status = 'approved'
            and (p_event_id is null or s.event_id = p_event_id)), 0::numeric)
      )::numeric as v_inflow,
      coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
        from public.event_financial_transactions as t
        where t.kind = 'expense' and t.payment_status in ('paid', 'deposit')
          and t.voided_at is null
          and (p_event_id is null or t.event_id = p_event_id)), 0::numeric
      )::numeric as v_outflow
  ) as totals;
$function$;
```

Then, in the same section, these seven (each `create or replace function` copied from the live
definition at the cited line, with the noted one-line addition):

| Function | Live definition | The added predicate |
| --- | --- | --- |
| `private.event_finance_summary(uuid)` | `20261013032242:541` | `and s.verification_status = 'approved'` in all three `from public.event_ticket_sales as s where s.event_id = p_event_id and s.refunded_at is null` subqueries (`:551`, `:553`, `:562`) |
| `private.event_finance_budget_summary(uuid)` | `20261013032242:567` | the same three places (`:582`, `:584`, `:591`) |
| `private.event_ticket_tier_status(uuid)` | `20261003102501:1058` | `left join … on s.tier_id = t.id and s.refunded_at is null and s.verification_status = 'approved'` (`:1064`) |
| `private.event_finance_ticket_tier_summary(uuid, date, date)` | `20261013040328:423` | one predicate on the left join's `ON` (`:455-467`): `and sale.verification_status = 'approved'`. Putting it on the join, not in the `CASE`s, is what removes non-approved rows from the ranged subtract branch too — §4's asymmetry, for free. |
| `private.event_finance_report_summary(uuid, date, date)` | `20261013040328:484` | `and s.verification_status = 'approved'` in the three sales subqueries' `where s.event_id = p_event_id` (`:525`, `:538`, `:558`). Its five `event_financial_transactions` sums stay as they are. |
| `public.get_public_ticketed_events()` | `20261101010000:428` | in the `tier_sales` CTE (`:445-452`) replace `and coalesce(ets.verification_status, 'approved') <> 'rejected'` with `and ets.verification_status = 'approved'` |
| `private.guard_event_ticket_sale_write()` | `20261028014047:113` | capacity sum at `:190-193` gains `and s.verification_status = 'approved'` |
| `public.record_event_ticket_sale(...)` | `20261025123000:420` | the pre-check at `:493-494` gains `and s.verification_status = 'approved'` |
| `private.guard_event_ticket_tier_write()` | `20261003102501:245` | the capacity-lowering sum at `:289-291` gains `and s.verification_status = 'approved'` |

Two consequences to state in the SQL comments as you write them, because they look like bugs:

- `record_event_ticket_sale` and the write guard can no longer refuse an over-capacity **staged**
  row. That is intended: an unapproved row reserves nothing. The binding check moves to approval
  time, which is Task 6.
- The `coalesce(ets.verification_status, 'approved') <> 'rejected'` in
  `get_public_ticketed_events` was written before `verification_status` had a `not null` default;
  the replacement is stricter and cannot misread a live row, because every row this table has ever
  held has a non-null status.

- [ ] **Step 4: Write the close gate**

Append:

```sql
-- 8. §5: an event cannot close while anything on it awaits review, so nothing can be left staged
--    behind a closed door. The message is phrase-stable and carries no count: raw database text is
--    matched into an allowlisted notice by rpcErrorNotice, and the counts go to the audit trail.
create or replace function private.set_event_status(
  p_event_id uuid, p_status text, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
-- COPY the whole live body from supabase/migrations/20261003101500_events_roles_budgets_lifecycle.sql:978-1047,
-- then insert the block below. Everything else — the role ladder at :1003-1009, the same-status
-- early return at :1025, the `for update` lock at :1019-1020 — stays byte-for-byte where it is.
$$;
```

The inserted block goes **after** `select … into v_event … for update;` and **before**
`update public.events set status = p_status …`:

```sql
  if p_status in ('completed', 'cancelled') then
    select
      (select pg_catalog.count(*) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.verification_status = 'recorded'),
      (select pg_catalog.count(*) from public.event_financial_transactions as t
        where t.event_id = p_event_id and t.verification_status = 'recorded')
    into v_pending_sales, v_pending_transactions;

    if v_pending_sales > 0 or v_pending_transactions > 0 then
      -- The counts belong in the audit row this function already writes, not in the message.
      perform private.append_event_finance_audit(
        v_actor_id, 'event_close_blocked_pending_review', 'event_financial_transaction',
        p_event_id, null,
        pg_catalog.jsonb_build_object(
          'pending_ticket_sales', v_pending_sales,
          'pending_transactions', v_pending_transactions),
        p_reason
      );
      raise exception using errcode = '22000',
        message = 'Ticket sales or transactions still await review on this event.';
    end if;
  end if;
```

and declare the two temporaries in that function's `declare` section:

```sql
  v_pending_sales bigint;
  v_pending_transactions bigint;
```

⚠️ `append_event_finance_audit` resolves its `event_id` from `p_entity_type`
(`20261003102501:464-473`), and it has no `'event'` branch — passing an event id with any other
entity type raises `23503 'Event financial audit target is unavailable.'` and the buyer-facing
notice never appears. So do **not** call that helper. Record the counts with the plain insert this
file already owns, or omit the audit line entirely and let the refusal speak for itself. The
simplest correct form is to drop the `perform` and keep only the `raise`:

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

Use that. §5's "the counts go into the audit log entry" cannot be honoured by this helper as it
stands, and inventing an audit path for a refusal that a member can retry in five seconds is not
worth a new `p_entity_type` branch — record that as a spec note in the commit message.

- [ ] **Step 5: Run everything**

```bash
npx supabase db reset --local && npx supabase test db
npm test -- tests/home-dashboard.test.mjs
```
Expected: the new suite's Task 4 block passes. `club_event_shared_balance_test.sql` **may** fail:
it asserts specific `event_cash_totals` numbers, and it only creates default-`approved` rows, so a
failure there means it inserted a `recorded` row — read the failing assertion and add
`verification_status = 'approved'` to that fixture's insert rather than changing the expectation.
If it fails on the transaction-leg case, deviation 17 was not followed.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql supabase/tests/database/public_ticket_till_and_ledger_test.sql supabase/tests/database/club_event_shared_balance_test.sql
git commit -m "feat(ledger): count only approved ticket sales, and refuse to close on a staged queue"
```

---

## Task 5: The guest write path — guard branch, `submit_ticket_order`, `lookup_ticket_order`

This is the only task that gives `anon` anything. Two definer functions, no table privileges, and
a guard branch that accepts a row only if it already matches the online shape — so the till's
authority is the shape CHECK from Task 3, not a new permission.

**Files:**
- Modify: `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql` (append section 9)
- Modify: `supabase/tests/database/public_ticket_till_and_ledger_test.sql`

**Interfaces:**
- Consumes: Task 3's columns, constraints and both partial unique indexes; Task 2's raise texts.
- Produces:
  - `public.submit_ticket_order(p_event_id uuid, p_tier_id uuid, p_quantity integer, p_buyer_name text, p_buyer_email text, p_buyer_phone text, p_idempotency_key uuid, p_sale_id uuid, p_receipt_id uuid, p_receipt_filename text, p_receipt_object_key text, p_receipt_content_type text, p_receipt_size_bytes integer, p_receipt_sha256 text) returns jsonb` — `{"sale_id","public_reference","deduplicated"}`
  - `public.lookup_ticket_order(p_reference text, p_email text) returns table (public_reference text, event_title text, event_starts_at timestamptz, tier_name text, quantity integer, amount_ngn bigint, payment_method text, verification_status text, created_at timestamptz, outcome_reason text)`
  Task 10 calls the first; Task 14 calls the second.

- [ ] **Step 1: Write the failing pgTAP assertions**

Append to the test file, before `finish()`. `set local role anon` is what makes these honest — an
assertion run as the definer's own role would prove nothing about the grant.

```sql
-- ── The guest write path ────────────────────────────────────────────────────────────────
-- The tier must have room for the throttle test's 20 orders, and the suite's tier has capacity 20.
reset role;
update public.event_ticket_tiers set capacity = 200
where id = current_setting('test.till_tier')::uuid;

set local role anon;

-- 12. A well-formed order is accepted and returns both secrets the buyer needs.
select set_config('test.till_guest', o->>'public_reference', true)
from public.submit_ticket_order(
  p_event_id => current_setting('test.till_event')::uuid,
  p_tier_id => current_setting('test.till_tier')::uuid,
  p_quantity => 2, p_buyer_name => 'Chidi Obi',
  p_buyer_email => '  Chidi@Example.TEST  ', p_buyer_phone => '08031234571',
  p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000d1',
  p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000d2',
  p_receipt_id => '7b7b7b7b-0000-0000-0000-0000000000d3',
  p_receipt_filename => 'transfer-slip.pdf', p_receipt_object_key =>
    'receipts/event_ticket/7b7b7b7b-0000-0000-0000-0000000000d2/7b7b7b7b-0000-0000-0000-0000000000d3.pdf',
  p_receipt_content_type => 'application/pdf', p_receipt_size_bytes => 20480,
  p_receipt_sha256 => pg_catalog.repeat('a', 64)
) as o;

select match(
  (select current_setting('test.till_guest')), '^CF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$',
  'a guest order returns a CF- reference from the unambiguous alphabet');

select is(
  (select s.verification_status from public.event_ticket_sales as s
    where s.id = '7b7b7b7b-0000-0000-0000-0000000000d2'),
  'recorded', 'an online order starts staged, so it counts as nothing');
select is(
  (select s.buyer_email from public.event_ticket_sales as s
    where s.id = '7b7b7b7b-0000-0000-0000-0000000000d2'),
  'chidi@example.test', 'the buyer email is normalized before it is stored');
select is(
  (select s.seller_id from public.event_ticket_sales as s
    where s.id = '7b7b7b7b-0000-0000-0000-0000000000d2'),
  NULL::uuid, 'an online order has no seller');

-- 13. The same key returns the same reference instead of a second order.
select is(
  (select o->>'public_reference' from public.submit_ticket_order(
    p_event_id => current_setting('test.till_event')::uuid,
    p_tier_id => current_setting('test.till_tier')::uuid,
    p_quantity => 2, p_buyer_name => 'Chidi Obi',
    p_buyer_email => 'chidi@example.test', p_buyer_phone => '08031234571',
    p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000d1',
    p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000d9',
    p_receipt_id => '7b7b7b7b-0000-0000-0000-0000000000da',
    p_receipt_filename => 'transfer-slip.pdf', p_receipt_object_key => 'x',
    p_receipt_content_type => 'application/pdf', p_receipt_size_bytes => 20480,
    p_receipt_sha256 => pg_catalog.repeat('a', 64)
  ) as o),
  current_setting('test.till_guest'),
  'a replayed idempotency key returns the original reference');
select is((select pg_catalog.count(*) from public.event_ticket_sales as s
  where s.buyer_email = 'chidi@example.test'), 1::bigint,
  'the replay created no second row');

-- 14. Validation refusals.
select throws_ok($$
  select public.submit_ticket_order(
    p_event_id => current_setting('test.till_event')::uuid,
    p_tier_id => current_setting('test.till_tier')::uuid, p_quantity => 11,
    p_buyer_name => 'Too Many', p_buyer_email => 'many@example.test',
    p_buyer_phone => '08031234572',
    p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000e1',
    p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000e2', p_receipt_id => null,
    p_receipt_filename => null, p_receipt_object_key => null,
    p_receipt_content_type => null, p_receipt_size_bytes => null,
    p_receipt_sha256 => null)
$$, '23514', 'the online ceiling refuses quantity 11');

select throws_ok($$
  select public.submit_ticket_order(
    p_event_id => current_setting('test.till_event')::uuid,
    p_tier_id => current_setting('test.till_tier')::uuid, p_quantity => 1,
    p_buyer_name => 'Bad Email', p_buyer_email => 'not-an-email',
    p_buyer_phone => '08031234573',
    p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000e3',
    p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000e4', p_receipt_id => null,
    p_receipt_filename => null, p_receipt_object_key => null,
    p_receipt_content_type => null, p_receipt_size_bytes => null,
    p_receipt_sha256 => null)
$$, '22023', 'an invalid email is refused');

-- 15. The per-email throttle: three live orders per address per event.
select throws_ok($$
  do $$
  declare i int;
  begin
    for i in 1..4 loop
      perform public.submit_ticket_order(
        p_event_id => current_setting('test.till_event')::uuid,
        p_tier_id => current_setting('test.till_tier')::uuid, p_quantity => 1,
        p_buyer_name => 'Flood Buyer',
        p_buyer_email => 'flood@example.test', p_buyer_phone => '08031234574',
        p_idempotency_key => ('7b7b7b7b-0000-0000-0000-0000000000f' || i)::uuid,
        p_sale_id => ('7b7b7b7b-0000-0000-0000-0000000000g' || i)::uuid,
        p_receipt_id => null, p_receipt_filename => null, p_receipt_object_key => null,
        p_receipt_content_type => null, p_receipt_size_bytes => null,
        p_receipt_sha256 => null);
    end loop;
  end $$;
$$, '22000', 'This email address has too many pending ticket orders for this event.',
  'the fourth live order from one address on one event is refused');

-- 16. Lookup needs both halves, and a case-insensitive reference.
select is((select pg_catalog.count(*) from public.lookup_ticket_order(
    (select lower(current_setting('test.till_guest'))), 'chidi@example.test'))::integer,
  1, 'the lookup normalizes reference case, so a retyped lowercase k still finds the order');

select is((select pg_catalog.count(*) from public.lookup_ticket_order(
    current_setting('test.till_guest'), 'someone-else@example.test'))::integer,
  0, 'a wrong email returns no rows, not an error, so references cannot be probed');

select is((select pg_catalog.count(*) from public.lookup_ticket_order(
    current_setting('test.till_guest'), NULL)), 0, 'a reference alone returns nothing');

reset role;
```

The third and fourth assertions are the no-enumeration property (§6) in two lines: the pair must
match, and neither half alone answers anything.

- [ ] **Step 2: Run to verify they fail**

Run: `npx supabase db reset --local && npx supabase test db`
Expected: `submit_ticket_order` does not exist → `42883 function does not exist`, reported as a
suite-level failure. Note the expected failure text now, so Step 3's success is distinguishable.

- [ ] **Step 3: The guard's online branch**

`private.guard_event_ticket_sale_write` is a trigger body of ~85 lines
(`20261028014047:113-199`). Re-`create or replace` it in full, inserting this block **immediately
after** the DELETE refusal and **before** the active-membership check at `:125-127` — order
matters, because every later rule assumes a member session:

```sql
  -- An online row is created by no one. It is accepted on shape alone, and only by no one: an
  -- officer who wants to sell a ticket has record_event_ticket_sale, which attributes them.
  if new.source = 'online' then
    if v_actor_id is not null then
      raise exception using errcode = '42501',
        message = 'Online ticket orders cannot be recorded by a signed-in member.';
    end if;
    if new.verification_status <> 'recorded' then
      raise exception using errcode = '42501',
        message = 'Online ticket orders must enter the review queue as recorded.';
    end if;
    if new.refunded_at is not null then
      raise exception using errcode = '42501',
        message = 'Online ticket orders cannot carry a refund.';
    end if;
    if not (select pg_catalog.count(*) = 1
      from public.event_ticket_tiers as t
      where t.id = new.tier_id and t.event_id = new.event_id and t.retired_at is null) then
      raise exception using errcode = '42501',
        message = 'Ticket sales require a scheduled event with ticketing enabled.';
    end if;
    if new.unit_price_ngn <> (select t.price_ngn from public.event_ticket_tiers as t
      where t.id = new.tier_id) then
      raise exception using errcode = '42501',
        message = 'Ticket price must match the tier.';
    end if;
    return new;
  end if;
```

Then re-read the rest of the body and confirm two things, both of which the block above depends on:

- the event-status check at `:149-153` (`Ticket sales require a scheduled event with ticketing
  enabled.`) runs for INSERT **and** UPDATE *after* this branch, so the early `return new` above
  skips it. That is why the branch re-checks the tier and must re-check the event. Add that check
  to the block rather than relying on the fall-through:

  ```sql
    if not exists (
      select 1 from public.events as e
      where e.id = new.event_id and e.status = 'scheduled'
        and e.archived_at is null and e.ticketing_enabled
    ) then
      raise exception using errcode = '42501',
        message = 'This event is no longer accepting ticket orders.';
    end if;
  ```

  Place it first among the online checks, so a closed event answers with the §13 message and not
  the generic one. This is what makes `box-office-closed` reachable at all: the till closes the
  moment the event does, and the buyer is told so rather than shown `denied`.
- the UPDATE rules at `:166-188` and the capacity block at `:190-196` are unreachable for an online
  INSERT but still reachable for the review function's UPDATE, which sets `source` to its existing
  value `'online'`. Read `:166` before you write: if the UPDATE branch keys off `tg_op = 'UPDATE'`
  (it does), the online branch above must test `tg_op` too, or an approval would be refused by the
  `verification_status <> 'recorded'` rule. The correct guard is therefore
  `if new.source = 'online' and tg_op = 'INSERT' then`. Confirm against the live body and adjust —
  an approval of an online row must still pass through the normal UPDATE rules, which is exactly
  how `verify_event_ticket_sale`'s `app.event_verification_active` bypass works today.

- [ ] **Step 4: `submit_ticket_order`**

Append:

```sql
-- 9a. The only path an anonymous session can take to create a ticket sale. security definer with an
--     empty search path, revoked from everyone, granted to anon alone; anon holds no table
--     privileges anywhere in this migration.
create or replace function public.submit_ticket_order(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_idempotency_key uuid,
  p_sale_id uuid,
  p_receipt_id uuid,
  p_receipt_filename text,
  p_receipt_object_key text,
  p_receipt_content_type text,
  p_receipt_size_bytes integer,
  p_receipt_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_sid uuid := coalesce(p_sale_id, pg_catalog.gen_random_uuid());
  v_tier public.event_ticket_tiers%rowtype;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_buyer_email, '')));
  v_phone text := pg_catalog.btrim(coalesce(p_buyer_phone, ''));
  v_name text := pg_catalog.btrim(coalesce(p_buyer_name, ''));
  v_existing public.event_ticket_sales%rowtype;
  v_live_per_email bigint;
  v_live_per_email_event bigint;
  v_live_per_event bigint;
  v_reference text;
  v_bytes bytea;
  v_chars text;
  v_index integer;
  v_attempt integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  -- An officer has their own path. Unattributed sales must not be mintable from a session.
  if v_actor_id is not null then
    raise exception using errcode = '42501',
      message = 'Online ticket orders cannot be recorded by a signed-in member.';
  end if;

  if p_event_id is null or p_tier_id is null or p_idempotency_key is null
     or p_quantity is null or p_quantity not between 1 and 10 then
    raise exception using errcode = '23514',
      message = 'The ticket order values are invalid.';
  end if;

  if v_name = '' or pg_catalog.char_length(v_name) > 160 or v_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514',
      message = 'The ticket order values are invalid.';
  end if;

  if not (select private.is_valid_email(v_email)) then
    raise exception using errcode = '22023', message = 'The buyer email address is invalid.';
  end if;

  if v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception using errcode = '22023', message = 'The buyer phone number is invalid.';
  end if;

  select * into v_tier from public.event_ticket_tiers
  where id = p_tier_id and event_id = p_event_id and retired_at is null;
  if not found then
    raise exception using errcode = '23503', message = 'Ticket tier not found.';
  end if;

  if p_receipt_filename is not null
     or p_receipt_object_key is not null
     or p_receipt_content_type is not null
     or p_receipt_size_bytes is not null
     or p_receipt_sha256 is not null then
    if p_receipt_id is null or p_receipt_object_key is null
       or p_receipt_filename is null or p_receipt_content_type is null
       or p_receipt_size_bytes is null or p_receipt_sha256 is null then
      raise exception using errcode = '22023',
        message = 'Receipt metadata required for bank transfer ticket sales.';
    end if;
    -- The key must be exactly what runReceiptEntry already wrote (receipt-rules.mjs:40). An
    -- arbitrary key here would point the row at someone else's object.
    if p_receipt_object_key <> ('receipts/event_ticket/' || v_sid::text || '/'
        || p_receipt_id::text || '.' || case p_receipt_content_type
          when 'application/pdf' then 'pdf'
          when 'image/jpeg' then 'jpg'
          when 'image/png' then 'png'
          else 'bin' end) then
      raise exception using errcode = '22023', message = 'Object key mismatch.';
    end if;
    if v_tier.price_ngn <= 0 then
      raise exception using errcode = '22023', message = 'The ticket order values are invalid.';
    end if;
  end if;

  -- One event row per order, and it serialises the throttle counts below.
  perform 1 from public.events where id = p_event_id for update;

  select * into v_existing
  from public.event_ticket_sales as s
  where s.idempotency_key = p_idempotency_key and s.seller_id is null;
  if found then
    if v_existing.event_id = p_event_id and v_existing.tier_id = p_tier_id
       and v_existing.quantity = p_quantity then
      return pg_catalog.jsonb_build_object(
        'sale_id', v_existing.id,
        'public_reference', v_existing.public_reference,
        'deduplicated', true);
    end if;
    raise exception using errcode = '23505',
      message = 'This submission key was already used for different ticket order data.';
  end if;

  -- Throttles. Email- and event-scoped because the database cannot see an IP address; the server
  -- action adds the cheap front-of-house defences on top.
  select
    (select pg_catalog.count(*) from public.event_ticket_sales as s
      where s.buyer_email = v_email and s.event_id = p_event_id
        and s.verification_status = 'recorded'),
    (select pg_catalog.count(*) from public.event_ticket_sales as s
      where s.buyer_email = v_email and s.verification_status = 'recorded'),
    (select pg_catalog.count(*) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.source = 'online'
        and s.verification_status = 'recorded')
  into v_live_per_email_event, v_live_per_email, v_live_per_event;

  if v_live_per_email >= 5 then
    raise exception using errcode = '22000',
      message = 'This email address has too many pending ticket orders.';
  end if;
  if v_live_per_email_event >= 3 then
    raise exception using errcode = '22000',
      message = 'This email address has too many pending ticket orders for this event.';
  end if;
  if v_live_per_event >= 20 then
    raise exception using errcode = '22000',
      message = 'The box office has reached its limit of pending orders for this event.';
  end if;

  -- CF- + 8 characters from a 32-symbol alphabet, so 2^40 combinations. get_byte returns 0..255
  -- and 256 is a multiple of 32, so the modulo is unbiased. No I/O/0/1: a reference retyped from an
  -- email cannot be misread.
  <<reference_loop>>
  loop
    v_bytes := pg_catalog.gen_random_bytes(8);
    v_chars := '';
    for v_index in 0..7 loop
      v_chars := v_chars || pg_catalog.substr(
        '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
        (pg_catalog.get_byte(v_bytes, v_index) % 32) + 1, 1);
    end loop;
    v_reference := 'CF-' || v_chars;
    exit reference_loop when not exists (select 1 from public.event_ticket_sales
      where public_reference = v_reference);
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then
      raise exception using errcode = '22000',
        message = 'The ticket order could not be completed. Please try again.';
    end if;
  end loop;

  begin
    insert into public.event_ticket_sales (
      id, event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
      payment_method, idempotency_key, created_at, updated_at,
      source, buyer_email, buyer_phone, public_reference, verification_status
    ) values (
      v_sid, p_event_id, p_tier_id, null, v_name, p_quantity, v_tier.price_ngn,
      'bank_transfer', p_idempotency_key, v_now, v_now,
      'online', v_email, v_phone, v_reference, 'recorded'
    );
  exception when unique_violation then
    -- Two concurrent double-clicks: one row wins, and the loser shows the buyer the winner's
    -- reference rather than an error (plan deviation 8).
    if pg_catalog.sqlstate = '23505' then
      select * into v_existing
      from public.event_ticket_sales as s
      where s.idempotency_key = p_idempotency_key and s.seller_id is null;
      if found then
        return pg_catalog.jsonb_build_object(
          'sale_id', v_existing.id,
          'public_reference', v_existing.public_reference,
          'deduplicated', true);
      end if;
    end if;
    raise;
  end;

  if p_receipt_id is not null then
    insert into public.finance_receipts (
      id, scope, event_ticket_sale_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event_ticket', v_sid, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, null
    );
  end if;

  -- No audit row: audit_log.actor_id is `not null` and a stranger has no profile (deviation 19).
  return pg_catalog.jsonb_build_object(
    'sale_id', v_sid, 'public_reference', v_reference, 'deduplicated', false);
end;
$$;

revoke all on function public.submit_ticket_order(uuid, uuid, integer, text, text, text, uuid, uuid, uuid, text, text, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_ticket_order(uuid, uuid, integer, text, text, text, uuid, uuid, uuid, text, text, text, integer, text)
  to anon;
```

Three notes about the body above:

- `v_index` is declared with the other loop locals (see the `declare` block) — plpgsql has no implicit
  loop variable, and the `for v_index in 0..7 loop` needs it.
- The `<<reference_loop>>` label pairs with `exit reference_loop when not exists (…)`. The `for` loop has
  already closed by then, so a bare `exit when` would also work; keep the label so the retry bound
  (`v_attempt > 10`) reads as belonging to a named loop.
- A guest order is always `payment_method = 'bank_transfer'`: the till takes bank transfer only,
  and `cash` at an officer's keyboard is the manual path. The RPC does not accept a method
  parameter, so a stranger cannot pick one.

- [ ] **Step 5: `lookup_ticket_order`**

```sql
-- 9b. The buyer's status read. Both secrets must match, and a mismatch returns no rows rather than
--     an error, so this cannot be used to confirm that a reference exists. It never returns the
--     receipt, never the phone number, and never a second buyer's row.
create or replace function public.lookup_ticket_order(p_reference text, p_email text)
returns table (
  public_reference text, event_title text, event_starts_at timestamptz,
  tier_name text, quantity integer, amount_ngn bigint,
  payment_method text, verification_status text, created_at timestamptz,
  outcome_reason text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.public_reference, e.title, e.starts_at, t.name, s.quantity, s.amount_ngn,
    s.payment_method, s.verification_status, s.created_at,
    case when s.verification_status in ('rejected', 'cancelled')
      then coalesce(s.rejection_reason, s.refund_reason) end
  from public.event_ticket_sales as s
  join public.events as e on e.id = s.event_id
  join public.event_ticket_tiers as t on t.id = s.tier_id
  where s.source = 'online'
    and s.public_reference = pg_catalog.upper(pg_catalog.btrim(coalesce(p_reference, '')))
    and s.buyer_email = pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
$function$;

revoke all on function public.lookup_ticket_order(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.lookup_ticket_order(text, text) to anon;
```

`upper(btrim(coalesce(...)))` makes an empty input `' '`-normalised to nothing match nothing, which
is the wanted answer for a blank form.

- [ ] **Step 6: Run and commit**

```bash
npx supabase db reset --local && npx supabase test db
```
Expected: the guest-path block passes. If `set local role anon` fails with `permission denied for
function`, the `revoke … from public` line ran after the `grant` — the order in the file is
revoke-then-grant, and PostgREST's `anon` role resolves through `public`, so check both.

```bash
git add supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql supabase/tests/database/public_ticket_till_and_ledger_test.sql
git commit -m "feat(tickets): let anon sell a ticket through two definer functions and nothing else"
```

---

## Task 6: `cancelled` as a third review decision

`verify_event_ticket_sale` owns the whole lifecycle: `recorded → approved | rejected | cancelled`.
One function, one audit action, one segregation-of-duties rule. This task also installs the
approval-time capacity check that deviation 12 proves is necessary.

**Files:**
- Modify: `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql` (append section 10)
- Modify: `supabase/tests/database/public_ticket_till_and_ledger_test.sql`
- Modify: `supabase/tests/database/event_finance_ticketing_ledger_test.sql` (the assertions that
  pinned a two-decision vocabulary)

**Interfaces:**
- Consumes: Task 3's `cancelled` value; Task 4's approved-only sums; the existing 3-parameter
  signature `(p_sale_id uuid, p_decision text, p_reason text default null)`.
- Produces: the decision set `approved | rejected | cancelled` that Tasks 10, 13 and 15 render and
  call. PostgREST resolves by argument name, so the signature is unchanged (`20261028014047:279`).

- [ ] **Step 1: Write the failing assertions**

```sql
-- ── The review lifecycle ────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000001', true);

-- A staged row counts as nothing before it is approved and as something after.
select is((select net from private.event_cash_totals(current_setting('test.till_event')::uuid)) > 0,
  true, 'baseline: the approved sale already counts');

select set_config('test.till_appr', (
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    null, 'To Approve', 1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-000000000011', 'online',
    'approve@example.test', '08031234581', 'CF-K7M2QX9K', 'recorded'
  ) returning id)::text, true);

select is((select pg_catalog.sum(s.quantity) from public.event_ticket_sales as s
  where s.tier_id = current_setting('test.till_tier')::uuid
    and s.verification_status = 'approved'), 2::bigint,
  'the newly staged row is not yet counted');

select lives_ok($$
  select public.verify_event_ticket_sale(
    current_setting('test.till_appr')::uuid, 'approved', null)
$$, 'an officer may approve an online order');

select is(
  (select s.verification_status from public.event_ticket_sales as s
    where s.id = current_setting('test.till_appr')::uuid), 'approved',
  'approval flips the status');
select is(
  (select s.refunded_at is null from public.event_ticket_sales as s
    where s.id = current_setting('test.till_appr')::uuid), true,
  'approval never refunds');

-- Cancel: sets the reason, touches neither refund column, and is terminal.
select set_config('test.till_canc', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-000000000012', 'online',
    'cancel@example.test', '08031234582', 'CF-K7M2QX9M', 'recorded'
  ) returning id)::text, true);

select lives_ok($$
  select public.verify_event_ticket_sale(
    current_setting('test.till_canc')::uuid, 'cancelled', 'Transfers closed')
$$, 'an officer may cancel an online order');

select is(
  (select s.refunded_at is null and s.refund_reason is null and s.refunded_by is null
    from public.event_ticket_sales as s where s.id = current_setting('test.till_canc')::uuid),
  true, 'cancellation touches no refund column: nothing arrived, so nothing returns');
select is(
  (select s.rejection_reason from public.event_ticket_sales as s
    where s.id = current_setting('test.till_canc')::uuid), 'Transfers closed',
  'cancellation records the reason the buyer is emailed');

select throws_ok($$
  select public.verify_event_ticket_sale(
    current_setting('test.till_canc')::uuid, 'approved', null)
$$, '23514', 'cancelled is terminal');

select throws_ok($$
  select public.verify_event_ticket_sale(
    current_setting('test.till_canc')::uuid, 'cancelled', 'again')
$$, '23514', 'a second cancellation is refused');

select throws_ok($$
  select public.verify_event_ticket_sale(
    current_setting('test.till_canc')::uuid, 'cancelled', 'abc')
$$, '22023', 'a cancellation needs the same 5-character reason as a rejection');

-- Deviation 12: approving past capacity must fail, because the write guard's capacity block is
-- bypassed by the app.event_verification_active early return.
reset role;
update public.event_ticket_tiers set capacity = 2
where id = current_setting('test.till_tier')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000001', true);

select set_config('test.till_over', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    9, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-000000000013', 'online',
    'oversell@example.test', '08031234583', 'CF-K7M2QX9N', 'recorded'
  ) returning id)::text, true);

select throws_ok($$
  select public.verify_event_ticket_sale(
    current_setting('test.till_over')::uuid, 'approved', null)
$$, '23514', 'Ticket tier capacity has been reached.',
  'approval refuses to oversell a tier, reusing the guard raise text and code');

reset role;
```

- [ ] **Step 2: Run to verify they fail**

`npx supabase db reset --local && npx supabase test db` — `cancelled` is refused by the decision
whitelist (`20261028014047:297-299`) and the capacity case passes when it should fail.

- [ ] **Step 3: Re-write `verify_event_ticket_sale`**

`create or replace function public.verify_event_ticket_sale(p_sale_id uuid, p_decision text,
p_reason text default null) returns void` copied from `20261028014047:279-391` **in full**, with
four edits:

1. Decision whitelist (`:297-299`):

```sql
  if p_decision is null or p_decision not in ('approved', 'rejected', 'cancelled') then
    raise exception using errcode = '23514', message = 'The review decision is invalid.';
  end if;
```

2. Reason rule (`:301-303`) — one clause for both terminal refusals, because a stranger is waiting
   on either email:

```sql
  if p_decision in ('rejected', 'cancelled')
     and pg_catalog.char_length(coalesce(v_trimmed_reason, '')) < 5 then
    raise exception using errcode = '22023',
      message = 'A rejection or cancellation reason is required.';
  end if;
```

3. Approval-time capacity, inside the `approved` branch (`:352-363`) **before** the update, so the
   bypass in the write guard never gets to be the only thing standing between the till and an
   oversold tier. It reuses the guard's own code and text so "capacity" is one message in one place
   (`rpc-error-notice.ts` maps it to `budget-exceeded`, which is already the club's capacity
   wording):

```sql
    select coalesce(pg_catalog.sum(s.quantity), 0) into v_approved_sold
    from public.event_ticket_sales as s
    where s.tier_id = v_sale.tier_id and s.refunded_at is null
      and s.verification_status = 'approved'
      and s.id <> v_sale.id;

    if exists (
      select 1 from public.event_ticket_tiers as t
      where t.id = v_sale.tier_id
        and t.capacity is not null
        and v_approved_sold + v_sale.quantity > t.capacity
    ) then
      raise exception using errcode = '23514',
        message = 'Ticket tier capacity has been reached.';
    end if;
```

   Declare `v_approved_sold bigint;`. Note `t.capacity is not null` — an open-ended tier cannot be
   oversold.

4. The `cancelled` branch, modelled on the `rejected` one at `:364-371` with the refund columns
   left alone:

```sql
  elsif p_decision = 'cancelled' then
    update public.event_ticket_sales
      set verification_status = 'cancelled',
          verified_by = v_actor_id,
          verified_at = v_now,
          rejection_reason = v_trimmed_reason,
          updated_at = v_now
      where id = p_sale_id;
```

The terminal rule at `:346-348` (`if v_sale.verification_status = 'rejected' or
v_sale.refunded_at is not null then raise … 'already-processed'`) must gain the new state, or a
cancelled row can be re-reviewed:

```sql
  if v_sale.verification_status in ('rejected', 'cancelled')
     or v_sale.refunded_at is not null then
    raise exception using errcode = '23514',
      message = 'This ticket sale was already reviewed.';
  end if;
```

That is the text `/already been (reviewed|refunded)/i` **does not** match. Keep the existing
sentence — `This ticket sale has already been reviewed.` — and only widen the condition. Task 2's
`already-processed` mapping depends on the phrase, and `event_finance_ticketing_ledger_test.sql`
asserts it.

Leave untouched: the guard lock at `:305`, the `for update` fetch at `:307-310`, the archived
refusal at `:320-322`, the role ladder at `:325-334`, the segregation-of-duties comparison at
`:337-343` (for an online row `v_sale.seller_id` is null, so `is distinct from` makes every
authorised officer eligible — §7 wants that), the `set_config('app.event_verification_active', …)`
at `:350`, and the audit call at `:373-389` (its `after_data` already carries the decision).

- [ ] **Step 4: Run and commit**

```bash
npx supabase db reset --local && npx supabase test db
```
Expected: the lifecycle block passes. Update the two stale assertions in
`supabase/tests/database/event_finance_ticketing_ledger_test.sql` that expect a third decision to
be refused, and leave every other expectation in that file alone.

```bash
git add supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql supabase/tests/database/public_ticket_till_and_ledger_test.sql supabase/tests/database/event_finance_ticketing_ledger_test.sql
git commit -m "feat(tickets): let one review function own the whole sale lifecycle"
```

---

## Task 7: Migration checkpoint — clean replay and the pgTAP baseline

The migration is finished after Task 6. This task proves it replays from nothing and that the
approved-only rule did not move a number any existing suite depends on. It is a gate, not a
writing task: if anything here fails, go back to the task that owns the failing object.

**Files:**
- Modify: `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql` only if a replay
  error requires it

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces: the recorded suite baseline Task 17 cites, and confidence that Task 18's production
  apply will not fail on the way up.

- [ ] **Step 1: Replay from zero**

```bash
npx supabase db reset --local
```
Expected: the whole migration set applies with no error. A `does not exist` here means a Task 3–6
`create or replace` referenced something a later task creates — the functions in this file are
ordered schema → sums → guard → RPCs → review, and that order is load-bearing because
`guard_event_ticket_sale_write` is a trigger function that must exist before the trigger fires.

- [ ] **Step 2: Run the full pgTAP suite and record the counts**

```bash
npx supabase test db 2>&1 | tee /tmp/pgtap-plan-a.txt
```
Expected: `public_ticket_till_and_ledger_test.sql` passes with 0 failures. Read the per-file lines
for the other 22 suites and write the pass/fail counts into the commit message body.

Known drift, already accepted by this project (`docs/superpowers/plans` history and the project
memory note *pgTAP baseline*): seven suites reference function names that were later renamed, and
a `+N` count failure means leftover rows in the local database rather than new breakage. If a
suite that passed before Task 4 now fails, that is not drift — it is the approved-only rule moving
a sum, and Task 4's deviation 17 is the thing to re-read.

- [ ] **Step 3: Confirm no balance shifted for the wrong reason**

```bash
npx supabase db query --linked --local "
  select verification_status, pg_catalog.count(*),
         pg_catalog.coalesce(pg_catalog.sum(amount_ngn), 0) as ngn
  from public.event_ticket_sales group by 1 order by 1;"
```
Expected on a fresh local reset: only `approved` rows, from the fixtures the seed data creates. If
the local database has `recorded` rows, they came from a test transaction that did not roll back —
investigate before assuming the filter is wrong.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql supabase/tests/database/public_ticket_till_and_ledger_test.sql
git commit -m "test(database): replay the till and ledger migration against the full pgTAP suite"
```

If Step 1 or Step 2 required a change, commit it here. If they passed as-is, skip the commit
(`git commit` with nothing staged is a no-op — do not force one).

---

## Task 8: Server-side order parsing — `src/lib/ticket-order-intake.mjs`

The action cannot be unit-tested while its validation lives inline in a `"use server"` file:
importing `src/app/actions.ts` pulls in the Supabase server client. So the parsing and the two
front-of-house defences (honeypot, elapsed time) are a pure module the action calls and the tests
import directly. §6's cheap defences are the only things in this project's public surface that
exist — there is no rate limit, captcha or time check anywhere else, and the CSP
(`src/proxy.ts:24`) would need widening before a third-party captcha could load at all.

**Files:**
- Create: `src/lib/ticket-order-intake.mjs`
- Test: `tests/ticket-order-intake.test.mjs`

**Interfaces:**
- Consumes: `MAX_ONLINE_QUANTITY` from `src/lib/ticket-order-state.mjs` (Task 1) — one ceiling,
  defined once, shared by the URL clamp, this parser and the RPC.
- Produces: `HONEYPOT_FIELD`, `MIN_SUBMIT_SECONDS`, `parseTicketOrderForm(formData)`,
  `isHoneypotClean(formData)`, `isElapsedEnough(renderedAt, now)`. Task 10 calls all three; Task
  12 renders the fields this parser expects by name.

- [ ] **Step 1: Write the failing test**

Create `tests/ticket-order-intake.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HONEYPOT_FIELD,
  MIN_SUBMIT_SECONDS,
  isElapsedEnough,
  isHoneypotClean,
  parseTicketOrderForm,
} from "../src/lib/ticket-order-intake.mjs";

const EVENT_ID = "6b1f9b7a-3d2c-4f70-9b2a-1c7d3e5a8b11";
const TIER_ID = "9c2a0c8b-4e3d-4a81-8c3b-2d8e4f6b9c22";
const KEY = "1d3b7f2c-5a4e-4b92-9d4c-3e9f5a7c0d33";
const SALE_ID = "2e4c8a3d-6b5f-4ca3-8e5d-4fa06b8d1e44";

function form(overrides = {}) {
  const data = new FormData();
  const values = {
    event_id: EVENT_ID,
    tier_id: TIER_ID,
    quantity: "2",
    buyer_name: "Chidi Obi",
    buyer_email: " Chidi@Example.test ",
    buyer_phone: "08031234567",
    idempotency_key: KEY,
    sale_id: SALE_ID,
    rendered_at: "2026-11-05T10:00:00.000Z",
    [HONEYPOT_FIELD]: "",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

const NOW = Date.parse("2026-11-05T10:00:30.000Z");

test("a well-formed order parses, with the email normalized", () => {
  const parsed = parseTicketOrderForm(form(), { now: NOW });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.buyerEmail, "chidi@example.test");
  assert.equal(parsed.values.buyerName, "Chidi Obi");
  assert.equal(parsed.values.quantity, 2);
  assert.equal(parsed.values.idempotencyKey, KEY);
  assert.equal(parsed.values.saleId, SALE_ID);
});

test("an unclamped quantity is refused, not clamped", () => {
  for (const quantity of ["0", "11", "1000", "abc", ""]) {
    const parsed = parseTicketOrderForm(form({ quantity }), { now: NOW });
    assert.equal(parsed.ok, false, `quantity ${quantity} was accepted`);
    assert.equal(parsed.notice, "invalid-request");
  }
});

test("a malformed uuid, email or phone is refused", () => {
  for (const bad of [
    { event_id: "not-a-uuid" },
    { tier_id: "" },
    { buyer_email: "chidi at example.test" },
    { buyer_email: "a@b" },
    { buyer_phone: "080 312 345 67" },
    { buyer_phone: "+2348031234567890123" },
    { buyer_phone: "call me" },
    { idempotency_key: "reuse-of-someone-elses" },
  ]) {
    assert.equal(parseTicketOrderForm(form(bad), { now: NOW }).ok, false, JSON.stringify(bad));
  }
});

test("the buyer name follows the table's own rules", () => {
  assert.equal(parseTicketOrderForm(form({ buyer_name: "   " }), { now: NOW }).ok, false);
  assert.equal(
    parseTicketOrderForm(form({ buyer_name: `Chidi\u0007Obi` }), { now: NOW }).ok,
    false,
    "a control character is refused, as event_ticket_sales_buyer_check does",
  );
  assert.equal(
    parseTicketOrderForm(form({ buyer_name: "x".repeat(161) }), { now: NOW }).ok,
    false,
  );
});

test("the honeypot refuses a bot that filled it in", () => {
  assert.equal(isHoneypotClean(form()), true);
  assert.equal(isHoneypotClean(form({ [HONEYPOT_FIELD]: "http://spam.example" })), false);
  assert.equal(isHoneypotClean(new FormData()), true, "a missing field is not a filled field");
});

test("a submit faster than a human refuses, and a missing stamp refuses", () => {
  assert.equal(MIN_SUBMIT_SECONDS, 5);
  assert.equal(isElapsedEnough("2026-11-05T10:00:00.000Z", Date.parse("2026-11-05T10:00:02.000Z")), false);
  assert.equal(isElapsedEnough("2026-11-05T10:00:00.000Z", Date.parse("2026-11-05T10:00:05.000Z")), true);
  assert.equal(isElapsedEnough("nonsense", NOW), false);
  assert.equal(isElapsedEnough(null, NOW), false);
  assert.equal(isElapsedEnough("2026-11-05T10:00:00.000Z", Date.parse("2025-01-01T00:00:00.000Z")), false);
});

test("parsed values are plain strings, never a File or a FormData entry", () => {
  const parsed = parseTicketOrderForm(form({ buyer_name: "  Ada Eze  " }), { now: NOW });
  assert.equal(parsed.values.buyerName, "Ada Eze", "the table CHECK demands a trimmed name");
  for (const value of Object.values(parsed.values)) assert.equal(typeof value, "string");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/ticket-order-intake.test.mjs`
Expected: `Cannot find module '../src/lib/ticket-order-intake.mjs'`.

- [ ] **Step 3: Write the module**

Create `src/lib/ticket-order-intake.mjs`:

```js
import { MAX_ONLINE_QUANTITY } from "./ticket-order-state.mjs";

/** Hidden field. A human never fills it; a generic bot almost always does. */
export const HONEYPOT_FIELD = "website";
/** Shorter than anyone actually typing a name, a phone and an email can manage. */
export const MIN_SUBMIT_SECONDS = 5;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
const EMAIL_PATTERN = /^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$/;

function text(formData, name, { trim = true } = {}) {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const out = trim ? value.trim() : value;
  return out === "" ? null : out;
}

/**
 * The table's own buyer-name rule, applied here so a refusal is a notice rather than a 23514:
 * `event_ticket_sales_buyer_check` requires btrim equality, 1..160 and no control characters
 * (20261003102501:122-127).
 */
function isCleanName(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    value === value.trim() &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isHoneypotClean(formData) {
  const filled = formData.get(HONEYPOT_FIELD);
  return typeof filled !== "string" || filled.trim() === "";
}

export function isElapsedEnough(renderedAt, now = Date.now()) {
  if (typeof renderedAt !== "string") return false;
  const rendered = Date.parse(renderedAt);
  if (!Number.isFinite(rendered)) return false;
  const elapsedSeconds = (now - rendered) / 1000;
  return elapsedSeconds >= MIN_SUBMIT_SECONDS && elapsedSeconds < 86400;
}

/**
 * @param {FormData} formData
 * @param {{ now?: number }} [options]
 * @returns {{ ok: true, values: Record<string, string> } | { ok: false, notice: string }}
 */
export function parseTicketOrderForm(formData, options = {}) {
  const eventId = text(formData, "event_id");
  const tierId = text(formData, "tier_id");
  const rawQuantity = text(formData, "quantity");
  const buyerName = text(formData, "buyer_name");
  const rawEmail = text(formData, "buyer_email");
  const buyerPhone = text(formData, "buyer_phone");
  const idempotencyKey = text(formData, "idempotency_key");
  const saleId = text(formData, "sale_id");

  const quantity = Number.parseInt(rawQuantity ?? "", 10);
  const buyerEmail = rawEmail ? rawEmail.toLowerCase() : null;

  const failures = [
    !eventId || !UUID_PATTERN.test(eventId),
    !tierId || !UUID_PATTERN.test(tierId),
    !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ONLINE_QUANTITY,
    !isCleanName(buyerName),
    !buyerEmail ||
      buyerEmail.length < 3 ||
      buyerEmail.length > 320 ||
      !buyerEmail.includes("@") ||
      !new RegExp("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").test(buyerEmail),
    !buyerPhone || !PHONE_PATTERN.test(buyerPhone),
    !idempotencyKey || !UUID_PATTERN.test(idempotencyKey),
    !saleId || !UUID_PATTERN.test(saleId),
    !isHoneypotClean(formData),
    !isElapsedEnough(text(formData, "rendered_at", { trim: false }), options.now),
  ];

  if (failures.some(Boolean)) return { ok: false, notice: "invalid-request" };

  return {
    ok: true,
    values: {
      eventId,
      tierId,
      quantity: String(quantity),
      buyerName,
      buyerEmail,
      buyerPhone,
      idempotencyKey,
      saleId,
    },
  };
}
```

- [ ] **Step 4: Run everything**

Run: `npm test -- tests/ticket-order-intake.test.mjs` → 0 fail. Then `npm test`.

The `rendered_at` window is capped at 86 400 seconds on purpose: a buyer who leaves the tab open
overnight and submits at breakfast is a real person, and refusing them for a bot defence that buys
nothing is the wrong trade. Task 10 maps an expired stamp to the same `invalid-request` notice, and
the overlay re-stamps the form when it re-mounts.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/lib/ticket-order-intake.mjs tests/ticket-order-intake.test.mjs
git add src/lib/ticket-order-intake.mjs tests/ticket-order-intake.test.mjs
git commit -m "feat(tickets): parse and refuse a guest order outside the action"
```

---

## Task 9: Put the box-office prototype where the port can cite it

§2.18 makes `carpenters_family_box_office.tsx` the visual source of truth for `/tickets`, and Tasks
11–14 copy from it section by section. A source of truth that lives in a personal Downloads folder
is not a source of truth: it vanishes, and the next reviewer cannot check a claim about the
overlay's stacking or step indicator.

**Files:**
- Create: `docs/superpowers/specs/assets/carpenters_family_box_office.tsx`

- [ ] **Step 1: Copy, do not rewrite**

```bash
mkdir -p docs/superpowers/specs/assets
cp "C:/Users/HomePC/Downloads/carpenters_family_box_office.tsx" docs/superpowers/specs/assets/carpenters_family_box_office.tsx
```

- [ ] **Step 2: Confirm the copy is byte-identical and outside the build**

```bash
cmp "C:/Users/HomePC/Downloads/carpenters_family_box_office.tsx" docs/superpowers/specs/assets/carpenters_family_box_office.tsx && echo identical
npm run lint
```
Expected: `identical`, and lint stays clean — `biome check next.config.ts src` does not look at
`docs/`, so a `.tsx` under `docs/` is documentation, not a component. Do not "fix" its
`React.useState`-free style or its fictional `INITIAL_ORDERS_DB`; the file's value is that it is
the thing Tasks 11–14 were measured against.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/assets/carpenters_family_box_office.tsx
git commit -m "docs(specs): keep the box-office prototype beside the spec that ports it"
```

---

## Task 10: `submitTicketOrderAction`

The one server action an anonymous visitor can reach. It parses, uploads through the existing R2
helper, calls the definer RPC, and redirects to `/tickets/order?ref=…` with the reference — never
the email (§3, §14). Everything it can get wrong is a redirect to a notice, so the failure paths
are the deliverable as much as the success path is.

**Files:**
- Modify: `src/app/actions.ts` (append after `recordEventTicketSaleAction`, near `:2830`)
- Test: `tests/ticket-order-action.test.mjs` (source-text assertions)

**Interfaces:**
- Consumes: Task 8's `parseTicketOrderForm`; Task 1's `buildSubmitFailureUrl`;
  `runReceiptEntry` (`src/lib/receipt-entry.mjs`), `getR2StorageAdapter` and
  `validateFinanceReceiptUpload` (already imported by this file at the officer path);
  `rpcErrorNotice`; Task 5's `submit_ticket_order`.
- Produces: the action bound to the overlay's `<form action=…>` (Task 12) and the redirect target
  `/tickets/order?ref=…` (Task 14). Task 13 later inserts the `notifyTicketOrderReceived` call
  between the successful RPC and the redirect.

- [ ] **Step 1: Write the failing test**

Create `tests/ticket-order-action.test.mjs`. `src/app/actions.ts` cannot be imported by a node test
(it constructs a Supabase client at module scope), so these are source-text assertions — the style
already used by `tests/notice-methods-verification.test.mjs`. Keep them few and each one about a
rule that a future edit could plausibly break.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("src/app/actions.ts", "utf8");
const start = source.indexOf("export async function submitTicketOrderAction");

test("the guest order action exists", () => {
  assert.ok(start !== -1, "submitTicketOrderAction is not in src/app/actions.ts");
});

const action = source.slice(start, source.indexOf("\nexport ", start + 1));

test("it is not gated on a session", () => {
  assert.doesNotMatch(action, /createSupabaseServerClient|clientOrRedirect|getActiveEventActor/);
  assert.doesNotMatch(action, /is_active_club_member|auth\.getUser/);
});

test("it validates through the shared parser, not inline", () => {
  assert.match(action, /parseTicketOrderForm\(/);
  assert.match(action, /notice=invalid-request|buildSubmitFailureUrl/);
});

test("it uploads through the R2 helper and never through Supabase Storage", () => {
  assert.match(action, /runReceiptEntry\(/);
  assert.match(action, /getR2StorageAdapter\(\)/);
  assert.match(action, /validateFinanceReceiptUpload/);
  assert.match(action, /scope: "event_ticket"/);
  assert.match(action, /paymentStatus: "paid"/);
});

test("it passes the generated sale id as the receipt target", () => {
  assert.match(action, /p_sale_id:/);
  assert.match(action, /values\.saleId/);
});

test("it calls the anon RPC with every named parameter", () => {
  for (const name of [
    "p_event_id", "p_tier_id", "p_quantity", "p_buyer_name", "p_buyer_email",
    "p_buyer_phone", "p_idempotency_key", "p_sale_id", "p_receipt_id",
    "p_receipt_filename", "p_receipt_object_key", "p_receipt_content_type",
    "p_receipt_size_bytes", "p_receipt_sha256",
  ]) {
    assert.match(action, new RegExp(`${name}:`), `${name} is not passed`);
  }
  assert.match(action, /rpc\(\s*"submit_ticket_order"/);
});

test("the success redirect carries the reference and nothing else", () => {
  assert.match(action, /\/tickets\/order\?ref=/);
  assert.doesNotMatch(action, /buyer_email=|&email=|buyerEmail\)/, "PII must not enter a URL");
  assert.doesNotMatch(action, /redirect\(`\/tickets\/order\$\{[^}]*buyerEmail/);
});

test("revalidation happens before the redirect, because redirect throws", () => {
  const revalidate = action.indexOf("revalidatePath");
  const redirect = action.indexOf("redirect(");
  assert.ok(revalidate !== -1, "no revalidatePath in the guest action");
  assert.ok(revalidate < redirect, "revalidatePath must precede redirect()");
});

test("every database refusal becomes a mapped notice", () => {
  assert.match(action, /rpcErrorNotice\(/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/ticket-order-action.test.mjs`
Expected: `submitTicketOrderAction is not in src/app/actions.ts`.

- [ ] **Step 3: Write the action**

Append to `src/app/actions.ts`. Check the file's existing imports first — `runReceiptEntry`,
`getR2StorageAdapter`, `validateFinanceReceiptUpload`, `rpcErrorNotice`, `randomUUID` and
`FormData`-reading helpers are all already used by the officer path above it; only
`parseTicketOrderForm` and `buildSubmitFailureUrl` are new imports.

```ts
export async function submitTicketOrderAction(formData: FormData) {
  const parsed = parseTicketOrderForm(formData);
  if (!parsed.ok) {
    redirect(buildSubmitFailureUrl({ notice: parsed.notice }));
  }
  const { eventId, tierId, quantity, buyerName, buyerEmail, buyerPhone, idempotencyKey, saleId } =
    parsed.values;

  const file = formData.get("receipt");
  if (!(file instanceof File)) {
    redirect(buildSubmitFailureUrl({ eventId, tierId, quantity, notice: "receipt-required" }));
  }

  const anon = await createAnonClient();
  if (!anon) {
    redirect(buildSubmitFailureUrl({ eventId, tierId, quantity, notice: "configuration" }));
  }

  // The buyer generates both ids: the object key is receipts/event_ticket/<saleId>/<receiptId>.<ext>,
  // so the sale id must exist before the upload (plan deviation 1). Dedupe lives inside
  // submit_ticket_order — find_finance_entry_id answers null without a member session.
  // `runReceiptEntry` returns only { kind, id, deduplicated } (src/lib/receipt-entry.mjs:71) and drops
  // unknown keys from what the commit callback resolves, so the RPC's row has to be captured in the
  // action's own scope. Task 13's emails read the display fields off this same variable.
  let submitted: {
    public_reference: string | null;
    event_id: string | null;
    event_title: string | null;
    tier_name: string | null;
    quantity: number | null;
    amount_ngn: number | null;
  } = {
    public_reference: null,
    event_id: null,
    event_title: null,
    tier_name: null,
    quantity: null,
    amount_ngn: null,
  };
  const entryResult = await runReceiptEntry(
    {
      scope: "event_ticket",
      targetId: saleId,
      paymentMethod: "bank_transfer",
      paymentStatus: "paid",
      file,
    },
    {
      storage: getR2StorageAdapter(),
      validateReceipt: validateFinanceReceiptUpload,
    },
    async (receipt) => {
      const { data, error } = await anon.rpc("submit_ticket_order", {
        p_event_id: eventId,
        p_tier_id: tierId,
        p_quantity: Number.parseInt(quantity, 10),
        p_buyer_name: buyerName,
        p_buyer_email: buyerEmail,
        p_buyer_phone: buyerPhone,
        p_idempotency_key: idempotencyKey,
        p_sale_id: saleId,
        p_receipt_id: receipt?.receiptId ?? null,
        p_receipt_filename: receipt?.originalFilename ?? null,
        p_receipt_object_key: receipt?.objectKey ?? null,
        p_receipt_content_type: receipt?.contentType ?? null,
        p_receipt_size_bytes: receipt?.sizeBytes ?? null,
        p_receipt_sha256: receipt?.sha256 ?? null,
      });
      if (error) return { kind: "error", error };
      const row = Array.isArray(data) ? data[0] : data;
      submitted = {
        public_reference: row?.public_reference ?? null,
        event_id: row?.event_id ?? eventId,
        event_title: row?.event_title ?? null,
        tier_name: row?.tier_name ?? null,
        quantity: row?.quantity ?? Number.parseInt(quantity, 10),
        amount_ngn: row?.amount_ngn ?? null,
      };
      return {
        kind: "ok",
        id: row?.sale_id ?? saleId,
        deduplicated: Boolean(row?.deduplicated),
      };
    },
  );

  if (entryResult.kind === "error") {
    const notice =
      entryResult.notice === "operation-failed"
        ? rpcErrorNotice(entryResult.error)
        : entryResult.notice;
    redirect(buildSubmitFailureUrl({ eventId, tierId, quantity, notice }));
  }

  const reference = submitted.public_reference;
  if (!reference) {
    // The RPC answered but has no reference: never send a buyer to a status page they cannot read.
    redirect(buildSubmitFailureUrl({ eventId, tierId, quantity, notice: "operation-failed" }));
  }

  revalidatePath("/tickets");
  revalidatePath("/tickets/order");
  // Task 13 adds the two notify calls here, between revalidatePath and redirect.
  redirect(`/tickets/order?ref=${encodeURIComponent(reference)}`);
}
```

`reference` is a plain `string` from the `if (!reference)` guard downward — the narrowing comes from the
guard, so no annotation or non-null assertion is needed at the template literal. `submitted` is read
again by Task 13's email wiring, which is why it holds the display fields and not only the reference.

```ts
  let reference: string | null = null;
  // …inside the commit callback, after the rpc returns:
  //   reference = row?.public_reference ?? null;
```

Declare `reference` above `runReceiptEntry`, assign it in the callback, and delete the two
`entryResult.publicReference` expressions. The callback runs to completion before `await
runReceiptEntry(...)` resolves, so the value is set by the time the action reads it — which is the
same trick the officer path uses to get `targetId` into the key.

- [ ] **Step 4: Add `createAnonClient`**

The action needs an **anon** client, not the cookie-scoped server client: `submit_ticket_order`
refuses a signed-in actor (`42501`), and a member who is logged in and buys a ticket would otherwise
be told "something went wrong". `src/lib/supabase/client.ts:6` builds a publishable-key client for
the browser; a server-side anon twin does not exist yet. Add it to
`src/lib/supabase/server.ts` — next to `createSupabaseServerClient`, which stays untouched — so the
key handling and the config import live in one file:

```ts
/**
 * An anon-keyed server client, for the calls an anonymous visitor is allowed to make. It carries
 * no cookies and no session: `submit_ticket_order` and `lookup_ticket_order` raise 42501 for any
 * signed-in actor, so reusing createSupabaseServerClient here would break the till for every
 * logged-in buyer. Returns null when the public config is unusable, which is the same shape
 * createSupabaseBrowserClient (client.ts:6) uses — callers must not treat it as a thrown error.
 */
export async function createAnonClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`getSupabasePublicConfig()` (`src/lib/supabase/config.ts:6-24`) is the single place this project
resolves the Supabase URL and publishable key and it already validates the protocol and trims; the
action must not invent a third spelling of the env names. The dynamic `import` keeps `server-only`
and `next/headers` off the anon path.

Resolve the config **before** `runReceiptEntry`, not inside the commit callback — the callback can only
report `operation-failed`, and a missing key is a different story:

```ts
  const anon = await createAnonClient();
  if (!anon) {
    redirect(buildSubmitFailureUrl({ eventId, tierId, quantity, notice: "configuration" }));
  }
```

and pass `anon` down into the callback in place of a `createAnonClient()` call there. `configuration`
is Task 2's notice code for exactly this state, so a stranger gets a sentence rather than a 500.

- [ ] **Step 5: Run and commit**

```bash
npm test -- tests/ticket-order-action.test.mjs
npm test
npm run build
```
Expected: the action tests pass; `npm run build` compiles `"use server"` exports and is the check
that the action's signature is legal for a form (a server action's parameters must be
serializable — `FormData` is, an options object is not, which is why `parseTicketOrderForm`'s
`{ now }` option is used only by the tests and never from the form).

```bash
git add src/app/actions.ts src/lib/supabase/server.ts tests/ticket-order-action.test.mjs
git commit -m "feat(tickets): accept a guest ticket order from an anonymous session"
```

---

## Task 11: One type module, the real tokens, and the word "pass"

The prototype's CSS block (`docs/superpowers/specs/assets/carpenters_family_box_office.tsx:637-720`)
defines `--color-forest`, `--color-forest-hover`, `bg-forest-tint`, `bg-forest-chip`,
`border-forest-subtle` and `ring-forest-selected` by hand, and
`src/components/tickets/tickets-storefront-view.tsx` reproduces the same palette as ~120 inline hex
literals. The repo already owns this palette at `src/app/globals.css:53-70`:
`forest #174c37`, `deep-forest #0c3325`, `deep-forest-hover #103d2b`, `espresso #3d291f`,
`ochre #d6a23a`, `warm-canvas #faf6f0`, `linen #e5ddd3`, `terracotta #ba3c2a`, `muted #7a685d`,
`body #5c4638`. Every prototype alpha variant is reachable as a Tailwind opacity modifier on those
tokens, so this task adds **no** new token. It also extracts the three public interfaces into
`src/components/tickets/ticket-types.ts` because Tasks 12, 13 and 14 all need them and a type that
lives inside a client component cannot be imported by a route without pulling the component in.

The word "pass" goes. Spec §11 rules the buyer-facing noun is **ticket**, and the six sites are
`:128` ("Official Event Passes & Reservations"), `:131` ("Purchase Event Tickets & Celebration
Passes"), `:252` (`${remaining} pass${remaining === 1 ? "" : "es"} available`), `:266` ("Number of
Passes"), `:281` (`{num} {num === 1 ? "Pass" : "Passes"}`) and `:380` ("issue and verify your pass").
`:116`'s `href={isAuthenticatedMember ? "/events" : "/"}` is **left exactly as it is** — Plan B moves
that route, and changing it here would put the same edit in two plans.

Do not touch the hardcoded bank fallbacks at `:74-76` (`"1307798889"`, `"ProvidusUnity"`,
`"The Carpenters Fam Soc Club Asb"`). They are a lying read of missing data, and Task 14 owns the
unavailable state that replaces them.

**Files:**
- Create: `src/components/tickets/ticket-types.ts`
- Create: `tests/tickets-storefront-copy.test.mjs`
- Modify: `src/components/tickets/tickets-storefront-view.tsx:20-42` (interfaces move out), `:89-392`
  (hex → tokens, copy)
- Modify: `src/app/tickets/page.tsx:1-6` (import the types from their new home)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PublicTicketTier`, `PublicTicketedEvent`, `PublicBankInfo` (moved verbatim), plus the
  new `TicketOrderStatus` and `TicketLookupState` that Task 14's lookup returns. Task 12 imports all
  five from `@/components/tickets/ticket-types`.

- [ ] **Step 1: Write the failing test**

Create `tests/tickets-storefront-copy.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const STOREFRONT = readFileSync(
  "src/components/tickets/tickets-storefront-view.tsx",
  "utf8",
);
const TYPES = readFileSync("src/components/tickets/ticket-types.ts", "utf8");

const BANNED_COPY = [
  "Event Passes & Reservations",
  "Tickets & Celebration Passes",
  "Number of Passes",
  'num === 1 ? "Pass" : "Passes"',
  "pass${remaining === 1",
  "verify your pass",
];

test("the storefront sells tickets, not passes", () => {
  for (const phrase of BANNED_COPY) {
    assert.ok(
      !STOREFRONT.includes(phrase),
      `stale "pass" copy still present: ${phrase}`,
    );
  }
  assert.match(STOREFRONT, /Number of Tickets/);
});

test("the storefront carries no inline hex palette", () => {
  const hexes = STOREFRONT.match(/#[0-9A-Fa-f]{6}/g) ?? [];
  assert.deepEqual(hexes, [], `inline hex literals remain: ${hexes.join(", ")}`);
});

test("the public ticket types live outside the client component", () => {
  assert.doesNotMatch(STOREFRONT, /interface PublicTicket/);
  for (const name of [
    "PublicTicketTier",
    "PublicTicketedEvent",
    "PublicBankInfo",
    "TicketOrderStatus",
    "TicketLookupState",
  ]) {
    assert.match(TYPES, new RegExp(`export interface ${name}`));
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/tickets-storefront-copy.test.mjs`
Expected: FAIL — "Cannot find module … ticket-types.ts" is the first failure, because
`readFileSync` throws before any assertion runs. That is the right failure: the file does not exist
yet. Do not "fix" it by pointing the test at the storefront; create the file in Step 3.

- [ ] **Step 3: Create `src/components/tickets/ticket-types.ts`**

```ts
/**
 * The shapes the public box office reads and writes. They live here, not inside a client component,
 * so that a server route can name them without importing a component.
 */

export interface PublicTicketTier {
  id: string;
  name: string;
  price_ngn: number;
  capacity: number | null;
  /** Approved online + officer-recorded tickets only — see the approved-only rule in the plan header. */
  sold: number;
}

export interface PublicTicketedEvent {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  description: string | null;
  tiers: PublicTicketTier[];
}

export interface PublicBankInfo {
  bank_name: string;
  account_name: string;
  account_number: string;
  instructions: string | null;
}

/** One row of `public.lookup_ticket_order(p_reference, p_email)`, never more. */
export interface TicketOrderStatus {
  public_reference: string;
  event_title: string;
  event_starts_at: string;
  tier_name: string;
  quantity: number;
  amount_ngn: number;
  payment_method: string;
  verification_status: "recorded" | "approved" | "rejected" | "cancelled";
  created_at: string;
  /** Set only for `rejected` and `cancelled`; the officer's explanation, verbatim. */
  outcome_reason: string | null;
}

export interface TicketLookupState {
  status: TicketOrderStatus | null;
  /** True when the reference/email pair matched nothing — the same answer as a wrong reference. */
  notFound: boolean;
  /** A notice code, never a database message. */
  error: string | null;
  pendingReference: string;
}
```

- [ ] **Step 4: Rewrite the storefront**

In `src/components/tickets/tickets-storefront-view.tsx`:

1. Delete the three `export interface` blocks at `:20-42` and add
   `import type { PublicBankInfo, PublicTicketedEvent, PublicTicketTier } from "./ticket-types";`.
   In `src/app/tickets/page.tsx:1-6`, change the type import to
   `import { type PublicBankInfo, type PublicTicketedEvent } from "@/components/tickets/ticket-types";`
   and leave the `TicketsStorefrontView` value import pointing at the component.
2. Apply this map mechanically across `:89-392`. Every entry on the left appears in the file today;
   the right is what to write. Nothing else about the markup changes.

| Now | Write |
| --- | --- |
| `bg-[#FAF6F0]` | `bg-warm-canvas` |
| `bg-[#FAF6F0]/95` | `bg-warm-canvas/95` |
| `bg-[#FAF6F0]/60` | `bg-warm-canvas/60` |
| `border-[#E5DDD3]` | `border-linen` |
| `text-[#3D291F]` | `text-espresso` |
| `text-[#174C37]` | `text-forest` |
| `text-[#5C4638]` | `text-body` |
| `text-[#7A685D]` | `text-muted` |
| `text-[#D6A23A]` | `text-ochre` |
| `text-[#54433A]` | `text-espresso` |
| `bg-[#0C3325]` | `bg-deep-forest` |
| `bg-[#174C37]` | `bg-forest` |
| `bg-[#174C37]/10` | `bg-forest/10` |
| `bg-[#174C37]/5` | `bg-forest/5` |
| `hover:bg-[#174C37]` | `hover:bg-forest` |
| `hover:bg-[#FAF6F0]` | `hover:bg-warm-canvas` |
| `hover:bg-[#103D2B]` | `hover:bg-deep-forest-hover` |
| `border-[#174C37]` | `border-forest` |
| `ring-[#174C37]/20` | `ring-forest/20` |
| `text-[#174C37]/60` | `text-forest/60` |

`text-[#54433A]` is the one colour with no token and no analogue. DESIGN.md:7 assigns espresso to
"headings and primary text", and all three uses (`:210`, `:263`, `:289`) are small uppercase section
labels — headings. Espresso is the correct mapping; inventing a token for three labels is not.

3. The six copy sites, with the exact replacement text:

| Line | Now | Write |
| --- | --- | --- |
| `:128` | `Official Event Passes & Reservations` | `Official Event Tickets & Reservations` |
| `:131` | `Purchase Event Tickets & Celebration Passes` | `Purchase Tickets for Upcoming Club Events` |
| `:252` | `` `${remaining} pass${remaining === 1 ? "" : "es"} available` `` | `` `${remaining} ticket${remaining === 1 ? "" : "s"} left` `` |
| `:266` | `Number of Passes` | `Number of Tickets` |
| `:281` | `{num} {num === 1 ? "Pass" : "Passes"}` | `{num} {num === 1 ? "Ticket" : "Tickets"}` |
| `:380` | `and verify your pass.` | `and verify your ticket.` |

`:252`'s "left" rather than "available" keeps the line short enough not to wrap the tier button at
`sm:grid-cols-2`, which is where `capacity - sold` is longest.

4. Nothing else changes. In particular `:279`'s option list `[1, 2, 3, 4, 5, 6, 8, 10]` stays a
   literal for now — Task 12 replaces it with `maxQuantityForTier`-driven options, and changing it
   twice would be churn.

- [ ] **Step 5: Run, verify, commit**

```bash
npm test -- tests/tickets-storefront-copy.test.mjs
npm run lint
npm run build
```
Expected: the three tests pass; biome clean; the build compiles. Then confirm by eye that
`http://127.0.0.1:3001/tickets` is unchanged in colour — `bg-forest/5` and `bg-[#174C37]/5` are the
same pixels, so a visible difference means a token was mismatched, not that the design moved.

```bash
git add src/components/tickets/ticket-types.ts src/components/tickets/tickets-storefront-view.tsx src/app/tickets/page.tsx tests/tickets-storefront-copy.test.mjs
git commit -m "refactor(tickets): share the public ticket types and the design tokens"
```

---

## Task 12: The checkout overlay

This is the port. `docs/superpowers/specs/assets/carpenters_family_box_office.tsx` holds the whole
design already approved: the step indicator at `:1230-1286`, step 1 at `:1288-1551`, step 2 at
`:1553-1930`. The prototype is a single-file demo with mock data and a screen-switching control bar;
what transfers is layout, spacing, copy and the order of fields — not its `useState` wiring, which
this task replaces with the Task 1 URL contract.

Three deliberate divergences from the prototype, each of which a reviewer will otherwise read as a
mistake:

1. **The indicator shows two steps, not three.** The prototype's third node is
   `Step 3: Order Submitted` (`:1280`, `:787`), a screen the buyer never acts on. Here that outcome
   lives at `/tickets/order` (Task 14), so `step ∈ {1, 2}` and the overlay's `aria-current` ladder has
   two entries. The rejected alternative — a third node that does nothing when submitted — reads as
   a broken control.
2. **Selection is React state first, URL second.** `GlobalFlashListener`
   (`src/components/ui/global-flash-listener.tsx:55-61`) rewrites the query string when it clears
   `?notice=`, and Next's router writes are not coordinated with `history.replaceState`. If the
   overlay's open/closed state were *derived from* the URL, a toast cleanup could close the buyer's
   checkout mid-entry. So the storefront keeps `checkout: CheckoutState | null` in state, syncs it to
   the URL for refresh-and-share, and re-reads the URL once on mount (the prototype's own restore
   effect, `:359-398`).
3. **Validation rules come from the server module, not the component.** The prototype defines the
   email and phone tests inline (`:312-330`). Here they go into
   `src/lib/ticket-order-intake.mjs` (Task 8's file), which has no `server-only` import and so can be
   imported by both the client and `submitTicketOrderAction`. One regex, two consumers.

**Files:**
- Create: `src/components/tickets/ticket-checkout-overlay.tsx`
- Create: `tests/till-ledger-surfaces.test.mjs` (created here with the overlay's structural guards;
  Task 17 extends it)
- Modify: `src/lib/ticket-order-intake.mjs` (three new exports)
- Modify: `tests/ticket-order-intake.test.mjs` (their tests)
- Modify: `src/components/tickets/tickets-storefront-view.tsx` (render the overlay, drive it from
  `?event=&tier=&qty=&step=`)

**Interfaces:**
- Consumes: Task 1's `CHECKOUT_PARAM_KEYS`, `MAX_ONLINE_QUANTITY`, `DRAFT_STORAGE_KEY`,
  `tierRemaining`, `maxQuantityForTier`, `clampQuantity`, `parseCheckoutState`,
  `buildCheckoutQuery`, `checkoutHref`; Task 8's `HONEYPOT_FIELD`, `MIN_SUBMIT_SECONDS`,
  `parseTicketOrderForm`; Task 10's `submitTicketOrderAction`; Task 11's types.
- Produces:
  - `ticketOrderIntake` gains `BUYER_EMAIL_PATTERN: RegExp`,
    `isBuyerEmailValid(value: string): boolean`, `isBuyerPhoneValid(value: string): boolean`,
    `stepOneMissingFields(input: { name: string; email: string; phone: string }): string[]`.
  - `TicketCheckoutOverlayProps` and `export function TicketCheckoutOverlay(props)` with the props
    object in Step 4.
  - `checkoutFromWindow(events: PublicTicketedEvent[], search?: string): CheckoutState | null`,
    exported from the storefront file for tests.

- [ ] **Step 1: Write the failing tests for the shared validators**

Append to `tests/ticket-order-intake.test.mjs`:

```js
test("the client's email test accepts exactly what the column accepts", async () => {
  const { isBuyerEmailValid } = await import("../src/lib/ticket-order-intake.mjs");
  assert.equal(isBuyerEmailValid("chidi@example.com"), true);
  assert.equal(isBuyerEmailValid("  Chidi@Example.COM  "), true);
  assert.equal(isBuyerEmailValid("not-an-email"), false);
  assert.equal(isBuyerEmailValid("two@at-signs.example.com"), false);
  assert.equal(isBuyerEmailValid("a@b"), false);
  assert.equal(isBuyerEmailValid(""), false);
});

test("the client's phone test mirrors the +?[0-9]{10,15} column check", async () => {
  const { isBuyerPhoneValid } = await import("../src/lib/ticket-order-intake.mjs");
  assert.equal(isBuyerPhoneValid("08031234571"), true);
  assert.equal(isBuyerPhoneValid("+2348031234571"), true);
  assert.equal(isBuyerPhoneValid("0803 123 4571"), false);
  assert.equal(isBuyerPhoneValid("+234-803-123-4571"), false);
  assert.equal(isBuyerPhoneValid("123456789"), false);
  assert.equal(isBuyerPhoneValid("1234567890123456"), false);
});

test("step one reports every field that is missing", async () => {
  const { stepOneMissingFields } = await import("../src/lib/ticket-order-intake.mjs");
  assert.deepEqual(stepOneMissingFields({ name: "", email: "", phone: "" }), [
    "your name",
    "a valid email address",
    "your phone number",
  ]);
  assert.deepEqual(
    stepOneMissingFields({
      name: "Chidi Okafor",
      email: "chidi@example.com",
      phone: "08031234571",
    }),
    [],
  );
});
```

Run: `npm test -- tests/ticket-order-intake.test.mjs`
Expected: FAIL — `isBuyerEmailValid is not a function` for the first three.

- [ ] **Step 2: Add the validators to `src/lib/ticket-order-intake.mjs`**

These are copies of the constraints Task 3 put on the columns
(`event_ticket_sales_buyer_email_check` at `918-924` of the migration, `…_buyer_phone_check` at
`931-934`), which is why they are `lower`-then-test and digit-count-bounded rather than the
prototype's looser `replace(/\D/g, "").length` test:

```js
/** Mirrors event_ticket_sales_buyer_email_check. */
export const BUYER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isBuyerEmailValid(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized.length >= 3 &&
    normalized.length <= 320 &&
    BUYER_EMAIL_PATTERN.test(normalized)
  );
}

/** Mirrors event_ticket_sales_buyer_phone_check: ^\+?[0-9]{10,15}$ */
export function isBuyerPhoneValid(value) {
  return /^\+?[0-9]{10,15}$/.test(String(value ?? "").trim());
}

/**
 * The names the "Continue to checkout" button lists when it is still disabled. Kept in this module
 * so the buyer's wording and the server's rejection say the same thing.
 */
export function stepOneMissingFields({ name, email, phone }) {
  const missing = [];
  if (!String(name ?? "").trim()) missing.push("your name");
  if (!isBuyerEmailValid(email)) missing.push("a valid email address");
  if (!isBuyerPhoneValid(phone)) missing.push("your phone number");
  return missing;
}
```

Run: `npm test -- tests/ticket-order-intake.test.mjs` — expected: all pass.

- [ ] **Step 3: Write the failing structural test for the overlay**

Create `tests/till-ledger-surfaces.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OVERLAY = readFileSync(
  "src/components/tickets/ticket-checkout-overlay.tsx",
  "utf8",
);

test("the overlay stacks above the sign-in sheet and is a real dialog", () => {
  assert.match(OVERLAY, /useModalHygiene\(/);
  assert.match(OVERLAY, /role="dialog"/);
  assert.match(OVERLAY, /aria-modal="true"/);
  assert.match(OVERLAY, /z-\[60\]/);
});

test("the overlay keeps its own copy of the checkout state", () => {
  assert.match(OVERLAY, /history\.replaceState/);
  assert.match(OVERLAY, /DRAFT_STORAGE_KEY/);
  assert.match(OVERLAY, /sessionStorage/);
  assert.doesNotMatch(OVERLAY, /window\.location\.search =/);
});

test("the overlay posts through the server action, not fetch", () => {
  assert.match(OVERLAY, /action=\{submitTicketOrderAction\}/);
  assert.match(OVERLAY, /type="file"/);
  assert.match(OVERLAY, /name=\{HONEYPOT_FIELD\}/);
});

test("every overlay control is a 48px target", () => {
  const buttons = OVERLAY.match(/<button[\s\S]*?type="button"/g) ?? [];
  assert.ok(buttons.length >= 4, `expected the overlay's controls, found ${buttons.length}`);
  for (const button of buttons) {
    assert.match(button, /min-h-\[48px\]/);
  }
});
```

Run: `npm test -- tests/till-ledger-surfaces.test.mjs`
Expected: FAIL at `readFileSync` — the component does not exist. That is the intended first failure.

The `min-h-[48px]` rule is DESIGN.md:25 ("Inputs and buttons are at least 48px high"). The repo's
shared `.cf-btn` is `min-height: 38px` (`src/app/globals.css:11656-11657`) so it cannot be used here
unchanged; the overlay writes its own utility classes. This is safe because the global button reset is
scoped `button:not([class])` (`src/app/globals.css:366`) and `:where(button)` (`:360`) — both of which
lose to a Tailwind utility — and the focus ring the overlay needs is already global
(`:271-276`, `outline: 3px solid var(--color-focus-ring)`).

- [ ] **Step 4: Create `src/components/tickets/ticket-checkout-overlay.tsx`**

The shell, the wiring and the logic are below in full. The two step bodies are ported from the
prototype's regions with Task 11's token map and the copy table applied, plus the field-name changes
in Step 5.

```tsx
"use client";

import { ArrowLeft, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type CheckoutState,
  DRAFT_STORAGE_KEY,
  MAX_ONLINE_QUANTITY,
  buildCheckoutQuery,
  clampQuantity,
  maxQuantityForTier,
  tierRemaining,
} from "@/lib/ticket-order-state.mjs";
import {
  HONEYPOT_FIELD,
  MIN_SUBMIT_SECONDS,
  stepOneMissingFields,
} from "@/lib/ticket-order-intake.mjs";
import { submitTicketOrderAction } from "@/app/actions";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { PublicBankInfo, PublicTicketedEvent } from "./ticket-types";

export interface TicketCheckoutOverlayProps {
  event: PublicTicketedEvent;
  bank: PublicBankInfo | null;
  checkout: CheckoutState;
  onCheckoutChange: (next: CheckoutState) => void;
  onClose: () => void;
}

/** What the buyer types. PII, so it goes in sessionStorage and never in the URL. */
interface DraftFields {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
}

const EMPTY_DRAFT: DraftFields = { buyerName: "", buyerEmail: "", buyerPhone: "" };

export function TicketCheckoutOverlay({
  event,
  bank,
  checkout,
  onCheckoutChange,
  onClose,
}: TicketCheckoutOverlayProps) {
  const [fields, setFields] = useState<DraftFields>(EMPTY_DRAFT);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useModalHygiene({ isOpen: true, onClose, dialogRef });

  // Restore the typed fields once per event, never on every keystroke: a File cannot survive a
  // refresh, so step 2 always requires a fresh upload even when the draft reloads.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<DraftFields> & { eventId?: string };
      if (draft.eventId === event.id) {
        setFields({
          buyerName: typeof draft.buyerName === "string" ? draft.buyerName : "",
          buyerEmail: typeof draft.buyerEmail === "string" ? draft.buyerEmail : "",
          buyerPhone: typeof draft.buyerPhone === "string" ? draft.buyerPhone : "",
        });
        setRestored(true);
      }
    } catch {
      // A draft this page cannot read is a draft this page ignores.
    }
  }, [event.id]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ ...fields, eventId: event.id }),
      );
    } catch {
      // Storage can be full or blocked; the form still works without persistence.
    }
  }, [fields, event.id]);

  const tiers = event.tiers ?? [];
  const tier = tiers.find((t) => t.id === checkout.tierId) ?? tiers[0] ?? null;
  const remaining = tier ? tierRemaining(tier) : null;
  const maxQty = tier ? maxQuantityForTier(tier) : MAX_ONLINE_QUANTITY;
  const quantity = clampQuantity(checkout.quantity, maxQty);
  const total = tier ? Number(tier.price_ngn) * quantity : 0;

  const missing = stepOneMissingFields(fields);
  const canContinue = missing.length === 0;
  const canSubmit = canContinue && Boolean(receiptFile) && !fileError && !isSubmitting;

  const step = checkout.step === 2 && canContinue ? 2 : 1;

  function go(next: Partial<CheckoutState>) {
    onCheckoutChange({ ...checkout, quantity, ...next });
  }

  function handleSelectTier(tierId: string) {
    setReceiptFile(null);
    setFileError(null);
    go({ tierId, step: 1 });
  }

  function handleFileChange(file: File | null) {
    setFileError(null);
    if (!file) {
      setReceiptFile(null);
      return;
    }
    // The real limit is the server's; this only stops an obvious mistake before the upload starts.
    if (file.size > 8 * 1024 * 1024) {
      setFileError("The receipt must be 8 MB or smaller.");
      return;
    }
    if (!/^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/i.test(file.type)) {
      setFileError("Upload a PDF or an image of the transfer receipt.");
      return;
    }
    setReceiptFile(file);
  }

  return (
    <div
      aria-labelledby="ticket-checkout-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-espresso/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      role="dialog"
    >
      <button
        aria-label="Close checkout overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      {/* Port the panel from the prototype's step bodies; see Step 5 for the field contract. */}
      <div
        className="relative z-10 w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl border border-linen shadow-2xl max-h-[94vh] flex flex-col overflow-hidden my-auto"
        ref={dialogRef}
      >
        <div className="p-4 sm:p-5 border-b border-linen bg-warm-canvas flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              className="text-sm sm:text-base font-extrabold text-espresso truncate"
              id="ticket-checkout-title"
            >
              {event.title}
            </h2>
            <p className="text-[11px] text-body">
              {formatEventLine(event.starts_at)} · {event.location}
            </p>
          </div>
          <button
            aria-label="Close checkout"
            className="w-11 h-11 min-h-[44px] min-w-[44px] shrink-0 rounded-full bg-white border border-linen hover:bg-warm-canvas flex items-center justify-center text-muted hover:text-espresso transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          <CheckoutStepIndicator step={step} />
          {restored && step === 2 && (
            <p className="text-[11px] text-body bg-warm-canvas border border-linen rounded-xl p-3">
              Your details are still here, but the receipt upload did not survive the refresh. Please
              attach it again.
            </p>
          )}
          <form
            action={submitTicketOrderAction}
            ref={formRef}
            onSubmit={(e) => {
              if (!canSubmit) {
                e.preventDefault();
                return;
              }
              setIsSubmitting(true);
            }}
          >
            <input name="event_id" type="hidden" value={event.id} />
            <input name="tier_id" type="hidden" value={tier?.id ?? ""} />
            <input name="quantity" type="hidden" value={quantity} />
            <input name="buyer_name" type="hidden" value={fields.buyerName} />
            <input name="buyer_email" type="hidden" value={fields.buyerEmail} />
            <input name="buyer_phone" type="hidden" value={fields.buyerPhone} />
            <input
              name="started_at"
              type="hidden"
              value={Math.floor(openedAt / 1000)}
            />
            <input
              autoComplete="off"
              className="sr-only"
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              type="text"
            />
            {step === 1 ? (
              <CheckoutStepOne /* port prototype :1288-1551 */ />
            ) : (
              <CheckoutStepTwo /* port prototype :1553-1930 */ />
            )}
            <div className="pt-4 border-t border-linen flex items-center justify-between gap-3">
              {step === 2 ? (
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[48px] rounded-xl bg-white border border-linen text-xs font-bold text-espresso hover:bg-warm-canvas cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    go({ step: 1 });
                  }}
                  type="button"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to tickets</span>
                </button>
              ) : (
                <span className="text-[11px] text-muted max-w-[16rem]">
                  {canContinue
                    ? "Payment is by bank transfer, then an officer confirms it."
                    : `Still needed: ${missing.join(", ")}.`}
                </span>
              )}
              {step === 1 ? (
                <button
                  className="px-5 py-2 min-h-[48px] rounded-xl bg-forest text-white text-xs font-bold hover:bg-deep-forest-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canContinue}
                  onClick={(e) => {
                    e.preventDefault();
                    go({ step: 2 });
                  }}
                  type="button"
                >
                  Continue to payment
                </button>
              ) : (
                <button
                  className="px-5 py-2 min-h-[48px] rounded-xl bg-forest text-white text-xs font-bold hover:bg-deep-forest-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  disabled={!canSubmit}
                  type="submit"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  <span>{isSubmitting ? "Submitting…" : `Submit order · ${formatNaira(total)}`}</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
```

Two notes on that code, because both look like bugs and neither is:

- The fields the buyer typed travel as `type="hidden"` inputs mirrored from React state rather than
  as the visible controls' own `name` attributes, because the visible controls live inside
  `CheckoutStepOne` and only step 2 can submit. One `<form>` element cannot span two sibling
  components, and mirroring keeps a single serializable submit path. The visible inputs must still be
  *controlled* by the same `fields` state, which is why `CheckoutStepOne` receives `fields`,
  `setFields` and `missing`.
- `started_at` carries the epoch seconds the server compares against `MIN_SUBMIT_SECONDS`;
  `parseTicketOrderForm` treats a missing or future value as a bot.

- [ ] **Step 5: Port the two step bodies**

`CheckoutStepOne` = the prototype's `:1288-1551` and `CheckoutStepTwo` = `:1553-1930`, copied with
Task 11's token map, these specific substitutions, and nothing else changed:

| Prototype | This component |
| --- | --- |
| `event.tiers[idx]` by array position | `tier` resolved by `id`, as in Step 4 |
| quantity `<select>` over `[1,2,3,4,5,6,8,10]` | `<option>` per count from `1..maxQty` — a tier with 3 left must not offer 4 |
| `onChange` → `setQuantity` | `onChange={(e) => go({ quantity: clampQuantity(Number(e.target.value), maxQty) })}` |
| buyer name/email/phone inputs (prototype `:1380-1480`) | the same three inputs, `value={fields.X}`, `onChange={(e) => setFields((f) => ({ ...f, X: e.target.value }))}`, `aria-invalid` and the inline error only once `missing` includes that field |
| `<a href="#upload">` "Continue to checkout" | the `Continue to payment` button in Step 4 — the prototype anchors to the upload block, this component changes `step` |
| the dropzone at `:1790-1860` (`Choose transfer receipt or drag it here`) | a real `<input type="file" name="receipt_file" accept="image/png,image/jpeg,image/webp,application/pdf">` plus the label block; `onCancel`/`onDrop` call `handleFileChange` |
| `activeTier.price_ngn` totals row (`:1700` region) | `<output aria-live="polite">{formatNaira(total)}</output>` bound to `quantity` and `tier`, `aria-label="Order total"` |
| the account number block (`:1650-1720`) | unchanged layout, plus `font-mono tracking-wider` and a Copy button; when `bank` is `null` render `Treasury account details are being confirmed — try again shortly` and leave `canSubmit` true (the bank text is not a form field) |
| the prototype's `handleSubmitOrder` (`:543-580`) | deleted entirely — the form's `action={submitTicketOrderAction}` replaces it |
| `screen === 'storefront' && …` control-bar conditionals | deleted — this component only ever renders inside the storefront |

`MIN_SUBMIT_SECONDS` is not referenced in the overlay's own code. Import it or drop the import — biome's
`noUnusedImports` will fail the lint step otherwise, so drop it and let
`parseTicketOrderForm` own the rule.

`CheckoutStepIndicator` is a two-node port of `:1230-1286` with `aria-current="step"` on the active
node and a `Check` icon on node 1 when `step === 2`:

```tsx
function CheckoutStepIndicator({ step }: { step: 1 | 2 }) {
  const labels = ["Choose your tickets", "Payment & receipt"];
  return (
    <nav aria-label="Ticket order steps" className="p-3 rounded-xl bg-warm-canvas border border-linen">
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {labels.map((label, index) => {
          const number = index + 1;
          const isActive = number === step;
          const isDone = number < step;
          return (
            <li
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold ${
                isActive
                  ? "bg-white border-forest text-espresso ring-2 ring-forest/20"
                  : "bg-white/60 border-linen text-muted"
              }`}
              key={label}
            >
              <span
                className={`w-6 h-6 rounded-full font-mono text-xs font-bold grid place-items-center shrink-0 ${
                  isActive || isDone ? "bg-forest text-white" : "bg-white border border-linen text-muted"
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} /> : number}
              </span>
              <span>
                {number}. {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

`formatEventLine(iso)` is a one-line helper local to this file —
`new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(new Date(iso))`
— matching the storefront's own `dateFormatter` at `tickets-storefront-view.tsx:50-56`. Do not import
`formatEventTime` from `@/lib/event-times.mjs`: that helper is for member event cards and appends a
time range this panel does not have.

- [ ] **Step 6: Mount it from the storefront**

In `tickets-storefront-view.tsx`, the component already holds per-event state
(`:63-71`). Replace that with the URL-derived contract:

1. Add a `checkout: CheckoutState | null` state, initialised to `null`, and a mount effect that resolves
   it from the URL. Export the helper so a test can drive it with any query string:

```ts
export function checkoutFromWindow(
  events: PublicTicketedEvent[],
  search: string = window.location.search,
): CheckoutState | null {
  return parseCheckoutState(search, events);
}
```

`parseCheckoutState` takes the event list to validate the ids (`ticket-checkout.mjs` returns `null` when
`?event=` names an event that is not in the list), so the wrapper must be given the storefront's real
`events` — passing an empty array would answer `null` for every URL and the overlay would never open.
The effect runs after mount because `window` does not exist during the server render:

```tsx
useEffect(() => {
  setCheckout(checkoutFromWindow(events));
}, [events]);
```

A test calls `checkoutFromWindow(events, "?event=e1&tier=t2&qty=3&step=2")` with no `window` at all,
which is why `search` is a parameter with a default rather than read inside the function.

2. On every `checkout` change, write the URL exactly the way the prototype does (`:401-421`), through
   `buildCheckoutQuery` + `history.replaceState`, and clear it on close. Never `router.push` — the
   buyer would lose their typed fields to a server round-trip.
3. Give each event card one primary action, `Buy tickets`, that opens the overlay:
   `href={checkoutHref({ eventId: event.id, tierId: tiers[0]?.id ?? "", quantity: 1, step: 1 })}`,
   `min-h-[48px]`, and render `null` for the action when `tiers.length === 0`. The tier buttons at
   `:224-255` keep selecting a tier *inside* the card only while the overlay is closed; once open, the
   overlay owns selection.
4. Render `<TicketCheckoutOverlay …/>` when `checkout` resolves to a real event, and call `onClose`
   when it resolves to none (a `?event=` that is not in `events` — the buyer's link is stale, so the
   storefront shows the list and the URL is cleaned).

- [ ] **Step 7: Run, verify in a browser, commit**

```bash
npm test
npm run lint
npm run build
```

Then the browser pass, against the production build on `http://127.0.0.1:3001/tickets` (port 3001, per
the local verification note in project memory — and if something already owns 3001, stop it rather
than reading a stale build):

1. Click **Buy tickets** → the overlay opens, the address bar gains
   `?event=…&tier=…&qty=1&step=1`, and no network navigation happens.
2. Type a name only → the hint reads `Still needed: a valid email address, your phone number.`
3. Fill all three → **Continue to payment** enables, the URL becomes `step=2`, and the indicator marks
   step 1 done.
4. Press Escape → the overlay closes and `?event=` is gone. Reopen → the typed name is still there.
5. **Refresh while on step 2** → the overlay reopens on step 1 with the name intact and the line
   "the receipt upload did not survive the refresh".
6. Attach a 9 MB file → `The receipt must be 8 MB or smaller.`; attach a `.txt` → the type message.
7. Tab through the overlay: every stop shows the 3px focus ring; Shift+Tab from the first control wraps
   to the last.
8. Select a tier with 2 left → the quantity select offers 1 and 2 only.

```bash
git add src/components/tickets/ticket-checkout-overlay.tsx src/components/tickets/tickets-storefront-view.tsx src/lib/ticket-order-intake.mjs tests/ticket-order-intake.test.mjs tests/till-ledger-surfaces.test.mjs
git commit -m "feat(tickets): port the box office checkout into a URL-driven overlay"
```

---

## Task 13: Three emails, and the actions that send them

The buyer gets one on submit ("we have your order") and one on every decision. The club gets the
submit one too, so an order does not sit unreviewed because nobody saw the queue — that is three
helpers and three trigger types. The helpers follow
`notifyDuesPaymentRequestSubmitted` (`src/lib/email/notifications.ts:577-675`) and
`notifyDuesPaymentConfirmed` (`:677-741`), which are the closest existing twins: submitted → member +
officers, decided → member.

Two things they cannot follow, and both are structural:

- `queueSingle` needs a `NotificationContact`, and every existing helper obtains one from
  `resolveMemberContact(supabase, userId)` (`src/lib/notifications/outbox-service.ts:193-235`), which
  reads `member_profiles` and `auth.admin.getUserById`. **A guest has neither.** `NotificationContact`
  is `{ email, userId: string | null, name }` (`outbox-service.ts:44-48`), `recipient_user_id` is
  nullable (`20261027000000:82` — `references public.member_profiles (id)`, no `not null`), and
  `enqueue_notification_email` passes it straight through (`:119`). So the guest contact is built from
  the order itself: `{ email: buyerEmail, userId: null, name: buyerName }`.
- `enqueue_notification_email:341-343` rejects a half-written CTA — `(p_cta_label is null) <>
  (p_cta_url is null)` raises. Both or neither, always.

Neither new trigger type needs a migration: `notification_outbox_trigger_type_check` is a shape test
(`^[a-z][a-z0-9_]{1,63}$`, `20261027000000:106-108`), not a whitelist, and all three names match.

**Files:**
- Modify: `src/lib/notifications/idempotency.ts`
- Modify: `src/lib/email/notifications.ts`
- Modify: `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql`
- Modify: `src/app/actions.ts`
- Modify: `src/app/(member)/events/[eventId]/dashboard/actions.ts`
- Create: `tests/ticket-order-emails.test.mjs`

**Interfaces:**
- Consumes: Task 5's `submit_ticket_order` jsonb and `lookup_ticket_order`; Task 6's
  `verify_event_ticket_sale` body; Task 10's `submitTicketOrderAction` and `createAnonClient`.
- Produces: `ticketOrderReceivedKey(saleId: string): string`,
  `ticketOrderOfficerAlertKey(params: { saleId: string; officerEmail: string }): string`,
  `ticketOrderReviewedKey(saleId: string, status: string): string`,
  `notifyTicketOrderReceived(params): Promise<void>`,
  `notifyTicketOrderAlerted(params): Promise<void>`,
  `notifyTicketOrderReviewed(params): Promise<void>`, and the widened `verify_event_ticket_sale`
  signature in Step 4 that Task 15's action wiring reads.

The officer alert is its own trigger type rather than a second use of `ticket_order_received`, because
one idempotency key per (sale, recipient) is what makes a retry safe: reusing the buyer's key would make
the first officer's row collide with the buyer's and every later officer would be silently deduplicated
away. `notifyTicketOrderAlerted` therefore takes `eventId: string` as well — its CTA deep-links into the
dashboard tab, which is the only place an officer can act on the order.

- [ ] **Step 1: Write the failing tests**

Create `tests/ticket-order-emails.test.mjs`. `idempotency.ts` imports nothing, so `node --test` can
run it for real; `notifications.ts` starts with `import "server-only"` and cannot be imported, so its
half is source-text, which is the house convention for that file:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ticketOrderOfficerAlertKey,
  ticketOrderReceivedKey,
  ticketOrderReviewedKey,
} from "../src/lib/notifications/idempotency.ts";

const NOTIFICATIONS = readFileSync("src/lib/email/notifications.ts", "utf8");

test("the received key is per sale and the reviewed key is per sale and outcome", () => {
  const sale = "6F1A0C6E-4b47-4a2f-9e3c-1d0e7c5b8a11";
  assert.equal(
    ticketOrderReceivedKey(sale),
    "ticket_order_received:sale:6f1a0c6e-4b47-4a2f-9e3c-1d0e7c5b8a11",
  );
  assert.equal(
    ticketOrderReviewedKey(sale, "approved"),
    "ticket_order_reviewed:sale:6f1a0c6e-4b47-4a2f-9e3c-1d0e7c5b8a11:status:approved",
  );
  assert.notEqual(
    ticketOrderReviewedKey(sale, "rejected"),
    ticketOrderReviewedKey(sale, "cancelled"),
  );
});

test("each officer of one sale gets a distinct key", () => {
  const sale = "6f1a0c6e-4b47-4a2f-9e3c-1d0e7c5b8a11";
  assert.equal(
    ticketOrderOfficerAlertKey({ saleId: sale, officerEmail: "Treasurer@Club.test" }),
    `ticket_order_alert:sale:${sale}:officer:treasurer_club_test`,
  );
  assert.notEqual(
    ticketOrderOfficerAlertKey({ saleId: sale, officerEmail: "a@club.test" }),
    ticketOrderOfficerAlertKey({ saleId: sale, officerEmail: "b@club.test" }),
  );
  assert.notEqual(
    ticketOrderOfficerAlertKey({ saleId: sale, officerEmail: "a@club.test" }),
    ticketOrderReceivedKey(sale),
    "the officer row must not collide with the buyer row",
  );
});

test("every key satisfies the outbox idempotency CHECK", () => {
  const check = /^[a-z0-9][a-z0-9:_-]{0,254}$/;
  assert.match(ticketOrderReceivedKey("abc"), check);
  assert.match(ticketOrderReviewedKey("abc", "approved"), check);
  assert.match(
    ticketOrderOfficerAlertKey({ saleId: "abc", officerEmail: "Officer@Club.Test" }),
    check,
  );
});

test("a guest order queues a buyer email and an officer alert", () => {
  assert.match(
    NOTIFICATIONS,
    /export async function notifyTicketOrderReceived/,
  );
  assert.match(NOTIFICATIONS, /triggerType: "ticket_order_received"/);
  assert.match(NOTIFICATIONS, /triggerType: "ticket_order_alert"/);
  // The guest has no profile: the recipient is built from the order, with a null user id.
  assert.match(NOTIFICATIONS, /userId: null/);
  assert.doesNotMatch(
    NOTIFICATIONS,
    /notifyTicketOrderReceived[\s\S]*?resolveMemberContact/,
  );
});

test("the review email carries the outcome and never the receipt", () => {
  assert.match(NOTIFICATIONS, /export async function notifyTicketOrderReviewed/);
  assert.match(NOTIFICATIONS, /triggerType: "ticket_order_reviewed"/);
  assert.doesNotMatch(
    NOTIFICATIONS,
    /notifyTicketOrderReviewed[\s\S]*?receipt/,
    "the stored voucher file must never be named or linked in a buyer email",
  );
});
```

Run: `npm test -- tests/ticket-order-emails.test.mjs`
Expected: FAIL — `does not provide an export named 'ticketOrderOfficerAlertKey'`. Node reports the first
missing name in the import list, so all three keys failing is what this single message stands for.

- [ ] **Step 2: The three keys**

Append to `src/lib/notifications/idempotency.ts`, after `eventRoleAssignedKey` (`:205-213`) and
before `broadcastRecipientKey`:

```ts
export function ticketOrderReceivedKey(saleId: string): string {
  return finalize(`ticket_order_received:sale:${normalizedId(saleId)}`);
}

export function ticketOrderOfficerAlertKey(params: {
  saleId: string;
  officerEmail: string;
}): string {
  return finalize(
    `ticket_order_alert:sale:${normalizedId(params.saleId)}:officer:${slug(params.officerEmail)}`,
  );
}

export function ticketOrderReviewedKey(saleId: string, status: string): string {
  return finalize(
    `ticket_order_reviewed:sale:${normalizedId(saleId)}:status:${slug(status)}`,
  );
}
```

This is the shape `memberSignupAlertKey` (`:92-99`) already uses for one sale fanned out to several
officers. `slug(officerEmail)` and `slug(status)` rather than the raw strings: the CHECK forbids
uppercase, `@` and spaces, and an officer pasting "Not Approved" into a reason must not be able to
poison a key.

- [ ] **Step 3: The three helpers**

In `src/lib/email/notifications.ts`, add the three keys to the existing `@/lib/notifications/idempotency`
import block (`:8-33`), then append a new section after `notifyDuesPaymentRequestRejected` ends.
`formatNgn` (`:50-52`) and `queueSingle` (`:113-138`) are already in this file and are what these use.

```ts
// ============================================================================
// 3b. BOX OFFICE — guest ticket orders (no member profile behind the buyer)
// ============================================================================

/**
 * The buyer's own copy. `buyerEmail` and `buyerName` come from the order, not from a profile, so
 * there is no `resolveMemberContact` call and no `userId` to hang the row on.
 */
export async function notifyTicketOrderReceived(params: {
  saleId: string;
  publicReference: string;
  buyerEmail: string;
  buyerName: string;
  eventTitle: string;
  tierName: string;
  quantity: number;
  amountNgn: number;
}): Promise<void> {
  const contact: NotificationContact = {
    email: params.buyerEmail,
    userId: null,
    name: params.buyerName,
  };
  try {
    await queueSingle({
      idempotencyKey: ticketOrderReceivedKey(params.saleId),
      triggerType: "ticket_order_received",
      contact,
      subject: `Ticket order ${params.publicReference} received`,
      heading: "Your ticket order is waiting for confirmation",
      ctaLabel: "Track this order",
      ctaPath: `/tickets/order?ref=${encodeURIComponent(params.publicReference)}`,
      copy: {
        previewText: `${params.quantity} × ${params.tierName} for ${params.eventTitle}.`,
        greeting: `Hello ${params.buyerName},`,
        intro:
          "We have your order and your transfer receipt. An event officer checks payments by hand, " +
          "so nothing is confirmed until they approve it. Keep your reference — it is how you and the " +
          "gate find this order.",
        detailsTitle: "Order Summary",
        details: [
          { label: "Reference", value: params.publicReference },
          { label: "Event", value: params.eventTitle },
          { label: "Ticket type", value: params.tierName },
          { label: "Quantity", value: String(params.quantity) },
          { label: "Amount to transfer", value: formatNgn(params.amountNgn) },
        ],
        footerNote:
          "This reference is your proof of order. It does not guarantee a seat until the payment is approved.",
        category: "event",
      },
    });
  } catch (err) {
    reportNotificationError(
      "[Email Service] notifyTicketOrderReceived failed:",
      err,
    );
  }
}

/** The officer alert. Same facts, different reader and different call to action. */
export async function notifyTicketOrderAlerted(params: {
  saleId: string;
  eventId: string;
  publicReference: string;
  buyerName: string;
  eventTitle: string;
  tierName: string;
  quantity: number;
  amountNgn: number;
}): Promise<void> {
  try {
    const officers = await resolveOfficerContacts();
    const queueResults = await Promise.allSettled(
      officers.map((officer) =>
        queueSingle({
          idempotencyKey: ticketOrderOfficerAlertKey({
            saleId: params.saleId,
            officerEmail: officer.email,
          }),
          triggerType: "ticket_order_alert",
          contact: officer,
          subject: `New ticket order ${params.publicReference} — ${params.buyerName}`,
          heading: "A guest submitted a ticket order",
          ctaLabel: "Review the receipt",
          ctaPath: `/events/${params.eventId}/dashboard?tab=tickets`,
          copy: {
            previewText: `${params.buyerName} ordered ${params.quantity} × ${params.tierName}.`,
            intro:
              "A buyer without a member account submitted this order with a transfer receipt. Verify the " +
              "voucher against the amount before approving; the tickets do not count until you do.",
            detailsTitle: "Order Under Review",
            details: [
              { label: "Reference", value: params.publicReference },
              { label: "Event", value: params.eventTitle },
              { label: "Buyer", value: params.buyerName },
              { label: "Ticket type", value: params.tierName },
              { label: "Quantity", value: String(params.quantity) },
              { label: "Amount claimed", value: formatNgn(params.amountNgn) },
            ],
            category: "event",
          },
        }),
      ),
    );
    const failure = queueResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  } catch (err) {
    reportNotificationError(
      "[Email Service] notifyTicketOrderAlerted failed:",
      err,
    );
  }
}

/** One email per decision, with the wording the outcome deserves. */
export async function notifyTicketOrderReviewed(params: {
  saleId: string;
  publicReference: string;
  buyerEmail: string;
  buyerName: string;
  eventTitle: string;
  tierName: string;
  quantity: number;
  amountNgn: number;
  decision: "approved" | "rejected" | "cancelled";
  reason?: string | null;
}): Promise<void> {
  const copy =
    params.decision === "approved"
      ? {
          subject: `Tickets confirmed — ${params.publicReference}`,
          heading: "Your tickets are confirmed",
          ctaLabel: "See your order",
          intro:
            "An officer matched your transfer to the order and confirmed it. Your tickets are held " +
            "against the reference below.",
          footerNote:
            "Bring this reference to the entrance. Payment matched, tickets confirmed.",
        }
      : params.decision === "rejected"
        ? {
            subject: `Ticket order ${params.publicReference} was not approved`,
            heading: "We could not confirm your payment",
            ctaLabel: "Read the reason",
            intro:
              "An officer reviewed the receipt and could not match it to the amount owed. No payment " +
              "is recorded against this order. You can transfer again and submit a new order.",
            footerNote:
              "If you believe this is a mistake, reply to this email with your reference.",
          }
        : {
            subject: `Ticket order ${params.publicReference} cancelled`,
            heading: "This order has been cancelled",
            ctaLabel: "See your order",
            intro:
              "This order was cancelled. It never counted as revenue and no ticket is held against it.",
            footerNote:
              "Cancelled means no money moved, so there is nothing to refund on this reference.",
          };

  const contact: NotificationContact = {
    email: params.buyerEmail,
    userId: null,
    name: params.buyerName,
  };

  try {
    await queueSingle({
      idempotencyKey: ticketOrderReviewedKey(params.saleId, params.decision),
      triggerType: "ticket_order_reviewed",
      contact,
      subject: copy.subject,
      heading: copy.heading,
      ctaLabel: copy.ctaLabel,
      ctaPath: `/tickets/order?ref=${encodeURIComponent(params.publicReference)}`,
      copy: {
        previewText: `${params.quantity} × ${params.tierName} — ${params.eventTitle}.`,
        greeting: `Hello ${params.buyerName},`,
        intro: copy.intro,
        detailsTitle: "Order",
        details: [
          { label: "Reference", value: params.publicReference },
          { label: "Event", value: params.eventTitle },
          { label: "Ticket type", value: params.tierName },
          { label: "Quantity", value: String(params.quantity) },
          { label: "Amount", value: formatNgn(params.amountNgn) },
        ],
        bodyLabel: params.reason ? "Officer's note" : undefined,
        bodyText: params.reason ?? null,
        footerNote: copy.footerNote,
        category: "event",
      },
    });
  } catch (err) {
    reportNotificationError(
      "[Email Service] notifyTicketOrderReviewed failed:",
      err,
    );
  }
}
```

The `bodyLabel`/`bodyText` pair is how `queueSingle` renders an officer's reason (see the dues twin at
`:658-659`); `templatePayload` drops both keys when the reason is null, so an approval has no empty
"Officer's note" box.

Run: `npm test -- tests/ticket-order-emails.test.mjs`
Expected: all five tests PASS.

- [ ] **Step 4: Widen the two RPCs so the actions have what the emails need**

Neither `submit_ticket_order` nor `verify_event_ticket_sale` currently hands back the facts an email
body needs. Both edits go in `supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql`.

(a) `submit_ticket_order` — the event title is not currently read, so take it from the lock the function
already holds. Replace Task 5's line

```sql
  -- One event row per order, and it serialises the throttle counts below.
  perform 1 from public.events where id = p_event_id for update;
```

with the same lock plus the value the emails need, and add the local to the `declare` block
(`v_event_title text;` beside `v_reference text;`):

```sql
  -- One event row per order: this both serialises the throttle counts below and gives the
  -- confirmation email a title without a second read.
  select e.title into v_event_title from public.events as e
    where e.id = p_event_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'Event not found.';
  end if;
```

It sits exactly where the `perform` was — after the tier check, before the dedup lookup — so every one of
the three `jsonb_build_object` return points is now past both `v_event_title` and `v_tier`.

Then add the display fields to each of the three return points. The success insert (Task 5's final
`return`) prices from the tier as written:

```sql
  return pg_catalog.jsonb_build_object(
    'sale_id', v_sid, 'public_reference', v_reference, 'deduplicated', false,
    'event_id', p_event_id, 'event_title', v_event_title, 'tier_name', v_tier.name,
    'unit_price_ngn', v_tier.price_ngn,
    'amount_ngn', (v_tier.price_ngn::bigint * p_quantity));
```

The two dedup returns (the `v_existing` match and the `unique_violation` re-select) must price from the
row that already exists, because an officer may have edited the tier's price since that order was placed
and the buyer's email must quote what the ledger holds, not today's tier. `amount_ngn` is a stored
generated column (`20261003102501:106`), so it is readable straight off `v_existing`:

```sql
      return pg_catalog.jsonb_build_object(
        'sale_id', v_existing.id,
        'public_reference', v_existing.public_reference,
        'deduplicated', true,
        'event_id', v_existing.event_id, 'event_title', v_event_title,
        'tier_name', v_tier.name,
        'unit_price_ngn', v_existing.unit_price_ngn,
        'amount_ngn', v_existing.amount_ngn);
```

`v_tier.name` is safe in both dedup branches: the function raises `23503` when the tier id does not
resolve, so `v_tier` is populated before any return point runs — and a replay only happens for the same
`tier_id`, which is what the `23505` guard checks. `event_id` is included because
`notifyTicketOrderAlerted` needs it for the officer's CTA.

(b) `verify_event_ticket_sale` — replace the header Task 6 left as `returns void` with a row the action
can read, and end the function with a return-query:

```sql
create or replace function public.verify_event_ticket_sale(
  p_sale_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  sale_id uuid, decision text, public_reference text, buyer_email text,
  buyer_name text, event_id uuid, event_title text, tier_name text,
  quantity integer, amount_ngn bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
-- … Task 6's body, unchanged …
  return query
    select s.id, p_decision, s.public_reference, s.buyer_email, s.buyer_name,
      e.id, e.title, t.name, s.quantity, s.amount_ngn
    from public.event_ticket_sales as s
    join public.events as e on e.id = s.event_id
    join public.event_ticket_tiers as t on t.id = s.tier_id
    where s.id = p_sale_id;
end;
$function$;
```

The `grant execute … to authenticated` line at `20261028014047:302`/`:139` does not change, and this is
why the widening is done here instead of giving the review queue `buyer_email` in the per-column SELECT
grant list (`20261003102501:218-241`): a buyer's address reaches exactly one reader, the reviewer who is
already authorized to reverse the sale, and it is never part of a table the browser can select.

Re-run the migration and both suites, because a `returns void` → `returns table` change can strand an
assertion written against the old signature:

```bash
npx supabase db reset --local && npx supabase test db
```
Expected: every suite passes. In
`supabase/tests/database/public_ticket_till_and_ledger_test.sql`, `perform`-style and
`select verify_event_ticket_sale(...)` calls both survive the widening; if an assertion compares the
whole result (`is_rows`, `results_eq`) it must be rewritten to select the columns it names. Fix it there
rather than reverting the signature.

- [ ] **Step 5: Send from the submit action**

In `src/app/actions.ts`, inside `submitTicketOrderAction`, replace the
`// Task 13 adds the two notify calls here…` comment Task 10 left, between `revalidatePath` and
`redirect`:

```ts
    // The order is committed and the buyer is about to be redirected to it. A notification that
    // cannot be queued is reported, not thrown: failing the action here would tell the buyer their
    // order was lost when it was not, and a retry would come back deduplicated. The dues twin
    // (`actions.ts:780`) lets the throw escape and has the same shape as a bug — the payment is
    // already recorded when the officer sees "failed". Not fixed here; out of this plan's scope.
    const saleIdForEmail = entryResult.id;
    await Promise.all([
      notifyTicketOrderReceived({
        saleId: saleIdForEmail,
        publicReference: reference,
        buyerEmail,
        buyerName,
        eventTitle: submitted.event_title ?? "your event",
        tierName: submitted.tier_name ?? "your ticket",
        quantity: submitted.quantity ?? Number.parseInt(quantity, 10),
        amountNgn: Number(submitted.amount_ngn ?? 0),
      }).catch((err) => console.error("[Ticket order] buyer email failed:", err)),
      notifyTicketOrderAlerted({
        saleId: saleIdForEmail,
        eventId: submitted.event_id ?? eventId,
        publicReference: reference,
        buyerName,
        eventTitle: submitted.event_title ?? "your event",
        tierName: submitted.tier_name ?? "your ticket",
        quantity: submitted.quantity ?? Number.parseInt(quantity, 10),
        amountNgn: Number(submitted.amount_ngn ?? 0),
      }).catch((err) => console.error("[Ticket order] officer alert failed:", err)),
    ]);
```

`Promise.all` with each promise already swallowed by its own `.catch` means one helper failing cannot
cancel the other, and neither can reject. Do not wrap them in a bare `try/catch` around `await` calls
sequentially — that would skip the officer alert if the buyer email threw, and the whole point of the
alert is that nobody has to notice an order for it to go unreviewed.

`submitted` is the closure variable Task 10 declared; `entryResult.id` is the sale id `runReceiptEntry`
settled on, which is the deduplicated row's id when the buyer double-submitted, so the email key matches
the row that actually exists.

- [ ] **Step 6: Send from the review action**

In `src/app/(member)/events/[eventId]/dashboard/actions.ts`, change
`verifyEventTicketSaleAction`'s RPC call to read the row it now returns and mail from it:

```ts
    const { data, error } = await supabase.rpc("verify_event_ticket_sale", {
      p_sale_id: params.saleId,
      p_decision: params.decision,
      p_reason: params.reason ? params.reason.trim() : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { buyer_email: string | null; buyer_name: string; public_reference: string | null; event_id: string; event_title: string; tier_name: string; quantity: number; amount_ngn: number }
      | undefined;

    // A guest order has a buyer email; an officer-recorded sale may have none, and then there is
    // nothing to send. The decision itself is already committed.
    if (row?.buyer_email && row.public_reference) {
      await notifyTicketOrderReviewed({
        saleId: params.saleId,
        publicReference: row.public_reference,
        buyerEmail: row.buyer_email,
        buyerName: row.buyer_name,
        eventTitle: row.event_title,
        tierName: row.tier_name,
        quantity: row.quantity,
        amountNgn: Number(row.amount_ngn),
        decision: params.decision,
        reason: params.reason?.trim() ?? null,
      }).catch((err) => console.error("[Ticket review] confirmation email failed:", err));
    }
```

The `.catch` is the same rule as Step 5 stated: the decision is terminal and committed, so an email
failure must not be reported as a review failure.

- [ ] **Step 7: Run, verify, commit**

```bash
npm test
npm run lint
npm run build
npx supabase test db
```
Expected: all green. Add `tests/ticket-order-emails.test.mjs` to the run list in your head and check
the four assertions actually ran (`node --test` prints 4 `✔` lines for it).

```bash
git add src/lib/notifications/idempotency.ts src/lib/email/notifications.ts src/app/actions.ts "src/app/(member)/events/[eventId]/dashboard/actions.ts" supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql tests/ticket-order-emails.test.mjs
git commit -m "feat(tickets): email the buyer and the club about till orders"
```

---

## Task 14: The storefront's unavailable state and the order status page

Today `src/app/tickets/page.tsx:34-36` swallows every failure into `catch {}` and renders
"No Ticketed Events Currently Open" (`tickets-storefront-view.tsx:142-148`) whether the database is
down or the club simply has nothing on sale. DESIGN.md:53 forbids exactly this for the events screen:
"If budget or allocation data fails to load, show an unavailable state and withhold the … form so blank
fallback values cannot be submitted". The same rule applies harder here, because the page also prints a
bank account number the buyer is asked to send real money to — and `:74-76` invents that account number
when the RPC gives none. This task replaces the fallbacks with an unavailable state, and builds the
status page the reference links to.

**Files:**
- Modify: `src/app/tickets/page.tsx`
- Modify: `src/components/tickets/tickets-storefront-view.tsx`
- Create: `src/app/tickets/order/page.tsx`
- Create: `src/components/tickets/ticket-status-view.tsx`
- Modify: `src/app/actions.ts` (`lookupTicketOrderAction`)

**Interfaces:**
- Consumes: Task 11's `TicketOrderStatus` / `TicketLookupState`; Task 5's
  `lookup_ticket_order(p_reference, p_email)`; Task 10's `createAnonClient`; Task 2's notice codes.
- Produces: `lookupTicketOrderAction(state, formData) → Promise<TicketLookupState>`;
  `TicketsStorefrontViewProps.unavailable: boolean`; the `/tickets/order` route.

- [ ] **Step 1: Write the failing test**

Append to `tests/tickets-storefront-copy.test.mjs`:

```js
test("the storefront never invents a bank account", () => {
  assert.doesNotMatch(STOREFRONT, /1307798889/);
  assert.doesNotMatch(STOREFRONT, /ProvidusUnity/);
  assert.doesNotMatch(STOREFRONT, /The Carpenters Fam Soc Club Asb/);
  assert.match(STOREFRONT, /unavailable/);
});

test("the order page awaits searchParams as a promise", () => {
  const orderPage = readFileSync("src/app/tickets/order/page.tsx", "utf8");
  assert.match(orderPage, /await searchParams/);
  assert.doesNotMatch(orderPage, /searchParams\.get\(/);
});

test("the lookup keeps the email out of the URL", () => {
  const actions = readFileSync("src/app/actions.ts", "utf8");
  assert.match(actions, /export async function lookupTicketOrderAction/);
  assert.doesNotMatch(actions, /buyer_email=\$\{/);
  assert.doesNotMatch(actions, /redirect\(.*tickets\/order\?.*email/);
});
```

Run: `npm test -- tests/tickets-storefront-copy.test.mjs`
Expected: FAIL on `1307798889` first (the file read at the top of the test module still exists), then
the other two once that one is fixed.

- [ ] **Step 2: Unavailable, not empty**

In `src/app/tickets/page.tsx`, split the try into the two things it conflates:

```ts
  let events: PublicTicketedEvent[] = [];
  let bank: PublicBankInfo | null = null;
  let isAuthenticatedMember = false;
  let unavailable = false;

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: authData }, rpcResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_public_ticketed_events"),
    ]);
    isAuthenticatedMember = Boolean(authData?.user);
    if (rpcResult.error) {
      unavailable = true;
    } else {
      const payload = (rpcResult.data ?? {}) as {
        bank?: PublicBankInfo | null;
        events?: PublicTicketedEvent[];
      };
      bank = payload.bank ?? null;
      events = Array.isArray(payload.events) ? payload.events : [];
    }
  } catch {
    unavailable = true;
  }
```

The `rpcResult.error` branch is the one that did not exist before: PostgREST reports a missing or
ungranted function as an error on the result, not as a thrown exception, so `catch {}` alone never saw
it. Pass `unavailable` to the view.

In `tickets-storefront-view.tsx`: delete `:74-76` and read `bank` directly. Where `bank` is null and
the page is not otherwise unavailable, the payment panel says
`Treasury account details are being confirmed. Try again shortly.` and the overlay's **Submit order**
stays enabled (the account text is not a field the server consumes). Add a third render branch ahead of
`events.length === 0`:

```tsx
        {unavailable ? (
          <section className="rounded-2xl bg-white border border-linen p-10 text-center space-y-3 shadow-xs">
            <ShieldAlert className="w-10 h-10 text-terracotta mx-auto" />
            <h2 className="text-lg font-extrabold text-espresso">
              The box office is temporarily unavailable
            </h2>
            <p className="text-xs sm:text-sm text-body max-w-md mx-auto leading-relaxed">
              Ticket listings could not be loaded. Please try again shortly — do not transfer money
              for a ticket you cannot see listed here.
            </p>
          </section>
        ) : events.length === 0 ? ( /* existing block */ ) : ( /* existing list */ )}
```

`ShieldAlert` joins the lucide import at `:3-12`. The sentence "do not transfer money for a ticket you
cannot see listed here" is the whole point of this state; do not trim it to "try again later".

- [ ] **Step 3: `lookupTicketOrderAction`**

In `src/app/actions.ts`, a `"use server"` export next to `submitTicketOrderAction`. It returns state
rather than redirecting, because the buyer's email must never enter the address bar and a redirect
cannot carry it back without doing exactly that:

```ts
import type {
  TicketLookupState,
  TicketOrderStatus,
} from "@/components/tickets/ticket-types";

export async function lookupTicketOrderAction(
  previous: TicketLookupState,
  formData: FormData,
): Promise<TicketLookupState> {
  const reference = String(formData.get("reference") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!reference || !email) {
    return { ...previous, notFound: false, error: "invalid-request", pendingReference: reference };
  }

  const supabase = await createAnonClient();
  if (!supabase) {
    return { ...previous, error: "configuration", pendingReference: reference };
  }

  const { data, error } = await supabase.rpc("lookup_ticket_order", {
    p_reference: reference,
    p_email: email,
  });

  if (error) {
    // Never forward error.message: it is the database's sentence, not ours.
    return { ...previous, error: "lookup-unavailable", pendingReference: reference };
  }

  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) {
    // One answer for "no such reference" and "wrong email": the endpoint cannot confirm that a
    // reference exists.
    return { ...previous, status: null, notFound: true, error: null, pendingReference: reference };
  }

  return {
    status: row as TicketOrderStatus,
    notFound: false,
    error: null,
    pendingReference: row.public_reference,
  };
}
```

`lookup-unavailable` is the fifth notice code Task 2 registers; if it is not in `SYSTEM_NOTICES`, add it
there now with the wording "We could not check that order just now. Please try again shortly."

No `useActionState` import belongs in `src/app/actions.ts` — that hook is React client API and this is a
`"use server"` module; it appears only in Step 4's component. `createAnonClient` returns `null` when the
public config is missing, which is why the guard above returns state instead of throwing.

- [ ] **Step 4: `src/components/tickets/ticket-status-view.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Loader2, ShieldCheck, Ticket, XCircle } from "lucide-react";
import { lookupTicketOrderAction } from "@/app/actions";
import { formatNaira } from "@/lib/format";
import { formatEventTime } from "@/lib/event-times.mjs";
import { getSystemNotice } from "@/lib/system-notices";
import type { TicketLookupState, TicketOrderStatus } from "./ticket-types";

const INITIAL: TicketLookupState = {
  status: null,
  notFound: false,
  error: null,
  pendingReference: "",
};

const STATUS_LABEL: Record<TicketOrderStatus["verification_status"], string> = {
  recorded: "Waiting for the officer's check",
  approved: "Confirmed",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

export function TicketStatusView({ initialReference }: { initialReference: string }) {
  const [state, lookupAction, isPending] = useActionState(lookupTicketOrderAction, INITIAL);
  const shown = state.status;
  const reference = shown?.public_reference ?? state.pendingReference ?? initialReference;

  return (
    <div className="space-y-6">
      {!shown && (
        <form action={lookupAction} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-espresso" htmlFor="order-ref">
              Order reference
            </label>
            <input
              className="w-full min-h-[48px] px-3 rounded-xl border border-linen bg-white font-mono text-sm tracking-wider text-espresso uppercase"
              defaultValue={initialReference || undefined}
              id="order-ref"
              maxLength={16}
              name="reference"
              placeholder="CF-XXXXXXXX"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-espresso" htmlFor="order-email">
              Email you used
            </label>
            <input
              className="w-full min-h-[48px] px-3 rounded-xl border border-linen bg-white text-sm text-espresso"
              id="order-email"
              inputMode="email"
              name="email"
              required
              type="email"
            />
            <p className="text-[11px] text-muted">
              Both are needed. The reference alone does not prove the order is yours.
            </p>
          </div>
          {state.notFound && (
            <p className="text-xs font-semibold text-terracotta">
              No order matches that reference and email. Check both and try again.
            </p>
          )}
          {state.error && (
            <p className="text-xs font-semibold text-terracotta" role="alert">
              {getSystemNotice(state.error)?.message ??
                "We could not check that order just now. Please try again shortly."}
            </p>
          )}
          <button
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl bg-forest text-white text-xs font-bold hover:bg-deep-forest-hover transition-colors cursor-pointer disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isPending ? "Checking…" : "Check my order"}</span>
          </button>
        </form>
      )}

      {shown && <OrderStatusCard status={shown} reference={reference} />}
    </div>
  );
}
```

`state.error` holds a notice **code**, and a code is not a sentence to print, so it goes through
`getSystemNotice` (`src/lib/system-notices.ts:529`) — the same allowlist the flash listener uses — with a
literal fallback for a code that somehow is not in the table. This is the client-side twin of the
`rpcErrorNotice` rule: no raw internal string reaches the browser.

There is deliberately **no** hidden `reference` input beside the visible one. Two fields named
`reference` would make `formData.get("reference")` return the hidden value in document order, so a buyer
who edited the visible box would still be searching for the reference the URL arrived with. The visible
input's `defaultValue={initialReference}` carries the deep link, and `initialReference` is already
validated by `REFERENCE_PATTERN` on the server.

`OrderStatusCard` renders, in this order: the reference in `font-mono` with a copy button; the event
title, `formatEventTime(status.event_starts_at)` and the quantity × tier line; `formatNaira` of the
amount; and the status label from `STATUS_LABEL` in a chip whose colour follows the existing ledger
palette — `approved` `bg-forest/10 text-forest`, `recorded` `bg-ochre/15 text-espresso`,
`rejected`/`cancelled` `bg-terracotta/10 text-terracotta`. For `rejected` and `cancelled` it renders
`status.outcome_reason` inside a `<section aria-label="Officer's reason">` panel, and `DESIGN.md:26`'s
"Do not communicate status through color alone" is satisfied by `STATUS_LABEL` being visible text. The
card ends with a `Back to tickets` link (`href="/tickets"`). It never renders a receipt, a phone number
or an email address — the email is what the buyer just typed, and echoing it invites shoulder-surfing.

- [ ] **Step 5: `src/app/tickets/order/page.tsx`**

```tsx
import ClubLogo from "@/components/club-logo";
import { TicketStatusView } from "@/components/tickets/ticket-status-view";
import { clubBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

const REFERENCE_PATTERN = /^CF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

export default async function TicketOrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[]; notice?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const reference =
    raw && REFERENCE_PATTERN.test(raw.toUpperCase()) ? raw.toUpperCase() : "";

  return (
    <main className="min-h-screen bg-warm-canvas text-espresso font-sans antialiased">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-14 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white border border-linen shadow-2xs">
            <ClubLogo size="sm" variant="dark" />
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight block text-espresso">
              {clubBrand.name}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-forest block">
              Box office · your order
            </span>
          </div>
        </div>
        <TicketStatusView initialReference={reference} />
      </div>
    </main>
  );
}
```

`REFERENCE_PATTERN` is exactly Task 5's alphabet — the `'23456789ABCDEFGHJKLMNPQRSTUVWXYZ'` literal inside
`submit_ticket_order`'s reference loop, and the same class the column CHECK and the pgTAP assertion
already use. digits 2–9 and every letter except `I` and `O`. A pattern that also accepted `0`, `1`, `I` or `O`
would send a garbage reference to `lookup_ticket_order` and report "not found" for a typo the buyer can
still see — so the character class is copied from the generator, not approximated. The uppercase check
is what lets a buyer paste `cf-a1b2c3d4` from a phone keyboard and still land on their order.

No `Suspense` boundary is needed: this page reads the query with `await searchParams` on the server and
`TicketStatusView` takes it as a prop, so nothing below it calls `useSearchParams`. `src/app/tickets/page.tsx:40`
renders its client child the same way.

- [ ] **Step 6: Run, verify, commit**

```bash
npm test
npm run lint
npm run build
```
Then in the browser at `http://127.0.0.1:3001/tickets`:
1. With the database reachable, the list shows as before and no bank digits are hardcoded — confirm
   the account number you see is the one `get_public_ticketed_events` returns.
2. `http://127.0.0.1:3001/tickets?notice=lookup-unavailable` toasts and clears without disturbing the
   list.
3. `/tickets/order` with no `?ref=` shows a blank form; submitting a made-up reference and a real email
   shows "No order matches that reference and email." and the address bar never gains an email.
4. `/tickets/order?ref=CF-ABCDEFGH&email=someone@example.com` — the email parameter is ignored entirely
   (the page reads only `ref`), which is the point.

```bash
git add src/app/tickets/page.tsx src/app/tickets/order/page.tsx src/components/tickets/tickets-storefront-view.tsx src/components/tickets/ticket-status-view.tsx src/app/actions.ts src/lib/system-notices.ts tests/tickets-storefront-copy.test.mjs
git commit -m "feat(tickets): add the order status page and an honest unavailable storefront"
```

---

## Task 15: The officer queue learns the third decision

`verify_event_ticket_sale` gained `cancelled` in Task 6 and the ledger learned to carry it in Task 3.
Nothing an officer can click knows about it yet: the drawer offers Approve and Reject only
(`voucher-inspection-drawer.tsx:74-134`), the ledger's filter union is
`"all" | "recorded" | "approved" | "rejected"` (`event-domain-ledger.tsx:44-46`), the action's decision
union is `"approved" | "rejected"` (`dashboard/actions.ts:14-18`), and the dashboard maps
`verificationStatus` from three values at `page.tsx:733-736`. A `cancelled` row today renders as
"Approved & Active" (`resolveStatus` falls through to `txn.verificationStatus || "approved"`), which is
the worst possible mistake this surface could make: an order with no money attached shown as revenue.

The rules that make `cancelled` different, and that the code must show:
- It requires a reason, exactly as `rejected` does (Task 6's `p_decision in ('rejected','cancelled')`
  rule), so the drawer's ≥5-character gate covers it.
- It sets neither `refunded_at` nor `refund_reason`. So `status` (`"posted" | "voided"`) stays
  `"posted"` and the ledger must strike the amount for a different reason than it strikes a refund.
- Only a `recorded` order can be cancelled, and only a ticket sale has the concept. An expense
  transaction keeps its two decisions.

**Files:**
- Modify: `src/app/(member)/events/[eventId]/dashboard/actions.ts`
- Modify: `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx`
- Modify: `src/components/events/dashboard/dashboard-types.ts`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 6's decision whitelist; Task 13's widened `verify_event_ticket_sale` row.
- Produces: `VerifyTicketSaleParams.decision: "approved" | "rejected" | "cancelled"`; the
  `isNotCounted` helper both ticket surfaces share.

- [ ] **Step 1: Write the failing test**

Create `tests/ticket-cancel-decision.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DRAWER = readFileSync(
  "src/components/events/dashboard/voucher-inspection-drawer.tsx",
  "utf8",
);
const LEDGER = readFileSync(
  "src/components/events/dashboard/event-domain-ledger.tsx",
  "utf8",
);
const ACTIONS = readFileSync(
  "src/app/(member)/events/[eventId]/dashboard/actions.ts",
  "utf8",
);
const TYPES = readFileSync(
  "src/components/events/dashboard/dashboard-types.ts",
  "utf8",
);

test("an officer can cancel a guest order with a reason", () => {
  assert.match(ACTIONS, /"approved" \| "rejected" \| "cancelled"/);
  assert.match(ACTIONS, /params.decision === "rejected" \|\| params.decision === "cancelled"/);
  assert.match(DRAWER, /decision: "cancelled"/);
  assert.match(DRAWER, /handleCancel/);
});

test("cancel is offered for ticket sales only, and only before review", () => {
  assert.match(DRAWER, /isTicketSale && isPending/);
  assert.doesNotMatch(DRAWER, /verifyEventFinancialTransactionAction\(\{[^}]*decision: "cancelled"/);
});

test("the ledger counts a cancelled row as not counted", () => {
  assert.match(TYPES, /"recorded" \| "approved" \| "rejected" \| "cancelled"/);
  assert.match(LEDGER, /const isNotCounted = isRejected \|\| isCancelled/);
  assert.match(LEDGER, /statusFilter === "cancelled"/);
  assert.match(LEDGER, /cancelledCount/);
});

test("the dashboard no longer maps every refunded sale to voided by reflex", () => {
  const dashboard = readFileSync(
    "src/app/(member)/events/[eventId]/dashboard/page.tsx",
    "utf8",
  );
  assert.match(dashboard, /"cancelled"/);
  assert.doesNotMatch(
    dashboard,
    /verificationStatus: s\.refunded_at\n\s*\?\s*"rejected"/,
  );
});
```

Run: `npm test -- tests/ticket-cancel-decision.test.mjs`
Expected: FAIL on the first `assert.match(ACTIONS, …)`.

- [ ] **Step 2: The action**

`src/app/(member)/events/[eventId]/dashboard/actions.ts`:

```ts
export interface VerifyTicketSaleParams {
  eventId: string;
  saleId: string;
  decision: "approved" | "rejected" | "cancelled";
  reason?: string;
}
```

and the reason gate becomes:

```ts
  if (
    (params.decision === "rejected" || params.decision === "cancelled") &&
    (!params.reason || params.reason.trim().length < 5)
  ) {
    return {
      success: false,
      error:
        "A mandatory explanation of at least 5 characters is required to reject or cancel a ticket sale.",
    };
  }
```

`VerifyTransactionParams.decision` (`:6-10`) stays two-valued. The Step 1 assertion that
`verifyEventFinancialTransactionAction` is never called with `cancelled` is what keeps them apart.

- [ ] **Step 3: The drawer**

`src/components/events/dashboard/dashboard-types.ts:113` becomes
`verificationStatus?: "recorded" | "approved" | "rejected" | "cancelled";`.

In `voucher-inspection-drawer.tsx`, the status resolution at `:50-56` gains the fourth value and a
derived helper everything else uses:

```ts
  const status =
    transaction.status === "voided"
      ? "rejected"
      : transaction.verificationStatus || "approved";
  const isRejected = status === "rejected";
  const isCancelled = status === "cancelled";
  const isNotCounted = isRejected || isCancelled;
  const isApproved = status === "approved";
  const isPending = status === "recorded";
  const isExpense = transaction.type === "expense";
```

The amount block at `:214-225` then reads `isNotCounted` for the strikethrough and the empty sign, so a
cancelled order shows `₦25,000` struck through and neither `+` nor `-`. Its chip, next to the three at
`:278-292`:

```tsx
                      {isCancelled && (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FAF6F0] text-[#5C4638] border border-[#E5DDD3]">
                          Cancelled — no payment verified
                        </span>
                      )}
```

and the reason panel at `:297-304` widens to `{isNotCounted && transaction.rejectionReason && (…)` with
its `<strong>` label switching between "Officer Rejection Explanation:" and "Officer's cancellation
note:" on `isCancelled`. The footer's terminal sentence at `:462-466` gains the same split: cancelled
rows say "This order was cancelled and never counted as revenue."

`handleCancel` sits beside `handleReject` (`:99-134`), same shape, ticket-only:

```ts
  async function handleCancel() {
    if (!transaction || !isTicketSale) return;
    const trimmed = cancellationReason.trim();
    if (trimmed.length < 5) {
      setErrorMessage(
        "Please say why this order is being cancelled (at least 5 characters).",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await verifyEventTicketSaleAction({
      eventId,
      saleId: transaction.id,
      decision: "cancelled",
      reason: trimmed,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || "Cancellation failed.");
    } else {
      setShowCancelInput(false);
      setCancellationReason("");
      onClose();
    }
  }
```

It needs its own `const [showCancelInput, setShowCancelInput] = useState(false);` and
`const [cancellationReason, setCancellationReason] = useState("");` — **not** the reject pair. Two
reasons, one field: sharing `rejectionReason` would let a cancelled row be re-labelled a rejected one by
a stray click, and the two decisions mean different things to the ledger.

In the footer action group (`:490-522`), before the Reject button:

```tsx
                  {isTicketSale && isPending && !showCancelInput && (
                    <button
                      className="px-4 py-2 bg-white text-[#5C4638] border border-[#E5DDD3] rounded-xl text-xs font-bold hover:bg-[#FAF6F0] transition-colors cursor-pointer flex items-center gap-1.5 min-h-[44px]"
                      disabled={isSubmitting}
                      onClick={() => setShowCancelInput(true)}
                      type="button"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Cancel order</span>
                    </button>
                  )}
```

`Ban` from lucide joins the import at `:3-14`. The matching input panel copies `:415-456` with the
`showCancelInput`/`cancellationReason`/`handleCancel` names and the label "Why is this order being
cancelled? (e.g. Buyer said they did not transfer; order duplicated)" — its confirm button reads
"Cancel this order" and is `disabled={isSubmitting || cancellationReason.trim().length < 5}`.

- [ ] **Step 4: The ledger**

`event-domain-ledger.tsx`:

- `:44-46` → `"all" | "recorded" | "approved" | "rejected" | "cancelled"`.
- `resolveStatus` (`:57-58`) needs no change: it already returns `txn.verificationStatus` verbatim, and
  `"cancelled"` now flows through it. That is the reason `resolveStatus` — not `status` — is the thing to
  read, and it is why `page.tsx` must stop folding `cancelled` into `"voided"`.
- Add `const cancelledCount = transactions.filter((t) => resolveStatus(t) === "cancelled").length;`
  beside the other three counts (`:89-97`).
- Add a fifth pill immediately after Rejected (`:177-191`), built exactly like its siblings:

```tsx
<button
  className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer min-h-[38px] flex items-center gap-1.5 ${
    statusFilter === "cancelled"
      ? "bg-[#5C4638] text-white font-semibold"
      : "text-[#5C4638] hover:bg-[#FAF6F0]"
  }`}
  onClick={() => {
    setStatusFilter("cancelled");
    setCurrentPage(1);
  }}
  type="button">
  <span className="w-2 h-2 rounded-full bg-[#5C4638]" />
  Cancelled ({cancelledCount})
</button>
```

  `#5C4638` is the espresso the drawer already uses for a neutral stopped state; do not invent a
  new hue and do not add an opacity modifier to the dot — the other three dots are solid.
- In both row blocks — mobile at `:222-320`, desktop at `:416-530` — introduce
  `const isCancelled = status === "cancelled"; const isNotCounted = isRejected || isCancelled;` next to
  the existing `isRejected` (`:223`, `:417`), then use `isNotCounted` at the six styling sites
  (`:236`, `:264`, `:271`, `:431`, `:483`, `:490`) and keep `isRejected` at the six copy sites
  (`:274`, `:294`, `:315`, `:462`, `:493`, `:524`), adding an `isCancelled && (…)` sibling beside each
  that renders "Cancelled" instead of "Rejected". The empty-state sentence at `:217` and `:410`
  interpolates `statusFilter` directly, so `cancelled` needs no copy work there.

- [ ] **Step 5: The dashboard's own mapping**

`src/app/(member)/events/[eventId]/dashboard/page.tsx:731-736` becomes:

```ts
      status: s.refunded_at ? "voided" : "posted",
      voidReason: s.refund_reason || undefined,
      verificationStatus: s.refunded_at
        ? "rejected"
        : ((s.verification_status as
            | "recorded"
            | "approved"
            | "rejected"
            | "cancelled") ?? "approved"),
```

and the same widening at `:694-697` for transactions stays three-valued — an expense cannot be
cancelled — so give it its own cast and do not copy the union across. Then the derived arithmetic
Task 16 owns the rest of: `activeSales` at `:352` becomes

```ts
  const activeSales = allSales.filter(
    (s) => !s.refunded_at && s.verification_status === "approved",
  );
```

which is what makes `soldCount` (`:357`) and every tier figure below it approved-only, while `:227`'s
row fetch keeps returning `recorded` and `cancelled` rows for the review queue. `verification_status` is
already in that select (`:229`); nothing new to add there.

- [ ] **Step 6: Run, verify, commit**

```bash
npm test -- tests/ticket-cancel-decision.test.mjs
npm test
npm run lint
npm run build
```
Browser, on an event with a `recorded` online order: open the ledger's tickets tab → the Cancelled pill
reads 0 → open the order → **Cancel order** → submit with 4 characters → refused; submit with 5 → the row
re-renders struck through, the pill reads 1, the Approved pill did not move, and the revenue total did
not change. Then confirm the same order cannot be approved afterwards: the RPC raises, and the drawer
shows the mapped notice, not a Postgres sentence.

```bash
git add src/app/\(member\)/events/\[eventId\]/dashboard/actions.ts src/app/\(member\)/events/\[eventId\]/dashboard/page.tsx src/components/events/dashboard/voucher-inspection-drawer.tsx src/components/events/dashboard/event-domain-ledger.tsx src/components/events/dashboard/dashboard-types.ts tests/ticket-cancel-decision.test.mjs
git commit -m "feat(tickets): give officers the cancelled decision across the review queue"
```

---

## Task 16: Approved-only where JavaScript does the summing

Task 4 moved every SQL aggregate to approved-only. Three places compute the same numbers in JavaScript
and would now disagree with the database — a dashboard that says 12 sold and a report that says 8, on the
same screen. All three read `event_ticket_sales` directly with PostgREST filters:

- `src/app/(member)/events/page.tsx:83` — the events list's `ticketsSold` (`:138`, `:146`).
- `src/lib/home-dashboard.mjs:463` — `countTicketsSold`, the member home's ticket count.
- `src/app/api/events/[eventId]/finance-report/route.ts:171` — the report's sales **line items**, whose
  sums already come from `event_finance_report_summary` and are therefore already correct.

**Files:**
- Modify: `src/app/(member)/events/page.tsx`
- Modify: `src/lib/home-dashboard.mjs`
- Modify: `src/app/api/events/[eventId]/finance-report/route.ts`
- Modify: `tests/home-dashboard.test.mjs`

**Interfaces:**
- Consumes: the `verification_status` column (Task 3) and its per-column SELECT grant (Task 3, section
  5).
- Produces: nothing other tasks consume. Task 17's guard test reads these three files.

- [ ] **Step 1: Write the failing test**

Append to `tests/home-dashboard.test.mjs`, after the existing ticket-count test (`:338-364`), using that
test's own `createSupabase` helper:

```js
test("tickets sold on the home screen count approved orders only", async () => {
  const supabase = createSupabase({
    tables: {
      events: { data: [], error: null, count: 0 },
      event_ticket_sales: { data: [{ quantity: 3 }], error: null, count: 3 },
    },
  });

  await getHomeDashboardData(supabase, memberId, now);

  const salesQuery = supabase.calls.find(
    (call) => call.table === "event_ticket_sales",
  );
  assert.ok(salesQuery, "the home screen must query event_ticket_sales");
  assert.deepEqual(
    salesQuery.filters.find((filter) => filter.column === "verification_status"),
    { method: "eq", column: "verification_status", value: "approved" },
  );
});
```

Run: `npm test -- tests/home-dashboard.test.mjs`
Expected: FAIL — `filters.find(…)` is `undefined`, so `deepEqual` compares against
`{ method: "eq", … }` and throws. This asserts the filter reaches the query builder, which is the only
part of the behaviour a unit test can see without a database.

- [ ] **Step 2: The three edits**

`src/lib/home-dashboard.mjs:463-468`, inside `countTicketsSold`:

```js
    supabase
      .from("event_ticket_sales")
      .select("quantity", { count: "exact" })
      .is("refunded_at", null)
      .eq("verification_status", "approved")
      .order("id", { ascending: true })
      .range(0, TICKET_PAGE_SIZE - 1),
```

`src/app/(member)/events/page.tsx:83-87`:

```ts
          supabase
            .from("event_ticket_sales")
            .select("event_id,quantity")
            .in("event_id", eventIds)
            .is("refunded_at", null)
            .eq("verification_status", "approved")
            .limit(1000),
```

`src/app/api/events/[eventId]/finance-report/route.ts:171-178` — the row select gains the column, and the
line-item label stops calling an unreviewed order "Paid":

```ts
    .select(
      "id,tier_id,buyer_name,quantity,unit_price_ngn,amount_ngn,payment_method,created_at,refunded_at,verification_status",
    )
```

Then at `:271` the status text becomes a lookup, with `SaleRow` at `:43` gaining
`verification_status: "recorded" | "approved" | "rejected" | "cancelled"`:

```ts
      sale.refunded_at
        ? "Sold; refund recorded"
        : sale.verification_status === "approved"
          ? "Paid"
          : sale.verification_status === "recorded"
            ? "Paid — awaiting officer confirmation"
            : `${sale.verification_status} — not counted`;
```

Without that last change the report's own line items would foot to more than its summary total, which is
the visible symptom this task exists to prevent.

- [ ] **Step 3: Run, verify, commit**

```bash
npm test
npm run lint
npm run build
```
Expected: the new home-dashboard test passes and the previous 30-odd in that file still do — the
`eventOverview.ticketsSold` test at `:334` asserts `5` from fixture rows, and `createSupabase` ignores
filters when choosing fixture data, so it is unaffected. Confirm that is still true rather than assuming
it: if it fails, the stub is recording filters in a way the assertion depends on and the fixture, not the
production filter, is what must change.

```bash
git add src/lib/home-dashboard.mjs src/app/\(member\)/events/page.tsx src/app/api/events/\[eventId\]/finance-report/route.ts tests/home-dashboard.test.mjs
git commit -m "fix(tickets): count approved sales on the JS-summed surfaces"
```

---

## Task 17: Cross-surface guards, the two docs, and the full run

The approved-only rule now lives in nine SQL functions, four JavaScript sites and one close gate. That
is a rule with twelve homes and no single owner, so it needs a guard test that fails when a future
`create or replace` quietly drops one of the filters. `docs/data-access-matrix.md:325` currently states
"`anon` has no schema/table access or role RPC execution" — after Tasks 5 and 10 that sentence is false,
and a false security doc is worse than no security doc.

**Files:**
- Modify: `tests/till-ledger-surfaces.test.mjs` (created in Task 12)
- Modify: `docs/data-access-matrix.md`
- Modify: `docs/threat-model.md`
- Modify: `docs/requirements-traceability.md` (only if it lists RPC grants — check in Step 4)

**Interfaces:**
- Consumes: everything above it.
- Produces: nothing consumed.

- [ ] **Step 1: Write the guards**

Append to `tests/till-ledger-surfaces.test.mjs`:

```js
const MIGRATION = readFileSync(
  "supabase/migrations/20261105120000_public_ticket_till_and_ledger.sql",
  "utf8",
);
const DASHBOARD_PAGE = readFileSync(
  "src/app/(member)/events/[eventId]/dashboard/page.tsx",
  "utf8",
);

test("every money leg in the migration filters sales to approved", () => {
  const functions = [
    "private.event_cash_totals",
    "private.event_finance_summary",
    "private.event_finance_budget_summary",
    "private.event_ticket_tier_status",
    "private.event_finance_ticket_tier_summary",
    "private.event_finance_report_summary",
    "public.get_public_ticketed_events",
    "private.guard_event_ticket_sale_write",
    "private.guard_event_ticket_tier_write",
    "public.record_event_ticket_sale",
  ];
  for (const fn of functions) {
    const body = migrationFunctionBody(MIGRATION, fn);
    assert.ok(body, `${fn} is not redefined in the migration`);
    if (!/event_ticket_sales/.test(body)) continue;
    assert.match(
      body,
      /verification_status\s*=\s*'approved'/,
      `${fn} reads sales without the approved-only filter`,
    );
  }
});

test("the transaction legs keep the did-cash-move rule", () => {
  const body = migrationFunctionBody(MIGRATION, "private.event_cash_totals");
  assert.match(body, /from public\.event_financial_transactions/);
  assert.doesNotMatch(
    body,
    /event_financial_transactions[\s\S]{0,200}verification_status\s*=\s*'approved'/,
    "deviation 17: transactions are not approved-only",
  );
});

test("the JS surfaces that sum sales filter to approved", () => {
  const eventsPage = readFileSync("src/app/(member)/events/page.tsx", "utf8");
  assert.match(eventsPage, /\.eq\("verification_status", "approved"\)/);
  assert.match(DASHBOARD_PAGE, /s\.verification_status === "approved"/);
  const home = readFileSync("src/lib/home-dashboard.mjs", "utf8");
  assert.match(home, /\.eq\("verification_status", "approved"\)/);
});

test("anon gets exactly the two definer entry points and no table", () => {
  assert.match(MIGRATION, /grant execute on function public\.submit_ticket_order[^;]* to anon;/);
  assert.match(MIGRATION, /grant execute on function public\.lookup_ticket_order[^;]* to anon;/);
  assert.doesNotMatch(MIGRATION, /grant (select|insert|update|delete)[^;]* to anon;/);
  assert.doesNotMatch(MIGRATION, /grant usage on schema public to anon/);
});

test("buyer email and phone never reach a client-visible read", () => {
  assert.doesNotMatch(
    MIGRATION,
    /grant select \([^)]*buyer_email[^)]*\) on public\.event_ticket_sales to (authenticated|anon)/,
  );
  assert.doesNotMatch(
    MIGRATION,
    /grant select \([^)]*buyer_phone[^)]*\) on public\.event_ticket_sales to (authenticated|anon)/,
  );
});

/**
 * The last body is the one that ships: the migration redefines several functions twice (Task 4's
 * filter pass, then Task 5's or 6's body pass), so a guard must read the final definition, not the
 * first. Deliberately no `lastIndexOf` fallback to the first hit — a name that appears once is found
 * the same way either way, and a name that appears twice must not be resolved to the stale body.
 */
function migrationFunctionBody(source, signature) {
  const start = source.lastIndexOf(`create or replace function ${signature}`);
  if (start === -1) return null;
  const end = source.indexOf("$function$", start + 40);
  return end === -1 ? null : source.slice(start, end);
}
```

No assertion here checks that the officer dashboard mentions `public_reference`: the ledger renders
`txn.paymentRef`, which is a different column, so such a test would pass for an unrelated reason and
prove nothing. Task 15's own file already pins the dashboard's approved-only mapping.

Run: `npm test -- tests/till-ledger-surfaces.test.mjs`
Expected: every test in this file passes, including Task 12's four. If the `grant … to anon` guard fails,
do not weaken it — fix the migration.

- [ ] **Step 2: `docs/data-access-matrix.md`**

Rewrite the sentence at `:325` under "Explicitly denied operations" from

> - `anon` has no schema/table access or role RPC execution.

to

> - `anon` has no schema `USAGE`, no table privileges anywhere, and no role RPC execution. It holds
>   `EXECUTE` on exactly two `security definer` functions, `public.submit_ticket_order` and
>   `public.lookup_ticket_order`, which are the box office's only paths and which refuse any signed-in
>   actor with `42501`. Everything else about `anon` remains denied.

Then add a section before "Verification coverage" (`:345`), matching the existing headings' shape:

```markdown
## Public box office authorization — till model

| Operation | Who | Path | Enforced by |
| --- | --- | --- | --- |
| Read ticketed events + treasury account | anon and active members | `get_public_ticketed_events()` | definer function; approved-only `tier_sales` CTE |
| Submit a ticket order with a receipt | anon | `submit_ticket_order(...)` | definer function; event must be `scheduled`, ticketing on, tier active; throttles of 3 per email+event, 5 per email overall, 20 per event |
| Read one order's status | anon | `lookup_ticket_order(reference, email)` | both secrets must match; no rows otherwise, so it cannot confirm a reference exists |
| Record a sale at the box office | event lead / officer | `record_event_ticket_sale(...)` | existing `authenticated` grants, unchanged |
| Approve / reject / cancel a sale | admin, president, executive, event lead (not their own sale) | `verify_event_ticket_sale(...)` | row lock on `private.administration_guard`; reason mandatory for reject and cancel |
| See who bought a ticket | event lead / officer | `event_ticket_sales` row reads | `buyer_email` and `buyer_phone` are **not** in the per-column SELECT grant list, so no client read returns them |

`source = 'online'` rows carry `public_reference`, `buyer_email`, `buyer_phone` and
`verification_status = 'recorded'` until an officer decides. A `cancelled` decision sets neither
`refunded_at` nor `refund_reason` and is excluded from every revenue sum. Sales count toward revenue
and toward tier capacity only at `verification_status = 'approved'`; `event_financial_transactions`
keeps its did-cash-move rule and is filtered on `payment_status`, not on review status.
```

- [ ] **Step 3: `docs/threat-model.md`**

Under "Threat assessment and planned controls" (`:33`), extend the table with the anonymous-write
boundary the app did not have before this feature, in that file's own prose style (a heading per control,
"Controls implemented" bullets beneath). Four entries, each with the mitigation this plan actually ships:

1. **Anonymous order flooding.** 20 live orders per event and 5 per email overall, 3 per email+event,
   enforced inside `submit_ticket_order` against `verification_status = 'recorded'` rows — so approving
   or cancelling frees a slot and a blocked buyer who completes review cannot be locked out forever. A
   honeypot field and a minimum 5-second dwell time on the form stop unattended scripts before the
   database is consulted. No third-party captcha: `frame-src 'none'` in the CSP makes one impossible, and
   that is recorded as a deliberate constraint, not an oversight.
2. **Reference enumeration.** `CF-` + 8 characters drawn from a 32-symbol alphabet via `get_byte % 32`
   (unbiased because 256 is a multiple of 32) is ~1.1×10¹² combinations, and the lookup still requires
   the buyer's email. A guess yields nothing.
3. **Order-status scraping / PII leakage.** `lookup_ticket_order` matches reference **and** email and
   returns no rows on a mismatch — the same answer for "no such order" and "wrong email", so the endpoint
   cannot confirm that a reference exists. It returns no receipt, no phone number, and no other buyer's
   row. `buyer_email` and `buyer_phone` are excluded from the per-column SELECT grant list, so no
   `authenticated` client read can return them either.
4. **Receipt storage abuse.** Uploads are validated by `validateFinanceReceiptUpload` before anything is
   written (type, size, magic bytes), stored in R2 under a hash-derived key, and any object prepared for
   a commit that fails, deduplicates, or lands on a different row is deleted
   (`src/lib/receipt-entry.mjs:56-68`). Guests never see the stored file — the box office tells them the
   officer can, which is the honest sentence.

Then add the one residual risk the plan does **not** close, so the document stays credible: throttles are
counted per email, and a determined actor with many addresses can still submit many orders; there is no
IP-based limit and no rate limit at the edge. That is the accepted cost of running a till without a
payment provider, and it belongs in "Out of scope until architecture adds a relevant path" (`:336`).

- [ ] **Step 4: Full verification**

```bash
npm test
npm run lint
npm run build
npx supabase db reset --local
npx supabase test db
```
Expected: `npm test` prints no failures; biome clean; the build succeeds; the reset replays every
migration in order; pgTAP finishes with `# Result: PASS` and no `not ok` lines. `db reset --local` is the
**only** form ever typed here — a `supabase db push` without `--local` applies to the production
database, and nothing in this plan authorizes that.

Check `docs/requirements-traceability.md` for a table of function grants or anon privileges
(`grep -n "anon" docs/requirements-traceability.md`). If it asserts "no anon RPC", update that line to
match Step 2; if it does not mention `anon`, add nothing.

- [ ] **Step 5: Commit**

```bash
git add tests/till-ledger-surfaces.test.mjs docs/data-access-matrix.md docs/threat-model.md
git commit -m "docs(security): record the box office anon boundary and guard the approved-only rule"
```

---

## Task 18: Apply to production — operator-run, not agent-run

**Do not execute this task.** It is written for a human at the keyboard with the Supabase dashboard open
and the backup drill already in their hands. An agent running it would be pushing schema to the live
club database, which this plan does not authorize. The steps exist so the operator has the ordered list
and the three checks that must pass first.

**Files:** none. This task changes the hosted database, not the repository.

**Interfaces:**
- Consumes: every task above, merged to `main` and deployed.
- Produces: the till in production.

- [ ] **Step 1: Confirm the precondition the whole plan turns on**

The approved-only rule silently discards any sale whose `verification_status` is `'recorded'` — including
every row written before this migration, if any exist. Before anything else, the operator runs, against
the **linked production** database:

```bash
node_modules/.bin/supabase db query --linked --read-only \
  "select count(*) as recorded_sales,
          count(*) filter (where refunded_at is not null) as refunded_rows,
          count(*) filter (where verification_status is null) as null_status
   from public.event_ticket_sales"
```
Note: this CLI build takes the SQL positionally and does **not** accept `-c`. If `recorded_sales` is not
`0`, stop. Those rows are real money an officer never reviewed, and applying the migration would remove
them from every reported total without telling anyone. The resolution is a human one — either review them
to `approved`/`rejected` through the officer queue first, or apply the migration and reconcile afterwards
with the ledger export. Decide, record the decision in the release notes, then continue.

- [ ] **Step 2: Take a verified backup**

Follow `docs/backup-and-restore.md` end to end, including its verification step. The guards in that
document skip verification silently under some conditions; confirm the run actually verified rather than
assuming it did.

- [ ] **Step 3: Apply**

```bash
node_modules/.bin/supabase migration list --linked
node_modules/.bin/supabase db push --linked
```
Expected: `migration list` shows `20261105120000` as local-only before the push, and `db push` applies
exactly that one file. Anything more than one file means production has drifted from `main` — stop and
reconcile, because production has held repo-less migrations before (see `docs/production-migration-drift`,
and the markers added on 2026-11-03).

- [ ] **Step 4: Verify in production, in this order**

1. `npx supabase test db` cannot be run against production; instead re-run the three pgTAP assertions by
   hand through `db query --linked`: the four-value status CHECK, the online-shape CHECK, and one
   `select * from public.lookup_ticket_order('CF-NOPE', 'nobody@example.com')` returning zero rows.
2. Load `https://www.carpentersfamily.com.ng/tickets` and confirm the real account number and event list,
   then submit a live order for one ticket with a small receipt, approve it from the officer dashboard,
   and confirm the buyer emails arrive. This is the only end-to-end proof the outbox, R2 and the guard
   branch all work together — local verification cannot prove Resend or R2 credentials.
3. Cancel a second test order and confirm the revenue totals do not move and the tier's remaining count
   does not change.
4. Delete both test orders' rows? **No** — they are audit history. Leave them, and note in the release
   that `CF-…` references belonging to test orders exist.
5. Close an event that has any test order still `recorded` and confirm the gate refuses with the mapped
   notice.

- [ ] **Step 5: Record**

Add the applied migration and the step-1 count to `docs/production-migration-drift.md` (or the release
notes if that file has no such section), and set the advisory-lock/GUC session settings nothing here
touches. No code change, no commit.

---

## Done when

Every task above is merged, `npm test`, `npm run lint`, `npm run build`,
`npx supabase db reset --local && npx supabase test db` are green, and the browser checklist in Tasks 12,
14 and 15 has been walked on the production build at `http://127.0.0.1:3001`. Task 18 belongs to a human.

Plan B (`landing page`, the `/` → `/portal` move) and Plan C (`membership intake`, invitation-only
signup) are in
`docs/superpowers/plans/2026-11-05-landing-portal-and-membership-intake.md`, which depends on this one
only through `src/lib/notice-routing.mjs` and the root route's own files — no task here needs them.
