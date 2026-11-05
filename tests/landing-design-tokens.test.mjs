import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("required landing images exist in public/landing", () => {
  const files = [
    "cta-band.jpg", "hero-family.jpg", "og-share.jpg",
    "tile-brand-activation.jpg", "tile-djs-hype.jpg",
    "tile-family-galas.jpg", "tile-raves.jpg",
    "what-we-do-inset.jpg", "what-we-do-main.jpg"
  ];
  for (const file of files) {
    assert.equal(fs.existsSync(`public/landing/${file}`), true, `Missing ${file}`);
  }
});

test("globals.css defines landing theme color variables and 44px touch targets", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /#174C37|--color-forest|--landing-forest/i);
  assert.match(css, /#FAF6F0|--color-cream|--landing-cream/i);
  assert.match(css, /#D6A23A|--color-ochre|--landing-ochre/i);
  assert.match(css, /min-height:\s*44px/);
});
