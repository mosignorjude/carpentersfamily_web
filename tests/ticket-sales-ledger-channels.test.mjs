import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const typesSource = readFileSync(
  new URL("../src/components/events/dashboard/dashboard-types.ts", import.meta.url),
  "utf8"
);

const pageSource = readFileSync(
  new URL("../src/app/(member)/events/[eventId]/dashboard/page.tsx", import.meta.url),
  "utf8"
);

const ledgerSource = readFileSync(
  new URL("../src/components/events/dashboard/event-domain-ledger.tsx", import.meta.url),
  "utf8"
);

describe("Ticket Sales Ledger Channels Requirements", () => {
  it("defines channel in DashboardTransaction", () => {
    assert.match(typesSource, /channel\?:\s*"member"\s*\|\s*"online"/);
  });

  it("maps online and member sales channels cleanly in page.tsx", () => {
    assert.match(pageSource, /"Online Sales"/);
    assert.match(pageSource, /"Member Sales"/);
    assert.match(pageSource, /channel:\s*isOnline\s*\?\s*"online"\s*:\s*"member"/);
  });

  it("does not include redundant parenthetical subtitles", () => {
    assert.doesNotMatch(pageSource, /\(Recorded by members\)/i);
    assert.doesNotMatch(pageSource, /\(From Box office\)/i);
    assert.doesNotMatch(ledgerSource, /\(Recorded by members\)/i);
    assert.doesNotMatch(ledgerSource, /\(From Box office\)/i);
  });

  it("renders Channel as column header for tickets domain instead of Category", () => {
    assert.match(ledgerSource, /domain\s*===\s*"tickets"\s*\?\s*"Channel"\s*:\s*"Category"/);
  });

  it("provides channel segment filter buttons for tickets domain", () => {
    assert.match(ledgerSource, /channelFilter/);
    assert.match(ledgerSource, /All Channels/);
    assert.match(ledgerSource, /Member Sales/);
    assert.match(ledgerSource, /Online Sales/);
  });

  it("filters transactions by channelFilter when domain is tickets", () => {
    assert.match(ledgerSource, /domain\s*===\s*"tickets"\s*&&\s*channelFilter\s*!==\s*"all"/);
  });
});
