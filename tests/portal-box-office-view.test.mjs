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
  assert.match(DESK_SOURCE, /Ticket Sales Revenue/);
  assert.match(DESK_SOURCE, /Tickets Sold \/ Capacity/);
  assert.match(DESK_SOURCE, /Verification Queue/);
  assert.match(DESK_SOURCE, /Active Ticketed Events/);
  assert.match(DESK_SOURCE, /href="\/create-event"/);
  assert.match(DESK_SOURCE, /\/events\/\$\{event\.id\}\/dashboard\?tab=tickets/);
});

test("PortalBoxOfficeView connects to Member Portal and renders ticket inventory", () => {
  const portalSource = readFileSync(
    "src/components/tickets/portal-box-office-view.tsx",
    "utf8",
  );
  assert.match(portalSource, /Tickets & Reservations/);
  assert.match(portalSource, /href="\/tickets\/order"/);
  assert.match(portalSource, /href="\/tickets\?view=public"/);
  assert.match(portalSource, /OfficerBoxOfficeDesk/);
  assert.match(portalSource, /Ticket Tiers & Prices/);

  // No breadcrumb
  assert.doesNotMatch(
    portalSource,
    /aria-label="Breadcrumb"/,
    "PortalBoxOfficeView must not render breadcrumb navigation",
  );

  // Standard responsive padding matching other pages
  assert.match(
    portalSource,
    /max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8/,
    "PortalBoxOfficeView must use standard responsive padding matching Finances and Dues",
  );

  // Bank section removed
  assert.doesNotMatch(
    portalSource,
    /Official Club Payment Account/,
    "PortalBoxOfficeView must not render Official Club Payment Account card",
  );
  assert.doesNotMatch(
    portalSource,
    /btn-copy-account/,
    "PortalBoxOfficeView must not render bank copy button",
  );
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

test("PortalBoxOfficeView provides segmented view toggle for officers without duplicating event lists", () => {
  const portalSource = readFileSync(
    "src/components/tickets/portal-box-office-view.tsx",
    "utf8",
  );
  assert.match(
    portalSource,
    /tab-officer-passes/,
    "PortalBoxOfficeView must provide Browse Events & Passes tab for officers",
  );
  assert.match(
    portalSource,
    /tab-officer-desk/,
    "PortalBoxOfficeView must provide Operations & Verification Desk tab for officers",
  );
});

test("PortalBoxOfficeView and OfficerBoxOfficeDesk obey eyebrow restraint and brand token palette", () => {
  const deskSource = readFileSync(
    "src/components/tickets/officer-box-office-desk.tsx",
    "utf8",
  );
  const portalSource = readFileSync(
    "src/components/tickets/portal-box-office-view.tsx",
    "utf8",
  );

  // No generic Tailwind amber in OfficerBoxOfficeDesk
  assert.doesNotMatch(
    deskSource,
    /bg-amber-100|bg-amber-50|bg-amber-200/,
    "Use brand ochre tokens instead of generic Tailwind amber background",
  );
  assert.doesNotMatch(
    deskSource,
    /text-amber-900|text-amber-800/,
    "Use brand espresso/ochre tokens instead of generic Tailwind amber text",
  );

  // Zero em-dashes across components
  assert.doesNotMatch(
    portalSource,
    /—/,
    "PortalBoxOfficeView must contain zero em-dashes",
  );
  assert.doesNotMatch(
    deskSource,
    /—/,
    "OfficerBoxOfficeDesk must contain zero em-dashes",
  );

  // Eyebrow count check in PortalBoxOfficeView (max 2)
  const portalEyebrows =
    portalSource.match(/uppercase tracking-(?:wider|widest)/g) ?? [];
  assert.ok(
    portalEyebrows.length <= 2,
    `PortalBoxOfficeView must have <= 2 uppercase tracking labels; found ${portalEyebrows.length}`,
  );
});



