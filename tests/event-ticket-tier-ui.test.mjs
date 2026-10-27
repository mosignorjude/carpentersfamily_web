import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const modalPath = new URL(
  "../src/components/events/dashboard/modals/event-ticket-tier-modal.tsx",
  import.meta.url,
);
const tabTicketsPath = new URL(
  "../src/components/events/dashboard/tab-tickets.tsx",
  import.meta.url,
);
const dashboardViewPath = new URL(
  "../src/components/events/dashboard/event-dashboard-view.tsx",
  import.meta.url,
);

describe("EventTicketTierModal", () => {
  it("file exists and exports EventTicketTierModal", () => {
    assert.ok(
      existsSync(modalPath),
      "event-ticket-tier-modal.tsx must exist",
    );
    const source = readFileSync(modalPath, "utf8");
    assert.match(
      source,
      /export function EventTicketTierModal/,
      "Must export EventTicketTierModal",
    );
  });

  it("supports create, edit, and retire server actions", () => {
    if (!existsSync(modalPath)) return;
    const source = readFileSync(modalPath, "utf8");
    assert.match(
      source,
      /createEventTicketTierAction/,
      "Must use createEventTicketTierAction",
    );
    assert.match(
      source,
      /updateEventTicketTierAction/,
      "Must use updateEventTicketTierAction",
    );
    assert.match(
      source,
      /retireEventTicketTierAction/,
      "Must use retireEventTicketTierAction",
    );
  });

  it("contains necessary form fields across modes", () => {
    if (!existsSync(modalPath)) return;
    const source = readFileSync(modalPath, "utf8");
    assert.match(source, /name="name"/, "Must have name field");
    assert.match(source, /name="price_ngn"/, "Must have price_ngn field");
    assert.match(source, /name="capacity"/, "Must have capacity field");
    assert.match(source, /name="reason"/, "Must have reason field");
    assert.match(source, /name="event_id"/, "Must have event_id hidden field");
    assert.match(source, /name="tier_id"/, "Must have tier_id hidden field");
    assert.match(
      source,
      /name="return_tab"/,
      "Must have return_tab hidden field",
    );
  });
});

describe("TabTickets management controls", () => {
  const source = readFileSync(tabTicketsPath, "utf8");

  it("accepts canManage and modal callback props", () => {
    assert.match(
      source,
      /canManage\?: boolean/,
      "TabTickets must accept canManage prop",
    );
    assert.match(
      source,
      /onOpenCreateTierModal/,
      "TabTickets must accept onOpenCreateTierModal prop",
    );
    assert.match(
      source,
      /onOpenEditTierModal/,
      "TabTickets must accept onOpenEditTierModal prop",
    );
    assert.match(
      source,
      /onOpenRetireTierModal/,
      "TabTickets must accept onOpenRetireTierModal prop",
    );
  });

  it("renders Add Ticket Tier button in header when authorized", () => {
    assert.match(
      source,
      /btn-add-ticket-tier/,
      "Must render Add Ticket Tier button with id btn-add-ticket-tier",
    );
    assert.match(
      source,
      /Add Ticket Tier/,
      "Must display Add Ticket Tier button label",
    );
  });

  it("renders call-to-action button in empty state when authorized", () => {
    assert.match(
      source,
      /btn-create-tier-empty/,
      "Must render empty state create tier button with id btn-create-tier-empty",
    );
    assert.match(
      source,
      /Create Admission Tier/,
      "Empty state button must say Create Admission Tier",
    );
  });

  it("renders Edit and Retire buttons for each active tier card", () => {
    assert.match(
      source,
      /btn-edit-tier-/,
      "Must render Edit button for tier card",
    );
    assert.match(
      source,
      /btn-retire-tier-/,
      "Must render Retire button for tier card",
    );
  });
});

describe("EventDashboardView ticket tier integration", () => {
  const dashboardSource = readFileSync(dashboardViewPath, "utf8");

  it("imports and renders EventTicketTierModal with state management", () => {
    assert.match(
      dashboardSource,
      /EventTicketTierModal/,
      "EventDashboardView must import and render EventTicketTierModal",
    );
    assert.match(
      dashboardSource,
      /isTierModalOpen|tierModalOpen/,
      "EventDashboardView must track tier modal open state",
    );
    assert.match(
      dashboardSource,
      /tierModalMode/,
      "EventDashboardView must track tier modal mode state",
    );
  });

  it("passes canManage and handlers to TabTickets", () => {
    assert.match(
      dashboardSource,
      /<TabTickets[\s\S]*canManage=\{canManageCategories\}[\s\S]*onOpenCreateTierModal/,
      "EventDashboardView must pass canManage and onOpenCreateTierModal to TabTickets",
    );
  });
});
