# Ticket Sales Ledger Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement sales channel labeling ("Member Sales" vs "Online Sales") and 1-tap channel segment filtering in the existing Ticket Sales Ledger (`EventDomainLedger`) on the event dashboard.

**Architecture:** Extend `DashboardTransaction` with an explicit `channel?: "member" | "online"` field mapped in `src/app/(member)/events/[eventId]/dashboard/page.tsx` from `event_ticket_sales.source`. Update `EventDomainLedger` to render a "Channel" column header when `domain === "tickets"`, display clean "Member Sales" / "Online Sales" badge chips, and provide a 1-tap channel segment filter toolbar (`All Channels`, `Member Sales`, `Online Sales`) alongside review status filters.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Node test runner (`node:test`).

**Spec:** [`docs/superpowers/specs/2026-11-07-ticket-sales-ledger-channels-design.md`](file:///c:/Users/HomePC/Documents/codex/Carpentersfamily/docs/superpowers/specs/2026-11-07-ticket-sales-ledger-channels-design.md)

## Global Constraints

- Preserve all existing routes, database permissions, server actions, and public guest checkout boundaries.
- Minimum interactive touch-target floor of 44px (`min-h-[44px]` or `min-h-[38px]` with adequate tap spacing).
- Zero em-dashes (`—`) anywhere in component markup or copy.
- Zero hardcoded inline hex color literals; use semantic brand tokens (`text-espresso`, `text-forest`, `bg-warm-canvas`, `border-linen`, `text-ochre`, `text-muted`).
- Zero redundant parentheticals like `(Recorded by members)` or `(From Box office)`.
- Maintain 100% pass rate across the full test suite (`npm test`, 1020+ tests).
- Clean Biome linter check (`npm run lint`) and TypeScript type check (`npx tsc --noEmit`).

## Review Focus

- When an event has both member desk and online box office ticket sales, filtering by "Member Sales" excludes all online sales and retains all member desk sales.
- When filtering by "Online Sales", the ledger excludes manual member sales and retains only online box office orders.
- When switching between review status tabs (e.g. "Pending Review") while a channel filter is active, both filters compose together correctly.
- When `domain !== "tickets"` (e.g. revenue or expenses ledger), the column header remains "Category" and channel filters are not rendered.
- Search queries for "Member Sales" or "Online Sales" match the channel and return the filtered results.

---

### Task 1: Add Unit Tests for Ticket Sales Ledger Channel Types & Filtering

**Files:**
- Create: `tests/ticket-sales-ledger-channels.test.mjs`

- [ ] **Step 1: Write failing test file**
Write `tests/ticket-sales-ledger-channels.test.mjs` exercising:
1. `DashboardTransaction` channel property assignment for manual vs online sales.
2. Category label mapping: `source === 'online'` produces `"Online Sales"` and `source === 'manual'` produces `"Member Sales"`.
3. Absence of redundant subtitle strings `(Recorded by members)` and `(From Box office)`.
4. Channel filtering logic composition with status filters and search query.
5. Column header logic: returns "Channel" when `domain === "tickets"` and "Category" otherwise.

- [ ] **Step 2: Run test to confirm failures**
Run `node --test tests/ticket-sales-ledger-channels.test.mjs` and verify tests fail or check expected module outputs.

- [ ] **Step 3: Commit test file**
Commit the test file: `git add tests/ticket-sales-ledger-channels.test.mjs && git commit -m "test(tickets): add test suite for ticket sales ledger channel filtering"`

---

### Task 2: Update Transaction Types & Dashboard Data Mapping

**Files:**
- Modify: `src/components/events/dashboard/dashboard-types.ts:70-115`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:710-748`

- [ ] **Step 1: Update DashboardTransaction interface**
In `src/components/events/dashboard/dashboard-types.ts`, add:
```typescript
channel?: "member" | "online";
```

- [ ] **Step 2: Update page.tsx sale transaction mapping**
In `src/app/(member)/events/[eventId]/dashboard/page.tsx`, update the mapping of `allSales`:
```typescript
const isOnline = (s as { source?: string }).source === "online";
const channelLabel = isOnline ? "Online Sales" : "Member Sales";

return {
  ...
  category: "ticket_sales",
  categoryLabel: channelLabel,
  channel: isOnline ? ("online" as const) : ("member" as const),
  ...
};
```

- [ ] **Step 3: Verify TypeScript compilation**
Run `npx tsc --noEmit` to verify type safety across all dashboard components.

- [ ] **Step 4: Commit type and mapping changes**
Commit: `git add src/components/events/dashboard/dashboard-types.ts src/app/(member)/events/[eventId]/dashboard/page.tsx && git commit -m "feat(tickets): map ticket sale channel on dashboard transactions"`

---

### Task 3: Implement Channel Filtering & Header in EventDomainLedger

**Files:**
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx:40-100, 130-210, 260-280, 420-435, 510-525`

- [ ] **Step 1: Add channel filter state in `EventDomainLedger`**
In `src/components/events/dashboard/event-domain-ledger.tsx`:
Add state:
```typescript
const [channelFilter, setChannelFilter] = useState<"all" | "member" | "online">("all");
```

- [ ] **Step 2: Update filter composition logic**
In `filtered = transactions.filter(...)`:
```typescript
if (domain === "tickets" && channelFilter !== "all") {
  const txnChannel = txn.channel || (txn.categoryLabel === "Online Sales" ? "online" : "member");
  if (txnChannel !== channelFilter) {
    return false;
  }
}
```

- [ ] **Step 3: Render Channel Segment Bar in toolbar**
When `domain === "tickets"`, render the segmented toggle:
- `All Channels ({total})`
- `Member Sales ({memberCount})`
- `Online Sales ({onlineCount})`
With accessible touch target floor (`min-h-[38px]`, rounded corners, active `bg-[#174C37] text-white`).

- [ ] **Step 4: Update Desktop Table Header & Cell**
When `domain === "tickets"`:
- Column header displays `Channel` instead of `Category`.
- Cell renders the badge chip (`Online Sales` in Forest badge, `Member Sales` in Linen badge).

- [ ] **Step 5: Update Mobile Card Badge**
In mobile card rendering, display the channel badge chip clearly without redundant parenthetical text.

- [ ] **Step 6: Run tests and verify**
Run `node --test tests/ticket-sales-ledger-channels.test.mjs` and `npm test` to verify all tests pass.

- [ ] **Step 7: Commit component implementation**
Commit: `git add src/components/events/dashboard/event-domain-ledger.tsx && git commit -m "feat(tickets): add channel segment filter and column header to ticket sales ledger"`

---

### Task 4: Full Verification, Linter & Build Check

**Files:**
- Test: Full test suite (`npm test`)
- Lint: Biome check (`npm run lint`)
- Build: Next.js production build (`npm run build`)

- [ ] **Step 1: Run linter**
Execute `npm run lint` and verify no biome warnings or errors.

- [ ] **Step 2: Run full test suite**
Execute `npm test` and verify 100% pass rate.

- [ ] **Step 3: Run production build**
Execute `npm run build` and ensure Turbopack compilation and TypeScript type checking succeed cleanly.

- [ ] **Step 4: Stop temporary visual companion server**
Stop background visual companion daemon task to keep workspace clean.

- [ ] **Step 5: Commit any final cleanup**
Commit: `git commit -am "chore(tickets): verify ticket sales ledger channel filtering"`
