# Box Office Member Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the signed-in Box Office UI (`/tickets`) into an actionable, anti-slop member ticketing portal tailored to real club workflows: physical ticket sales recorded in the event dashboard, online pass orders requiring guest attendee details (never member auto-fill), one-tap public link sharing for guests, segmented officer operational views, and calibrated Warm Editorial styling.

**Architecture:** 
1. **Guest-First Order Intake:** When members order passes for guests online, `TicketCheckoutOverlay` strictly captures the **guest attendee's details** (name, email, phone) so tickets and QR codes reach the guest directly—never auto-filling the member's personal info.
2. **Physical Sales Integration:** Highlight the direct pathway to `/events/[id]/dashboard?tab=tickets` where officers and authorized members record physical and cash ticket sales into the event ledger.
3. **One-Tap Guest Link Sharing:** Provide a prominent "Copy Guest Link" action on each event card so members can instantly copy and forward the public storefront link to friends and invitees.
4. **Officer Operational Segmentation:** Give officers an accessible segmented switcher (`Browse Events & Passes` vs. `Operations & Verification Desk`) eliminating redundant stacked event lists.
5. **Brand Polish & Restraint:** Prune uppercase tracking micro-labels, eliminate em-dashes, replace generic amber with brand Ochre tokens, and add 1-tap copy for the club bank account.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript, Node test runner (`node:test`).

