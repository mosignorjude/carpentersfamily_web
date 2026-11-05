import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CSS = "src/app/globals.css";
const LAYOUT = "src/app/layout.tsx";

function themeBlock(css) {
  const start = css.indexOf("@theme {");
  assert.notEqual(start, -1, "globals.css must have an @theme block");
  return css.slice(start, css.indexOf("}", css.indexOf("{", start)) + 1);
}

test("Fraunces woff2 files are vendored into src/fonts", () => {
  for (const file of [
    "fraunces-latin.woff2",
    "fraunces-latin-ext.woff2",
    "fraunces-latin-italic.woff2",
    "fraunces-latin-ext-italic.woff2",
  ]) {
    assert.equal(
      fs.existsSync(`src/fonts/${file}`),
      true,
      `Missing src/fonts/${file}`,
    );
    assert.equal(
      fs.existsSync(`public/fonts/${file}`),
      true,
      `Missing public/fonts/${file}`,
    );
  }
});

test("globals.css declares the Fraunces faces with subset unicode-ranges", () => {
  const css = fs.readFileSync(CSS, "utf8");
  const faces = css.match(/@font-face\s*\{[^}]*font-family:\s*["']Fraunces["'][^}]*\}/g) ?? [];
  assert.equal(faces.length, 4, `Expected 4 Fraunces @font-face blocks, found ${faces.length}`);
  assert.ok(faces.some((f) => /font-style:\s*italic/.test(f)), "No italic Fraunces face");
  for (const face of faces) {
    assert.match(face, /unicode-range:/, "Every Fraunces face must be subset-scoped");
    assert.match(face, /font-display:\s*swap/);
  }
});

test("@theme exposes --font-serif so font-serif stops resolving to the Tailwind default", () => {
  const css = fs.readFileSync(CSS, "utf8");
  const theme = themeBlock(css);
  assert.match(theme, /--font-serif:/, "@theme has no --font-serif token");
  assert.match(theme, /--font-serif:[^;]*Fraunces/, "--font-serif must name the Fraunces display face");
});

test("layout.tsx registers Fraunces as a local font variable on <html>", () => {
  const layout = fs.readFileSync(LAYOUT, "utf8");
  assert.match(
    layout,
    /localFont\(\{[\s\S]*?fraunces-latin\.woff2[\s\S]*?variable:\s*"--font-fraunces"/,
    "layout.tsx must localFont() the vendored Fraunces latin file",
  );
  assert.match(layout, /\$\{fraunces\.variable\}/, "fraunces.variable must be applied to <html>");
});
