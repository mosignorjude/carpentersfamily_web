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

test("landing navigation list has Box Office / Tickets as the last item", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /<ul[^>]*hidden lg:flex[\s\S]*?href="#membership"[\s\S]*?href="\/tickets"[\s\S]*?<\/ul>/);
});

test("header right removes standalone Box Office button", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  const rightSection = nav.slice(nav.indexOf("Right:"), nav.indexOf("<LandingSocialLinks"));
  assert.doesNotMatch(rightSection, /Box Office/);
});

test("mobile drawer has logo, ends nav list with Box Office / Tickets, and keeps only Partner button with socials", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /<aside[\s\S]*?<ClubLogo[\s\S]*?Carpenters Family/);
  assert.match(nav, /<aside[\s\S]*?href="#membership"[\s\S]*?href="\/tickets"[\s\S]*?<\/ul>/);
  assert.match(nav, /<aside[\s\S]*?modal=partnership[\s\S]*?Partner With Us/);
  assert.doesNotMatch(nav, /<aside[\s\S]*?Member Portal Sign In/);
  assert.doesNotMatch(nav, /<aside[\s\S]*?Request Membership/);
  assert.match(nav, /Partner With Us[\s\S]*?<LandingSocialLinks/);
});
