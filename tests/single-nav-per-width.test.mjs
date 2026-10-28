import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { declares, parseCss, rulesFor } from "./helpers/css-rules.mjs";

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

/**
 * The elements still open at `to`, walking JSX from `from` — that is, exactly the
 * ancestors of whatever sits at `to`.
 *
 * Openings and closings are tracked with a stack rather than a regex so the chain is
 * read from the markup instead of typed into the test. An attribute value or `{…}`
 * expression may hold anything, so both are walked over, not through.
 */
function ancestorsTo(source, from, to) {
  const stack = [];
  let i = from;
  while (i < to) {
    if (source[i] !== "<") {
      i += 1;
      continue;
    }
    if (source.startsWith("</", i)) {
      const closed = /^<\/([\w.-]*)/.exec(source.slice(i));
      if (closed !== null && stack.at(-1)?.tag === closed[1]) stack.pop();
      i += 2;
      continue;
    }
    const named = /^<([a-zA-Z][\w.-]*)/.exec(source.slice(i));
    if (named === null) {
      i += 1; // `<>`, `</>`, or `{/* … */}`
      continue;
    }
    const tag = named[1];
    let j = i + tag.length + 1;
    for (; j < source.length; j += 1) {
      const quote = source[j];
      if (quote === '"' || quote === "'") {
        j += 1;
        while (j < source.length && source[j] !== quote) j += 1;
      } else if (quote === "{") {
        const close = source.indexOf("}", j);
        j = close === -1 ? source.length : close;
      } else if (quote === ">") break;
    }
    if (source[j - 1] !== "/") {
      stack.push({ tag, attrs: source.slice(i + tag.length + 1, j) });
    }
    i = j + 1;
  }
  return stack;
}

/** The className text of a JSX step, whether it is a string or a template literal. */
function stepClassText({ attrs }) {
  const literal = attrs.match(/(?:^|\s)className="([^"]*)"/);
  if (literal !== null) return literal[1];
  const template = attrs.match(/(?:^|\s)className=\{\s*`([^`]*)`/);
  if (template !== null) return template[1];
  const expression = attrs.match(/(?:^|\s)className=\{([^}]*)\}/);
  return expression === null ? "" : expression[1];
}

/**
 * The DOM path from `<body>` down to the fixed overlay, as shipped.
 *
 * The guard that keeps the scrim covering the viewport used to read a hand-typed list
 * of class names, so it checked the list and not the page: inserting a wrapper `<div>`
 * in app-header.tsx, renaming one of these classes, or putting `backdrop-blur-sm` on
 * the middle div of the chain all stayed green, because nothing tied the list to the
 * markup. Deriving it from the JSX means the chain the guard reads grows when the
 * markup grows, and the assertions in the test below fail loudly when it shrinks.
 */
function overlayPath() {
  const shellRoot = shell.indexOf("<div className={`app-shell");
  const appHeader = shell.indexOf("<AppHeader", shellRoot);
  assert.ok(
    shellRoot !== -1,
    "app-shell.tsx no longer opens with the app-shell <div>",
  );
  assert.ok(
    appHeader !== -1,
    "app-shell.tsx no longer renders <AppHeader> inside the shell",
  );
  const headerOpen = header.indexOf('<header className="app-sticky-header">');
  const menuCall = header.indexOf("<MobileAppMenu", headerOpen);
  assert.ok(
    headerOpen !== -1,
    'app-header.tsx no longer opens with <header className="app-sticky-header">',
  );
  assert.ok(
    menuCall !== -1,
    "app-header.tsx no longer renders <MobileAppMenu> inside the header",
  );
  const menuRoot = menu.indexOf('<div className="app-mobile-menu">');
  assert.ok(
    menuRoot !== -1,
    'mobile-app-menu.tsx no longer renders its overlay inside <div className="app-mobile-menu">',
  );
  return [
    ...ancestorsTo(shell, shellRoot, appHeader),
    ...ancestorsTo(header, headerOpen, menuCall),
    { tag: "div", attrs: 'className="app-mobile-menu"' },
  ];
}

