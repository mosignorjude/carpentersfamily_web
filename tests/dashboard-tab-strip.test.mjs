import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL(
    "../src/components/events/dashboard/event-dashboard-view.tsx",
    import.meta.url,
  ),
  "utf8",
);

// ---------------------------------------------------------------------------
// Constants. Every helper below is a pure function and is CALLED INSIDE an
// `it`: a module-level `assert` throws while the file loads and collapses
// eight crisp failures into one opaque one.
// ---------------------------------------------------------------------------

/** DESIGN.md:25, first clause — "Inputs and buttons are at least 48px high".
 *  The strip's pills are `<button>`s, so this is the pill's own floor. */
const PILL_FLOOR_PX = 48;

/** DESIGN.md:25, second clause — "interactive targets must never fall below
 *  44px". Links and hand-rolled controls in the same header card live here. */
const TARGET_FLOOR_PX = 44;

/** DESIGN.md:19 — supporting labels are 13-14px. `text-xs` (12px) is below the
 *  range this task deliberately moved the pill labels into. */
const LABEL_MIN_PX = 13;

// Tailwind v4 scale math. `--spacing` defaults to `.25rem` and this repo never
// overrides it (`grep -n -- '--spacing' src/app/globals.css` → no match; the
// chunk this route loads emits `--spacing:.25rem`), so `min-h-9` is 9 x 4 = 36px
// and `p-1.5` is 6px. Parsing the scale form is what stops a floor from hiding
// in a spelling the old token filter never looked at.
const SPACING_PX = 4;
const REM_PX = 16;

// `min-h-0` (the flex-overflow idiom, 4 uses in src) and `min-h-full` (layout
// fill, 8 uses) are not hand-rolled heights. The file-wide sweep tolerates them
// — a wrapper's `min-h-full` is not a DESIGN.md violation — but the
// element-scoped sweeps do NOT accept one as an interactive target's floor,
// because it measures nothing. An unresolvable token (`min-h-[calc(…)]`,
// `min-h-[50%]`) is reported, never skipped: "cannot measure it" is not
// "it is big enough".
const LAYOUT_MIN_H = new Set([
  "0",
  "full",
  "screen",
  "svh",
  "lvh",
  "dvh",
  "small",
  "large",
  "dynamic",
  "auto",
  "none",
  "min-content",
  "max-content",
  "fit-content",
]);

const NAMED_TEXT_SIZES_PX = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };

// ---------------------------------------------------------------------------
// Source-scanning helpers.
// ---------------------------------------------------------------------------

/**
 * The JSX opening tag starting at `at`, scanned rather than regexed. A `>` is
 * legal inside an attribute value (`onClick={() => selectTab(id)}`), so the tag
 * ends at the first `>` that is outside a quoted string and outside a `{…}`
 * expression. Returns null when the tag never closes.
 */
function openingTag(src, at) {
  let depth = 0;
  let quote = null;
  for (let i = at + 1; i < src.length; i += 1) {
    const char = src[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

/** A tag's own `className` value as one space-normalised string, or null when
 *  the class list is not a static literal the suite can read. */
function classListOf(tag) {
  const match =
    /className=(?:"([^"]*)"|\{\s*"([^"]*)"\s*\}|\{\s*`([^`]*)`\s*\})/.exec(tag);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3]).replace(/\s+/g, " ").trim();
}

/** Resolve one Tailwind spacing-ish suffix (`[12px]`, `[.75rem]`, `2`, `1.5`)
 *  to px. Undefined means "this spelling is not a number I can compare". */
function resolveSpacing(suffix) {
  const bracket = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(suffix);
  if (bracket) {
    return Number(bracket[1]) * (bracket[2] === "rem" ? REM_PX : 1);
  }
  if (/^\d+(?:\.\d+)?$/.test(suffix)) return Number(suffix) * SPACING_PX;
  return undefined;
}

/**
 * Every `min-h-` token in a class list, unit-aware:
 * `min-h-[NNpx]`, `min-h-[N.Nrem]` and the bare scale form `min-h-N` (4px/step).
 */
function minHeightTokens(classList) {
  const floors = [];
  const layout = [];
  const unknown = [];
  for (const match of classList.matchAll(
    /(?:^|[\s"'`{])min-h-(\[[^\]]*\]|[\w.%-]+)/g,
  )) {
    const suffix = match[1];
    const token = `min-h-${suffix}`;
    const numeric =
      /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.test(suffix) ||
      /^\d+(\.\d+)?$/.test(suffix);
    if (numeric) {
      floors.push({ token, px: resolveSpacing(suffix) });
    } else if (LAYOUT_MIN_H.has(suffix)) {
      layout.push(token);
    } else {
      unknown.push(token);
    }
  }
  return { floors, layout, unknown };
}

