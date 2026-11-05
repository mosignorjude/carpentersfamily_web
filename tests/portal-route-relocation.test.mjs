import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isInlineNoticePath,
  handlesNoticeOnPage,
} from "../src/lib/notice-routing.mjs";

test("notice routing recognizes /portal as an inline notice destination", () => {
  assert.equal(isInlineNoticePath("/portal"), true);
  assert.equal(isInlineNoticePath("/portal/"), true);
  assert.equal(handlesNoticeOnPage("/portal", "credentials"), true);
  assert.equal(handlesNoticeOnPage("/portal", "sign-in"), true);
  assert.equal(handlesNoticeOnPage("/portal", "profile-locked"), true);
});

test("src/app/portal/page.tsx exists and exports default async PortalPage component", () => {
  assert.equal(fs.existsSync("src/app/portal/page.tsx"), true);
  const content = fs.readFileSync("src/app/portal/page.tsx", "utf8");
  assert.match(content, /export\s+default\s+async\s+function\s+PortalPage/);
  assert.match(content, /searchParams:\s*Promise<\{/);
  assert.match(content, /AuthPageLayout/);
  assert.match(content, /HomeDashboardView/);
});
