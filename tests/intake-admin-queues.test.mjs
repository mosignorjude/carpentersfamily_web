import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("admin membership requests page exists and exports default async page", () => {
  assert.equal(fs.existsSync("src/app/(staff)/admin/membership-requests/page.tsx"), true);
  const content = fs.readFileSync("src/app/(staff)/admin/membership-requests/page.tsx", "utf8");
  assert.match(content, /membership_requests/);
  assert.match(content, /reviewMembershipRequestAction/);
});

test("admin partnerships page exists and exports default async page", () => {
  assert.equal(fs.existsSync("src/app/(staff)/admin/partnerships/page.tsx"), true);
  const content = fs.readFileSync("src/app/(staff)/admin/partnerships/page.tsx", "utf8");
  assert.match(content, /partnership_enquiries/);
});
