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
  assert.deepEqual(
    hexes,
    [],
    `inline hex literals remain: ${hexes.join(", ")}`,
  );
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
