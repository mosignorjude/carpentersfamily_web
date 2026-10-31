import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getMemberProfileReadiness } from "../src/lib/member-administration-presentation.mjs";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const officerPage = read("../src/app/(member)/officers/members/page.tsx");
const staffPage = read("../src/app/(staff)/admin/members/page.tsx");
const staffTable = read("../src/components/staff/staff-member-table.tsx");

test("a complete profile with a confirmed email is approvable", () => {
  const readiness = getMemberProfileReadiness({
    profileComplete: true,
    emailConfirmed: true,
    lookupFailed: false,
  });
  assert.equal(readiness.profileState, "complete");
  assert.match(readiness.profileStateDescription, /verified/i);
});

test("an unconfirmed email withholds eligibility and names the blocker", () => {
  const readiness = getMemberProfileReadiness({
    profileComplete: true,
    emailConfirmed: false,
    lookupFailed: false,
  });
  assert.equal(readiness.profileState, "incomplete_email");
  assert.match(readiness.profileStateDescription, /confirm/i);
});

test("an unfinished profile is reported before the email requirement", () => {
  assert.equal(
    getMemberProfileReadiness({
      profileComplete: false,
      emailConfirmed: false,
      lookupFailed: false,
    }).profileState,
    "incomplete_bio",
  );
  assert.equal(
    getMemberProfileReadiness({
      profileComplete: false,
      emailConfirmed: true,
      lookupFailed: false,
    }).profileState,
    "incomplete_bio",
  );
});

test("a failed confirmation lookup fails closed", () => {
  const readiness = getMemberProfileReadiness({
    profileComplete: true,
    emailConfirmed: false,
    lookupFailed: true,
  });
  assert.equal(readiness.profileState, "verification_unknown");
  assert.match(readiness.profileStateDescription, /unavailable|refresh/i);
});

test("both rosters read the confirmation state instead of assuming it", () => {
  for (const source of [officerPage, staffPage]) {
    assert.match(
      source,
      /loadEmailConfirmationState/,
      "the roster must read the confirmation RPC",
    );
    assert.match(source, /getMemberProfileReadiness/);
    assert.doesNotMatch(
      source,
      /Email verified and profile complete/,
      "the verification claim belongs to the readiness helper only",
    );
  }
});

test("the staff directory only offers Approve to eligible applicants", () => {
  assert.match(staffTable, /member\.profileState === "complete"/);
  assert.match(staffTable, /member\.profileStateDescription/);
});
