import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panel = fs.readFileSync("src/lib/staff-panel.server.ts", "utf8");
const actions = fs.readFileSync("src/app/(staff)/admin/actions.ts", "utf8");
const errorNotices = fs.readFileSync("src/lib/rpc-error-notice.ts", "utf8");

test("the staff panel can read the incumbent club administrator", () => {
  assert.match(
    panel,
    /role: "president" \| "executive" \| "admin"/,
    "loadHolders must accept the admin role",
  );
  const loader = panel.match(
    /export async function loadClubAdmin\([\s\S]*?\n}\n/,
  );
  assert.ok(loader, "loadClubAdmin must be exported");
  assert.match(loader[0], /loadHolders\(supabase, "admin"\)/);
  assert.match(loader[0], /Promise<OfficerHolder \| null>/);
  assert.match(loader[0], /return holders\[0\] \?\? null;/);
});

test("the appointment action is staff-gated and calls the grant RPC", () => {
  const block = actions.match(
    /export async function staffGrantClubAdminAction\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "staffGrantClubAdminAction must be exported");
  assert.match(block[0], /await requireStaffActor\(\)/);
  assert.match(block[0], /uuidPattern\.test\(memberId\)/);
  assert.match(block[0], /supabase\.rpc\(\s*"staff_grant_admin",/);
  assert.match(
    block[0],
    /redirect\("\/admin\/governance\?notice=club-admin-granted"\)/,
  );
});

test("the revocation action is staff-gated and calls the revoke RPC", () => {
  const block = actions.match(
    /export async function staffRevokeClubAdminAction\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "staffRevokeClubAdminAction must be exported");
  assert.match(block[0], /await requireStaffActor\(\)/);
  assert.match(block[0], /supabase\.rpc\(\s*"staff_revoke_admin",/);
  assert.match(
    block[0],
    /redirect\("\/admin\/governance\?notice=club-admin-revoked"\)/,
  );
});

test("deactivating a serving club administrator is explained, not dumped", () => {
  assert.match(
    errorNotices,
    /primary Admin must remain active/i,
    "the trigger message maps to a notice code",
  );
});
