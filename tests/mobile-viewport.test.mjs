import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// SRC_ROOT lets the controller run this exact file against pre/post fixtures.
const ROOT = process.env.SRC_ROOT
  ? process.env.SRC_ROOT
  : fileURLToPath(new URL("..", import.meta.url));

const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

/**
 * The object literal of `export const <name>`, found by brace counting rather than
 * a regex over `[\s\S]*?`, so a nested object cannot truncate it. The flat
 * key/value readers below assume what Next's own types guarantee for `Viewport`:
 * scalar members. If a future task writes `themeColor: [{ media, color }]` for dark
 * mode, these readers return a nonsense value and the block REDs — loudly, rather
 * than passing on a value that was never parsed.
 */
function objectLiteralOf(src, name) {
  const declaration = `export const ${name}`;
  const at = src.indexOf(declaration);
  if (at === -1) return null;
  const brace = src.indexOf("{", at + declaration.length);
  if (brace === -1) return null;
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          annotation: src
            .slice(at + declaration.length, brace)
            .replace(/=\s*$/, "")
            .trim(),
          body: src.slice(brace + 1, i),
          text: src.slice(at, i + 1),
        };
      }
    }
  }
  return null;
}

const memberValue = (body, key) => {
  const match = new RegExp(`(?:^|[{,\\s])${key}\\s*:\\s*([^,\\n}]+)`).exec(
    body,
  );
  return match ? match[1].trim() : undefined;
};
const hasKey = (body, key) => new RegExp(`(?:^|[{,\\s])${key}\\s*:`).test(body);

/** `rgb(247 246 242 / 97%)` -> `f7f6f2`. The alpha is dropped on purpose: a
 *  browser chrome colour cannot be translucent. */
function headerHex(cssSource) {
  const rule = /\.app-sticky-header\s*\{[^}]*background:\s*rgb\(([^)]*)\)/.exec(
    cssSource,
  );
  assert.ok(
    rule,
    "cannot read a rgb() background off .app-sticky-header, so the theme colour " +
      "cannot be checked against the surface a phone actually shows",
  );
  const [channels] = rule[1].split("/");
  const parts = channels
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  assert.equal(
    parts.length,
    3,
    `.app-sticky-header's background is not three rgb() channels (${rule[1]})`,
  );
  assert.ok(
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255),
    `.app-sticky-header's rgb() channels are not 8-bit values (${rule[1]})`,
  );
  return parts.map((n) => n.toString(16).padStart(2, "0")).join("");
}

describe("viewport export", () => {
  it("exports a viewport Next will type-check", () => {
    const viewport = objectLiteralOf(layout, "viewport");
    assert.ok(
      viewport,
      "layout.tsx exports no `viewport` object, so the browser chrome colour and the " +
        "zoom intent are whatever the framework defaults happen to be",
    );
    // The annotation is the only thing that makes Next check the keys at build time:
    // an untyped object silently accepts a typo like `userScalable: false`.
    assert.equal(
      viewport.annotation,
      ": Viewport",
      `the viewport export is annotated "${viewport.annotation}"; it must be \`: Viewport\` ` +
        "or a misspelled key compiles and does nothing",
    );
    // Both `import type { Viewport }` and `import { type Viewport }` are valid and
    // mean the same thing to the compiler, so the name is read out of the braces
    // rather than matched as a spelling.
    const nextImport = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"next"/.exec(
      layout,
    );
    const importedNames = (nextImport?.[1] ?? "")
      .split(",")
      .map((name) => name.replace(/\btype\b/, "").trim())
      .filter(Boolean);
    assert.ok(
      importedNames.includes("Viewport"),
      'Viewport is not imported as a type from "next"',
    );
  });

  it("themes the browser chrome to the surface a phone actually shows", () => {
    const viewport = objectLiteralOf(layout, "viewport");
    assert.ok(viewport, "no viewport export to read a theme colour from");
    const themeColor = memberValue(viewport.body, "themeColor");
    assert.ok(
      themeColor,
      "the viewport declares no themeColor, so the status bar keeps the OS default " +
        "and matches nothing in the page",
    );
    assert.match(
      themeColor,
      /^"#([0-9a-fA-F]{6})"$/,
      `themeColor is ${themeColor}: it must be one quoted 6-digit hex colour, because a ` +
        "browser chrome colour cannot be translucent and cannot be a CSS variable",
    );
    const declared = RegExp(/^"#([0-9a-fA-F]{6})"$/)
      .exec(themeColor)[1]
      .toLowerCase();
    const expected = headerHex(css);
    assert.equal(
      declared,
      expected,
      `themeColor is #${declared} but the sticky header paints #${expected}: the tag exists ` +
        "to make the phone's status bar read as part of the page",
    );
  });

  it("never blocks pinch zoom", () => {
    const viewport = objectLiteralOf(layout, "viewport");
    assert.ok(viewport, "no viewport export to read zoom keys from");
    // Pinned as a key, not as `user-scalable=no` prose: a maximumScale of any value
    // is a ceiling on zoom, and WCAG 1.4.4 fails on the ceiling, not the spelling.
    assert.ok(
      !hasKey(viewport.body, "maximumScale"),
      "the viewport caps the scale, which is a WCAG 1.4.4 failure at any value",
    );
    if (hasKey(viewport.body, "userScalable")) {
      assert.equal(
        memberValue(viewport.body, "userScalable"),
        "true",
        "the viewport export disables user scaling, which is a WCAG 1.4.4 failure",
      );
    }
    assert.doesNotMatch(
      layout,
      /maximum-scale|user-scalable/,
      "a hand-written viewport meta string is present; the exported object is the only " +
        "shape Next reads",
    );
  });

  it("declares the intent the safe-area work depends on", () => {
    const viewport = objectLiteralOf(layout, "viewport");
    assert.ok(viewport, "no viewport export to read the layout intent from");
    assert.equal(
      memberValue(viewport.body, "width"),
      '"device-width"',
      'width is not "device-width", so env(safe-area-inset-*) in the mobile menu panel is ' +
        "measuring a viewport the source never asked for",
    );
    assert.equal(
      memberValue(viewport.body, "initialScale"),
      "1",
      "initialScale is not 1: the layout CSS and the safe-area insets are written for a " +
        "1:1 viewport and nothing else",
    );
  });

  it("keeps the theme colour out of the metadata export", () => {
    const metadata = objectLiteralOf(layout, "metadata");
    assert.ok(metadata, "layout.tsx no longer exports its metadata");
    assert.doesNotMatch(
      metadata.body,
      /themeColor/,
      "themeColor is back on the metadata export, where Next ignores it (it moved to the " +
        "viewport export) — the tag would silently never render",
    );
  });
});
