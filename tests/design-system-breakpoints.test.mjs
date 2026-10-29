import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalsCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8"
);

describe("Sprint 3 Design System Breakpoint Tokens", () => {
  it("declares canonical responsive breakpoints in @theme block", () => {
    assert.match(
      globalsCss,
      /@theme\s*\{[\s\S]*?--breakpoint-sm:\s*40rem;/,
      "must declare --breakpoint-sm: 40rem (640px)"
    );
    assert.match(
      globalsCss,
      /@theme\s*\{[\s\S]*?--breakpoint-md:\s*48rem;/,
      "must declare --breakpoint-md: 48rem (768px)"
    );
    assert.match(
      globalsCss,
      /@theme\s*\{[\s\S]*?--breakpoint-lg:\s*56rem;/,
      "must declare --breakpoint-lg: 56rem (896px)"
    );
    assert.match(
      globalsCss,
      /@theme\s*\{[\s\S]*?--breakpoint-xl:\s*64rem;/,
      "must declare --breakpoint-xl: 64rem (1024px)"
    );
    assert.match(
      globalsCss,
      /@theme\s*\{[\s\S]*?--breakpoint-2xl:\s*80rem;/,
      "must declare --breakpoint-2xl: 80rem (1280px)"
    );
  });
});
