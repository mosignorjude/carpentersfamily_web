/**
 * @fileoverview The public landing's only view of the events table. Every card,
 * ribbon line and count rendered by `src/app/page.tsx` is built here from rows
 * returned by public.get_public_ticketed_events(), so the page can never name a
 * event, a date, a place or a dress code that the database does not carry.
 */

import { formatEventTime } from "./event-times.mjs";

const LAGOS = "Africa/Lagos";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: LAGOS,
});

function parse(iso) {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function text(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/** capacity null or 0 means an uncapped tier, which can never sell out. */
function cappedCapacity(tier) {
  const capacity = Number(tier?.capacity);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
}

function cheapestPrice(tiers) {
  if (!Array.isArray(tiers)) return null;
  const prices = tiers
    .map((tier) => Number(tier?.price_ngn))
    .filter((price) => Number.isFinite(price) && price >= 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function isSoldOut(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  return tiers.every((tier) => {
    const capacity = cappedCapacity(tier);
    if (capacity === null) return false;
    return Number(tier?.sold ?? 0) >= capacity;
  });
}

/**
 * @param {Array<{id?: string | null, title?: string | null, starts_at?: string | null,
 *   location?: string | null, description?: string | null,
 *   tiers?: Array<{price_ngn?: number | null, capacity?: number | null, sold?: number | null}> | null}> | null | undefined} events
 */
export function selectLandingEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => {
    const instant = parse(event?.starts_at);
    return {
      id: text(event?.id) ?? "",
      title: text(event?.title) ?? "Untitled event",
      startsAt: instant ? instant.toISOString() : null,
      whenLabel: instant ? dateFormatter.format(instant) : "",
      timeLabel: instant ? formatEventTime(event.starts_at) : "",
      location: text(event?.location),
      blurb: text(event?.description),
      cheapestPrice: cheapestPrice(event?.tiers),
      soldOut: isSoldOut(event?.tiers),
    };
  });
}

/**
 * The earliest event in the set — the one the ribbon and the hero announce.
 * The RPC already orders by starts_at, but an unsorted caller must not change
 * what the public sees, so the ordering is decided here.
 */
export function selectNextEvent(events) {
  const cards = selectLandingEvents(events);
  if (cards.length === 0) return null;
  const withDates = events
    .map((event, index) => ({
      instant: parse(event?.starts_at),
      card: cards[index],
    }))
    .filter((row) => row.instant !== null)
    .sort((a, b) => a.instant.getTime() - b.instant.getTime());
  return withDates.length > 0 ? withDates[0].card : cards[0];
}
