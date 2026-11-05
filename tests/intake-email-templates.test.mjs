import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("membership invite email contains canonical domain and token query param", () => {
  const content = fs.readFileSync("src/lib/email/templates/membership-invite.ts", "utf8");
  assert.match(content, /\/signup\?token=/);
  assert.match(content, /Carpenters Family/);
  assert.match(content, /valid for 7 days/i);
});

test("membership request confirmation informs applicant of executive review", () => {
  const content = fs.readFileSync("src/lib/email/templates/membership-request-received.ts", "utf8");
  assert.match(content, /Executive Committee/i);
  assert.match(content, /received/i);
});
