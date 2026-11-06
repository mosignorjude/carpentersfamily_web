import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HONEYPOT_FIELD,
  isElapsedEnough,
  isHoneypotClean,
  MIN_SUBMIT_SECONDS,
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
  assert.equal(parsed.values.quantity, "2");
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
    assert.equal(
      parseTicketOrderForm(form(bad), { now: NOW }).ok,
      false,
      JSON.stringify(bad),
    );
  }
});

test("the buyer name follows the table's own rules", () => {
  assert.equal(
    parseTicketOrderForm(form({ buyer_name: "   " }), { now: NOW }).ok,
    false,
  );
  assert.equal(
    parseTicketOrderForm(form({ buyer_name: `Chidi\u0007Obi` }), { now: NOW })
      .ok,
    false,
    "a control character is refused, as event_ticket_sales_buyer_check does",
  );
  assert.equal(
    parseTicketOrderForm(form({ buyer_name: "x".repeat(161) }), { now: NOW })
      .ok,
    false,
  );
});

test("the honeypot refuses a bot that filled it in", () => {
  assert.equal(isHoneypotClean(form()), true);
  assert.equal(
    isHoneypotClean(form({ [HONEYPOT_FIELD]: "http://spam.example" })),
    false,
  );
  assert.equal(
    isHoneypotClean(new FormData()),
    true,
    "a missing field is not a filled field",
  );
});

test("a submit faster than a human refuses, and a missing stamp refuses", () => {
  assert.equal(MIN_SUBMIT_SECONDS, 5);
  assert.equal(
    isElapsedEnough(
      "2026-11-05T10:00:00.000Z",
      Date.parse("2026-11-05T10:00:02.000Z"),
    ),
    false,
  );
  assert.equal(
    isElapsedEnough(
      "2026-11-05T10:00:00.000Z",
      Date.parse("2026-11-05T10:00:05.000Z"),
    ),
    true,
  );
  assert.equal(isElapsedEnough("nonsense", NOW), false);
  assert.equal(isElapsedEnough(null, NOW), false);
  assert.equal(
    isElapsedEnough(
      "2026-11-05T10:00:00.000Z",
      Date.parse("2025-01-01T00:00:00.000Z"),
    ),
    false,
  );
});

test("parsed values are plain strings, never a File or a FormData entry", () => {
  const parsed = parseTicketOrderForm(form({ buyer_name: "  Ada Eze  " }), {
    now: NOW,
  });
  assert.equal(
    parsed.values.buyerName,
    "Ada Eze",
    "the table CHECK demands a trimmed name",
  );
  for (const value of Object.values(parsed.values))
    assert.equal(typeof value, "string");
});
