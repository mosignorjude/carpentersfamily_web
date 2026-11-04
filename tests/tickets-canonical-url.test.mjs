import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// tickets.carpentersfamily.com.ng has no DNS record, so the address the
// storefront prints could never resolve. The box office lives at
// carpentersfamily.com.ng/tickets, which is the path that works on every host
// the club actually serves.
const sourceFiles = (dir, found = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) found.push(path);
  }
  return found;
};

test("no source file advertises the tickets subdomain", () => {
  const offenders = sourceFiles("src").filter((file) =>
    readFileSync(file, "utf8").includes("tickets.carpentersfamily.com.ng"),
  );
  assert.deepEqual(
    offenders,
    [],
    "the subdomain has no DNS; the box office is carpentersfamily.com.ng/tickets",
  );
});

test("the proxy no longer rewrites a host that does not exist", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.doesNotMatch(
    proxy,
    /startsWith\("tickets\."\)/,
    "the tickets-subdomain branch is dead code once the host has no DNS",
  );
  assert.doesNotMatch(
    proxy,
    /NextResponse\.rewrite/,
    "the proxy sets security headers; routing belongs to the app tree",
  );
});

test("the storefront prints the address that actually resolves", () => {
  const view = readFileSync(
    "src/components/tickets/tickets-storefront-view.tsx",
    "utf8",
  ).replace(/\s+/g, " ");
  assert.match(
    view,
    /carpentersfamily\.com\.ng\/tickets/,
    "the box-office label must name the path a member can type",
  );
});
