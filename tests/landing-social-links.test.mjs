import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const brand = fs.readFileSync("src/lib/brand.ts", "utf8");
const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
const footer = fs.readFileSync(
  "src/components/landing/landing-footer.tsx",
  "utf8",
);
const socials = fs.readFileSync(
  "src/components/landing/landing-social-links.tsx",
  "utf8",
);

test("clubBrand names exactly the two social channels the club runs", () => {
  assert.match(brand, /socials:\s*\[/);
  assert.match(
    brand,
    /handle:\s*"@carpenters_family"/,
    "TikTok handle must be @carpenters_family",
  );
  assert.match(
    brand,
    /tiktok\.com\/@carpenters_family/,
    "the TikTok profile URL must carry the same handle",
  );
  assert.match(
    brand,
    /handle:\s*"@capenters_family"/,
    "Instagram is @capenters_family — no r, exactly as registered",
  );
  assert.match(
    brand,
    /instagram\.com\/capenters_family/,
    "the Instagram URL must point at the registered, r-less handle",
  );
  assert.ok(
    !/instagram\.com\/carpenters_family/.test(brand),
    "instagram.com/carpenters_family is a different account; never 'fix' the spelling there",
  );
  for (const gone of ["facebook.com", "linkedin.com", "twitter.com", "x.com"]) {
    assert.ok(!brand.includes(gone), `${gone} is not a channel the club runs`);
  }
});

test("the social links are real, external and safely labelled", () => {
  assert.match(socials, /target="_blank"/);
  assert.match(socials, /rel="noopener noreferrer"/);
  assert.match(socials, /clubBrand\.socials/);
  assert.match(socials, /aria-label=/);
});

test("no landing surface ships a social anchor that goes nowhere", () => {
  for (const [name, src] of [
    ["landing-nav.tsx", nav],
    ["landing-footer.tsx", footer],
  ]) {
    assert.ok(
      !src.includes('href="#footer"'),
      `${name} still renders a dead social anchor`,
    );
    assert.match(
      src,
      /LandingSocialLinks/,
      `${name} must render the real links`,
    );
  }
});

test("the dark mark is never dropped straight onto a dark surface", () => {
  // ClubLogo encapsulates its own circular white emblem (rounded-full bg-white),
  // ensuring the brand mark is never dropped directly onto dark surfaces like bg-forest.
  const logoContent = fs.readFileSync("src/components/club-logo.tsx", "utf8");
  assert.match(
    logoContent,
    /rounded-full\s+bg-white/,
    "ClubLogo must encapsulate a light circular chip behind the mark",
  );
  assert.match(
    footer,
    /<ClubLogo/,
    "the footer mark sits on bg-forest; it must render ClubLogo with its encapsulated light emblem",
  );
});

test("the landing uses the club mark, not a letter badge", () => {
  for (const [name, src] of [
    ["landing-nav.tsx", nav],
    ["landing-footer.tsx", footer],
  ]) {
    assert.match(src, /ClubLogo/, `${name} must render the brand mark`);
    assert.ok(
      !/rounded-full[^"]*">\s*\n?\s*C\s*<\/span>/.test(src),
      `${name} still fakes the crest with a letter`,
    );
  }
});
