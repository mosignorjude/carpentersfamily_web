import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const actions = fs.readFileSync("src/app/(staff)/admin/actions.ts", "utf8");
const email = fs.readFileSync("src/lib/email/notifications.ts", "utf8");
const keys = fs.readFileSync("src/lib/notifications/idempotency.ts", "utf8");

test("the resend action is staff-gated, audited, and mints a token hash", () => {
  const block = actions.match(
    /export async function staffResendConfirmationAction\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "staffResendConfirmationAction must be exported");
  assert.match(block[0], /await requireStaffActor\(\)/);
  assert.match(block[0], /uuidPattern\.test\(memberId\)/);
  assert.match(
    block[0],
    /supabase\.rpc\(\s*"staff_resend_member_email_confirmation",/,
  );
  assert.match(block[0], /admin\.auth\.admin\.generateLink\(\{/);
  assert.match(block[0], /queueEmailConfirmationResend\(\{/);
  assert.match(
    block[0],
    /redirect\("\/admin\/members\?notice=confirmation-resent"\)/,
  );
});

test("the resend CTA is a relative path into the confirm route", () => {
  const block = email.match(
    /export async function queueEmailConfirmationResend\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "queueEmailConfirmationResend must be exported");
  assert.match(block[0], /triggerType: "email_confirmation_resend"/);
  assert.match(
    block[0],
    /ctaPath: `\/auth\/confirm\?token_hash=\$\{encodeURIComponent\(/,
    "the CTA must be a relative path into the confirmation route",
  );
  assert.match(block[0], /&type=magiclink`/);
  assert.match(block[0], /idempotencyKey: emailConfirmationResendKey\(/);
});

test("resend keys are unique per minute so a later resend is not deduped", () => {
  assert.match(
    keys,
    /export function emailConfirmationResendKey\([\s\S]*?userKey\(\s*"email_confirmation_resend"/,
  );
});

test("the three new database messages map to specific notices", () => {
  const rules = fs.readFileSync("src/lib/rpc-error-notice.ts", "utf8");
  assert.match(
    rules,
    /\balready confirmed their email\b[\s\S]*"already-confirmed"/,
  );
  assert.match(rules, /\bless than 15 minutes ago\b[\s\S]*"resend-cooldown"/);
  assert.match(rules, /\bonly a pending applicant\b[\s\S]*"not-pending"/);
  const staff = fs.readFileSync("src/lib/staff-notices.ts", "utf8");
  for (const code of [
    "already-confirmed",
    "not-pending",
    "resend-cooldown",
    "confirmation-send-failed",
  ]) {
    assert.ok(
      staff.includes(`"${code}"`),
      `${code} must be a shared staff notice`,
    );
  }
});

test("the audit action has a human label", () => {
  const presentation = fs.readFileSync(
    "src/lib/staff-presentation.mjs",
    "utf8",
  );
  assert.match(
    presentation,
    /member_email_confirmation_resent: "Confirmation email resent"/,
  );
});
