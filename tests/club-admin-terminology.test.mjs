import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// "System administrator" is the staff population. A member holding the `admin`
// club role is the Club Admin, and member-facing copy that says otherwise
// tells the operator and the member about two different things.
const MEMBER_FACING = [
  "src/app/(member)/events/page.tsx",
  "src/app/(member)/dues/page.tsx",
  "src/components/dues/dues-page-view.tsx",
  "src/components/dues/pay-dues-modal.tsx",
  "src/lib/dues-governance.mjs",
];

for (const file of MEMBER_FACING) {
  test(`${file} never calls the Club Admin a system administrator`, () => {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /system administrator/i,
      "the `admin` club role is the Club Admin; staff are the system administrators",
    );
  });
}

test("the dues surfaces name the Club Admin in the exemption copy", () => {
  const view = readFileSync("src/components/dues/dues-page-view.tsx", "utf8");
  assert.match(view, /Club Admin Dues Exempt/);
  assert.match(view, /Club Admin Dues Exemption Policy/);

  const modal = readFileSync("src/components/dues/pay-dues-modal.tsx", "utf8");
  assert.match(modal, /Club Admin Exemption/);
  assert.match(
    modal,
    /While you hold the Club Admin role/,
    "the exemption follows the live assignment, so the copy must not imply it is permanent",
  );
});

test("the events header labels the two governance roles distinctly", () => {
  const events = readFileSync("src/app/(member)/events/page.tsx", "utf8");
  assert.match(events, /rolesSet\.has\("admin"\)\s*\?\s*"Club Admin"/);
  assert.doesNotMatch(
    events,
    /President \(Club Administrator\)/,
    '"Club Administrator" collides with the Club Admin role name',
  );
});
