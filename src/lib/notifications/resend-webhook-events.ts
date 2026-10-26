const OUTBOX_SYNC_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
]);

export function isOutboxSyncEvent(eventType: string): boolean {
  return OUTBOX_SYNC_EVENTS.has(eventType);
}
