import assert from "node:assert/strict";
import test from "node:test";
import {
  getScrollBehavior,
  parseAttendanceTab,
} from "../src/lib/tab-navigation.mjs";

test("attendance tab query accepts only known tabs", () => {
  assert.equal(parseAttendanceTab("session"), "session");
  assert.equal(parseAttendanceTab("minutes"), "minutes");
  assert.equal(parseAttendanceTab("history"), "history");
  assert.equal(parseAttendanceTab("audit"), "audit");
});

test("attendance tab query normalizes case and whitespace", () => {
  assert.equal(parseAttendanceTab("  HISTORY "), "history");
});

test("attendance tab query falls back to session for missing or unknown values", () => {
  assert.equal(parseAttendanceTab(null), "session");
  assert.equal(parseAttendanceTab(undefined), "session");
  assert.equal(parseAttendanceTab(""), "session");
  assert.equal(parseAttendanceTab("overview"), "session");
});

test("scroll behavior respects reduced-motion preference", () => {
  assert.equal(getScrollBehavior(true), "auto");
  assert.equal(getScrollBehavior(false), "smooth");
});
