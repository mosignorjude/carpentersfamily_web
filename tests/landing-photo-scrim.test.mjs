import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Measured, not estimated: each photo was decoded in the browser and the exact
// object-cover crop sitting behind each string of copy was sampled for
// luminance. The hero kicker lands on near-white photo (mean luminance 0.88)
// and the tiles' eyebrows land on 0.13-0.26, so gold-on-photo read 2.4:1,
// 2.5:1 and 3.4:1 at the sizes they are actually rendered (11-12px bold).
//
// Ochre is #d6a23a (relative luminance 0.436). AA body text needs 4.5:1, so the
// surface under it has to stay at or below 0.058 luminance. Composited over a
// fully lit photo pixel, `deep` only reaches that at 88% coverage - and the
// tiles' crop stays brighter than the hero's, so their floor is higher.
const COPY_BANDS = [
  {
    file: "src/components/landing/landing-hero.tsx",
    protects:
      "the kicker, headline and italic tagline centred on hero-family.jpg",
    // to-b: 0% is the top edge, 100% the bottom, and the copy fills the band.
    facing: ["from", "via", "to"],
    floor: 88,
  },
  {
    file: "src/components/landing/landing-events.tsx",
    protects:
      "the four eyebrows and captions bottom-aligned on the tile photos",
    // to-t: `from` is the bottom edge where the copy sits, `via` the mid stop
    // the taller block still reaches into.
    facing: ["from", "via"],
    floor: 92,
  },
];

function scrims(src) {
  return [
    ...src.matchAll(
      /className="([^"]*\babsolute inset-0\b[^"]*bg-gradient-to-[tblr][^"]*)"/g,
    ),
  ].map((m) => m[1]);
}

function stopOpacity(classes, stop) {
  const hit = new RegExp(`\\b${stop}-(?:[a-z]+)/(\\d+)\\b`).exec(classes);
  return hit ? Number(hit[1]) : null;
}

test("photo scrims behind landing copy stay dark enough for their text", () => {
  for (const band of COPY_BANDS) {
    const src = readFileSync(band.file, "utf8");
    const scrimsFound = scrims(src);
    assert.ok(
      scrimsFound.length > 0,
      `${band.file} lost the scrim layer that protects ${band.protects}`,
    );
    for (const classes of scrimsFound) {
      const thin = band.facing.filter((stop) => {
        const value = stopOpacity(classes, stop);
        return value !== null && value < band.floor;
      });
      assert.deepEqual(
        thin,
        [],
        `${band.file}: scrim ${JSON.stringify(classes)} lets ${band.protects} fall under ${band.floor}% coverage`,
      );
    }
  }
});

test("the hero kicker is cream, because gold cannot clear its own backdrop", () => {
  const src = readFileSync("src/components/landing/landing-hero.tsx", "utf8");
  const kicker = /<p className="([^"]*tracking-\[\.25em\][^"]*)">/.exec(src);
  assert.ok(kicker, "the hero kicker line is missing from landing-hero.tsx");
  assert.ok(
    /text-cream/.test(kicker[1]),
    `hero kicker must be cream over the photo, found ${JSON.stringify(kicker[1])}`,
  );
  assert.ok(
    !/text-ochre/.test(kicker[1]),
    "gold on the blown-out top of hero-family.jpg measures 3.9:1 even at 89% scrim",
  );
  assert.match(
    src,
    /h-px w-\d+ bg-ochre/,
    "the gold accent has to survive as a hairline rule above the kicker",
  );
});

test("the hero and tile scrims are gradient layers, not flat fills", () => {
  // A flat fill would pass the opacity floor above while flattening the photo
  // the brief exists to show, so the layered form is itself the requirement.
  for (const band of COPY_BANDS) {
    const src = readFileSync(band.file, "utf8");
    assert.match(
      src,
      /bg-gradient-to-[tblr]/,
      `${band.file} should keep the photo visible under a graduated scrim`,
    );
  }
});

test("gold copy over photography is limited to what its own backdrop clears", () => {
  // Both of these were measured on the rendered page with the scrim composited
  // per pixel: the hero motto read 4.05:1 (ochre/95 at 14px, 4.5 needed) and the
  // "One Family!" chip 4.38:1, because bg-ochre/85 lets a dark patch of the
  // inset photo through and espresso-on-muddy-gold is not AA.
  const hero = readFileSync("src/components/landing/landing-hero.tsx", "utf8");
  const motto = /<p className="([^"]*font-serif[^"]*italic[^"]*)">/.exec(hero);
  assert.ok(motto, "the hero motto line is missing from landing-hero.tsx");
  assert.ok(
    !/text-ochre/.test(motto[1]),
    `gold italic serif at 14px over hero-family.jpg measures 4.05:1, found ${JSON.stringify(motto[1])}`,
  );
  assert.match(
    motto[1],
    /text-cream/,
    "the motto has to carry the cream the rest of the hero copy uses",
  );

  const what = readFileSync(
    "src/components/landing/landing-what-we-do.tsx",
    "utf8",
  );
  const chips = [
    ...what.matchAll(
      /className="([^"]*bg-ochre\/\d+[^"]*text-espresso[^"]*)"/g,
    ),
  ].map((m) => m[1]);
  assert.deepEqual(
    chips,
    [],
    "espresso text needs the ochre chip opaque; a translucent chip inherits the photograph's brightness",
  );
});
