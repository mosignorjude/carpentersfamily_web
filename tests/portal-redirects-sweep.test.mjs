import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getNavigationItems } from "../src/lib/app-navigation.mjs";

test("app navigation provides /portal for Home and /tickets for Box office", () => {
  const items = getNavigationItems(["member"]);
  const homeItem = items.find((i) => i.label === "Home");
  assert.ok(homeItem, "Home navigation item must exist");
  assert.equal(homeItem.href, "/portal");

  const ticketsItem = items.find((i) => i.label === "Box office");
  assert.ok(ticketsItem, "Box office navigation item must exist");
  assert.equal(ticketsItem.href, "/tickets");
});

test("server actions default redirect points to /portal?notice=configuration", () => {
  const actionsContent = fs.readFileSync("src/app/actions.ts", "utf8");
  assert.match(
    actionsContent,
    /clientOrRedirect\(destination\s*=\s*"\/portal\?notice=configuration"\)/,
  );
  assert.match(actionsContent, /redirect\("\/portal\?notice=credentials"\)/);
  assert.match(actionsContent, /redirect\("\/portal"\)/);
});

test("auth confirm and callback routes redirect to /portal with notice", () => {
  const confirmContent = fs.readFileSync("src/app/auth/confirm/route.ts", "utf8");
  assert.match(confirmContent, /\/portal\?notice=/);

  const callbackContent = fs.readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(callbackContent, /\/portal\?notice=auth-failed/);
});