/** Base (unvariant) `text-*` sizes in a class list, resolved to px. A variant
 *  like `sm:text-xs` is not the element's base size, so it is not collected. */
function fontSizes(classList) {
  const sizes = [];
  for (const m of classList.matchAll(
    /(?:^|\s)text-(xs|sm|base|lg|xl)(?=\s|$)/g,
  )) {
    sizes.push({ token: m[0].trim(), px: NAMED_TEXT_SIZES_PX[m[1]] });
  }
  for (const m of classList.matchAll(
    /(?:^|\s)text-\[(\d+(?:\.\d+)?)(px|rem)\](?=\s|$)/g,
  )) {
    sizes.push({
      token: m[0].trim(),
      px: Number(m[1]) * (m[2] === "rem" ? REM_PX : 1),
    });
  }
  return sizes;
}

/** The opening tags that could contain `index`, nearest (innermost) first.
 *  Closing and self-closing tags are skipped, so the caller learns what the
 *  content actually lives in whatever the element is spelled as. */
function enclosingTags(src, index, lookback = 500) {
  const windowStart = Math.max(0, index - lookback);
  const window = src.slice(windowStart, index);
  const found = [];
  for (
    let i = window.lastIndexOf("<");
    i > -1;
    i = window.lastIndexOf("<", i - 1)
  ) {
    if (window[i + 1] === "/" || window[i + 1] === "!") continue;
    const tag = openingTag(window, i);
    if (!tag || tag.endsWith("/>")) continue;
    found.push({ index: windowStart + i, tag });
  }
  return found;
}

/** The pill strip, sliced so that nothing outside it can satisfy a pin.
 *  `tabs.map(` … the `</TableScroll>` that closes it. */
function stripSlice(src) {
  const start = src.indexOf("tabs.map(");
  assert.notEqual(
    start,
    -1,
    "the pill row is no longer rendered from tabs.map()",
  );
  const end = src.indexOf("</TableScroll>", start);
  assert.ok(
    end > start,
    "tabs.map() is not inside a <TableScroll> region: the strip moved out of the " +
      "scroll container this suite pins, so the slice has no end",
  );
  return { start, end, slice: src.slice(start, end) };
}

/** The pill `<button>`'s own opening tag, its own element region (through the
 *  first self-closing child, i.e. past `<Icon … />`) and its own class list. */
function pillElement(src) {
  const { slice } = stripSlice(src);
  const at = slice.indexOf("<button");
  assert.ok(
    at >= 0,
    "no <button> inside tabs.map(): the pill is no longer a hand-rolled button in " +
      "this file, so its floor lives elsewhere and this file-scoped suite cannot pin it",
  );
  const tag = openingTag(slice, at);
  assert.ok(tag, "the pill's <button> tag never closes");
  const closeAt = slice.indexOf("/>", at);
  const buttonEnd = slice.indexOf("</button>", at);
  assert.ok(
    closeAt > at && (buttonEnd === -1 || closeAt < buttonEnd),
    "no self-closing child found inside the pill's own element",
  );
  return {
    tag,
    element: slice.slice(at, closeAt + 2),
    className: classListOf(tag),
  };
}

/** 1-based line number of a character offset, for failure messages. */
function lineAt(index) {
  return source.slice(0, index).split("\n").length;
}

// ---------------------------------------------------------------------------

