import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  declares,
  parseCss,
  rulesFor,
  stylesClass,
} from "./helpers/css-rules.mjs";

// SRC_ROOT lets the controller run this exact file against pre/post fixtures.
const ROOT = process.env.SRC_ROOT
  ? process.env.SRC_ROOT
  : fileURLToPath(new URL("..", import.meta.url));

const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
const header = readFileSync(
  join(ROOT, "src/components/app-header.tsx"),
  "utf8",
);
const menu = readFileSync(
  join(ROOT, "src/components/mobile-app-menu.tsx"),
  "utf8",
);
const shell = readFileSync(join(ROOT, "src/components/app-shell.tsx"), "utf8");

const DISPLAY_TOKENS = new Set([
  "block",
  "contents",
  "flex",
  "grid",
  "hidden",
  "inline-block",
  "inline-flex",
]);

const DOC = parseCss(css);

/**
 * Rules that switch an element's own box shown or hidden, in source order.
 *
 * Pseudo-element rules are dropped and descendant rules are dropped, because
 * neither changes the element's box: `.app-sidebar::-webkit-scrollbar-button
 * { display: none }` styles a scrollbar part, and `.app-sidebar .button
 * { display: flex }` styles a button. Counting either as a display switch on
 * `.app-sidebar` would report a duplicated nav gate that does not exist.
 */
const displayRules = (className) =>
  rulesFor(DOC, className).filter((rule) => {
    if (rule.selector.includes("::")) return false;
    return declares(rule.body, "display") !== null;
  });

/** The value of `display` for a rule, trimmed of the `!important` nobody uses here. */
const displayOf = (rule) =>
  declares(rule.body, "display")
    .replace(/\s*!important/i, "")
    .trim();
const baseDisplayOf = (cls) =>
  cls
    .split(/\s+/)
    .filter((t) => t !== "" && !t.includes(":") && DISPLAY_TOKENS.has(t));
// Token equality, never a word-boundary grep: /\bapp-mobile-nav\b also matches the
// non-existent class "app-mobile-nav--legacy", which would hide nothing.
const hasGate = (cls) => cls.split(/\s+/).includes("app-mobile-nav");
// Any conditional `hidden`, whatever the variant is spelled as. The earlier shape
// here accepted a fixed sm|md|lg|xl list, which is the exact hole the Task 5
// review caught: 2xl and arbitrary variants like min-[400px] hid an element from
// the pin entirely.
const breakpointHidden = (cls) =>
  cls.split(/\s+/).some((token) => {
    const parts = token.split(":");
    return parts.length > 1 && parts.at(-1) === "hidden";
  });
// A `max-` only counts inside a variant segment: `max-w-full` is a sizing utility,
// and reading it as a media variant would RED an innocent class.
const maxVariant = (cls) =>
  cls.split(/\s+/).some((token) =>
    token
      .split(":")
      .slice(0, -1)
      .some((variant) => variant.startsWith("max-")),
  );

