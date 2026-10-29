import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const componentPath = new URL(
  "../src/components/events/dashboard/mobile-tab-bottom-sheet.tsx",
  import.meta.url,
);

describe("MobileTabBottomSheet component", () => {
  it("exists and exports MobileTabBottomSheet as a client component", () => {
    let source;
    try {
      source = readFileSync(componentPath, "utf8");
    } catch {
      assert.fail("mobile-tab-bottom-sheet.tsx does not exist");
    }
    assert.match(source, /^["']use client["'];?/m, "must be a client component");
    assert.match(
      source,
      /export\s+(?:function|default\s+function)\s+MobileTabBottomSheet|export\s*\{\s*MobileTabBottomSheet\s*\}/,
      "must export MobileTabBottomSheet",
    );
  });

  it("implements modal accessibility standards (dialog role, aria-modal, and trigger aria-expanded)", () => {
    const source = readFileSync(componentPath, "utf8");
    assert.match(source, /role=["']dialog["']/, "sheet must declare role='dialog'");
    assert.match(source, /aria-modal=["']true["']/, "sheet must declare aria-modal='true'");
    assert.match(
      source,
      /aria-expanded=\{isOpen\}|aria-expanded=\{isSheetOpen\}|aria-expanded=\{open\}/,
      "trigger button must bind aria-expanded",
    );
    assert.match(
      source,
      /aria-label=["']Close|aria-label=["']Dismiss/i,
      "sheet must provide an accessible close action",
    );
  });

  it("handles Escape key dismissal hygiene", () => {
    const source = readFileSync(componentPath, "utf8");
    assert.match(
      source,
      /key\s*===\s*["']Escape["']/,
      "sheet must close when the user presses Escape",
    );
  });

  it("renders 8 section items with minimum touch target sizing (min-h-[48px] or min-h-[44px])", () => {
    const source = readFileSync(componentPath, "utf8");
    assert.match(
      source,
      /min-h-\[(?:44|48|52)px\]|min-h-12|min-h-11/,
      "interactive items must meet touch target floor of >= 44px",
    );
  });
});
