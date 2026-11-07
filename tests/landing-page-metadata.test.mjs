import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(p, "utf8");

test("src/app/page.tsx is a public landing page with metadata and no session read", () => {
  const content = read("src/app/page.tsx");
  assert.match(content, /export\s+const\s+metadata/);
  assert.match(content, /Carpenters Family Social Club/);
  assert.match(content, /og-share\.jpg/);
  assert.doesNotMatch(content, /supabase\.auth\.getUser\(\)/); // No session read on marketing landing
});

test("robots.ts allows public routes and disallows protected routes", () => {
  assert.equal(existsSync("src/app/robots.ts"), true);
  assert.match(
    read("src/app/robots.ts"),
    /disallow:\s*\[.*"\/admin".*"\/portal".*\]/s,
  );
});

// ---------------------------------------------------------------------------
// Canonical host. carpentersfamily.com.ng answers 308 and hands the visitor to
// www.carpentersfamily.com.ng, which is the host that actually serves 200. A
// sitemap or OG tag naming the apex tells crawlers the canonical URL is one
// that only redirects, so every index starts a hop behind the real page.
// ---------------------------------------------------------------------------

const METADATA_FILES = [
  "src/app/page.tsx",
  "src/app/tickets/page.tsx",
  "src/app/sitemap.ts",
  "src/app/robots.ts",
];

test("one module owns the public origin", () => {
  const site = read("src/lib/site.mjs");
  assert.match(site, /https:\/\/www\.carpentersfamily\.com\.ng/);
  assert.match(site, /export const SITE_ORIGIN/);
});

test("no public metadata file hard-codes the redirecting apex host", () => {
  const offenders = METADATA_FILES.filter((file) =>
    /https:\/\/carpentersfamily\.com\.ng/.test(read(file)),
  );
  assert.deepEqual(
    offenders,
    [],
    "import SITE_ORIGIN — the apex only 308s to www",
  );
});

test("sitemap.ts and robots.ts build their URLs from the shared origin", () => {
  for (const file of ["src/app/sitemap.ts", "src/app/robots.ts"]) {
    const content = read(file);
    assert.match(
      content,
      /from "@\/lib\/site.mjs"/,
      `${file} builds its own host instead of importing the shared origin`,
    );
    assert.match(
      content,
      /SITE_ORIGIN|siteUrl\(/,
      `${file} uses no shared URL`,
    );
  }
});

// ---------------------------------------------------------------------------
// Indexability. The root layout sets robots noindex for the private portal,
// and a child that does not override it inherits the ban — which is how the
// two public pages ended up invisible to search.
// ---------------------------------------------------------------------------

test("the root layout keeps the private portal out of search", () => {
  assert.match(read("src/app/layout.tsx"), /robots:\s*\{\s*index:\s*false/s);
});

test("the root layout resolves relative OG and icon URLs against www", () => {
  assert.match(
    read("src/app/layout.tsx"),
    /metadataBase:\s*new URL\(SITE_ORIGIN\)/,
    "relative metadata URLs would otherwise resolve against the request host",
  );
});

test("both public pages opt back in and declare a canonical", () => {
  for (const file of ["src/app/page.tsx", "src/app/tickets/page.tsx"]) {
    const content = read(file);
    assert.match(
      content,
      /robots:\s*\{\s*index:\s*true,\s*follow:\s*true/,
      `${file} still inherits the root noindex`,
    );
    assert.match(
      content,
      /alternates:\s*\{[\s\S]{0,80}canonical/,
      `${file} has no canonical URL`,
    );
  }
});

test("the box office carries its own title and description", () => {
  const content = read("src/app/tickets/page.tsx");
  assert.match(content, /export\s+const\s+metadata/);
  assert.match(content, /Tickets/i);
  assert.match(content, /description:/);
});

test("root page and layout declare social preview image for WhatsApp and social cards", () => {
  const landing = read("src/app/page.tsx");
  assert.match(landing, /url:\s*"\/landing\/og-share\.jpg"/);
  assert.match(landing, /images:\s*\["\/landing\/og-share\.jpg"\]/);
  assert.match(landing, /width:\s*1024/);
  assert.match(landing, /height:\s*571/);

  const layout = read("src/app/layout.tsx");
  assert.match(layout, /url:\s*"\/landing\/og-share\.jpg"/);
  assert.match(layout, /images:\s*\["\/landing\/og-share\.jpg"\]/);

  assert.equal(existsSync("public/landing/og-share.jpg"), true);
});
