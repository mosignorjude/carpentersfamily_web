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

describe("dashboard tab strip", () => {
  it("meets the 44px target floor and 8px separation", () => {
    assert.match(source, /min-h-\[44px\]/);
    assert.doesNotMatch(source, /min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/);
    assert.match(source, /gap-2 p-1\.5/);
  });

  it("scrolls as a labelled focusable region", () => {
    assert.match(source, /<TableScroll[^>]*label="Dashboard sections"/);
    assert.match(source, /from "@\/components\/ui\/table-scroll"/);
    // The strip only overflows because the pill row is max-content wide.
    assert.match(source, /flex w-max items-center/);
  });

  it("announces the active tab as current, not only as green", () => {
    assert.match(source, /aria-current=\{isActive \? "page" : undefined\}/);
  });

  it("tells phone users the strip scrolls, with a mechanism that can fail closed", () => {
    assert.match(source, /Swipe right for more sections/);
    // PRE-FLIGHT CORRECTION (see below): the hint must be the proven `sm:hidden`
    // spelling. A base `hidden` is the fail-open shape this pin exists to forbid.
    // Anchored backwards from the copy, and tolerant of Biome wrapping the
    // attributes onto their own lines (there are zero `<p className="` in this
    // file today, and a same-line regex would break the moment the formatter
    // re-wraps it — Task 4's lesson).
    const hintIndex = source.indexOf("Swipe right for more sections");
    assert.notEqual(hintIndex, -1, "the phone hint copy must exist");
    const hintTag = source
      .slice(0, hintIndex)
      .match(/<p\s+(?:[^>]*?)className="([^"]*)"\s*>[\s]*$/);
    assert.ok(
      hintTag,
      "the hint must be a <p> with a static className immediately around its copy",
    );
    assert.match(hintTag[1], /\bsm:hidden\b/);
    assert.doesNotMatch(hintTag[1], /(^|\s)hidden(\s|$)/);
    assert.doesNotMatch(source, /\bmax-(sm|md|lg|xl):/);
  });
});
