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
