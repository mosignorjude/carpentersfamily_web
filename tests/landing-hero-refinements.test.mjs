import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("landing hero has Explore the Family scrolling to #what-we-do and omits Explore Events", () => {
  const hero = fs.readFileSync("src/components/landing/landing-hero.tsx", "utf8");
  assert.match(hero, /<button[^>]*type="button"[^>]*onClick=\{handleExploreClick\}/);
  assert.match(hero, /Explore the Family/);
  assert.doesNotMatch(hero, /Join the Family/);
  assert.doesNotMatch(hero, /Explore Events/);

  const whatWeDo = fs.readFileSync("src/components/landing/landing-what-we-do.tsx", "utf8");
  assert.match(whatWeDo, /id="what-we-do"[^>]*scroll-mt-20/);
});
