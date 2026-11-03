import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { handlesNoticeOnPage } from "../src/lib/notice-routing.mjs";
import { getSystemNotice } from "../src/lib/system-notices.ts";

test("staff routes keep the listener out so the page can announce the notice", () => {
  for (const pathname of [
    "/admin",
    "/admin/members",
    "/admin/governance",
    "/admin/staff",
    "/admin/audit",
  ]) {
    assert.equal(
      handlesNoticeOnPage(pathname, "club-admin-granted"),
      true,
      `${pathname} owns the notice; a listener toast or cleanup would race it`,
    );
  }
});

test("member routes let the listener toast and clear the notice", () => {
  for (const pathname of [
    "/dues",
    "/officers/members",
    "/events/4b329eb6-3225-437a-a897-7bc8537521db",
  ]) {
    assert.equal(
      handlesNoticeOnPage(pathname, "dues-recorded"),
      false,
      `${pathname} relies on the floating toast`,
    );
  }
});

test("auth and root routes keep their documented inline behaviour", () => {
  assert.equal(handlesNoticeOnPage("/signup", "invalid-request"), true);
  assert.equal(handlesNoticeOnPage("/forgot-password", "sent"), true);
  assert.equal(handlesNoticeOnPage("/reset-password", "password-updated"), true);
  assert.equal(handlesNoticeOnPage("/", "sign-in"), true);
  assert.equal(handlesNoticeOnPage("/", "unknown-code"), false);
  assert.equal(handlesNoticeOnPage("/administrator-tools", "sign-in"), false);
});

test("the flash listener defers to the shared routing predicate", () => {
  const listener = readFileSync(
    "src/components/ui/global-flash-listener.tsx",
    "utf8",
  );
  assert.match(listener, /handlesNoticeOnPage\(pathname, noticeCode\)/);
  assert.doesNotMatch(
    listener,
    /const INLINE_NOTICE_ROUTES/,
    "the route list lives in notice-routing.mjs",
  );
});

// Leaving the listener out is only safe while the page can speak for the code
// itself. These guards keep that promise true instead of assuming it.

