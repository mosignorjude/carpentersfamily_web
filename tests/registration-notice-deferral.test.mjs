import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/lib/email/notifications.ts", "utf8");

test("sign-up no longer emails the applicant before email confirmation", () => {
  const signUpBlock = source.match(
    /export async function notifyNewMemberSignUp\([\s\S]*?\n}\n/,
  );
  assert.ok(signUpBlock, "notifyNewMemberSignUp must exist");
  assert.doesNotMatch(
    signUpBlock[0],
    /triggerType: "signup_receipt"/,
    "the applicant receipt must not be queued at sign-up",
  );
  assert.match(signUpBlock[0], /triggerType: "member_signup_alert"/);
});

test("the deferred notice is queued only while the applicant is pending", () => {
  const block = source.match(
    /export async function notifyRegistrationReceivedIfPending\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "notifyRegistrationReceivedIfPending must be exported");
  assert.match(block[0], /\.select\("status, username"\)/);
  assert.match(block[0], /profile\?\.status !== "pending"/);
  assert.match(block[0], /idempotencyKey: signupReceiptKey\(/);
  assert.match(block[0], /triggerType: "signup_receipt"/);
});

test("the deferred copy confirms the email first and then states pending approval", () => {
  const block = source.match(
    /export async function notifyRegistrationReceivedIfPending\([\s\S]*?\n}\n/,
  );
  assert.ok(block);
  assert.match(block[0], /await queueSingle\(\{/);
  const copy = block[0];
  assert.doesNotMatch(copy, /Once you confirm your email address/);
  assert.match(copy, /Pending Approval/);
});

test("the auth callback queues the pending notice before the welcome check", () => {
  const route = fs.readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(
    route,
    /import \{\s*notifyRegistrationReceivedIfPending,/,
    "the callback must import the deferred notice",
  );
  const branch = route.match(
    /if \(data\.user\?\.email_confirmed_at\) \{([\s\S]*?)\n {4}\}/,
  );
  assert.ok(branch, "the confirmed-email branch must exist");
  const deferred = branch[1].search(/notifyRegistrationReceivedIfPending\(/);
  const welcome = branch[1].search(/notifyWelcomeIfActive\(/);
  assert.notEqual(deferred, -1, "the branch must queue the pending notice");
  assert.ok(deferred < welcome, "the pending notice must be queued first");
});
