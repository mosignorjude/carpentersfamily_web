# Event Budget Total & Ticket Tier Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable authorized club officers (Admin, Backup Admin, Executive) and event leads/assistants to:
1. Set and edit the overall Event Budget Total (Ceiling) without modifying the existing "Categories" button or modal behavior.
2. Create, edit, and retire Event Ticket Tiers directly from the Tickets tab in the Event Dashboard.

**Architecture:**
- **Budget Ceiling**: Modernize `setEventBudgetAction` in `src/app/actions.ts` to preserve existing category allocations and send `{ category_id, percentage }` to `public.set_event_budget`. Add an `EventBudgetCeilingModal` triggered by a "Set Budget Total" / "Edit Budget Total" button next to the existing "Categories" button.
- **Ticket Tiers**: Connect the existing backend RPCs (`create_event_ticket_tier`, `update_event_ticket_tier`, `retire_event_ticket_tier`) and server actions (`createEventTicketTierAction`, `updateEventTicketTierAction`, `retireEventTicketTierAction`) to a new `EventTicketTierModal` rendered on `TabTickets`.

**Tech Stack:** Next.js 16 (Server Actions), React 19, TypeScript, Tailwind CSS, Supabase RPCs, Node test runner (`node --test`).

**Spec:**
- `public.set_event_budget(p_event_id, p_total_ngn, p_allocations, p_reason)`: updates budget ceiling, preserving category allocations.
- `public.create_event_ticket_tier(p_event_id, p_name, p_price_ngn, p_capacity, p_reason)`: creates ticket tier.
- `public.update_event_ticket_tier(p_tier_id, p_name, p_price_ngn, p_capacity, p_reason)`: edits name, price, capacity with required reason.
- `public.retire_event_ticket_tier(p_tier_id, p_reason)`: marks tier retired with required reason.

## Global Constraints

- **Preserve Existing Categories Flow**: The `Categories` button on `TabBudgetAllocations` and the `EventCategoryManagementModal` must remain intact and functioning exactly as they currently do.
- **Whole Naira Currency**: All financial figures must use whole Naira integers (`bigint` in DB, no decimals).
- **100% Test Parity**: Maintain 100% test pass rate across the full test suite (`npm test`).
- **Clean Tooling**: Zero Biome lint diagnostics (`npm run lint`), successful production build (`npm run build`).

## Review Focus

1. **Category Allocation Preservation**: When changing the budget ceiling, any existing active category allocations must have their percentages recalculate or persist correctly without being wiped or rejected by PostgreSQL.
2. **Audit Reason Rules**: Initial budget setup or initial tier creation allows optional or default reason; editing an existing budget ceiling or editing/retiring an existing tier strictly requires a reason (1-500 characters).
3. **Empty State Call-to-Actions**: When `budgetCeiling === 0` or `tiers.length === 0`, empty states must offer direct, prominent buttons to configure them.
4. **Tab Navigation Consistency**: Saving or canceling actions must keep the user on the active tab (`tab=budget` or `tab=tickets`) without jumping to `overview`.
5. **Authorization Gating**: Management controls must only render for authorized roles (`isAdmin || isExecutive || isEventLead || isEventAssistant`) on scheduled, unarchived events.

---

### Task 1: Server Actions Alignment & Return Tab Support

**Files:**
- Modify: `src/app/actions.ts:1956-2035,2179-2265`
- Test: `tests/budget-and-tier-actions.test.mjs`

**Interfaces:**
- Consumes: `getActiveEventActor(eventId)`, `supabase.rpc(...)`
- Produces:
  - `setEventBudgetAction(formData: FormData) => Promise<void>` (sets/edits total budget ceiling and preserves/updates allocations)
  - Updated `createEventTicketTierAction`, `updateEventTicketTierAction`, `retireEventTicketTierAction` with `return_tab` support and revalidation on `/events/[eventId]/dashboard`

- [x] **Step 1: Write unit tests for budget ceiling and tier action handling**

