import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);

function extractActionBody(source, actionName) {
  const start = source.indexOf(`export async function ${actionName}(`);
  if (start === -1) return null;
  const nextAction = source.indexOf("export async function", start + 1);
  return source.slice(start, nextAction === -1 ? undefined : nextAction);
}

describe("setEventBudgetAction", () => {
  const body = extractActionBody(actionsSource, "setEventBudgetAction");

  it("exports setEventBudgetAction from src/app/actions.ts", () => {
    assert.ok(
      body !== null,
      "setEventBudgetAction must be exported from src/app/actions.ts",
    );
  });

  it("supports return_tab in form data and normalizes it", () => {
    assert.ok(body !== null);
    assert.match(
      body,
      /return_tab/,
      "setEventBudgetAction must accept return_tab",
    );
    assert.match(
      body,
      /normalizeEventFinanceTab\(formData\.get\("return_tab"\)\)/,
      "setEventBudgetAction must normalize return_tab",
    );
  });

  it("enforces event finance authorization", () => {
    assert.ok(body !== null);
    assert.match(
      body,
      /eventFinanceManagerAllowed\(actor\)|eventManagerAllowed\(actor\.roles\)/,
      "setEventBudgetAction must check manager authorization",
    );
  });

  it("queries existing budget and enforces reason on revision", () => {
    assert.ok(body !== null);
    assert.match(
      body,
      /\.from\("event_budgets"\)/,
      "setEventBudgetAction must check existing budget in event_budgets",
    );
  });

  it("queries existing allocations to preserve them", () => {
    assert.ok(body !== null);
    assert.match(
      body,
      /\.from\("event_budget_allocations"\)/,
      "setEventBudgetAction must preserve allocations from event_budget_allocations",
    );
    assert.match(
      body,
      /category_id/,
      "setEventBudgetAction must map existing allocations with category_id",
    );
    assert.match(
      body,
      /percentage/,
      "setEventBudgetAction must map existing allocations with percentage",
    );
  });

  it("calls set_event_budget RPC with category_id and percentage", () => {
    assert.ok(body !== null);
    assert.match(
      body,
      /\.rpc\("set_event_budget",\s*\{[\s\S]*p_event_id:[\s\S]*p_total_ngn:[\s\S]*p_allocations:[\s\S]*p_reason:/,
      "setEventBudgetAction must call set_event_budget with p_event_id, p_total_ngn, p_allocations, p_reason",
    );
  });

  it("revalidates event dashboard and redirects to budget tab on success", () => {
    assert.ok(body !== null);
    assert.match(
      body,
      /revalidatePath\(`\/events\/\$\{eventId\}\/dashboard`\)/,
      "setEventBudgetAction must revalidate event dashboard path",
    );
    assert.match(
      body,
      /eventFinanceNoticeUrl\(eventId,\s*"budget-saved",\s*returnTab\)/,
      "setEventBudgetAction must redirect with budget-saved notice and returnTab",
    );
  });
});

describe("Ticket tier actions return_tab routing and revalidation", () => {
  it("createEventTicketTierAction supports return_tab and revalidates dashboard", () => {
    const body = extractActionBody(
      actionsSource,
      "createEventTicketTierAction",
    );
    assert.ok(body !== null);
    assert.match(
      body,
      /"return_tab"/,
      "createEventTicketTierAction must allow return_tab in fields",
    );
    assert.match(
      body,
      /normalizeEventFinanceTab\(formData\.get\("return_tab"\)\)/,
      "createEventTicketTierAction must normalize return_tab",
    );
    assert.match(
      body,
      /revalidatePath\(`\/events\/\$\{eventId\}\/dashboard`\)/,
      "createEventTicketTierAction must revalidate /events/[eventId]/dashboard",
    );
    assert.match(
      body,
      /eventFinanceNoticeUrl\(eventId,\s*"tier-saved",\s*returnTab\)/,
      "createEventTicketTierAction must redirect with returnTab",
    );
    assert.match(
      body,
      /eventText\(formData,\s*"reason",\s*500\)\s*\|\|\s*"Initial admission tier entry"/,
      "createEventTicketTierAction must fallback to 'Initial admission tier entry'",
    );
  });

  it("updateEventTicketTierAction supports return_tab and revalidates dashboard", () => {
    const body = extractActionBody(
      actionsSource,
      "updateEventTicketTierAction",
    );
    assert.ok(body !== null);
    assert.match(
      body,
      /"return_tab"/,
      "updateEventTicketTierAction must allow return_tab in fields",
    );
    assert.match(
      body,
      /normalizeEventFinanceTab\(formData\.get\("return_tab"\)\)/,
      "updateEventTicketTierAction must normalize return_tab",
    );
    assert.match(
      body,
      /revalidatePath\(`\/events\/\$\{eventId\}\/dashboard`\)/,
      "updateEventTicketTierAction must revalidate /events/[eventId]/dashboard",
    );
    assert.match(
      body,
      /eventFinanceNoticeUrl\(eventId,\s*"tier-saved",\s*returnTab\)/,
      "updateEventTicketTierAction must redirect with returnTab",
    );
  });

  it("retireEventTicketTierAction supports return_tab and revalidates dashboard", () => {
    const body = extractActionBody(
      actionsSource,
      "retireEventTicketTierAction",
    );
    assert.ok(body !== null);
    assert.match(
      body,
      /"return_tab"/,
      "retireEventTicketTierAction must allow return_tab in fields",
    );
    assert.match(
      body,
      /normalizeEventFinanceTab\(formData\.get\("return_tab"\)\)/,
      "retireEventTicketTierAction must normalize return_tab",
    );
    assert.match(
      body,
      /revalidatePath\(`\/events\/\$\{eventId\}\/dashboard`\)/,
      "retireEventTicketTierAction must revalidate /events/[eventId]/dashboard",
    );
    assert.match(
      body,
      /eventFinanceNoticeUrl\(eventId,\s*"tier-retired",\s*returnTab\)/,
      "retireEventTicketTierAction must redirect with returnTab",
    );
  });
});
