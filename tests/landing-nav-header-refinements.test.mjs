import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("club-logo component wraps the brand mark in a circular white emblem", () => {
  const content = fs.readFileSync("src/components/club-logo.tsx", "utf8");
  assert.match(content, /rounded-full\s+bg-white/);
  assert.match(content, /border/);
});

test("landing-social-links renders TikTok and Instagram SVG logos without text pills", () => {
  const content = fs.readFileSync("src/components/landing/landing-social-links.tsx", "utf8");
  assert.match(content, /<svg[^>]*>[\s\S]*?<\/svg>/i);
  assert.match(content, /TikTok/i);
  assert.match(content, /Instagram/i);
  assert.match(content, /aria-label=/);
  // Pure icon buttons without text pill labels
  assert.doesNotMatch(content, /<span>\{social\.network\}<\/span>/);
});

test("landing-nav header displays Carpenters Family without Asaba Delta subtext", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /Carpenters Family/);
  assert.doesNotMatch(nav, /Asaba,\s*Delta\s*State/);
});
