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
