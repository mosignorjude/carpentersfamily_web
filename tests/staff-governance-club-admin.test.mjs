import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panel = fs.readFileSync("src/lib/staff-panel.server.ts", "utf8");

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
