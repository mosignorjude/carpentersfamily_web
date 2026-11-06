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

const MIGRATION = readFileSync(
  "supabase/migrations/20261106120000_public_ticket_till_and_ledger.sql",
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
  const open = source.indexOf("$function$", start);
  if (open === -1) return null;
  const end = source.indexOf("$function$", open + 10);
  return end === -1 ? null : source.slice(start, end);
}

