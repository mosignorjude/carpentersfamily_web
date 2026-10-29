import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalsCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8"
);
const preLaunchCard = readFileSync(
  new URL("../src/components/dues/pre-launch-dues-reconciliation-card.tsx", import.meta.url),
  "utf8"
);
const duesPageView = readFileSync(
  new URL("../src/components/dues/dues-page-view.tsx", import.meta.url),
  "utf8"
);
const tabOverview = readFileSync(
  new URL("../src/components/events/dashboard/tab-overview.tsx", import.meta.url),
  "utf8"
);

describe("Sprint 1 Mobile Safety & Space Reclamation", () => {
  it("enforces safe-area-inset-top on app-sticky-header", () => {
    assert.match(
      globalsCss,
      /\.app-sticky-header[\s\S]*?padding-top:\s*max\([^;]*env\(safe-area-inset-top/
    );
  });

  it("enforces 16px mobile input font size to eliminate iOS auto-zoom", () => {
    assert.match(
      globalsCss,
      /@media\s*\(max-width:\s*48rem\)[\s\S]*?font-size:\s*16px\s*!important/
    );
  });

  it("enforces 44px mobile input min-height floor", () => {
    assert.match(
      globalsCss,
      /@media\s*\(max-width:\s*48rem\)[\s\S]*?min-height:\s*44px/
    );
  });

  it("collapses pre-launch dues reconciliation workspace by default", () => {
    assert.match(
      preLaunchCard,
      /const\s*\[isCollapsed,\s*setIsCollapsed\]\s*=\s*useState\(true\)/
    );
  });

  it("compacts dues hero on mobile viewports", () => {
    assert.match(duesPageView, /className="[^"]*p-4\s+sm:p-8[^"]*"/);
    assert.match(duesPageView, /<p className="hidden sm:block text-xs/);
  });

  it("converts overview financial metric cards to 2x2 grid on mobile", () => {
    assert.match(
      tabOverview,
      /grid\s+grid-cols-2\s+md:grid-cols-2\s+xl:grid-cols-4\s+gap-2\.5/
    );
  });
});