**Spec & Context:**
- Audit Artifact: [`C:\Users\HomePC\.gemini\antigravity\brain\e08de48a-024f-496e-8905-753549c6af42\taste-audit-signed-in-box-office.md`](file:///C:/Users/HomePC/.gemini/antigravity/brain/e08de48a-024f-496e-8905-753549c6af42/taste-audit-signed-in-box-office.md)
- Domain Rule: Members do not use their details to purchase for guests. Physical sales are recorded in the event dashboard. Online orders require guest recipient details so tickets reach the guest.

## Global Constraints

- Preserve all existing routes, database permissions, server actions, and public guest checkout boundaries.
- Minimum interactive touch-target floor of 44px (`min-h-[44px]` or `min-h-[48px]`).
- Zero em-dashes (`—`) anywhere in component markup or copy.
- Zero hardcoded inline hex color literals; use semantic brand tokens (`text-espresso`, `text-forest`, `bg-warm-canvas`, `border-linen`, `text-ochre`, `text-muted`).
- Maximum 1 uppercase tracking eyebrow per 3 sections (Section 4.7 of `design-taste-frontend`).
- Maintain 100% pass rate across the full test suite (`npm test`, 1020+ tests).
- Clean Biome linter check (`npm run lint`) and TypeScript type check (`npx tsc --noEmit`).

---

### Task 1: Clarify Guest Recipient Intake in `TicketCheckoutOverlay`

**Files:**
- Modify: `src/components/tickets/ticket-checkout-overlay.tsx`
- Test: `tests/portal-box-office-view.test.mjs`

**Interfaces:**
- Consumes: `DraftFields` in `TicketCheckoutOverlay`.
- Produces: Explicit guest recipient labels and helper copy stating tickets are delivered directly to the guest's email.

- [ ] **Step 1: Write the failing test for guest-first intake labeling and copy**

Add to `tests/portal-box-office-view.test.mjs`:
```javascript
test("TicketCheckoutOverlay enforces guest recipient labeling and clear delivery helper copy", () => {
  const checkoutSource = readFileSync(
    "src/components/tickets/ticket-checkout-overlay.tsx",
    "utf8",
  );
  assert.match(
    checkoutSource,
    /Guest Attendee Details|Guest \/ Attendee Details/i,
    "Step 2 must clearly indicate that details belong to the guest/attendee",
  );
  assert.match(
    checkoutSource,
    /delivered directly to the guest|emailed directly to/i,
    "Step 2 must explain that tickets are delivered to the recipient email",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Update Step 2 copy in `TicketCheckoutOverlay`**

In `src/components/tickets/ticket-checkout-overlay.tsx`:
1. Update Step 2 header:
   - Heading: "Guest Attendee Details"
   - Subhead: "Provide the attendee's name, email, and phone number. Official tickets and entry passes are delivered directly to this email."
2. Update field label for email:
   - "Guest Email Address (Pass Delivered Here)"
3. Ensure no automatic member credential prefill occurs; fields start empty to ensure recipient accuracy.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tickets/ticket-checkout-overlay.tsx tests/portal-box-office-view.test.mjs
git commit -m "feat(tickets): clarify guest recipient details and delivery helper in checkout overlay"
```

---

### Task 2: Actionable Tier Cards, Guest Ordering, and 1-Tap Link Sharing in `PortalBoxOfficeView`

**Files:**
- Modify: `src/components/tickets/portal-box-office-view.tsx`
- Test: `tests/portal-box-office-view.test.mjs`

**Interfaces:**
- Consumes: `checkoutFromWindow`, `buildCheckoutQuery`, `checkoutHref`, `tierRemaining` from `@/lib/ticket-order-state.mjs`.
- Produces:
  - Interactive tier cards (`<button type="button">`) triggering `TicketCheckoutOverlay`.
  - "Order Pass for Guest" primary CTA on each event card.
  - "Copy Guest Link" button copying the public storefront URL (`/tickets?event=${event.id}&view=public`) with toast feedback.
  - "Record Physical Sales & Manage Ledger" prominent shortcut for officers linking to `/events/${event.id}/dashboard?tab=tickets`.

- [ ] **Step 1: Write the failing test for actionable portal tier cards, guest link sharing, and physical sales link**

Add to `tests/portal-box-office-view.test.mjs`:
```javascript
test("PortalBoxOfficeView provides interactive tier buttons, guest link copy, and physical sales routing", () => {
  const portalSource = readFileSync(
    "src/components/tickets/portal-box-office-view.tsx",
    "utf8",
  );
  assert.match(
    portalSource,
    /TicketCheckoutOverlay/,
    "PortalBoxOfficeView must mount TicketCheckoutOverlay for online guest pass orders",
  );
  assert.match(
    portalSource,
    /btn-tier-select-/,
    "PortalBoxOfficeView must render interactive tier selection buttons",
  );
  assert.match(
    portalSource,
    /btn-copy-guest-link-/,
    "PortalBoxOfficeView must provide a copy guest link button on event cards",
  );
  assert.match(
    portalSource,
    /Record Physical Sales|Manage Event Tickets/,
    "PortalBoxOfficeView must provide a direct shortcut to record physical sales in event dashboard",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement interactive tier buttons, checkout overlay, link sharing, and physical sales actions**

In `src/components/tickets/portal-box-office-view.tsx`:
1. Import `TicketCheckoutOverlay`, `buildCheckoutQuery`, `type CheckoutState`, `parseCheckoutState`.
2. Add checkout overlay state synced with browser URL:
   ```tsx
   const [checkout, setCheckout] = useState<CheckoutState | null>(null);
   const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
   ```
3. Convert tier display boxes to interactive `<button type="button">` with `min-h-[44px]`:
   - Click handler sets `checkout` state and opens `TicketCheckoutOverlay`.
   - Tactile feedback: `active:scale-[0.98] cursor-pointer` (or `cursor-not-allowed` when sold out).
4. Add action buttons to each event card:
   - Primary: "Order Pass for Guest" button (launches checkout overlay).
   - Secondary: "Copy Guest Link" button (copies `/tickets?event=${event.id}&view=public` to clipboard, switches to "Copied!" for 2 seconds).
   - Officer action: "Record Physical Sales & Ledger" (`/events/${event.id}/dashboard?tab=tickets`).
5. Render `<TicketCheckoutOverlay ... />` when `checkout && activeEvent` is active.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tickets/portal-box-office-view.tsx tests/portal-box-office-view.test.mjs
git commit -m "feat(tickets): add interactive tier selection, guest link sharing, and physical sales routing"
```

---

### Task 3: Officer Segmented View Navigation & Deduplication

**Files:**
- Modify: `src/components/tickets/portal-box-office-view.tsx`
- Modify: `src/components/tickets/officer-box-office-desk.tsx`
- Test: `tests/portal-box-office-view.test.mjs`

**Interfaces:**
- Consumes: `isOfficer` and `summary` props.
- Produces: Accessible segmented tabs (`activeView: "passes" | "desk"`) separating the member pass storefront from the officer operational desk.

- [ ] **Step 1: Write the failing test for officer view segmentation**

Add to `tests/portal-box-office-view.test.mjs`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement segmented view switcher in `PortalBoxOfficeView`**

1. In `src/components/tickets/portal-box-office-view.tsx`:
   - Introduce state: `const [officerTab, setOfficerTab] = useState<"passes" | "desk">("passes");`.
   - When `isOfficer && summary`, render segmented pill tabs:
     - `tab-officer-passes`: "Browse Events & Passes"
     - `tab-officer-desk`: "Operations & Verification Desk" (with pending count badge if > 0).
   - When `officerTab === "desk"`, render `<OfficerBoxOfficeDesk ... />`.
   - When `officerTab === "passes"`, render the available events section.
   - For regular members, always render the available events section.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tickets/portal-box-office-view.tsx tests/portal-box-office-view.test.mjs
git commit -m "feat(tickets): add segmented view switcher for officers to prevent event duplication"
```

---

### Task 4: Anti-Slop Typography Refinement, Brand Token Calibration & Copy Polish

**Files:**
- Modify: `src/components/tickets/portal-box-office-view.tsx`
- Modify: `src/components/tickets/officer-box-office-desk.tsx`
- Test: `tests/portal-box-office-view.test.mjs`

**Interfaces:**
- Consumes: Semantic tokens `--color-ochre`, `--color-forest`, `--color-linen`, `--color-espresso`.
- Produces: Restrained typography with ≤ 2 uppercase tracking labels per view, zero em-dashes, and verified brand warning states.

- [ ] **Step 1: Write the failing test for eyebrow restraint and brand token compliance**

Add to `tests/portal-box-office-view.test.mjs`:
```javascript
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
  assert.doesNotMatch(deskSource, /bg-amber-100/, "Use brand ochre tokens instead of generic Tailwind amber");
  assert.doesNotMatch(deskSource, /text-amber-900/, "Use brand espresso/ochre tokens instead of generic Tailwind amber");

  // Zero em-dashes across components
  assert.doesNotMatch(portalSource, /—/, "PortalBoxOfficeView must contain zero em-dashes");
  assert.doesNotMatch(deskSource, /—/, "OfficerBoxOfficeDesk must contain zero em-dashes");

  // Eyebrow count check in PortalBoxOfficeView (max 3)
  const portalEyebrows = portalSource.match(/uppercase tracking-(?:wider|widest)/g) ?? [];
  assert.ok(portalEyebrows.length <= 3, `PortalBoxOfficeView must have <= 3 uppercase tracking labels; found ${portalEyebrows.length}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Refactor typography, prune eyebrows, and apply Warm Editorial tokens**

1. In `src/components/tickets/officer-box-office-desk.tsx`:
   - Replace `bg-amber-50/70 border-amber-200` with `bg-ochre/10 border-ochre/30`.
   - Replace `bg-amber-200 text-amber-900` with `bg-ochre/25 text-espresso`.
   - Replace `text-amber-900` with `text-espresso font-extrabold`.
   - Replace `text-amber-800` with `text-ochre font-bold`.
2. In `src/components/tickets/portal-box-office-view.tsx`:
   - Remove decorative `Official Event` badge from event cards.
   - Refactor uppercase tracking in `Admission Tiers & Pass Pricing` to clean sentence-case subhead: `text-xs font-bold text-espresso`.
   - Update footer copy: replace *"Passes and reservations are logged in the club ledger. Guests can purchase passes online via the public storefront."* with: *"Official club passes and table reservations logged directly in the club ledger."*
   - In the Bank Details section, add a copy button for the account number with clipboard feedback and accessible label.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portal-box-office-view.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Run full test suite and linters**

Run:
```bash
npm run lint
npx tsc --noEmit
npm test
```
Expected: 0 lint errors, 0 type errors, all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/tickets/portal-box-office-view.tsx src/components/tickets/officer-box-office-desk.tsx tests/portal-box-office-view.test.mjs
git commit -m "style(tickets): calibrate brand tokens, prune eyebrow saturation, and polish copy voice"
```

---

## Self-Review

1. **Alignment with User Clarification:**
   - Members don't use their own details: No auto-fill of member credentials into the ticket order form; Step 2 explicitly prompts for Guest / Attendee details.
   - Physical sales: Direct routing and clear callouts to `/events/[id]/dashboard?tab=tickets` where physical ticket sales are logged into the ledger.
   - Guest delivery: Explicit helper copy that entry passes and QR codes are emailed directly to the guest's email.
   - Link sharing: 1-tap "Copy Guest Link" action so members can send the public link directly to guests.
2. **Review Focus:** Covered guest recipient intake, physical sales workflow, link sharing, officer view segmentation, touch-target compliance, and test suite safety.
