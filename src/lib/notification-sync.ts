export const NOTIFICATION_SYNC_EVENT = "cf:notifications-sync";

export type NotificationSyncPayload =
  | { kind: "mark-read"; id: string; readAt: string }
  | { kind: "mark-unread"; id: string }
  | { kind: "mark-all-read"; readAt: string }
  | { kind: "delete"; id: string }
  | { kind: "delete-all" };

export function dispatchNotificationSync(payload: NotificationSyncPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationSyncPayload>(NOTIFICATION_SYNC_EVENT, {
      detail: payload,
    }),
  );
}
