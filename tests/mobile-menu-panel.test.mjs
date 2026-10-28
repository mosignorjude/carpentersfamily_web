import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { declares, parseCss, rulesFor } from "./helpers/css-rules.mjs";

const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

const DOC = parseCss(css);
/**
 * Value compare that does not care how the declaration is line-wrapped.
 *
 * The file breaks `min(...)` and `calc(...)` over lines, which puts whitespace after
 * each open paren and before each close. Removing exactly that, then collapsing the
 * rest to single spaces, leaves the string a reader would write by hand. Spaces
 * between operands survive, because `calc(100% - 2rem)` is only meaningful with them
 * — a normaliser that stripped every space would compare two mangled strings and
 * call it a pass.
 */
const flat = (value) =>
  value === null
    ? null
    : value
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .replace(/\s+/g, " ")
        .trim();

/**
 * Rules whose subject is the panel itself. `.app-shell-dashboard
 * .app-mobile-menu-panel .app-nav-links a` styles a link inside the panel, not the
 * panel, so it must not enter a geometry question — but `.app-shell-dashboard
 * .app-mobile-menu-panel` does, and that one is the repaint Task 3 shipped.
 */
const panelRules = () => rulesFor(DOC, "app-mobile-menu-panel");
/**
 * The rule that gives the panel its box: the selector exactly, at top level.
 *
 * "Exactly this selector" is not enough on its own. The same selector inside
 * `@media (max-width: 40rem)` still reads as the base rule to a selector-only find,
 * so moving the whole block into a query — the one edit that leaves the panel with no
 * box at all outside that range — kept every assertion in this file green. The
 * top-level requirement is the anchor the original guard had before a rewrite lost it.
 */
const basePanelRule = () =>
  panelRules().find(
    (rule) => rule.selector === ".app-mobile-menu-panel" && rule.media === "",
  );

describe("mobile menu panel fits the viewport", () => {
  it("has one base rule to read the geometry from", () => {
    const topLevel = panelRules().filter(
      (rule) =>
        rule.selector.replace(/::[\w-]+/g, "") === ".app-mobile-menu-panel" &&
        rule.media === "",
    );
    assert.equal(
      topLevel.length,
      1,
      `${topLevel.length} top-level rules whose subject is the panel itself; the geometry below is read from exactly one`,
    );
    assert.ok(
      basePanelRule(),
      "no rule whose selector is exactly .app-mobile-menu-panel — the panel's box is undefined",
    );
  });

  it("caps height at the dvh viewport minus the full reservation", () => {
    const panel = basePanelRule();
    assert.ok(panel, "no base .app-mobile-menu-panel rule");
    // Whole-declaration equality, not a substring: /100dvh/ also passes on a cap
    // that adds the reservation instead of subtracting it, or drops it entirely.
    assert.equal(
      flat(declares(panel.body, "max-height")),
      "calc(100dvh - 5.5rem - env(safe-area-inset-bottom, 0px))",
    );
  });

  it("scrolls its own overflow instead of spilling off-screen", () => {
    const panel = basePanelRule();
    assert.ok(panel, "no base .app-mobile-menu-panel rule");
    assert.equal(flat(declares(panel.body, "overflow-y")), "auto");
    assert.equal(flat(declares(panel.body, "overscroll-behavior")), "contain");
  });

  it("pins the geometry the vertical and horizontal fit depends on", () => {
    const panel = basePanelRule();
    assert.ok(panel, "no base .app-mobile-menu-panel rule");
    assert.equal(flat(declares(panel.body, "position")), "fixed");
    assert.equal(flat(declares(panel.body, "top")), "4.5rem");
    assert.equal(
      flat(declares(panel.body, "left")),
      "max(1rem, env(safe-area-inset-left, 0px))",
    );
    // 100%, not 100vw: a fixed element's containing block is the viewport MINUS a
    // classic scrollbar, while 100vw includes it. At 510 CSS px with a 15px
    // scrollbar, 100vw is 510 and the containing block is 494.67, so a 20rem panel
    // starts 16px in and ends 1px past the visible edge on a 320px window. On a
    // phone the two are identical, so this is the desktop-narrow-window half of the
    // same invariant, and it holds whichever ancestor owns the containing block.
    assert.equal(
      flat(declares(panel.body, "width")),
      "min(20rem, calc(100% - 2rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
    );
    assert.equal(
      flat(declares(panel.body, "padding-bottom")),
      "calc(0.65rem + env(safe-area-inset-bottom, 0px))",
    );
  });

  it("leaves the base rule as the sole geometry source in the cascade", () => {
    // Two hazards, and the guard has to face both. A same-specificity geometry rule
    // BEFORE the base rule is inert dead CSS — main carried one, which is the bug
    // this branch fixed, and Task 2 originally guarded only that direction. A rule
    // AFTER the base (or a more specific descendant-context rule anywhere) wins the
    // cascade and silently replaces the fit math the block above pins: the exact
    // shape of the B2 regression, one line later in the file.
    //
    // Reading only the base rule and its successors by index arithmetic missed both:
    // the loop compared a match that starts at the selector's dot against an anchor
    // that starts at the newline before it, so it broke on its first iteration and
    // no rule was ever examined. Parsed rules make the question "does any other rule
    // style this box's geometry", which has no order caveat.
    const geometry = ["top", "left", "right", "bottom", "width", "max-height"];
    const offenders = panelRules()
      .filter((rule) => rule !== basePanelRule())
      .filter((rule) => !rule.selector.includes("::"))
      .filter((rule) =>
        geometry.some((prop) => declares(rule.body, prop) !== null),
      )
      .map(
        (rule) =>
          `${rule.media ? `(${rule.media}) ` : ""}${rule.selector} { ${geometry
            .map((prop) => `${prop}: ${flat(declares(rule.body, prop))}`)
            .filter((part) => !part.endsWith("null"))
            .join("; ")} } at offset ${rule.start}`,
      );
    // A narrow-screen override should edit the rule above, not shadow it: the
    // min()/calc() cap is already viewport-adaptive, so a second geometry rule is
    // either dead or a change nobody measured.
    assert.deepEqual(
      offenders,
      [],
      "only the base .app-mobile-menu-panel rule may set the panel's box geometry",
    );
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