Create `tests/budget-and-tier-actions.test.mjs`:
1. Test `setEventBudgetAction` parses `event_id`, `total_ngn`, `reason`, and preserves existing allocations.
2. Test `setEventBudgetAction` enforces reason when existing budget exists; optional on initial setup.
3. Test `createEventTicketTierAction` accepts `return_tab`, validates `price_ngn` and `capacity`.
4. Test `updateEventTicketTierAction` and `retireEventTicketTierAction` enforce required `reason`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/budget-and-tier-actions.test.mjs`
Expected: FAIL.

- [x] **Step 3: Update `src/app/actions.ts`**

1. Modernize `setEventBudgetAction`:
   - Accept `event_id`, `total_ngn`, `reason`, `return_tab`.
   - Query existing `event_budgets` and `event_budget_allocations`.
   - If existing budget exists: require `reason`.
   - Format existing allocations as `{ category_id: a.category_id, percentage: a.allocation_percent }`. If total changes, ensure percentages still sum $\le 100\%$.
   - Call `actor.supabase.rpc("set_event_budget", { p_event_id: eventId, p_total_ngn: total, p_allocations: rpcAllocations, p_reason: reason || null })`.
   - Revalidate `/events/${eventId}/dashboard` and redirect with `?tab=${returnTab}&notice=budget-saved#event-finance-${returnTab}`.
2. Update `createEventTicketTierAction`, `updateEventTicketTierAction`, `retireEventTicketTierAction`:
   - Allow optional `return_tab` in `eventFieldsOnly`.
   - Revalidate `/events/${eventId}/dashboard` alongside `/events/${eventId}/finance`.
   - Pass `return_tab` to `eventFinanceNoticeUrl(eventId, notice, returnTab)`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/budget-and-tier-actions.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/actions.ts tests/budget-and-tier-actions.test.mjs
git commit -m "feat(events): modernize budget ceiling action and add tier return-tab routing"
```

---

### Task 2: Event Budget Ceiling Modal & Tab Integration

**Files:**
- Create: `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`
- Modify: `src/components/events/dashboard/tab-budget-allocations.tsx`
- Modify: `src/components/events/dashboard/tab-overview.tsx`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`
- Test: `tests/event-budget-ceiling-ui.test.mjs`

**Interfaces:**
- Consumes: `setEventBudgetAction`, `canManageCategories`
- Produces: `EventBudgetCeilingModal`, "Set Budget Total" / "Edit Budget Total" buttons

- [x] **Step 1: Write UI component tests for budget ceiling modal and trigger buttons**

Create `tests/event-budget-ceiling-ui.test.mjs`:
1. Modal displays "Set Event Budget Total" when `budgetCeiling === 0`.
2. Modal displays "Edit Event Budget Total" with required reason field when `budgetCeiling > 0`.
3. `TabBudgetAllocations` renders "Set Budget Total" (or "Edit Budget Total") alongside the existing "Categories" button.
4. Existing "Categories" button retains its id (`#btn-manage-budget-categories`) and click handler.
5. `TabOverview` renders quick budget action on the budget ceiling card.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-budget-ceiling-ui.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement `EventBudgetCeilingModal` and wire into views**

1. Create `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`:
   - Form fields: `total_ngn` (using `FormattedAmountInput`), `reason` (mandatory on edit, optional with hint on initial setup), hidden `event_id`, hidden `return_tab`.
   - Action: submits to `setEventBudgetAction`.
   - Full accessibility: focus trap, escape key, aria dialog attributes.
2. In `TabBudgetAllocations` (`src/components/events/dashboard/tab-budget-allocations.tsx`):
   - Add `onOpenBudgetCeilingModal?: () => void` prop.
   - Render button next to "Categories":
     - If `budgetCeiling === 0`: button text `"Set Budget Total"` with `Plus` icon.
     - If `budgetCeiling > 0`: button text `"Edit Budget Total"` with `Edit3` icon.
   - In empty state card: include `"Set Budget Total"` button.
   - **Keep the existing "Categories" button completely intact.**
