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
  // Staff banners resolve any unrecognised code through SYSTEM_NOTICES, so the
  // registry entry is what makes these failure classes visible on /admin/staff.
  const registry = fs.readFileSync("src/lib/system-notices.ts", "utf8");
  for (const code of [
    "already-confirmed",
    "not-pending",
    "resend-cooldown",
    "confirmation-send-failed",
  ]) {
    assert.ok(
      new RegExp(`^\\s{2}"?${code}"?: \\{$`, "m").test(registry),
      `${code} must have system notice copy`,
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

test("the roster offers resend only for a known unconfirmed email", () => {
  const table = fs.readFileSync(
    "src/components/staff/staff-member-table.tsx",
    "utf8",
  );
  assert.match(table, /staffResendConfirmationAction/);
  assert.match(
    table,
    /member\.profileState === "incomplete_email"/,
    "resend must be gated on a confirmed-negative email state",
  );
  assert.doesNotMatch(
    table.slice(table.search(/staffResendConfirmationAction/)),
    /officers/,
    "the officer roster must not reuse the staff resend action",
  );
});

test("verification unknown never offers a resend", () => {
  const table = fs.readFileSync(
    "src/components/staff/staff-member-table.tsx",
    "utf8",
  );
  const resendBlock = table.match(
    /profileState === "incomplete_email"[\s\S]*?"Resend confirmation"/,
  );
  assert.ok(resendBlock, "resend dialog must exist");
  assert.doesNotMatch(resendBlock[0], /verification_unknown/);
});

test("the members page reports a successful resend", () => {
  const page = fs.readFileSync(
    "src/app/(staff)/admin/members/page.tsx",
    "utf8",
  );
  assert.match(page, /"confirmation-resent": \{/);
});

test("a successful resend reports through the shared toast allowlist", () => {
  const system = fs.readFileSync("src/lib/system-notices.ts", "utf8");
  const entry = system.match(/"confirmation-resent": \{[\s\S]*?\n {2}\},/);
  assert.ok(
    entry,
    "confirmation-resent must be a system notice or the toast stays silent",
  );
  assert.match(entry[0], /type: "success"/);
});
