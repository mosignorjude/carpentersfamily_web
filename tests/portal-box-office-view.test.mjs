import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DESK_SOURCE = readFileSync(
  "src/components/tickets/officer-box-office-desk.tsx",
  "utf8",
);
const PORTAL_SOURCE = readFileSync(
  "src/components/tickets/portal-box-office-view.tsx",
  "utf8",
);

test("OfficerBoxOfficeDesk renders core KPI metrics and governance controls", () => {
  assert.match(DESK_SOURCE, /Officer Box Office Desk/);
  assert.match(DESK_SOURCE, /Gross Ticketing Inflow/);
  assert.match(DESK_SOURCE, /Passes Issued \/ Capacity/);
  assert.match(DESK_SOURCE, /Verification Queue/);
  assert.match(DESK_SOURCE, /Active Ticketed Events/);
  assert.match(DESK_SOURCE, /href="\/create-event"/);
  assert.match(DESK_SOURCE, /\/events\/\$\{event\.id\}\/dashboard\?tab=tickets/);
});

test("PortalBoxOfficeView connects to Member Portal and renders ticket inventory", () => {
  assert.match(PORTAL_SOURCE, /Box Office & Passes/);
  assert.match(PORTAL_SOURCE, /href="\/portal"/);
  assert.match(PORTAL_SOURCE, /href="\/tickets\/order"/);
  assert.match(PORTAL_SOURCE, /href="\/tickets\?view=public"/);
  assert.match(PORTAL_SOURCE, /OfficerBoxOfficeDesk/);
  assert.match(PORTAL_SOURCE, /Admission Tiers & Pass Pricing/);
});

test("OfficerBoxOfficeDesk and PortalBoxOfficeView carry no inline hex palette", () => {
  const deskHexes = DESK_SOURCE.match(/#[0-9A-Fa-f]{6}/g) ?? [];
  assert.deepEqual(
    deskHexes,
    [],
    `inline hex literals in OfficerBoxOfficeDesk: ${deskHexes.join(", ")}`,
  );

  const portalHexes = PORTAL_SOURCE.match(/#[0-9A-Fa-f]{6}/g) ?? [];
  assert.deepEqual(
    portalHexes,
    [],
    `inline hex literals in PortalBoxOfficeView: ${portalHexes.join(", ")}`,
  );
});

test("/tickets/page.tsx implements dual-route routing for members and guests", () => {
  const pageSource = readFileSync("src/app/tickets/page.tsx", "utf8");
  assert.ok(
    pageSource.includes('import AppShell from "@/components/app-shell"'),
    "expected AppShell import",
  );
  assert.ok(
    pageSource.includes(
      'import { PortalBoxOfficeView } from "@/components/tickets/portal-box-office-view"',
    ),
    "expected PortalBoxOfficeView import",
  );
  assert.match(pageSource, /await searchParams/);
  assert.match(pageSource, /viewParam === "public"/);
  assert.match(pageSource, /verification_status/);
  assert.match(pageSource, /<AppShell/);
  assert.match(pageSource, /<PortalBoxOfficeView/);
  assert.match(pageSource, /<TicketsStorefrontView/);
});

test("tickets storefront header links route authenticated members to /portal", () => {
  const storefrontSource = readFileSync(
    "src/components/tickets/tickets-storefront-view.tsx",
    "utf8",
  );
  assert.match(
    storefrontSource,
    /href=\{isAuthenticatedMember \? "\/portal" : "\/"\}/,
  );
  assert.doesNotMatch(
    storefrontSource,
    /href=\{isAuthenticatedMember \? "\/events" : "\/"\}/,
  );
});

