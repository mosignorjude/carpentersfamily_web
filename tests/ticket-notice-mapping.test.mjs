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
  ["This event is no longer accepting ticket orders.", "box-office-closed"],
  [
    "The box office has reached its limit of pending orders for this event.",
    "box-office-at-capacity",
  ],
  ["Online ticket orders cannot be recorded by a signed-in member.", "denied"],
  ["Ticket tier capacity has been reached.", "budget-exceeded"],
];

for (const [message, expected] of RAISES) {
  test(`maps ${JSON.stringify(message)} to ${JSON.stringify(expected)}`, () => {
    assert.equal(rpcErrorNotice({ message }), expected);
  });
}

test("the new codes never fall through to the generic failure", () => {
  for (const [message] of RAISES.slice(0, 5)) {
    assert.notEqual(rpcErrorNotice({ message }), "operation-failed");
  }
});

test("capacity wording does not get swallowed by budget-exceeded", () => {
  // `budget-exceeded` matches "exceeds the allowed limit"; the near-miss text must not.
  assert.equal(
    rpcErrorNotice({
      message: "The box office has reached its limit of pending orders.",
    }),
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
  for (const notice of [
    "receipt-required",
    "receipt-upload-failed",
    "receipt-storage-unavailable",
  ]) {
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
