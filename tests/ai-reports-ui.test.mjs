import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getActiveMemberNavigationItems,
  getNavigationItems,
} from "../src/lib/app-navigation.mjs";

function readSource(relPath) {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

describe("AI reports UI wiring and officer-only visibility", () => {
  it("shows /officers/reports link only to club officers", () => {
    const memberHrefs = getNavigationItems(["member"]).map((i) => i.href);
    const execHrefs = getNavigationItems(["executive"]).map((i) => i.href);
    const adminHrefs = getNavigationItems(["admin"]).map((i) => i.href);
    const presHrefs = getNavigationItems(["president"]).map((i) => i.href);

    assert.ok(!memberHrefs.includes("/officers/reports"));
    assert.ok(execHrefs.includes("/officers/reports"));
    assert.ok(adminHrefs.includes("/officers/reports"));
    assert.ok(presHrefs.includes("/officers/reports"));
    assert.deepEqual(adminHrefs, presHrefs);

    const erroredLinks = getActiveMemberNavigationItems(
      "active",
      ["admin"],
      true,
    );
    assert.ok(erroredLinks);
    assert.ok(!erroredLinks.some((i) => i.href === "/officers/reports"));
  });

  it("provides AiSummaryPanel with generate, edit, approve, and regenerate actions", () => {
    const panelPath = new URL(
      "../src/components/reports/ai-summary-panel.tsx",
      import.meta.url,
    );
    assert.ok(existsSync(panelPath), "ai-summary-panel.tsx must exist");
    const panel = readSource("src/components/reports/ai-summary-panel.tsx");
    assert.match(panel, /Generate AI summary/);
    assert.match(panel, /Approve/);
    assert.match(panel, /Regenerate/);
    assert.match(panel, /Draft — not included in PDFs until approved/);
    assert.match(panel, /\/api\/ai-reports/);
    assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);
  });

  it("wires AiSummaryPanel and includeAi option into Finances, Dues, Event Dashboard, and Officer Reports", () => {
    assert.ok(
      existsSync(
        new URL(
          "../src/app/(member)/officers/reports/page.tsx",
          import.meta.url,
        ),
      ),
      "officers/reports/page.tsx must exist",
    );
    assert.ok(
      existsSync(
        new URL(
          "../src/components/reports/club-overview-client.tsx",
          import.meta.url,
        ),
      ),
      "club-overview-client.tsx must exist",
    );

    const financesView = readSource(
      "src/components/finances/finances-page-view.tsx",
    );
    assert.match(financesView, /AiSummaryPanel/);
    assert.match(financesView, /isOfficer && aiEnabled/);
    assert.match(financesView, /name="includeAi"/);

    const duesView = readSource("src/components/dues/dues-page-view.tsx");
    assert.match(duesView, /AiSummaryPanel/);
    assert.match(duesView, /isOfficer && aiEnabled/);
    assert.match(duesView, /name="includeAi"/);

    const tabReports = readSource(
      "src/components/events/dashboard/tab-reports.tsx",
    );
    assert.match(tabReports, /AiSummaryPanel/);
    assert.match(tabReports, /isClubOfficer && aiEnabled/);

    const modal = readSource(
      "src/components/events/dashboard/modals/download-report-modal.tsx",
    );
    assert.match(modal, /includeAi/);
  });
});