/** The classes this text styles elements by — the stylesheet's own `app-` namespace. */
const cssClasses = (text) => text.match(/app-[\w-]+/g) ?? [];

/**
 * Tailwind utilities that turn an element into the containing block of its fixed
 * descendants. The filter family and the transform family each do it; so do the
 * individual `rotate`/`scale`/`translate` properties, which is where v4 puts the
 * `rotate-*`/`scale-*`/`translate-*` utilities.
 */
const HAZARD_UTILITY =
  /^(?:[\w-]+:)*(?:backdrop-blur|blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|rotate|scale|translate|transform|will-change|content-visibility|contain|container)(?:$|[-/])/;

/** Declarations that create a containing block, and the values that do not. */
const hazardOf = (body) => {
  for (const prop of [
    "(?:-webkit-|-moz-)?backdrop-filter",
    "(?:-webkit-|-moz-)?filter",
    "(?:-webkit-|-moz-)?transform",
    "perspective",
    "scale",
    "rotate",
    "translate",
    "container-type",
    "content-visibility",
    "animation",
    "will-change",
    "contain",
  ]) {
    const value = declares(body, prop);
    if (value === null || value === "none" || value === "normal") continue;
    if (prop === "content-visibility" && value === "visible") continue;
    if (
      prop === "will-change" &&
      !/backdrop-filter|filter|transform|perspective|contain|scale|rotate|translate|content-visibility|animation/.test(
        value,
      )
    )
      continue;
    if (
      prop === "contain" &&
      !/\b(layout|paint|strict|content|size)\b/.test(value)
    )
      continue;
    return `${prop.replace(/(?:\(\?:[^)]*\)\?)/g, "")}: ${value}`;
  }
  return null;
};

/** The tag a compound selector is anchored to: `div`, `header`, `*`, `:root`, or null. */
const compoundHead = (compound) => {
  const bare = compound.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
  const match = /^(?::root|\*|[a-zA-Z][\w-]*)/.exec(bare);
  return match === null ? null : match[0];
};

/**
 * True when this selector can put a declaration on an element of the overlay's chain.
 *
 * Three shapes reach the chain: a rule whose subject carries one of its classes, a
 * rule anchored to `*`, `:root`, `html` or `body` (which styles every element, path
 * included, however qualified: `body.has-shell`, `html[data-theme]`), and a rule whose
 * subject is a bare path tag hanging off a path class — `.app-sticky-header > div` is
 * how someone would blur the header's inner row without naming it. A rule that reaches
 * a path tag through an intermediate class (`.app-shell-dashboard .dues-page > header`)
 * styles a page header, not the app header, so it stays out.
 */
const reachesPath = (selector, pathClasses, pathTags) => {
  for (const alternative of selector.split(",")) {
    const parts = alternative
      .trim()
      .split(/[\s>+~]+/)
      .filter(Boolean);
    if (parts.length === 0) continue;
    const subject = parts.at(-1).replace(/::[\w-]+/g, "");
    const head = compoundHead(subject);
    if (cssClasses(subject).some((cls) => pathClasses.has(cls))) return true;
    if (head === null) continue;
    if (head === ":root" || head === "html" || head === "body") {
      if (parts.length === 1) return true;
      continue;
    }
    const isPathTag = head === "*" || pathTags.has(head);
    if (!isPathTag) continue;
    const parent = parts.at(-2);
    if (
      parts.length === 1 ||
      (parent !== undefined &&
        cssClasses(parent).some((cls) => pathClasses.has(cls)))
    ) {
      return true;
    }
  }
  return false;
};

/** The rule that gives `className` its own box: that selector, exactly, at top level. */
const baseRule = (className) =>
  rulesFor(DOC, className).find(
    (rule) => rule.selector === `.${className}` && rule.media === "",
  );

