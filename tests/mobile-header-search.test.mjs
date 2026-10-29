import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const headerSource = readFileSync(
  new URL("../src/components/app-header.tsx", import.meta.url),
  "utf8"
);
const searchSource = readFileSync(
  new URL("../src/components/dashboard-search.tsx", import.meta.url),
  "utf8"
);

describe("Sprint 2 Mobile Global Search", () => {
  it("renders a mobile-only search toggle button with 44px min-dimensions", () => {
    assert.match(
      headerSource,
      /className="[^"]*md:hidden[^"]*min-h-\[44px\]\s+min-w-\[44px\][^"]*"/,
      "mobile search button must be md:hidden with min 44x44px touch target"
    );
  });

  it("binds accessible aria-expanded and aria-label attributes on mobile search button", () => {
    assert.match(
      headerSource,
      /aria-expanded=\{isMobileSearchOpen\}/,
      "mobile search button must bind aria-expanded to isMobileSearchOpen"
    );
    assert.match(
      headerSource,
      /aria-label=\{\s*isMobileSearchOpen\s*\?\s*["']Close search bar["']\s*:\s*["']Open search bar["']\s*\}/,
      "mobile search button must provide clear aria-label indicating open/close state"
    );
  });

  it("renders conditional mobile search bar drawer below header", () => {
    assert.match(
      headerSource,
      /isMobileSearchOpen\s*&&\s*\([\s\S]*?<DashboardSearch[\s\S]*?id="dashboard-search-input-mobile"/,
      "must render DashboardSearch when isMobileSearchOpen is true with unique mobile id"
    );
  });

  it("supports configurable input id in DashboardSearch to prevent duplicate DOM IDs", () => {
    assert.match(
      searchSource,
      /id\s*=\s*["']dashboard-search-input["']/,
      "DashboardSearch must support default id"
    );
    assert.match(
      searchSource,
      /<input[\s\S]*?id=\{id\}/,
      "input element must use the provided id prop"
    );
  });
});
