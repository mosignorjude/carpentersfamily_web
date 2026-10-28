import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

function ruleBody(source, anchor) {
  const start = source.indexOf(anchor);
  assert.notEqual(start, -1, `missing rule near "${anchor}"`);
  const open = source.indexOf("{", start);
  return source.slice(open + 1, source.indexOf("}", open));
}

describe("mobile menu panel fits the viewport", () => {
  // The "\n." anchor is load-bearing: it extracts only the base rule written at
  // column 0, never an indented .app-mobile-menu-panel rule nested inside a
  // media query. The geometry-before-base test below is what keeps a media
  // override from creeping back in front of the base rule as inert dead CSS.
  const panel = ruleBody(css, "\n.app-mobile-menu-panel {");

  it("caps height at the dvh viewport minus the full reservation", () => {
    // Whole-declaration match: a loose /max-height:[^;]*100dvh/ also passes on
    // caps that overflow the viewport (no reservation, or added instead of
    // subtracted terms).
    assert.match(
      panel,
      /max-height:\s*calc\(\s*100dvh\s*-\s*5\.5rem\s*-\s*env\(safe-area-inset-bottom,\s*0px\)\s*\)/,
    );
  });

  it("scrolls its own overflow instead of spilling off-screen", () => {
    assert.match(panel, /overflow-y:\s*auto/);
    assert.match(panel, /overscroll-behavior:\s*contain/);
  });

  it("pins the geometry the vertical and horizontal fit depends on", () => {
    assert.match(panel, /top:\s*4\.5rem/);
    assert.match(
      panel,
      /left:\s*max\(1rem,\s*env\(safe-area-inset-left,\s*0px\)\)/,
    );
    assert.match(
      panel,
      /width:\s*min\(\s*20rem,\s*calc\(\s*100vw\s*-\s*2rem\s*-\s*env\(safe-area-inset-left,\s*0px\)\s*-\s*env\(safe-area-inset-right,\s*0px\)\s*\)\s*\)/,
    );
    assert.match(
      panel,
      /padding-bottom:\s*calc\(\s*0\.65rem\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\s*\)/,
    );
  });

  it("leaves the base rule as the sole geometry source in the cascade", () => {
    // A .app-mobile-menu-panel rule earlier in source order than the base rule
    // is inert dead CSS (equal specificity, media queries add none) unless it
    // is more specific; either way it must not set panel geometry.
    const baseStart = css.indexOf("\n.app-mobile-menu-panel {");
    assert.notEqual(baseStart, -1, "base .app-mobile-menu-panel rule missing");
    for (const match of css.matchAll(
      /\.app-mobile-menu-panel\s*\{([^}]+)\}/g,
    )) {
      if (match.index > baseStart) {
        break;
      }
      for (const prop of [
        /^\s*top\s*:/m,
        /^\s*left\s*:/m,
        /^\s*max-height\s*:/m,
      ]) {
        assert.doesNotMatch(
          match[1],
          prop,
          "a .app-mobile-menu-panel rule before the base rule must not set top/left/max-height",
        );
      }
    }
  });
});

describe("dashboard menu panel contrast", () => {
  it("recolours sign out for the dark dashboard panel", () => {
    assert.match(
      css,
      /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button\s*\{[^}]*color:\s*#f0a89e/,
    );
  });

  it("keeps the hover state readable", () => {
    // Whole declarations, not just the selector: the 7.28:1 hover ratio depends
    // on the text colour AND the alpha of the blended background, so a rule
    // that regressed to the panel colour, dropped color, or emptied itself must
    // fail. A selector-only match stayed green on all three.
    assert.match(
      css,
      /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button:hover\s*\{[^}]*color:\s*#ffd0c7/,
    );
    assert.match(
      css,
      /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button:hover\s*\{[^}]*background:\s*rgb\(240 168 158 \/ 0\.16\)/,
    );
  });

  it("makes the focus ring visible on the dark panel", () => {
    // The base ring is var(--color-focus-ring) -> --brand-forest-hover =
    // #103d2b: 1.118:1 on the forest panel, i.e. no keyboard indicator at all.
    // The dashboard override must pin the ochre token (5.89:1, over the 3:1
    // WCAG 2.2 AA bar for non-text focus appearance) via the outline-color
    // longhand, which keeps the base rule's 3px width and 2px offset.
    assert.match(
      css,
      /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button:focus-visible\s*\{[^}]*outline-color:\s*var\(--brand-ochre\)/,
    );
  });
});
