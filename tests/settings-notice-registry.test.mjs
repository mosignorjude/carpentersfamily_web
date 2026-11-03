import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handlesNoticeOnPage } from "../src/lib/notice-routing.mjs";
import { getSystemNotice } from "../src/lib/system-notices.ts";

// /settings renders no notice of its own, so the toast is the only channel for
// anything that redirects there with ?notice= — and a toast requires a
// SYSTEM_NOTICES entry, which is what keeps crafted query text from rendering.
const SETTINGS_ONLY_CODES = [
  "password-updated",
  "invalid-profile",
  "profile-update-failed",
];

// The sign-in screen keeps a private copy table. Where a code is shared with
// /settings, the registry must say exactly what that screen says.
function signInTableCopy(code) {
  const source = readFileSync("src/app/page.tsx", "utf8");
  const key = `"${code}"`;
  const start = source.indexOf(key);
  if (start === -1) return undefined;
  let cursor = source.indexOf(":", start + key.length) + 1;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  if (source[cursor] !== '"') return undefined;
  cursor += 1;
  let value = "";
  while (cursor < source.length) {
    const ch = source[cursor];
    if (ch === "\\") {
      value += source[cursor + 1];
      cursor += 2;
      continue;
    }
    if (ch === '"') return value;
    value += ch;
    cursor += 1;
  }
  return undefined;
}

for (const code of SETTINGS_ONLY_CODES) {
  test(`/settings?notice=${code} has registry copy to toast`, () => {
    const definition = getSystemNotice(code);
    assert.ok(definition, `"${code}" must exist in SYSTEM_NOTICES`);
    assert.ok(definition.message.length > 0);
  });

  test(`${code} keeps the wording the sign-in screen already uses`, () => {
    const fromSignIn = signInTableCopy(code);
    assert.ok(fromSignIn, `${code} should still be in the sign-in table`);
    assert.equal(getSystemNotice(code)?.message, fromSignIn);
  });

  test(`${code} is not claimed by a page, so the listener must toast it`, () => {
    assert.equal(handlesNoticeOnPage("/settings", code), false);
  });
}

test("a successful password change is a success card, profile failures are errors", () => {
  assert.equal(getSystemNotice("password-updated")?.type, "success");
  assert.equal(getSystemNotice("invalid-profile")?.type, "error");
  assert.equal(getSystemNotice("profile-update-failed")?.type, "error");
});
