import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

/** Returns the declaration body of an exact top-level selector, or null. */
function cssRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{`).exec(css);
  if (!match) return null;
  const open = css.indexOf("{", match.index);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function landingSourceFiles() {
  return fs
    .readdirSync("src/components/landing")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `src/components/landing/${f}`);
}

test("required landing images exist in public/landing", () => {
  const files = [
    "cta-band.jpg",
    "hero-family.jpg",
    "og-share.jpg",
    "tile-brand-activation.jpg",
    "tile-djs-hype.jpg",
    "tile-family-galas.jpg",
    "tile-raves.jpg",
    "what-we-do-inset.jpg",
    "what-we-do-main.jpg",
  ];
  for (const file of files) {
    assert.equal(
      fs.existsSync(`public/landing/${file}`),
      true,
      `Missing ${file}`,
    );
  }
});

test("globals.css defines landing theme color variables and 44px touch targets", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /#174C37|--color-forest|--landing-forest/i);
  assert.match(css, /#FAF6F0|--color-cream|--landing-cream/i);
  assert.match(css, /#D6A23A|--color-ochre|--landing-ochre/i);
  assert.match(css, /min-height:\s*44px/);
});

test(".btn is a defined rule with an accessible touch target", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const body = cssRuleBody(css, ".btn");
  assert.ok(
    body,
    'globals.css has no .btn rule — every landing CTA using className="btn" renders unstyled',
  );

  const minHeight = /min-height:\s*([\d.]+)px/.exec(body);
  assert.ok(minHeight, ".btn must declare min-height in px");
  assert.ok(
    Number.parseFloat(minHeight[1]) >= 44,
    `.btn min-height is ${minHeight[1]}px, below the 44px floor`,
  );

  assert.match(body, /display:\s*inline-flex/);
  assert.match(body, /align-items:\s*center/);
  assert.match(body, /justify-content:\s*center/);
  assert.match(body, /padding:\s*\d/);
  assert.match(body, /font-weight:\s*\d/);
});

test(".btn declares a visible focus ring and honours reduced motion", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const focus = cssRuleBody(css, ".btn:focus-visible");
  assert.ok(focus, ".btn:focus-visible must exist");
  assert.match(focus, /outline:\s*[^;]*solid/);

  const motion = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
  );
  assert.match(
    motion,
    /\.btn\b/,
    ".btn must be inside the reduced-motion guard",
  );
});

test("no landing control sets a height floor below 44px", () => {
  const offenders = [];
  for (const file of [...landingSourceFiles(), "src/app/page.tsx"]) {
    const src = fs.readFileSync(file, "utf8");
    for (const token of src.match(/min-h-\[(\d+(?:\.\d+)?)px\]/g) ?? []) {
      if (Number.parseFloat(token.match(/(\d+(?:\.\d+)?)px/)[1]) < 44) {
        offenders.push(`${file}: ${token}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "DESIGN.md puts interactive targets at 44px or above",
  );
});

test("landing components carry no hard-coded hex colors", () => {
  const offenders = [];
  for (const file of landingSourceFiles()) {
    const src = fs.readFileSync(file, "utf8");
    for (const hex of src.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      offenders.push(`${file}: ${hex}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "Use @theme tokens (text-ochre, bg-ochre, currentColor) instead of literal hex",
  );
});
