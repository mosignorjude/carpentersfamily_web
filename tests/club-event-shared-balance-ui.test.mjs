import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const summarySource = readFileSync(
  new URL("../src/components/finances/club-financial-summary.tsx", import.meta.url),
  "utf8"
);
const viewSource = readFileSync(
  new URL("../src/components/finances/finances-page-view.tsx", import.meta.url),
  "utf8"
);
const ledgerSource = readFileSync(
  new URL("../src/components/finances/event-ledger-section.tsx", import.meta.url),
  "utf8"
);

describe("Club event shared balance UI", () => {
  it("carries the two event cash fields through the summary props", () => {
    assert.match(
      viewSource,
      /event_inflow\?:\s*number \| string \| null;/,
      "the page view type must accept the RPC's event inflow"
    );
    assert.match(
      viewSource,
      /event_outflow\?:\s*number \| string \| null;/,
      "the page view type must accept the RPC's event outflow"
    );
    assert.match(viewSource, /eventInflow=\{summary\?\.event_inflow\}/);
    assert.match(viewSource, /eventOutflow=\{summary\?\.event_outflow\}/);
  });

  it("renders event cash as its own card without touching the club lines", () => {
    assert.match(summarySource, /eventInflow,\s*\n\s*eventOutflow,/);
    assert.match(summarySource, /lg:grid-cols-5/);
    assert.doesNotMatch(summarySource, /lg:grid-cols-4/);
    assert.match(summarySource, /Event Cash/);
    assert.match(summarySource, /formatNaira\(eventNet\)/);
    assert.match(summarySource, /formatNaira\(eventInflow\)/);
    assert.match(summarySource, /formatNaira\(eventOutflow\)/);
  });

  it("labels the event posting panel as audit history that is not counted", () => {
    assert.match(ledgerSource, /not counted in the balance/);
    assert.doesNotMatch(
      ledgerSource,
      /Automated financial reconciliation from completed or cancelled/,
      "the old copy implied the postings feed the club totals"
    );
  });
});