/** The highest z-index this class is given anywhere in the file, or null. */
const topZOf = (className) => {
  const values = rulesFor(DOC, className)
    .map((rule) => declares(rule.body, "z-index"))
    .filter((value) => value !== null && Number.isFinite(Number(value)))
    .map(Number);
  return values.length === 0 ? null : Math.max(...values);
};

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
      (rule) => displayOf(rule) === "flex",
    );
    // The value, not merely "something other than none": the hamburger host lays its
    // children out with `items-center`, which is a flex-only alignment, and the brand
    // link relies on the same row. A rule that re-showed the group as `display: block`
    // would pass a not-none check while stacking the toggle over the brand.
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
        navShown.some((rule) => rule.mediaAt === hider.mediaAt),
        `the sidebar hides under "(${hider.media})" but no rule re-shows .app-mobile-nav as flex in the same @media block`,
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
      sidebarHiders[0].mediaAt,
      shellBlocks[0].mediaAt,
      `the sidebar hides at offset ${sidebarHiders[0].mediaAt} and the shell stops being a grid at ` +
        `${shellBlocks[0].mediaAt}: the same query text in a different @media block puts the two switches ` +
        "in different cascade neighbourhoods, so a later rule can undo one of them",
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
    // backdrop-filter/filter/transform/perspective, the individual transform properties
    // (rotate/scale/translate), `content-visibility`, `animation`, `contain: layout|paint`,
    // a `will-change` naming one of them, or a container-type other than normal turns the
    // element into the containing block for its fixed-position descendants. The scrim and
    // the panel are both `position: fixed` and both render inside <header>, so one such
    // declaration on an ancestor silently rewrites `inset-0` from "the viewport" to "the
    // header's 64px box" — outside-tap dismissal stops working and nothing else in this
    // file notices. Measured in Chrome: scrim height 72px with the property, 100% of the
    // viewport without it. Vendor prefixes are matched because Safari honours
    // -webkit-backdrop-filter on its own, and Safari is the phone this branch ships.
    const path = overlayPath();
    const pathClasses = new Set(
      path.flatMap((step) => cssClasses(stepClassText(step))),
    );
    const pathTags = new Set(path.map((step) => step.tag));
    const chain = path
      .map((step) => `${step.tag}.${cssClasses(stepClassText(step)).join(".")}`)
      .join(" > ");
    assert.ok(
      path.length >= 6,
      `the overlay's ancestor chain resolved to ${path.length} elements (${chain}); the shipped ` +
        "chain is seven deep from <body>, so a shorter answer means the JSX walk lost a step " +
        "and the guard is reading part of the page",
    );
    for (const cls of [
      "app-shell",
      "app-shell-main",
      "app-sticky-header",
      "app-mobile-nav",
      "app-mobile-menu",
    ]) {
      assert.ok(
        pathClasses.has(cls),
        `.${cls} is not on the derived chain (${chain}) — either the overlay moved, or it was ` +
          "renamed and this guard is now checking a list of elements that no longer exist",
      );
    }

    const offenders = DOC.rules
      .filter((rule) => reachesPath(rule.selector, pathClasses, pathTags))
      .map((rule) => ({ rule, hazard: hazardOf(rule.body) }))
      .filter(({ hazard }) => hazard !== null)
      .map(
        ({ rule, hazard }) =>
          `${rule.media ? `(${rule.media}) ` : ""}${rule.selector} { ${hazard} }`,
      );

    // The other way a path element grows a containing block is the class list itself:
    // `backdrop-blur-sm` on the header's inner row is one token, no CSS edit, and no
    // rule for a CSS scan to find. The utilities are read from the same JSX walk.
    const utilities = path.flatMap((step) =>
      stepClassText(step)
        .split(/\s+/)
        .filter(
          (token) =>
            token !== "" &&
            !token.startsWith("app-") &&
            HAZARD_UTILITY.test(token),
        )
        .map(
          (token) =>
            `${step.tag}[${stepClassText(step).trim()}] carries ${token}, which creates a containing block`,
        ),
    );

    assert.deepEqual(
      [...offenders, ...utilities],
      [],
      `an ancestor of the fixed mobile overlay creates a containing block, so the scrim ` +
        `covers that box instead of the viewport: ${[...offenders, ...utilities].join(" | ")}. ` +
        "Drop the declaration, or scope it to an element outside this chain.",
    );
  });

  it("stacks the overlay above the sticky header it has to cover", () => {
    // Every other assertion in this file asks whether the overlay is the right size. A
    // size only matters if the overlay is on top: the header is `position: sticky` with
    // its own z-index, so lowering it below the scrim, or the panel below the scrim,
    // paints the toolbar over the backdrop the user is meant to tap to dismiss — and no
    // geometry check can see it. Pinned as an ordering, in the cascade's own units,
    // because three magic numbers copied from the file would say nothing about which is
    // meant to be on top.
    const headerRule = baseRule("app-sticky-header");
    const panelRule = baseRule("app-mobile-menu-panel");
    assert.ok(
      headerRule !== undefined && panelRule !== undefined,
      "the header or the menu panel lost its base rule",
    );
    const scrimClass = menu.match(
      /className="([^"]*\bfixed\b[^"]*\binset-0\b[^"]*)"/,
    );
    assert.ok(
      scrimClass !== null,
      "cannot find the scrim's fixed classes in mobile-app-menu.tsx",
    );
    const scrimZ = Number(
      /(?:^|\s)z-(\d+)(?:\s|$)/.exec(scrimClass[1])?.[1] ?? "NaN",
    );
    const headerZ = Number(declares(headerRule.body, "z-index"));
    const panelZ = Number(declares(panelRule.body, "z-index"));
    assert.ok(
      [headerZ, scrimZ, panelZ].every(Number.isFinite),
      `the stacking resolves to ${headerZ}/${scrimZ}/${panelZ}; the header's and panel's z-index come ` +
        "from globals.css and the scrim's from its z-* utility, and one of them is gone",
    );
    assert.ok(
      headerZ < scrimZ,
      `the scrim is z-${scrimZ} and the sticky header is z-${headerZ}: the header paints above the ` +
        "backdrop, so the menu cannot be dismissed by tapping outside it",
    );
    assert.ok(
      scrimZ < panelZ,
      `the panel is z-${panelZ} and its scrim is z-${scrimZ}: the backdrop paints over the menu it ` +
        "is meant to dim",
    );
  });

  it("keeps the sticky header above the page furniture that scrolls under it", () => {
    // The scrim pin above only says what has to cover what when the menu is open. The
    // header's own number has a second job: these are the sticky strips inside the page,
    // and a header lowered to meet them stops floating over the tab strip it is meant to
    // sit above — which is the regression a `z-index: 40` to `5` edit ships while every
    // not-none check stays green. Read as an ordering against the highest of them, so
    // the pin says why the number exists rather than freezing the number.
    const headerRule = baseRule("app-sticky-header");
    assert.ok(
      headerRule !== undefined,
      "the sticky header lost its base rule, so its stacking is undefined",
    );
    const headerZ = Number(declares(headerRule.body, "z-index"));
    const furniture = [
      "event-finance-tabs",
      "slk-event-sidebar",
      "slk-event-scrim",
    ];
    const stacked = furniture
      .map((cls) => ({ cls, z: topZOf(cls) }))
      .filter(({ z }) => z !== null);
    assert.equal(
      stacked.length,
      furniture.length,
      `only ${stacked.map(({ cls }) => `.${cls}`).join(", ")} of the three in-page sticky strips resolve ` +
        "to a number; a z-index that cannot be read is a z-index that cannot be pinned",
    );
    for (const { cls, z } of stacked) {
      assert.ok(
        headerZ > z,
        `.${cls} sits at z-${z} and the sticky header at z-${headerZ}: the page strip paints over the ` +
          "toolbar it is meant to scroll beneath",
      );
    }
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