describe("exactly one primary navigation at every width", () => {
  it("couples the hamburger to the breakpoint that actually hides the sidebar", () => {
    const sidebarHiders = displayRules("app-sidebar").filter(
      (rule) => displayOf(rule) === "none",
    );
    assert.ok(
      sidebarHiders.length >= 1,
      "no @media rule hides .app-sidebar — the mobile layout switch has been deleted",
    );
    const navShown = displayRules("app-mobile-nav").filter(
      (rule) => displayOf(rule) !== "none",
    );
    for (const hider of sidebarHiders) {
      assert.ok(
        hider.media,
        ".app-sidebar is hidden by a top-level rule, which would blank the sidebar at every width",
      );
      assert.match(
        hider.media,
        /max-width:\s*56rem/,
        `.app-sidebar is hidden under "(${hider.media})"; the nav switch must stay at 56rem`,
      );
      assert.ok(
        navShown.some((rule) => rule.media === hider.media),
        `the sidebar hides under "(${hider.media})" but no rule re-shows .app-mobile-nav there`,
      );
    }
  });

  it("defaults the mobile nav group to hidden outside its breakpoint", () => {
    const navRules = displayRules("app-mobile-nav");
    const defaults = navRules.filter((rule) => !rule.media);
    assert.equal(
      defaults.length,
      1,
      `${defaults.length} top-level rules set display on .app-mobile-nav; exactly one may, and it must hide the group`,
    );
    assert.equal(
      displayOf(defaults[0]),
      "none",
      `the top-level .app-mobile-nav rule sets display:${displayOf(defaults[0])}; the group must default to hidden`,
    );

    // Cascade, which no source-text test can see unless someone does the arithmetic:
    // `.app-mobile-nav { display: none }` and the in-block `display: flex` have the
    // same specificity, so whichever appears LAST in the file wins inside the media
    // range. A second `display: none` anywhere below the block therefore blanks
    // mobile navigation at every width while every other assertion in this file
    // stays green — cardinality first, then order, because an order-only check
    // inspects whichever default it finds first and misses a duplicate appended at
    // the end of the file.
    const showing = navRules.filter((rule) => rule.media);
    assert.equal(
      showing.length,
      1,
      `${showing.length} media rules set .app-mobile-nav's display; exactly one may, or two ranges fight ` +
        "and the later one in the file decides",
    );
    assert.ok(
      defaults[0].start < showing[0].start,
      `the top-level .app-mobile-nav default sits at offset ${defaults[0].start} and the rule that re-shows it at ` +
        `${showing[0].start}: equal specificity means the later rule wins, so the default must precede it ` +
        "or the hamburger and mobile brand disappear on phones",
    );
    const lastNavRule = navRules.at(-1);
    assert.equal(
      lastNavRule,
      showing[0],
      `the last .app-mobile-nav rule in the file is "${lastNavRule.selector}" at offset ${lastNavRule.start}, ` +
        "which sets the cascade's final answer inside the media range; nothing may re-hide the group after the block",
    );
  });

  it("gates both mobile-only header elements by the shared class, not by a utility", () => {
    const toggleHost = header.match(
      /<div className="([^"]*)">\s*<MobileAppMenu/,
    );
    assert.ok(toggleHost, "cannot find the <div> that wraps <MobileAppMenu>");
    const brand = [...header.matchAll(/<Link\b([^>]*)>/g)].find((m) =>
      m[1].includes('href="/"'),
    );
    assert.ok(brand, 'cannot find the <Link href="/"> in app-header.tsx');
    const brandClass = brand[1].match(/className="([^"]*)"/);
    assert.ok(
      brandClass,
      "the mobile brand <Link> has no static className to pin",
    );

    for (const [name, cls] of [
      ["menu toggle host", toggleHost[1]],
      ["mobile brand link", brandClass[1]],
    ]) {
      assert.ok(
        hasGate(cls),
        `${name} is not gated by the .app-mobile-nav class`,
      );
      assert.deepEqual(
        baseDisplayOf(cls),
        [],
        `${name} carries base display utilities (${baseDisplayOf(cls)}); display is owned by .app-mobile-nav`,
      );
      assert.ok(
        !breakpointHidden(cls),
        `${name} still hides itself at a Tailwind breakpoint`,
      );
      assert.ok(
        !maxVariant(cls),
        `${name} uses a max-* variant instead of the shared class`,
      );
    }

    // The gate hides whatever carries it above the nav breakpoint, so a stray third
    // use can blank a whole region. Pin its cardinality, not only its presence.
    const uses = (source) =>
      (source.match(/app-mobile-nav(?![\w-])/g) ?? []).length;
    assert.equal(
      uses(header),
      2,
      `only the toggle host and the brand link may carry the gate (found ${uses(header)})`,
    );
    assert.equal(
      uses(menu),
      0,
      "the menu panel is inside the gated host; it must not gate itself",
    );
    assert.equal(
      uses(shell),
      0,
      "the app shell must not carry the mobile nav gate",
    );
  });

  it("lets the overlay scrim inherit the gate from its ancestor", () => {
    const scrim = menu.match(
      /<div\b([^>]*?)onClick=\{\(\) => setIsOpen\(false\)\}/,
    );
    assert.ok(scrim, "cannot find the scrim <div> in mobile-app-menu.tsx");
    const cls = scrim[1].match(/className="([^"]*)"/);
    assert.ok(cls, "the scrim has no static className to pin");
    // Token membership, not the "fixed inset-0 z-70" substring: a reorder of the
    // scrim's classes changes nothing about the overlay but breaks a conjunction grep.
    for (const token of ["fixed", "inset-0", "z-70"]) {
      assert.ok(cls[1].split(/\s+/).includes(token), `the scrim lost ${token}`);
    }
    assert.ok(
      !breakpointHidden(cls[1]),
      "the scrim still carries a breakpoint utility",
    );
    assert.deepEqual(
      baseDisplayOf(cls[1]),
      [],
      "the scrim sets its own display",
    );
  });

  it("keeps the live shell rules that sit beside the dead ones", () => {
    const shellBlocks = displayRules("app-shell").filter(
      (rule) => displayOf(rule) === "block",
    );
    assert.equal(
      shellBlocks.length,
      1,
      `${shellBlocks.length} rules set .app-shell to display:block; the nav switch depends on there being exactly one`,
    );
    // Selected by the query it must satisfy, not by whichever block mentions
    // .app-shell first: an unrelated earlier `@media (max-width: 40rem)` block that
    // happens to touch .app-shell would otherwise make these assertions pin the
    // wrong block, or fail for a reason that has nothing to do with the nav switch.
    assert.match(
      shellBlocks[0].media ?? "",
      /max-width:\s*56rem/,
      `.app-shell stops being a grid under "(${shellBlocks[0].media})"; it must switch in the nav block`,
    );
    const sidebarHiders = displayRules("app-sidebar").filter(
      (rule) => displayOf(rule) === "none",
    );
    assert.equal(
      sidebarHiders.length,
      1,
      `${sidebarHiders.length} rules hide .app-sidebar; the nav switch must live in a single rule`,
    );
    assert.equal(
      sidebarHiders[0].media,
      shellBlocks[0].media,
      "the sidebar hides under a different query than the shell stops being a grid",
    );
    // Safe only because nothing sets display on the dashboard variant: the general
    // .app-sidebar rule then hides both shells. If a display ever returns there, the
    // dashboard keeps a visible sidebar while the hamburger gate says desktop, and
    // the phone gets two navigations. Read from parsed rules rather than a literal
    // `.app-shell-dashboard .app-sidebar {`: the file writes compound selectors over
    // two lines elsewhere (`.app-shell-dashboard\n  .app-sidebar {`), and a
    // one-space-tolerant regex silently matches nothing on a reflowed rule.
    const dashboardSidebar = sidebarHiders
      .concat(displayRules("app-sidebar"))
      .filter((rule) => rule.selector.includes("app-shell-dashboard"));
    assert.deepEqual(
      dashboardSidebar.map(
        (rule) => `${rule.selector} { display: ${displayOf(rule)} }`,
      ),
      [],
      ".app-shell-dashboard .app-sidebar sets display; it needs its own nav breakpoint rule",
    );
  });

  it("leaves the viewport as the containing block for the fixed overlay", () => {
    // `backdrop-filter` is decorative and it is also a layout hazard: any non-none
    // backdrop-filter/filter/transform/perspective, `contain: layout|paint`, or a
    // container-type other than normal turns the element into the containing block
    // for its fixed-position descendants. The scrim and the panel are both
    // `position: fixed` and both render inside <header>, so one such declaration on
    // an ancestor silently rewrites `inset-0` from "the viewport" to "the header's
    // 64px box" — outside-tap dismissal stops working and nothing else in this file
    // notices. Measured in Chrome: scrim height 72px with the property, 100% of the
    // viewport without it. Vendor prefixes are matched because Safari honours
    // -webkit-backdrop-filter on its own, and Safari is the phone this branch ships.
    const ancestors = [
      "app-sticky-header",
      "app-mobile-nav",
      "app-mobile-menu",
      "app-shell",
      "app-shell-dashboard",
      "app-shell-main",
    ];
    const offenders = DOC.rules
      .filter((rule) => {
        const isAncestor =
          /(^|,)\s*(?:html|body)(?:\s*[,{:]|\s*,)/.test(rule.selector) ||
          ancestors.some((cls) => stylesClass(rule.selector, cls));
        if (!isAncestor) return false;
        for (const prop of [
          "(?:-webkit-|-moz-)?backdrop-filter",
          "(?:-webkit-|-moz-)?filter",
          "(?:-webkit-|-moz-)?transform",
          "perspective",
        ]) {
          const value = declares(rule.body, prop);
          if (value && value !== "none") return true;
        }
        const containerType = declares(rule.body, "container-type");
        if (containerType && containerType !== "normal") return true;
        const contain = declares(rule.body, "contain");
        if (contain && /\b(layout|paint|strict|content)\b/.test(contain)) {
          return true;
        }
        const willChange = declares(rule.body, "will-change");
        return Boolean(
          willChange &&
            /backdrop-filter|filter|transform|perspective|contain/.test(
              willChange,
            ),
        );
      })
      .map((rule) => `${rule.selector} { ${rule.media || "top level"} }`);
    assert.deepEqual(
      offenders,
      [],
      `an ancestor of the fixed mobile overlay creates a containing block, so the scrim ` +
        `covers that box instead of the viewport: ${offenders.join(" | ")}`,
    );
  });

  it("drops the never-used mobile header rules and keeps the live brand rules", () => {
    assert.doesNotMatch(
      css,
      /\.app-mobile-header/,
      ".app-mobile-header rules are still present",
    );
    assert.doesNotMatch(
      css,
      /\.app-mobile-actions/,
      ".app-mobile-actions rules are still present",
    );
    for (const live of [
      ".app-brand",
      ".app-brand-copy",
      ".app-brand-name",
      ".app-brand-slogan",
      ".app-brand-logo",
      ".app-signout-form",
      ".app-menu-toggle",
      ".app-menu-icon",
      ".app-mobile-menu",
      ".app-mobile-menu-panel",
    ]) {
      assert.ok(
        new RegExp(`^${live.split(".").join("\\.")}\\s*\\{`, "m").test(css),
        `the live rule ${live} was deleted along with the dead ones`,
      );
    }
  });
});
