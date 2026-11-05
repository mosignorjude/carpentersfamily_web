import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("src/app/signup/page.tsx validates token before rendering form", () => {
  const content = fs.readFileSync("src/app/signup/page.tsx", "utf8");
  assert.match(content, /validate_invite_token/);
  assert.match(content, /Invitation Required/i);
  assert.match(content, /Request Membership/i);
  assert.match(content, /href="\/portal"/); // Link to sign in
});

test("signUpAction rejects submission without valid invite token", () => {
  const content = fs.readFileSync("src/app/actions.ts", "utf8");
  assert.match(content, /token[\s\S]*?validate_invite_token/);
  assert.match(content, /consume_invite_token/);
});
