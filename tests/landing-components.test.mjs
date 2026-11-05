import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("all landing components exist in src/components/landing", () => {
  const expectedFiles = [
    "src/components/landing/landing-ribbon.tsx",
    "src/components/landing/landing-nav.tsx",
    "src/components/landing/landing-hero.tsx",
    "src/components/landing/landing-vision.tsx",
    "src/components/landing/landing-what-we-do.tsx",
    "src/components/landing/landing-events.tsx",
    "src/components/landing/landing-footer.tsx",
  ];
  for (const file of expectedFiles) {
    assert.equal(fs.existsSync(file), true, `Missing component file: ${file}`);
  }
});

test("landing hero has verbatim copy and no profit sharing claim", () => {
  const hero = fs.readFileSync(
    "src/components/landing/landing-hero.tsx",
    "utf8",
  );
  assert.match(hero, /Rooted in Family\./);
  assert.match(hero, /Driven by the Vibe\./);
  assert.doesNotMatch(hero, /60%/);
  assert.doesNotMatch(hero, /profit.?sharing/i);
});

test("what-we-do component omits 60% profit-sharing claim in card 03", () => {
  const whatWeDo = fs.readFileSync(
    "src/components/landing/landing-what-we-do.tsx",
    "utf8",
  );
  assert.match(whatWeDo, /Family Welfare & Shared Prosperity/);
  assert.doesNotMatch(whatWeDo, /share 60% of event profits/);
});

test("landing nav provides links to Box Office /tickets and Member Portal /portal", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /href="\/tickets"/);
  assert.match(nav, /href="\/portal"/);
});

test("the footer legal band keeps its small type off the container edge", () => {
  // Full-bleed and centred, so without horizontal padding the copyright line
  // touches both edges on a phone — 11px text needs at least 8px of inset.
  const footer = fs.readFileSync(
    "src/components/landing/landing-footer.tsx",
    "utf8",
  );
  const band = /className="([^"]*bg-deep\/60[^"]*)"/.exec(footer);
  assert.ok(band, "the footer legal band is missing from landing-footer.tsx");
  assert.match(
    band[1],
    /px-(?:[4-9]|1\d)\b/,
    `legal band needs >=16px horizontal padding, found ${JSON.stringify(band[1])}`,
  );
});
