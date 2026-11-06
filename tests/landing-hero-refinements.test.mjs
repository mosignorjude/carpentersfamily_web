import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("landing hero has Explore the Family scrolling to #vision and omits Explore Events", () => {
  const hero = fs.readFileSync("src/components/landing/landing-hero.tsx", "utf8");
  assert.match(hero, /href="#vision"/);
  assert.match(hero, /Explore the Family/);
  assert.doesNotMatch(hero, /Join the Family/);
  assert.doesNotMatch(hero, /Explore Events/);
});
