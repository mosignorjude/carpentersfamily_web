import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getActiveMemberNavigationItems } from "../src/lib/app-navigation.mjs";

const officerMembersPage = new URL(
  "../src/app/(member)/officers/members/page.tsx",
  import.meta.url,
);
const legacyAdminMembersPage = new URL(
  "../src/app/(member)/admin/members/page.tsx",
  import.meta.url,
);
const staffAdminMembersPage = new URL(
  "../src/app/(staff)/admin/members/page.tsx",
  import.meta.url,
);

test("officer navigation points at /officers/members", () => {
  const items = getActiveMemberNavigationItems("active", ["executive"]);
  assert.ok(items.some((item) => item.href === "/officers/members"));
  assert.ok(!items.some((item) => item.href === "/admin/members"));
});

test("staff receive no member navigation", () => {
  assert.equal(getActiveMemberNavigationItems("staff", []), null);
});

test("president is formatted as PRESIDENT", async () => {
  const { formatPrimaryRole } = await import("../src/lib/user-profile.ts");
  assert.equal(formatPrimaryRole(["president"]), "PRESIDENT");
});

test("officer member administration lives under /officers", () => {
  assert.ok(
    existsSync(officerMembersPage),
    "src/app/(member)/officers/members/page.tsx must exist",
  );
});

test("the legacy /admin/members path cannot serve the officer page", () => {
  if (!existsSync(legacyAdminMembersPage)) return;

  const source = readFileSync(legacyAdminMembersPage, "utf8");
  assert.match(
    source,
    /redirect\("\/officers\/members"\)/,
    "the legacy path may only redirect to /officers/members",
  );
});

test("the staff member directory lives at /admin/members", () => {
  assert.ok(
    existsSync(staffAdminMembersPage),
    "src/app/(staff)/admin/members/page.tsx must exist",
  );
});

test("audit actions map to governance domains", async () => {
  const { matchesAuditDomain } = await import("../src/lib/audit-domains.mjs");

  assert.equal(matchesAuditDomain("member_approved", "membership"), true);
  assert.equal(matchesAuditDomain("club_role_granted", "roles"), true);
  assert.equal(matchesAuditDomain("staff_disabled", "staff"), true);
  assert.equal(
    matchesAuditDomain("legacy_admin_converted_to_staff", "staff"),
    true,
  );
  assert.equal(
    matchesAuditDomain("club_payment_settings_updated", "settings"),
    true,
  );
  assert.equal(matchesAuditDomain("member_approved", "roles"), false);
  assert.equal(matchesAuditDomain("anything_at_all", "all"), true);
});