3. In `TabOverview` (`src/components/events/dashboard/tab-overview.tsx`):
   - Add `onOpenBudgetCeilingModal?: () => void` prop.
   - On the "Approved Club Budget Ceiling" metric card, add an "Edit" / "Set" button when `canManage`.
4. In `EventDashboardView` (`src/components/events/dashboard/event-dashboard-view.tsx`):
   - Add `isBudgetCeilingModalOpen` state.
   - Pass handler to `TabBudgetAllocations` and `TabOverview`.
   - Render `EventBudgetCeilingModal`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-budget-ceiling-ui.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/ tests/event-budget-ceiling-ui.test.mjs
git commit -m "feat(events): add EventBudgetCeilingModal and wire triggers while preserving categories"
```

---

### Task 3: Ticket Tier Modal & Tickets Tab Integration

**Files:**
- Create: `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`
- Modify: `src/components/events/dashboard/tab-tickets.tsx`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`
- Test: `tests/event-ticket-tier-ui.test.mjs`

**Interfaces:**
- Consumes: `DashboardTicketTier`, `createEventTicketTierAction`, `updateEventTicketTierAction`, `retireEventTicketTierAction`
- Produces: `EventTicketTierModal`, "Add Ticket Tier" button in header & empty state, "Edit" and "Retire" buttons on cards

- [x] **Step 1: Write UI component tests for ticket tier modal and actions**

Create `tests/event-ticket-tier-ui.test.mjs`:
1. Modal supports `mode = "create" | "edit" | "retire"`.
2. In create mode: inputs for `name`, `price_ngn`, `capacity`, optional `reason`.
3. In edit mode: prefilled inputs with required `reason`.
4. In retire mode: warning alert, confirmation message, required `reason`.
5. `TabTickets` renders "Add Ticket Tier" button when `canManage` is true.
6. `TabTickets` empty state renders "Create Admission Tier" button.
7. Tier cards render "Edit" and "Retire" buttons for active tiers.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-ticket-tier-ui.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement `EventTicketTierModal` and wire into `TabTickets`**

1. Create `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`:
   - Modal with clean tabbed or mode-specific form for create, edit, and retire.
   - Price field formatted with `FormattedAmountInput`.
   - Capacity field with number limits (1 to 100,000).
   - Reason field with validation.
   - Submits to `createEventTicketTierAction`, `updateEventTicketTierAction`, or `retireEventTicketTierAction`.
2. In `TabTickets` (`src/components/events/dashboard/tab-tickets.tsx`):
   - Add props: `canManage?: boolean`, `onOpenCreateTierModal?: () => void`, `onOpenEditTierModal?: (tier: DashboardTicketTier) => void`, `onOpenRetireTierModal?: (tier: DashboardTicketTier) => void`.
   - In header: add `"Add Ticket Tier"` button (`Plus` + `Ticket` icon) when `canManage`.
   - In empty state card: add `"Create Admission Tier"` button when `canManage`.
   - On each tier card: add an `"Edit"` button and `"Retire"` button for managers.
3. In `EventDashboardView` (`src/components/events/dashboard/event-dashboard-view.tsx`):
   - Add state: `isTierModalOpen`, `tierModalMode`, `selectedTierForEdit`.
   - Pass handlers and `canManageCategories` to `TabTickets`.
   - Render `EventTicketTierModal`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-ticket-tier-ui.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/ tests/event-ticket-tier-ui.test.mjs
git commit -m "feat(events): add EventTicketTierModal and wire ticket tier creation, editing, and retirement"
```

---

### Task 4: Regression Verification & Production Readiness

**Files:**
- Full test suite & build validation

- [x] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 350+ tests pass with 0 failures.

- [x] **Step 2: Run Biome linter & formatting check**

Run: `npm run lint`
Expected: Checked 210+ files, no diagnostics.

- [x] **Step 3: Run Next.js production build**

Run: `npm run build`
Expected: Successfully compiled and optimized production build across all routes.

- [x] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(events): verify full budget ceiling and ticket tier suite, linting, and build"
```
