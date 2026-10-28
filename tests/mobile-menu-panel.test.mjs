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
  // The "\n." anchor is load-bearing: an unanchored search matches the
  // .app-mobile-menu-panel override inside @media (max-width: 48rem) first,
  // which legitimately does not carry overflow-y.
  const panel = ruleBody(css, "\n.app-mobile-menu-panel {");

  it("caps height with dvh plus the bottom safe area", () => {
    assert.match(panel, /max-height:[^;]*100dvh/);
    assert.match(panel, /max-height:[^;]*env\(safe-area-inset-bottom/);
  });

  it("scrolls its own overflow instead of spilling off-screen", () => {
    assert.match(panel, /overflow-y:\s*auto/);
    assert.match(panel, /overscroll-behavior:\s*contain/);
  });

  it("insets for notch and landscape safe areas", () => {
    assert.match(panel, /left:\s*max\([^;]*env\(safe-area-inset-left/);
    assert.match(panel, /padding-bottom:[^;]*env\(safe-area-inset-bottom/);
  });
});
