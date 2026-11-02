import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rendersNoticeInline } from "../src/lib/notice-routing.mjs";

test("staff panel notices survive the address-bar cleanup", () => {
  for (const pathname of [
    "/admin",
    "/admin/members",
    "/admin/governance",
    "/admin/staff",
    "/admin/audit",
  ]) {
    assert.equal(
      rendersNoticeInline(pathname, "club-admin-granted"),
      true,
      `${pathname} renders its own banner`,
    );
  }
});

test("member routes still clear the notice once the toast has fired", () => {
  for (const pathname of [
    "/dues",
    "/officers/members",
    "/events/4b329eb6-3225-437a-a897-7bc8537521db",
  ]) {
    assert.equal(
      rendersNoticeInline(pathname, "dues-recorded"),
      false,
      `${pathname} relies on the floating toast`,
    );
  }
});

test("auth and root routes keep their documented inline behaviour", () => {
  assert.equal(rendersNoticeInline("/signup", "invalid-request"), true);
  assert.equal(rendersNoticeInline("/forgot-password", "sent"), true);
  assert.equal(rendersNoticeInline("/reset-password", "password-updated"), true);
  assert.equal(rendersNoticeInline("/", "sign-in"), true);
  assert.equal(rendersNoticeInline("/", "unknown-code"), false);
  assert.equal(rendersNoticeInline("/administrator-tools", "sign-in"), false);
});

test("the flash listener defers to the shared routing predicate", () => {
  const listener = readFileSync(
    "src/components/ui/global-flash-listener.tsx",
    "utf8",
  );
  assert.match(listener, /rendersNoticeInline\(pathname, noticeCode\)/);
  assert.doesNotMatch(
    listener,
    /const INLINE_NOTICE_ROUTES/,
    "the route list lives in notice-routing.mjs",
  );
});
