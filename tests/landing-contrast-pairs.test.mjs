import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// Every pair below was measured in the browser on the built page, not estimated
// from the palette: 4.28:1 gold-on-forest numerals and 1.4:1 forest-on-deep
// disclosures. Both read as decoration until you try to actually look at them.
const BANNED_PAIRS = [
  ["bg-forest", "text-ochre", "4.28:1"],
  ["bg-forest", "text-forest", "1.0:1"],
  ["bg-deep", "text-forest", "1.4:1"],
  ["bg-forest/40", "text-forest", "1.4:1"],
  ["bg-cream", "text-cream", "1.0:1"],
  ["bg-white", "text-cream", "1.05:1"],
  ["bg-terra/10", "text-terra", "4.47:1"],
];

const files = [
  "src/app/page.tsx",
  ...readdirSync("src/components/landing")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `src/components/landing/${f}`),
];

/** Bare class tokens only: `hover:bg-forest` is a different surface, not this one. */
function bareTokens(classList) {
  return classList
    .trim()
    .split(/\s+/)
    .filter((token) => token && !token.includes(":"));
}

test("no landing element pairs a brand surface with text that fails on it", () => {
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // Class lists hide in three places: className="…", the branches of a
    // conditional template literal, and the shared skin constants. Scanning
    // quoted strings that carry a surface token catches all three.
    for (const [, classList] of src.matchAll(
      /["`]([^"`]*(?:bg-|text-)[^"`]*)["`]/g,
    )) {
      const tokens = bareTokens(classList);
      for (const [bg, fg, ratio] of BANNED_PAIRS) {
        if (tokens.includes(bg) && tokens.includes(fg)) {
          offenders.push(`${file}: ${bg} + ${fg} (${ratio})`);
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `unreadable brand pairs:\n    ${offenders.join("\n    ")}`,
  );
});

test("disclosures on the dark stewardship card state their own text colour", () => {
  // `summary` is coloured forest by globals.css, which is right on paper and
  // invisible on the Charter of Values card, so each one has to overrule it.
  const page = readFileSync("src/app/page.tsx", "utf8");
  const naked = [...page.matchAll(/<summary\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((attrs) => !/text-(cream|ochre|white)/.test(attrs));
  assert.deepEqual(
    naked,
    [],
    `${naked.length} summary controls inherit forest text over a dark card`,
  );
});
