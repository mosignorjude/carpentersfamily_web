import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  STAFF_NOTICE_TOAST_DURATION_MS,
  noticeDispatchState,
  staffToastPayload,
} from "../src/lib/staff-notice-toast.mjs";

test("a staff page notice becomes a toast with the same wording", () => {
  const payload = staffToastPayload({
    message:
      "Club Admin appointed. The change is recorded in the audit history and the president has been notified.",
    isError: false,
  });
  assert.equal(
    payload?.message,
    "Club Admin appointed. The change is recorded in the audit history and the president has been notified.",
  );
});

test("failure copy toasts as an error and success copy as success", () => {
  assert.equal(
    staffToastPayload({ message: "Invite failed.", isError: true })?.type,
    "error",
  );
  assert.equal(
    staffToastPayload({ message: "President appointed.", isError: false })
      ?.type,
    "success",
  );
});

test("an absent notice produces no toast", () => {
  assert.equal(staffToastPayload(undefined), null);
});

test("staff notices stay on screen longer than the default toast", () => {
  assert.ok(
    STAFF_NOTICE_TOAST_DURATION_MS > 7000,
    "the flash card default is 7s, and a staff notice is the only record of what the button did",
  );
  assert.equal(
    staffToastPayload({ message: "Saved.", isError: false })?.durationMs,
    STAFF_NOTICE_TOAST_DURATION_MS,
  );
});

test("staff pages toast their notice instead of painting a banner", () => {
  for (const page of ["governance", "members", "staff"]) {
    const source = readFileSync(`src/app/(staff)/admin/${page}/page.tsx`, "utf8");
    assert.match(
      source,
      /<StaffNoticeToast notice=\{notice\} \/>/,
      `/admin/${page} must hand its notice to the toast`,
    );
    assert.doesNotMatch(source, /<StaffNotice /);
  }
  assert.equal(
    existsSync("src/components/staff/staff-notice.tsx"),
    false,
    "the dismissable banner is gone; leaving it would keep a second, refresh-persistent channel",
  );
});

test("the staff toast clears the query so a refresh shows nothing", () => {
  const toast = readFileSync(
    "src/components/staff/staff-notice-toast.tsx",
    "utf8",
  );
  assert.match(toast, /dispatchFlashCard\(payload\)/);
  assert.match(toast, /params\.delete\("notice"\)/);
  assert.match(toast, /router\.replace/);
  assert.doesNotMatch(
    toast,
    /history\.replaceState/,
    "clearing the URL outside the router leaves App Router state pointing at a stale notice",
  );
});

test("a notice code nobody has announced yet gets announced", () => {
  assert.deepEqual(noticeDispatchState("club-admin-granted", null), {
    announce: true,
    handled: "club-admin-granted",
  });
});

test("the same code still sitting in the URL is not announced twice", () => {
  // While router.replace is in flight React re-renders with a new searchParams
  // object and the identical code. One arrival of a code is one toast.
  assert.deepEqual(
    noticeDispatchState("club-admin-granted", "club-admin-granted"),
    { announce: false, handled: "club-admin-granted" },
  );
});

test("a cleared URL forgets the code it announced", () => {
  assert.deepEqual(noticeDispatchState(null, "club-admin-granted"), {
    announce: false,
    handled: null,
  });
});

test("appointing twice in one page mount toasts twice", () => {
  let handled = null;
  const first = noticeDispatchState("club-admin-granted", handled);
  handled = first.handled;
  // The toast strips ?notice= before the operator can press the button again.
  handled = noticeDispatchState(null, handled).handled;
  const second = noticeDispatchState("club-admin-granted", handled);

  assert.equal(first.announce, true);
  assert.equal(
    second.announce,
    true,
    "a silent second appointment reads as nothing happening",
  );
});

test("the toast component decides through the shared predicate", () => {
  const toast = readFileSync(
    "src/components/staff/staff-notice-toast.tsx",
    "utf8",
  );
  assert.match(
    toast,
    /noticeDispatchState\(noticeCode, handledRef\.current\)/,
    "the component must keep its repeat-guard in step with the tested rule",
  );
});

test("the page owns the notice, so the global listener neither toasts nor clears it", () => {
  const routing = readFileSync("src/lib/notice-routing.mjs", "utf8");
  assert.match(routing, /export function handlesNoticeOnPage\(/);
  assert.doesNotMatch(
    routing,
    /export function rendersNoticeInline\(/,
    "staff notices no longer render inline, so the old name would lie",
  );
  const listener = readFileSync(
    "src/components/ui/global-flash-listener.tsx",
    "utf8",
  );
  assert.match(listener, /handlesNoticeOnPage\(pathname, noticeCode\)/);
});
