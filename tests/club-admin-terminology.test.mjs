import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// "System administrator" is the staff population. A member holding the `admin`
// club role is the Club Admin, and member-facing copy that says otherwise
// tells the operator and the member about two different things. Scoped by tree
// rather than by file list, so a member-facing component added later cannot
// drift back into the old wording.
const MEMBER_FACING_TREES = [
  "src/app/(member)",
  "src/components/dues",
  "src/components/events",
];

// Outside those trees, but member-facing and carrying the exemption rules.
const MEMBER_FACING_FILES = ["src/lib/dues-governance.mjs"];

const sourceFiles = (dir, found = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) found.push(path);
  }
  return found;
};

const memberFacingSources = [
  ...MEMBER_FACING_TREES.flatMap((dir) => sourceFiles(dir)),
  ...MEMBER_FACING_FILES,
];

for (const file of memberFacingSources) {
  test(`${file} never calls the Club Admin a system administrator`, () => {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /system administrator/i,
      "the `admin` club role is the Club Admin; staff are the system administrators",
    );
  });
}

test("the officer-only money copy names the role that actually holds the gate", () => {
  // Both surfaces describe `admin || president`, which is the Club Admin and
  // the President — not staff, who cannot write club money from /admin.
  assert.match(
    readFileSync("src/components/dues/dues-rate-schedule-card.tsx", "utf8"),
    /President or a Club Admin/,
  );
  assert.match(
    readFileSync("src/components/events/event-lifecycle-modal.tsx", "utf8"),
    /President or a Club Admin/,
  );
});

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
