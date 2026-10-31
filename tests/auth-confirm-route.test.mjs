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
  assert.deepEqual(parsed, {
    tokenHash: "abc123def456",
    verificationType: "magiclink",
  });
});

test("rejects missing, oversized, whitespace, or control-character hashes", () => {
  assert.equal(readConfirmRequest(new URLSearchParams("type=magiclink")), null);
  assert.equal(
    readConfirmRequest(
      new URLSearchParams(`token_hash=${"a".repeat(513)}&type=magiclink`),
    ),
    null,
  );
  assert.equal(
    readConfirmRequest(
      new URLSearchParams("token_hash=ab%09cd&type=magiclink"),
    ),
    null,
  );
  assert.equal(
    readConfirmRequest(new URLSearchParams("token_hash=short&type=magiclink")),
    null,
  );
});

test("only ever treats the hash as a magiclink verification", () => {
  for (const type of [
    "signup",
    "recovery",
    "email_change",
    "sms",
    "",
    "MagicLink",
  ]) {
    assert.equal(
      readConfirmRequest(
        new URLSearchParams(`token_hash=abc123def456&type=${type}`),
      ),
      null,
      `${type} must not be verifiable through this route`,
    );
  }
});

test("notices are fixed strings chosen by outcome", () => {
  assert.equal(confirmNotice(true), "email-confirmed");
  assert.equal(confirmNotice(false), "confirm-link-invalid");
});
