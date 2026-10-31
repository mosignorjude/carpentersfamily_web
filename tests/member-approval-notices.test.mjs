import assert from "node:assert/strict";
import test from "node:test";
import { rpcErrorNotice } from "../src/lib/rpc-error-notice.ts";
import { SYSTEM_NOTICES } from "../src/lib/system-notices.ts";

const lifecycleError = (message) => ({ code: "23514", message });

test("an unconfirmed applicant is reported as an email confirmation problem", () => {
  assert.equal(
    rpcErrorNotice(
      lifecycleError("The member must confirm their email before approval."),
    ),
    "email-confirmation-required",
  );
});

test("an unfinished profile is reported as a profile problem", () => {
  assert.equal(
    rpcErrorNotice(
      lifecycleError("The member must complete their profile before approval."),
    ),
    "profile-incomplete",
  );
});

test("the new notice codes carry actionable error copy", () => {
  const email = SYSTEM_NOTICES["email-confirmation-required"];
  assert.equal(email.type, "error");
  assert.match(email.message, /confirm/i);
  assert.match(email.message, /approval/i);

  const profile = SYSTEM_NOTICES["profile-incomplete"];
  assert.equal(profile.type, "error");
  assert.match(profile.message, /profile/i);
});

test("other lifecycle failures keep their existing notice codes", () => {
  assert.equal(
    rpcErrorNotice(lifecycleError("Only a pending member can be approved.")),
    "invalid-state",
  );
  assert.equal(
    rpcErrorNotice({ code: "42501", message: "Only an active Executive may." }),
    "denied",
  );
  assert.equal(
    rpcErrorNotice({ code: "P0001", message: "Something unrecognised." }),
    "operation-failed",
  );
});
