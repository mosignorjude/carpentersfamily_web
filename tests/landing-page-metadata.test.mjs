import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("src/app/page.tsx is a public landing page with metadata and no session read", () => {
  const content = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.match(content, /export\s+const\s+metadata/);
  assert.match(content, /Carpenters Family Social Club/);
  assert.match(content, /og-share\.jpg/);
  assert.doesNotMatch(content, /supabase\.auth\.getUser\(\)/); // No session read on marketing landing
});

test("robots.ts allows public routes and disallows protected routes", () => {
  assert.equal(fs.existsSync("src/app/robots.ts"), true);
  const content = fs.readFileSync("src/app/robots.ts", "utf8");
  assert.match(content, /disallow:\s*\[.*"\/admin".*"\/portal".*\]/s);
});

test("sitemap.ts generates valid URLs for canonical site", () => {
  assert.equal(fs.existsSync("src/app/sitemap.ts"), true);
  const content = fs.readFileSync("src/app/sitemap.ts", "utf8");
  assert.match(content, /https:\/\/carpentersfamily\.com\.ng/);
});
