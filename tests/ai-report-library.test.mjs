import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const draftEditorSource = readFileSync(
  new URL("../src/components/reports/document-draft-editor.tsx", import.meta.url),
  "utf8"
);
const reportsPageSource = readFileSync(
  new URL("../src/app/(member)/officers/reports/page.tsx", import.meta.url),
  "utf8"
);

describe("Task 6: Saved Report Library Core, Stale Detection & Meeting Switch Reset", () => {
  it("buildReportLibraryItems filters discarded rows, sorts updated_at DESC, and computes isStale", async () => {
    const { buildReportLibraryItems } = await import(
      "../src/lib/reports/library-core.ts"
    );

    const rows = [
      {
        id: "r-discarded",
        report_type: "club_overview",
        scope_id: null,
        period_start: "2026-11-01",
        period_end: "2026-11-30",
        facts_fingerprint: "fp-old",
        provider: "gemini",
        model: "gemini-2.5-flash",
        content: { headline: "Old discarded brief", summary: "Ignored" },
        status: "discarded",
        approved_by: null,
        approved_at: null,
        created_at: "2026-11-02T09:00:00Z",
        updated_at: "2026-11-12T10:00:00Z",
      },
      {
        id: "r-draft",
        report_type: "club_finance",
        scope_id: null,
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        facts_fingerprint: "fp-finance-stale",
        provider: "groq",
        model: "llama-3.3-70b",
        content: {
          headline: "Treasury Draft",
          narrative: "Cash reserves remain healthy across accounts.",
        },
        status: "draft",
        approved_by: null,
        approved_at: null,
        created_at: "2026-11-01T08:00:00Z",
        updated_at: "2026-11-10T10:00:00Z",
      },
      {
        id: "r-approved",
        report_type: "club_overview",
        scope_id: null,
        period_start: "2026-11-01",
        period_end: "2026-11-30",
        facts_fingerprint: "fp-overview-current",
        provider: "gemini",
        model: "gemini-2.5-flash",
        content: {
          headline: "November Executive Brief",
          executiveSummary: "Strong dues collection this month.",
        },
        status: "approved",
        approved_by: "user-1",
        approved_at: "2026-11-13T12:00:00Z",
        created_at: "2026-11-13T11:00:00Z",
        updated_at: "2026-11-13T12:00:00Z",
      },
    ];

    const items = buildReportLibraryItems(rows, {
      activeFingerprints: {
        club_finance: "fp-finance-live",
        "club_overview:2026-11-01:2026-11-30": "fp-overview-current",
      },
      approverNames: new Map([["user-1", "Treasurer Ada"]]),
      eventTitles: new Map(),
    });

    assert.equal(items.length, 2, "discarded rows must be excluded");
    assert.equal(items[0].id, "r-approved", "newest updated_at comes first");
    assert.equal(items[0].isStale, false);
    assert.equal(items[0].approvedByName, "Treasurer Ada");
    assert.equal(
      items[0].pdfHref,
      "/api/reports/overview?period=2026-11&format=pdf&includeAi=true"
    );
    assert.equal(items[1].id, "r-draft");
    assert.equal(items[1].isStale, true);
    assert.equal(items[1].pdfHref, null);
  });

  it("resets meeting minutes raw notes and privacy preview when switching selectedMeetingId", () => {
    assert.match(
      draftEditorSource,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*selectedMeetingId[\s\S]*setRawNotes\(""\);[\s\S]*setPreviewMaskedText\(""\);[\s\S]*setPreviewStats\(null\);[\s\S]*setShowMaskedPreview\(false\);[\s\S]*\},\s*\[selectedMeetingId\]\)/
    );
  });

  it("loads Saved Library items in /officers/reports page and passes libraryItems to ClubOverviewClient", () => {
    assert.match(reportsPageSource, /loadOfficerReportLibrary/);
    assert.match(reportsPageSource, /libraryItems=\{libraryItems\}/);
  });

  it("refactors ClubOverviewClient into a 4-mode segmented studio placing AiSummaryPanel before KPIs", () => {
    const overviewSource = readFileSync(
      new URL("../src/components/reports/club-overview-client.tsx", import.meta.url),
      "utf8"
    );
    assert.match(overviewSource, /AI Reports Centre/);
    assert.match(overviewSource, /role="tablist"/);
    assert.match(overviewSource, /Executive Brief/);
    assert.match(overviewSource, /Document Studio/);
    assert.match(overviewSource, /Custom Query/);
    assert.match(overviewSource, /Saved Library/);
    assert.match(overviewSource, /ReportLibraryPanel/);

    const aiIdx = overviewSource.indexOf("<AiSummaryPanel");
    const kpiIdx = overviewSource.indexOf("Key Overview Totals");
    assert.ok(aiIdx !== -1 && kpiIdx !== -1);
    assert.ok(
      aiIdx < kpiIdx,
      "AiSummaryPanel must appear before the Key Overview Totals KPI grid in Executive Brief"
    );
  });

  it("provides ReportLibraryPanel with search, filters, Data Updated badge, Open routing, and PDF download", () => {
    const libraryPanelSource = readFileSync(
      new URL("../src/components/reports/report-library-panel.tsx", import.meta.url),
      "utf8"
    );
    assert.match(libraryPanelSource, /Data Updated/);
    assert.match(libraryPanelSource, /Approved/);
    assert.match(libraryPanelSource, /Drafts/);
    assert.match(libraryPanelSource, /type="search"/);
    assert.match(libraryPanelSource, /min-h-\[44px\]/);
    assert.match(libraryPanelSource, /item\.pdfHref/);
    assert.match(libraryPanelSource, /\/finances/);
    assert.match(libraryPanelSource, /\/dues/);
    assert.match(libraryPanelSource, /\/dashboard/);
  });
});
