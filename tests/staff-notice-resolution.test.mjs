import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveNoticeCopy } from "../src/lib/staff-notice-resolution.mjs";

const registry = new Map([
  ["denied", { message: "You are not allowed to do that.", type: "error" }],
  ["budget-exceeded", { message: "That exceeds the budget.", type: "error" }],
  ["saved", { message: "Saved.", type: "success" }],
]);
const getNotice = (code) => registry.get(code);

test("the page's own copy wins over the shared registry", () => {
  const resolved = resolveNoticeCopy(
    "club-admin-granted",
    { "club-admin-granted": { message: "Club Admin appointed.", isError: false } },
    getNotice,
  );
  assert.deepEqual(resolved, { message: "Club Admin appointed.", isError: false });
});

test("a code the page does not declare still resolves through the registry", () => {
  const resolved = resolveNoticeCopy("budget-exceeded", {}, getNotice);
  assert.deepEqual(resolved, {
    message: "That exceeds the budget.",
    isError: true,
  });
});

test("a successful registry notice is not rendered as an error", () => {
  assert.equal(resolveNoticeCopy("saved", {}, getNotice)?.isError, false);
});

test("an unknown code resolves to nothing rather than invented copy", () => {
  assert.equal(resolveNoticeCopy("not-a-real-code", {}, getNotice), undefined);
  assert.equal(resolveNoticeCopy(undefined, {}, getNotice), undefined);
});

test("the staff page wrapper injects the real registry, not a hand-maintained list", () => {
  const source = readFileSync("src/lib/staff-notices.ts", "utf8");
  assert.match(source, /resolveNoticeCopy\(\s*code,\s*pageNotices,\s*getSystemNotice\s*\)/);
  assert.doesNotMatch(
    source,
    /const sharedCodes/,
    "an allowlist duplicated from SYSTEM_NOTICES goes stale and silently hides notices",
  );
});
