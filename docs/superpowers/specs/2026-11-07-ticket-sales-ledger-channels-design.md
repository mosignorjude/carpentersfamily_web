# Ticket Sales Ledger Channels Design

## 1. Intent & The Why
Provide clear channel distinction and filtering in the existing Ticket Sales Ledger on the event dashboard (`/events/[eventId]/dashboard?tab=tickets`). Officers and members need to distinguish between physical/cash pass sales recorded directly by club members and online orders originating from the public Box Office storefront without redundant helper copy.

## 2. Goals, Non-Goals, and Anti-Goals
- **Goals:**
  - Label ticket sales as either **Member Sales** (when `source = 'manual'`) or **Online Sales** (when `source = 'online'`).
  - Rename the column header from "Category" to "Channel" specifically when `domain === "tickets"`.
  - Add a dedicated channel segment filter (`All Channels`, `Member Sales`, `Online Sales`) in the ledger toolbar alongside the existing review status filters.
  - Maintain full searchability by channel name.
- **Non-Goals:**
  - Changing the database schema or RPCs (`event_ticket_sales` already strictly enforces `source IN ('manual', 'online')`).
  - Adding channel filtering to other domain ledgers (Revenue or Expenses).
- **Anti-Goals:**
  - No redundant subtitle clutter such as `(Recorded by members)` or `(From Box office)`.
  - No duplication of "recorded by" info in table rows (audit log and inspection drawers already display recorder attribution).

## 3. Constraints
- Preserve existing review status filters (`All`, `Pending Review`, `Approved`, `Rejected`, `Cancelled`).
- Preserve existing permissions, test coverage, and interactive touch-target floor (minimum 44px).
- Zero hardcoded inline hex colors; use brand tokens (`bg-forest`, `bg-warm-canvas`, `border-linen`, `text-espresso`).

## 4. Approaches & Selection
- **Approach 1: Segmented Button Group in Toolbar (Selected)**
  - Places `[ All Channels ] [ Member Sales ] [ Online Sales ]` directly in the ledger toolbar alongside the status pills.
  - *Trade-off*: 1-tap filtering matching existing status pill ergonomics.
- **Approach 2: Dropdown Selector next to Search**
  - Places a dropdown selector `Channel: All ▾` in the search row.
  - *Trade-off*: Slightly more compact, but requires two taps to change channels.
- **Decision:** Selected Approach 1 for consistent 1-tap UX across desktop and mobile.

## 5. Implementation Details
1. **Transaction Mapping (`src/app/(member)/events/[eventId]/dashboard/page.tsx`):**
   - For each sale in `allSales`, if `s.source === 'online'` set `categoryLabel = "Online Sales"`, otherwise `categoryLabel = "Member Sales"`.
   - Retain `category = "ticket_sales"` for existing summary filtering.
2. **Ledger Presentation (`src/components/events/dashboard/event-domain-ledger.tsx`):**
   - When `domain === "tickets"`, render table column header as **Channel** instead of **Category**.
   - Add state `channelFilter: "all" | "member" | "online"`.
   - Render channel segment buttons in the filter bar when `domain === "tickets"`.
   - Filter transactions by `channelFilter` alongside `statusFilter` and `searchQuery`.

## 6. What's Left to the Builder
- Wire responsive mobile cards to display the clean `Member Sales` / `Online Sales` channel badge.
- Ensure automated test suite covers the new channel filtering behavior.
