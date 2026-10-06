import assert from "node:assert/strict";
import test from "node:test";
import {
  getActiveMemberNavigationItems,
  getNavigationItems,
} from "../src/lib/app-navigation.mjs";

function hrefs(roles) {
  return getNavigationItems(roles).map((item) => item.href);
}

test("ordinary members receive member links without officer-only areas", () => {
  const links = hrefs(["member"]);
  assert.ok(links.includes("/"));
  assert.ok(links.includes("/events"));
  assert.ok(links.includes("/dues"));
  assert.ok(links.includes("/announcements"));
  assert.ok(links.includes("/notifications"));
  assert.ok(!links.includes("/finances"));
  assert.ok(!links.includes("/admin/members"));
});

test("executives receive officer links without changing their role identity", () => {
  const links = hrefs(["executive"]);
  assert.ok(links.includes("/finances"));
  assert.ok(links.includes("/admin/members"));
});

test("Admin and Backup Admin receive the same navigation links", () => {
  assert.deepEqual(hrefs(["admin"]), hrefs(["backup_admin"]));
});

test("event roles do not imply club officer navigation", () => {
  for (const role of ["lead", "assistant", "committee"]) {
    const links = hrefs([role]);
    assert.ok(links.includes("/events"));
    assert.ok(!links.includes("/finances"));
    assert.ok(!links.includes("/admin/members"));
  }
});

test("role lookup failures fail closed for officer-only links", () => {
  assert.ok(!hrefs([]).includes("/finances"));
  assert.ok(!hrefs([]).includes("/admin/members"));
});

test("pending and deactivated members do not receive the private shell", () => {
  assert.equal(getActiveMemberNavigationItems("pending", ["admin"]), null);
  assert.equal(getActiveMemberNavigationItems("deactivated", ["admin"]), null);
});

test("active status gates role links, and role lookup errors omit officer links", () => {
  const links = getActiveMemberNavigationItems("active", ["admin"], true);
  assert.ok(links);
  assert.ok(!links.some((item) => item.href === "/finances"));
  assert.ok(!links.some((item) => item.href === "/admin/members"));
});
