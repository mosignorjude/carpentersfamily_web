# Phase 2 Implementation Plan: Card Consolidation & Copy/Content Pruning

> **Objective:** Streamline mobile viewports by consolidating vertically stacked single-metric cards into responsive 2-column/3-column stat grids, pruning verbose repetitive disclaimers, and converting dense static policy cards into collapsible accordions.

---

### Task 1: Member Home Dashboard Consolidation
**Files:**
- Modify: `src/components/home/member-dues-card.tsx`
- Modify: `src/components/home/quick-links-section.tsx`
- Test: Unit check & mobile verification at 390px

- [x] **Step 1: Consolidate Dues sub-cards on mobile**
  In `member-dues-card.tsx`, add a responsive mobile 3-metric strip (`sm:hidden`) displaying `[Paid] · [Due] · [Status]` while preserving desktop 3-card layout (`hidden sm:grid sm:grid-cols-3`).
- [x] **Step 2: Convert Quick Access services into a 2x2 grid on mobile**
  In `quick-links-section.tsx`, change `grid-cols-1` to `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4` and hide verbose descriptions on mobile (`hidden sm:block`).

---

### Task 2: Member Dues Page Consolidation & Exemption Cleanup
**Files:**
- Modify: `src/components/dues/dues-summary-cards.tsx`
- Modify: `src/components/dues/dues-page-view.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Convert 4 dues metric cards into a 2x2 summary matrix**
  In `dues-summary-cards.tsx`, change mobile grid from `grid-cols-1` to `grid-cols-2 gap-2.5 sm:gap-4` and tune metric fonts for 2-column mobile layout.
- [x] **Step 2: Hide duplicate exemption callout card on mobile**
  In `dues-page-view.tsx`, mark the second full-width `Club Administrator Exemption` callout as `hidden sm:flex`, relying on the top `[Admin Dues Exempt]` badge.

---

### Task 3: Club Finances Header & Mandate Pruning
**Files:**
- Modify: `src/components/finances/finances-page-view.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Shorten H1 and subtitle on mobile**
  In `finances-page-view.tsx`, make H1 responsive (`Club Finances` on mobile) and prune the 3-line subtitle.
- [x] **Step 2: Collapse static Mandate disclaimer on mobile**
  Hide the large 160px static Mandate card on mobile (`hidden sm:flex`), showing a discrete privacy badge in the mobile metadata strip.

---

### Task 4: Communications Privacy Banner Collapsible Cleanup
**Files:**
- Modify: `src/components/communications/communications-privacy-banner.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Transform static policy banner into a native `<details>` element**
  In `communications-privacy-banner.tsx`, convert the static container into a `<details>` element with a 44px summary line (`View Policy ▾`), reclaiming ~180px above the fold.

---

### Task 5: Member Admin Governance Rules Accordion
**Files:**
- Modify: `src/components/admin/members/member-admin-permission-guide.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Convert governance rules into a collapsible `<details>` element**
  In `member-admin-permission-guide.tsx`, wrap the 3-card rules block in a `<details>` element on mobile, saving 300px so administrators immediately see membership requests.

---

### Task 6: Event Dashboard Header & Redundancy Pruning
**Files:**
- Modify: `src/components/events/dashboard/tab-overview.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Eliminate duplicate H2 on mobile**
  In `tab-overview.tsx`, render `<span className="sm:hidden">Financial Overview</span><span className="hidden sm:inline">{event.title} — Event Finance</span>` to eliminate the duplicate heading within 100px.

---

### Task 7: End-to-End Mobile Flow Verification & Screenshot Capture
**Files:**
- Verify: Full test suite & automated mobile browser capture

- [x] **Step 1: Run TypeScript check (`npx tsc --noEmit`)**
- [x] **Step 2: Run full test suite (`npm test`)**
- [x] **Step 3: Capture mobile browser screenshots across all updated pages**
