import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const dashboard = readFileSync(
  new URL(
    "../src/components/events/dashboard/event-dashboard-view.tsx",
    import.meta.url,
  ),
  "utf8",
);
const revenue = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-revenue.tsx",
    import.meta.url,
  ),
  "utf8",
);
const expenses = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-expenses.tsx",
    import.meta.url,
  ),
  "utf8",
);
const globalsCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

describe("event dashboard mobile panel layout", () => {
  it("does not clip event dashboard tab content at the panel boundary", () => {
    const panel = /className="([^"]*\bevent-finance-panel\b[^"]*)"/.exec(
      dashboard,
    );
    assert.ok(panel, "could not find the active event finance panel");
    assert.doesNotMatch(
      panel[1],
      /(?:^|\s)overflow-hidden(?:\s|$)/,
      "the event panel clips controls and content that exceed its width",
    );
    assert.match(panel[1], /(?:^|\s)min-w-0(?:\s|$)/);
    assert.match(panel[1], /(?:^|\s)max-w-full(?:\s|$)/);
  });

  it("keeps .event-finance-panel unboxed with a bounded 1fr grid track in globals.css", () => {
    assert.doesNotMatch(
      globalsCss,
      /\.club-finance-panel,\s*\.event-finance-panel/,
      ".event-finance-panel should not share the bordered card rules with .club-finance-panel",
    );
    assert.match(
      globalsCss,
      /\.event-finance-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
      ".event-finance-panel must bound its grid track with minmax(0, 1fr) so wide tables cannot blow out the panel width",
    );
  });

  it("wraps the revenue summary and action controls on narrow screens", () => {
    const actionRow =
      /<div className="([^"]*\bflex-wrap\b[^"]*)">([\s\S]*?btn-record-revenue[\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/.exec(
        revenue,
      );
    assert.ok(actionRow, "could not find the revenue summary and action row");
    assert.match(actionRow[1], /flex-wrap/);
    assert.match(actionRow[2], /btn-record-revenue/);
  });

  it("wraps expense summary and action controls on narrow screens", () => {
    const actionRow =
      /<div className="([^"]*\bflex-wrap\b[^"]*)">([\s\S]*?btn-record-disbursement[\s\S]*?)<\/div>\s*<\/div>/.exec(
        expenses,
      );
    assert.ok(actionRow, "could not find the expense summary and action row");
    assert.match(actionRow[1], /flex-wrap/);
    assert.match(actionRow[2], /btn-record-disbursement/);
  });
});