describe("dashboard tab strip", () => {
  it("floors the pill's own height at 48px, parsed from the pill", () => {
    // Element-scoped and unit-aware on purpose. `assert.match(source,
    // /min-h-\[44px\]/)` — the shipped form — was measured green with the
    // pill's floor deleted outright, with `min-h-[16px]`, with `min-h-[1.75rem]`
    // and with `min-h-9`.
    const pill = pillElement(source);
    assert.ok(
      pill.className,
      "the pill's className is not a static literal, so its height cannot be read",
    );
    const { floors, layout, unknown } = minHeightTokens(pill.className);
    assert.deepEqual(
      unknown,
      [],
      `the pill carries a height floor this suite cannot measure: ${unknown.join(", ")}`,
    );
    assert.deepEqual(
      layout,
      [],
      `the pill's height is set by a layout token (${layout.join(", ")}), not a floor`,
    );
    // Task 3's second-owner trap: two floors on one element is not one floor.
    assert.equal(
      floors.length,
      1,
      `the pill must own exactly one height floor, found ${floors.length} ` +
        `(${floors.map((f) => f.token).join(", ")})`,
    );
    assert.ok(
      floors[0].px >= PILL_FLOOR_PX,
      `the pill's floor is ${floors[0].px}px (${floors[0].token}) — DESIGN.md:25 ` +
        `"Inputs and buttons are at least 48px high"`,
    );
  });

  it("keeps every measured height floor in the file at or above 44px", () => {
    const { floors, unknown } = minHeightTokens(source);
    assert.ok(floors.length > 0, "the file has no numeric height floor left");
    assert.deepEqual(
      unknown,
      [],
      `height floor(s) this suite cannot compare: ${unknown.join(", ")}`,
    );
    // `min-h-0` is the flex-overflow idiom (`flex-1 min-h-0 overflow-y-auto`,
    // 4 uses in src and the shape this plan's modal work keeps producing), not a
    // target floor, so the file-wide net lets it through. The element-scoped
    // blocks above and below do NOT: on an interactive target it is a floor of
    // 0px and they say so.
    const measured = floors.filter((floor) => floor.token !== "min-h-0");
    for (const floor of measured) {
      assert.ok(
        floor.px >= TARGET_FLOOR_PX,
        `${floor.token} resolves to ${floor.px}px, below DESIGN.md:25's 44px ` +
          `"interactive targets must never fall below" floor`,
      );
    }
    // Never-regress filter kept alongside the parse: it is the cheap net for
    // the 20-43px band in the spelling this file actually uses.
    assert.doesNotMatch(source, /min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/);
  });

  it("gives every interactive target its own parsed floor", () => {
    // A token sweep is blind to a control that owns no token at all — which is
    // exactly how the ~30px "Minutes & Attendance" link stayed invisible to the
    // shipped pins (I-1's delete-the-floor shape, live in the markup).
    const targets = [];
    for (const match of source.matchAll(
      /<(button|Link|input|select|textarea|a)(?=[\s/>])/g,
    )) {
      const tag = openingTag(source, match.index);
      assert.ok(
        tag,
        `the <${match[1]}> at line ${lineAt(match.index)} never closes`,
      );
      targets.push({ tag, element: match[1], line: lineAt(match.index) });
    }
    assert.ok(
      targets.length >= 6,
      `expected the header card's interactive targets, found ${targets.length}`,
    );
    for (const target of targets) {
      const className = classListOf(target.tag);
      assert.ok(
        className,
        `<${target.element}> at :${target.line} has no static className literal, ` +
          "so this suite cannot read its height",
      );
      const { floors, layout, unknown } = minHeightTokens(className);
      assert.deepEqual(
        unknown,
        [],
        `<${target.element}> at :${target.line} has an unmeasurable height floor: ` +
          `${unknown.join(", ")}`,
      );
      assert.equal(
        floors.length,
        1,
        `<${target.element}> at :${target.line} must own exactly one height floor; ` +
          `found ${floors.length} (${floors.map((f) => f.token).join(", ")})` +
          (layout.length ? `, plus layout tokens ${layout.join(", ")}` : ""),
      );
      assert.ok(
        floors[0].px >= TARGET_FLOOR_PX,
        `<${target.element}> at :${target.line} is floored at ${floors[0].px}px ` +
          `(${floors[0].token}); DESIGN.md:25 puts interactive targets at 44px or above`,
      );
    }
  });

  it("keeps the pill labels at supporting-label size, not text-xs", () => {
    // This task chose the text-xs -> text-sm bump and the width it costs. Left
    // unpinned, the next pass can revert it silently (measured green shipped).
    const pill = pillElement(source);
    assert.ok(pill.className, "the pill's className is not a static literal");
    const sizes = fontSizes(pill.className);
    assert.ok(
      sizes.length > 0,
      "the pill sets no base text size, so its label inherits the browser default",
    );
    for (const size of sizes) {
      assert.ok(
        size.px >= LABEL_MIN_PX,
        `the pill's ${size.token} is ${size.px}px; DESIGN.md:19 puts supporting ` +
          "labels at 13-14px and this strip is already at text-sm (14px)",
      );
    }
  });

  it("keeps the pill row max-content wide and separated enough to scroll", () => {
    const { start } = stripSlice(source);
    const wrappers = enclosingTags(source, start);
    assert.ok(
      wrappers.length > 0,
      "nothing wraps tabs.map(), so the pill row has no flex parent",
    );
    const row = wrappers[0];
    const className = classListOf(row.tag);
    assert.ok(
      className,
      "the pill row's className is not a static literal, so its shape cannot be read",
    );
    // Parsed, and order-blind: `gap-2 p-1.5` as a conjunction went RED for the
    // improvement `gap-3` and GREEN for a decoy element carrying the substring.
    const gaps = [
      ...className.matchAll(/(?:^|\s)gap(?:x|y)?-(\[[^\]]*\]|[\w.]+)(?=\s|$)/g),
    ].map((m) => ({ token: m[0].trim(), px: resolveSpacing(m[1]) }));
    const pads = [
      ...className.matchAll(/(?:^|\s)p(?:x|y)?-(\[[^\]]*\]|[\w.]+)(?=\s|$)/g),
    ].map((m) => ({ token: m[0].trim(), px: resolveSpacing(m[1]) }));
    const gapPx = Math.max(0, ...gaps.map((g) => g.px ?? 0));
    const padPx = Math.max(0, ...pads.map((p) => p.px ?? 0));
    assert.ok(
      gapPx >= 2 * SPACING_PX,
      `the pill row separates its pills by ${gapPx}px ` +
        `(${gaps.map((g) => g.token).join(", ") || "no gap token"}); the strip is ` +
        "8 tabs wide on a 360px viewport and 4px separation is what made it unreadable",
    );
    assert.ok(
      padPx >= 1.5 * SPACING_PX,
      `the pill row pads itself by ${padPx}px ` +
        `(${pads.map((p) => p.token).join(", ") || "no padding token"}); the row ` +
        "needs 6px so the pills' own focus ring is not clipped by the scroller",
    );
    assert.match(
      className,
      /(?:^|\s)(?:inline-)?flex(?:\s|$)/,
      `the pill row is not a flex container (${className.slice(0, 60)}), so gap ` +
        "does not apply to it",
    );
    assert.match(
      className,
      /(?:^|\s)w-max(?:\s|$)/,
      "the pill row is not max-content wide, so it cannot overflow the region and " +
        "the tabs past the fold stay undiscoverable",
    );
    assert.doesNotMatch(
      className,
      /(?:^|\s)max-w-/,
      "a max-width cap on the pill row cancels the overflow the scroll region exists to give",
    );
  });

  it("wraps the strip in a labelled scroll region", () => {
    const { start } = stripSlice(source);
    const tableAt = source.lastIndexOf("<TableScroll", start);
    assert.ok(tableAt >= 0, "the pill strip is not inside a <TableScroll>");
    const tag = openingTag(source, tableAt);
    assert.ok(tag, "the <TableScroll> tag never closes");
    assert.match(
      tag,
      /\blabel="Dashboard sections"/,
      "the scroll region lost its accessible name, so a phone user is dropped into " +
        "an unlabelled region",
    );
    // Deliberately NOT pinned: where TableScroll is imported from. Moving it to
    // the `@/components/ui` barrel is an internal refactor with no user-visible
    // consequence, and the shipped import-path assertion made it a two-file
    // change (R-6).
  });

  it("puts the current cue on the pill element, any accepted spelling", () => {
    const pill = pillElement(source);
    const match = /aria-current=(?:"([^"]*)"|\{([^{}]*)\})/.exec(pill.element);
    assert.ok(
      match,
      "the pill's own opening tag carries no aria-current — the shipped pin was " +
        'satisfied by "page" on the inner <span>, which is the accessibility bug',
    );
    const value = match[1] ?? match[2];
    assert.match(
      value,
      /["'](page|true)["']/,
      `aria-current=${value.trim()} is not a current-item spelling an AT announces ` +
        '("page" or "true"; the strip deep-links a ?tab= URL, so "page" is honest)',
    );
  });

  it("keeps the phone hint visible to sighted users below a breakpoint", () => {
    // The copy is pinned loosely (/more sections/i, not the full string) so a
    // wording fix is one file, not two. The breakpoint is pinned NUMERICALLY: the
    // property under test is the visibility OUTCOME, and accepting any of
    // sm/md/lg/xl as a spelling let `sm:hidden` — which drops the cue at 640px,
    // while the strip is still mid-scroll — pass every assertion in this block.
    const copyAt = source.search(/more sections/i);
    assert.notEqual(copyAt, -1, "the phone hint copy is gone from the file");
    const wrappers = enclosingTags(source, copyAt);
    assert.ok(
      wrappers.length > 0,
      "nothing wraps the hint copy, so no element owns its visibility",
    );
    const hint = wrappers[0];
    const className = classListOf(hint.tag);
    assert.ok(
      className,
      "the hint's className is not a static literal, so its visibility cannot be read",
    );

    // Tailwind v4's default `--breakpoint-*` scale in rem. `globals.css` declares
    // no overrides — its `@theme` block has no `--breakpoint-*` line — so these
    // are the widths the variants actually compile to.
    const BREAKPOINT_REM = { sm: 40, md: 48, lg: 64, xl: 80, "2xl": 96 };
    // The strip stops being phone-width when the shell switches to the
    // two-column layout, and that boundary is `@media (max-width: 56rem)` in
    // globals.css. A cue that switches off below it is gone while the tabs past
    // the fold are still undiscoverable, which is the defect this block exists
    // to catch.
    const HINT_MIN_BREAKPOINT_REM = 56;

    const hiddenAt = className
      .split(/\s+/)
      .filter((token) => /^[a-z0-9-]+:hidden$/.test(token))
      .map((token) => token.slice(0, token.indexOf(":")));
    assert.equal(
      hiddenAt.length,
      1,
      `the hint carries ${hiddenAt.length} breakpoint-conditional \`hidden\` tokens ` +
        `(found: ${hiddenAt.join(", ") || "none"}). Exactly one is required: zero means ` +
        "it shows at every width, and two mean a second variant re-shows it at some " +
        "width no reader can work out from this element",
    );
    const hintBreakpoint = BREAKPOINT_REM[hiddenAt[0]];
    assert.ok(
      hintBreakpoint !== undefined,
      `the hint hides at \`${hiddenAt[0]}:hidden\`, a variant whose width is not in the ` +
        "default Tailwind scale, so its visibility cannot be resolved against the " +
        "app's mobile boundary",
    );
    assert.ok(
      hintBreakpoint >= HINT_MIN_BREAKPOINT_REM,
      `the hint hides at ${hiddenAt[0]}:hidden = ${hintBreakpoint}rem, below the app's ` +
        `${HINT_MIN_BREAKPOINT_REM}rem mobile boundary: sighted phone and small-tablet ` +
        "users lose the swipe cue while the pill row still scrolls",
    );
    // The two guards that earn their keep: a base `hidden` is the fail-open
    // shape (it wins unless the variant lands), and `max-*:` is a variant this
    // codebase has never compiled for a consumer like this one.
    assert.doesNotMatch(
      className,
      /(?:^|\s)hidden(?:\s|$)/,
      "the hint carries a base `hidden`: that is the fail-open shape this pin exists " +
        "to forbid, because an uncompiled variant would leave it invisible on phones",
    );
    assert.doesNotMatch(
      className,
      /(?:^|\s)sr-only(?:\s|$)/,
      "the hint is `sr-only`: sighted phone users lose the cue that the strip " +
        "scrolls, which is the exact defect this block exists to catch",
    );
    assert.doesNotMatch(
      hint.tag,
      /aria-hidden/,
      "the hint is aria-hidden, so assistive tech loses the cue too — aria-hidden " +
        "is a live reflex in this codebase (38 uses in src)",
    );
    assert.doesNotMatch(source, /\bmax-(sm|md|lg|xl):/);
  });
});