// Some codes are written bare (`denied: {`), most quoted (`"denied": {`).
// An extractor that only matched the quoted form reported phantom missing codes.
const systemNoticeCodes = () =>
  new Set(
    readFileSync("src/lib/system-notices.ts", "utf8")
      .split("\n")
      .flatMap((line) => {
        const key = line.match(/^\s{2}"?([a-z][a-z0-9-]*)"?: \{$/)?.[1];
        return key ? [key] : [];
      }),
  );

const rpcNoticeCodes = () => {
  const source = readFileSync("src/lib/rpc-error-notice.ts", "utf8");
  const ruleBlock = source.slice(
    source.indexOf("const MESSAGE_RULES"),
    source.indexOf("\n];"),
  );
  const emitted = new Set([...ruleBlock.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const m of source.matchAll(/return "([a-z0-9-]+)"/g)) emitted.add(m[1]);
  for (const m of source.matchAll(/fallback = "([a-z0-9-]+)"/g)) emitted.add(m[1]);
  return emitted;
};

// Every code a staff redirect can put in the URL: literals, the arms of a
// ternary inside `${}`, the lifecycle lookup table, and — because the
// translator decides at runtime — the whole rpcErrorNotice() output set.
const staffRoutedCodes = () => {
  const source = readFileSync("src/app/(staff)/admin/actions.ts", "utf8");
  const lifecycle = new Set(
    [...source.matchAll(/const lifecycleNotice[\s\S]*?\n\};/g)].flatMap((m) => [
      ...m[0].matchAll(/"([a-z][a-z0-9-]+)"/g),
    ]).map((m) => m[1]),
  );
  const routed = [];
  for (const match of source.matchAll(/redirect\(/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; depth > 0 && end < source.length; end++) {
      if (source[end] === "(") depth++;
      if (source[end] === ")") depth--;
    }
    const statement = source.slice(match.index, end);
    const page = statement.match(/\/admin\/(governance|members|staff)\?notice=/)?.[1];
    if (!page) continue;
    const codes = new Set();
    for (const m of statement.matchAll(/\?notice=([a-z][a-z0-9-]+)/g)) codes.add(m[1]);
    for (const m of statement.matchAll(/\$\{([^}]*)\}/g))
      for (const q of m[1].matchAll(/"([a-z][a-z0-9-]+)"/g)) codes.add(q[1]);
    if (/rpcErrorNotice/.test(statement))
      for (const c of rpcNoticeCodes()) codes.add(c);
    if (/lifecycleNotice/.test(statement))
      for (const c of lifecycle) codes.add(c);
    for (const code of codes) routed.push([page, code]);
  }
  return routed;
};

const staffPageNotices = () =>
  new Map(
    ["governance", "members", "staff"].map((page) => {
      const source = readFileSync(
        `src/app/(staff)/admin/${page}/page.tsx`,
        "utf8",
      );
      const block = source.slice(
        source.indexOf("const pageNotices"),
        source.indexOf("};", source.indexOf("const pageNotices")),
      );
      return [
        page,
        new Set([...block.matchAll(/^\s{2}"?([a-z0-9-]+)"?:/gm)].map((m) => m[1])),
      ];
    }),
  );

test("a permission denial is visible on the page that received it", () => {
  const source = readFileSync("src/lib/system-notices.ts", "utf8");
  const entry = source.match(
    /^\s{2}"?denied"?: \{\n((?:\s+.*\n)*?)\s{2}\},$/m,
  )?.[1];
  assert.ok(entry, "a 42501 denial is the most-routed notice in the app");
  assert.match(entry, /type:\s*"error"/, "a denial must read as an error");
});

test("rpc denial translations all have notice copy", () => {
  const emitted = rpcNoticeCodes();
  assert.ok(emitted.size >= 12, `expected many classes, saw ${emitted.size}`);
  const defined = systemNoticeCodes();
  for (const code of emitted) {
    assert.ok(
      defined.has(code),
      `rpcErrorNotice() can emit "${code}", which no toast or banner can render`,
    );
  }
});

test("every code a staff action routes is renderable on that staff page", () => {
  const defined = systemNoticeCodes();
  const pageCodes = staffPageNotices();
  const routed = staffRoutedCodes();
  assert.ok(routed.length >= 60, `expected the staff panel to route notices, saw ${routed.length}`);

  for (const [page, code] of routed) {
    assert.ok(
      pageCodes.get(page).has(code) || defined.has(code),
      `/admin/${page}?notice=${code} would show nothing: the page has no banner entry and the code is not in SYSTEM_NOTICES, ` +
        `so suppressing the toast on staff routes hides the notice entirely`,
    );
  }
});

// The same promise for the rest of the app: a redirect that no page claims is
// only visible if the registry can toast it. This is how the three silent
// /settings codes were found, and it is what stops the class reopening.
// Read markers are the one exemption the listener itself declares, so the
// guard below pins this list to the listener instead of trusting it.
const SILENT_READ_CODES = new Set(["announcement-read", "read", "unread"]);

const actionSources = (dir, found = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) actionSources(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
};

const redirectStatements = (source) => {
  const statements = [];
  for (const match of source.matchAll(/redirect\(/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; depth > 0 && end < source.length; end++) {
      if (source[end] === "(") depth++;
      if (source[end] === ")") depth--;
    }
    statements.push(source.slice(match.index, end));
  }
  return statements;
};

const appRoutedCodes = () => {
  const pairs = [];
  for (const file of actionSources("src/app")) {
    const source = readFileSync(file, "utf8");
    for (const statement of redirectStatements(source)) {
      if (!statement.includes("?notice=")) continue;
      const route = statement.match(/["'`]\/([^"'`?]*)\?notice=/)?.[1];
      if (route === undefined) continue;
      const codes = new Set();
      for (const m of statement.matchAll(/\?notice=([a-z][a-z0-9-]*)/g))
        codes.add(m[1]);
      for (const m of statement.matchAll(/\$\{([^}]*)\}/g))
        for (const q of m[1].matchAll(/"([a-z][a-z0-9-]*)"/g)) codes.add(q[1]);
      if (/rpcErrorNotice/.test(statement))
        for (const c of rpcNoticeCodes()) codes.add(c);
      for (const code of codes) pairs.push([`/${route}`, code, file]);
    }
  }
  return pairs;
};

test("every notice the app routes is announced by a page or by the registry", () => {
  const routed = appRoutedCodes();
  assert.ok(routed.length >= 80, `expected the whole app to route notices, saw ${routed.length}`);

  const silent = [];
  for (const [route, code, file] of routed) {
    if (SILENT_READ_CODES.has(code)) continue;
    if (handlesNoticeOnPage(route, code)) continue;
    if (getSystemNotice(code)) continue;
    silent.push(`${route}?notice=${code} (${file})`);
  }
  assert.deepEqual(
    silent,
    [],
    "these redirects leave the member with neither a page notice nor toast copy",
  );
});

test("the sweep exempts only the codes the listener itself keeps silent", () => {
  const listener = readFileSync(
    "src/components/ui/global-flash-listener.tsx",
    "utf8",
  );
  const declared = listener.match(
    /const SILENT_READ_NOTICE_CODES = new Set\(\[([\s\S]*?)\]\);/,
  )?.[1];
  assert.ok(
    declared,
    "the listener no longer declares SILENT_READ_NOTICE_CODES; the sweep would be exempting codes nobody silenced",
  );
  assert.deepEqual(
    new Set([...declared.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1])),
    SILENT_READ_CODES,
  );
});
