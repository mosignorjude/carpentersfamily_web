# Mobile UX Option B & Phase 1 Responsive Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Option B Interactive Bottom Sheet Picker for the Event Dashboard mobile navigation, resolve the mobile drawer menu backdrop click interception bug, and consolidate cluttered mobile card action clusters.

**Architecture:** 
1. Build a self-contained, accessible `MobileTabBottomSheet` component with touch backdrop hygiene, keyboard dismiss (`Escape`), and rich metadata (section icons, titles, and subtitles).
2. Wire `MobileTabBottomSheet` into `EventDashboardView` for viewports under 640px (`sm:hidden`), while preserving the horizontal pill tabs for tablet and desktop (`hidden sm:flex`), and eliminate the inverted "Swipe right" helper text.
3. Elevate the hamburger button in `mobile-app-menu.tsx` to `relative z-80` so the `fixed z-70` backdrop overlay does not intercept toggle clicks.
4. Consolidate the 5 wrapped action buttons on event cards in `events-page-view.tsx` into a primary CTA (`Open Dashboard`) and a compact secondary action menu.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide React, Vitest / Testing Library.

**Spec:** [mobile-responsive-ui-ux-audit.md](file:///C:/Users/HomePC/.gemini/antigravity/brain/e08de48a-024f-496e-8905-753549c6af42/mobile-responsive-ui-ux-audit.md) & [dashboard-navigation-preview.html](file:///C:/Users/HomePC/.gemini/antigravity/brain/e08de48a-024f-496e-8905-753549c6af42/dashboard-navigation-preview.html)

---

## Global Constraints

- Preserve all existing role permission guards and server action mutation flows.
- Maintain Warm Editorial brand aesthetics (`#174C37` forest green, `#8A641A` gold/ochre accents, `#FBF9F5` warm sand surfaces, `#E5DDD3` borders).
- Keep desktop and tablet layouts (`sm:` and `lg:`) unchanged while optimizing mobile (`< 640px`).
- Ensure WCAG 2.2 AA accessibility standards: minimum 44×44px touch targets for primary interactive controls, ARIA dialog roles (`role="dialog"`, `aria-modal="true"`, `aria-expanded`).
- Do not add heavy external UI dependencies; use existing Lucide icons and lightweight React state.

---

## Review Focus

1. **Backdrop & Focus Trap Hygiene:** When the bottom sheet is open, background scrolling should be locked, tapping the blurred backdrop or pressing `Escape` must close the sheet, and keyboard focus must return cleanly to the trigger button.
2. **URL Hash & Query Synchronization:** Selecting any section in the bottom sheet must update the URL (`?tab=<id>#event-finance-<id>`) identically to desktop tabs.
3. **Responsive Breakpoint Cleanliness:** No layout flash or simultaneous display of both bottom sheet trigger and desktop tabs at 640px boundary.
4. **Touch Target Sizing:** Every item inside the bottom sheet must offer a minimum 48px vertical touch target for error-free one-handed thumb tapping.
5. **Backdrop Interception Regression:** Tapping the hamburger button toggle `×` when the main navigation drawer is open must cleanly close the drawer.

---

## Tasks

### Task 1: Create `MobileTabBottomSheet` Component

**Files:**
- Create: `src/components/events/dashboard/mobile-tab-bottom-sheet.tsx`
- Test: `tests/unit/mobile-tab-bottom-sheet.test.tsx`

- [ ] **Step 1: Write failing unit test for `MobileTabBottomSheet`**
  Verify that the component renders the trigger button displaying the active tab, opens the bottom sheet drawer upon clicking, displays all 8 section items with subtitles, calls `onSelectTab` when an item is tapped, and closes on backdrop click or `Escape` key.

- [ ] **Step 2: Run unit test to confirm failure**
  Run `npm test tests/unit/mobile-tab-bottom-sheet.test.tsx` and confirm it fails because the component does not yet exist.

- [ ] **Step 3: Implement `MobileTabBottomSheet`**
  Create `src/components/events/dashboard/mobile-tab-bottom-sheet.tsx` with:
  - Props:
    ```typescript
    export interface MobileTabItem {
      id: DashboardTab;
      label: string;
      subtitle: string;
      icon: React.ComponentType<{ className?: string }>;
    }
    
    interface MobileTabBottomSheetProps {
      activeTab: DashboardTab;
      onSelectTab: (tab: DashboardTab) => void;
      tabs: MobileTabItem[];
    }
    ```
  - Trigger pill button with active section icon, label, "8 Sections ▾" badge, and `aria-expanded`.
  - Slide-up bottom sheet with `role="dialog"`, `aria-modal="true"`, drag pill, close `✕` button, active checkmark (`✓`), and smooth `animate-in slide-in-from-bottom` transition.
  - Backdrop click and `Escape` key hygiene.

- [ ] **Step 4: Verify tests pass**
  Run `npm test tests/unit/mobile-tab-bottom-sheet.test.tsx` to verify clean pass.

---

### Task 2: Integrate Bottom Sheet into Event Dashboard & Responsive Tab Switcher

**Files:**
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:391-410,550-587`
- Test: Browser verification at 390px mobile viewport

- [x] **Step 1: Enrich `tabs` definition with descriptive mobile subtitles**
  In `event-dashboard-view.tsx`, extend the `tabs` array with domain-specific subtitles for each of the 8 tabs:
  - `overview`: "Financial summary, budget ceiling & variances"
  - `tickets`: "Tier inventory, sales tallies & pass holders"
  - `expenses`: "Operational cost centers & vendor receipts"
  - `budget`: "Departmental limits & statutory caps"
  - `revenue`: "Sponsorships, donations & external inflows"
  - `reports`: "Financial statements, P&L & PDF export"
  - `team_roles`: "Committee desks & authorized officers"
  - `audit_log`: "Immutable transaction journal & void logs"

- [x] **Step 2: Update rendering in `event-dashboard-view.tsx`**
  - Render `<MobileTabBottomSheet>` conditionally for mobile viewports:
    ```tsx
    <div className="sm:hidden pt-2 border-t border-[#E5DDD3]">
      <MobileTabBottomSheet
        activeTab={activeTab}
        onSelectTab={selectTab}
        tabs={tabs}
      />
    </div>
    ```
  - Wrap the horizontal pill strip in `<div className="hidden sm:block pt-2 border-t border-[#E5DDD3]">`.
  - Remove the inverted helper text `"Swipe right for more sections"`.

- [x] **Step 3: Run TypeScript & Next build check**
  Run `npx tsc --noEmit` to ensure zero type regressions.

---

### Task 3: Fix Mobile Menu Backdrop Click Interception Bug

**Files:**
- Modify: `src/components/mobile-app-menu.tsx:28-48`
- Modify: `src/app/globals.css:3983-4010`
- Test: Mobile browser verification

- [x] **Step 1: Elevate toggle button stacking context**
  In `src/components/mobile-app-menu.tsx`, add `relative z-80` to `.app-menu-toggle` so that when `isOpen === true`, the toggle button sits above the `z-70` backdrop overlay:
  ```tsx
  <button
    ref={menuButton}
    aria-controls="mobile-primary-navigation"
    aria-expanded={isOpen}
    aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
    className="button-secondary app-menu-toggle relative z-80"
    onClick={() => setIsOpen((open) => !open)}
    onKeyDown={closeOnEscape}
    type="button"
  >
  ```

- [x] **Step 2: Verify in CSS that toggle remains clickable**
  Ensure `.app-menu-toggle` in `src/app/globals.css` does not have clipping or overflow restrictions that hinder touch taps.

---

### Task 4: Consolidate Event Card Action Button Clutter

**Files:**
- Modify: `src/components/events/event-card.tsx`
- Test: Mobile browser verification at 390px

- [x] **Step 1: Simplify event card actions on mobile**
  On event cards in `event-card.tsx`:
  - Provide a clear, full-width primary CTA button on mobile: `[Open Event Dashboard →]`.
  - Place secondary actions (`Minutes & Attendance`, `Edit Details`, `Complete`, `Cancel`) into a compact overflow dropdown or secondary action menu/strip on mobile.

---

### Task 5: End-to-End Mobile Flow Verification

**Files:**
- Verify: Full test suite & local mobile browser verification

- [x] **Step 1: Run project test suite**
  Execute `npm test` and verify all unit and integration tests pass (501 tests passing, 0 failing).

- [x] **Step 2: Run automated mobile browser test suite**
  Using `agent-browser` at `390 × 844`, test:
  1. Login and navigate to `/events`.
  2. Open mobile hamburger menu, tap `×` to close, and verify toggle click is not intercepted.
  3. Open event dashboard; verify bottom sheet trigger is visible.
  4. Tap bottom sheet trigger; verify sheet opens smoothly from bottom with all 8 items.
  5. Tap `Tickets` item; verify sheet closes, URL updates to `?tab=tickets#event-finance-tickets`, and ticket view renders.
  6. Tap bottom sheet trigger; tap `Audit Log` item; verify transaction audit log renders.
  7. Verify no horizontal spillage outside the 390px viewport.

- [ ] **Step 3: Commit changes**
  Commit the completed tasks with clear, concise messages.
