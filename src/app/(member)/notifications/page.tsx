import Link from "next/link";
import { redirect } from "next/navigation";
import {
  markNotificationReadAction,
  setNotificationPreferenceAction,
} from "@/app/actions";
import {
  getNotificationCategoryLabel,
  getNotificationReadLabel,
  getNotificationTimestamp,
  routinePreferenceCategories,
} from "@/lib/notification-page-presentation.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NotificationRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  event_id: string | null;
  created_at: string;
  read_at: string | null;
};

type PreferenceRow = { category: string; enabled: boolean };

const notices: Record<string, string> = {
  read: "The notification was marked as read.",
  "preference-saved": "Your in-app notification preference was saved.",
  "invalid-request": "Check the request and try again.",
  "operation-failed": "The request could not be saved.",
};

function notificationHref(notification: NotificationRow) {
  switch (notification.category) {
    case "dues_reminder":
      return "/dues";
    case "officer_money":
      return notification.event_id
        ? `/events/${notification.event_id}/finance`
        : "/finances";
    case "officer_member":
      return "/admin/members";
    case "officer_event":
      return "/events";
    case "attendance_open":
      return notification.event_id
        ? `/events/${notification.event_id}/attendance`
        : "/events";
    case "event_activity":
      return "/events";
    default:
      return "/announcements";
  }
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Notifications unavailable</h1>
          <p>Authentication is not configured in this environment.</p>
        </section>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Access denied</h1>
          <p>Notifications are available to active members.</p>
          <Link href="/">Return to the member portal</Link>
        </section>
      </main>
    );
  }

  const [notificationResult, preferenceResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,category,title,body,event_id,created_at,read_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
    supabase.from("notification_preferences").select("category,enabled"),
  ]);

  if (notificationResult.error || preferenceResult.error) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Notifications unavailable</h1>
          <p className="notice notifications-error" role="alert">
            Notification data could not be loaded. Your notifications and
            preferences are hidden until they can be checked.
          </p>
          <p>
            <Link href="/notifications">Try loading notifications again</Link>
          </p>
          <Link href="/">Return to the member portal</Link>
        </section>
      </main>
    );
  }

  const notifications = (notificationResult.data ?? []) as NotificationRow[];
  const preferences = new Map(
    ((preferenceResult.data ?? []) as PreferenceRow[]).map((preference) => [
      preference.category,
      preference.enabled,
    ]),
  );
  const unreadCount = notifications.filter(
    (item) => item.read_at === null,
  ).length;

  return (
    <main className="shell">
      <section className="panel notifications-panel">
        <header className="member-card-heading member-page-header">
          <div>
            <p className="eyebrow">Your personal inbox</p>
            <h1>Notifications</h1>
            <p className="muted">
              Your notifications and read status are private to your account.
            </p>
            <p className="notification-count">
              {unreadCount} unread in the latest {notifications.length} notices
            </p>
          </div>
        </header>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="auth-grid notifications-grid">
          <section aria-labelledby="notification-list-heading">
            <h2 id="notification-list-heading">Recent notifications</h2>
            {notifications.length === 0 ? (
              <p className="muted">You have no notifications yet.</p>
            ) : (
              <ul className="notification-list">
                {notifications.map((notification) => {
                  const timestamp = getNotificationTimestamp(
                    notification.created_at,
                  );
                  return (
                    <li
                      className="notification-card"
                      key={notification.id}
                      data-read={notification.read_at !== null}
                    >
                      <div className="notification-card-heading">
                        <span className="notification-category">
                          {getNotificationCategoryLabel(notification.category)}
                        </span>
                        <span
                          className="notification-read-state"
                          data-unread={notification.read_at === null}
                        >
                          {getNotificationReadLabel(notification.read_at)}
                        </span>
                      </div>
                      <h3>{notification.title}</h3>
                      <p>{notification.body}</p>
                      <p className="muted">
                        <time dateTime={timestamp.dateTime}>
                          {timestamp.label}
                        </time>
                      </p>
                      <p>
                        <Link
                          aria-label={`Open related page for ${notification.title}`}
                          href={notificationHref(notification)}
                        >
                          Open related page
                        </Link>
                      </p>
                      {notification.read_at === null ? (
                        <form action={markNotificationReadAction}>
                          <input
                            name="notification_id"
                            type="hidden"
                            value={notification.id}
                          />
                          <button className="button-secondary" type="submit">
                            Mark as read
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="notification-preferences-heading">
            <h2 id="notification-preferences-heading">In-app preferences</h2>
            <details className="notification-settings">
              <summary>
                <span>Manage routine preferences</span>
                <span className="muted">
                  {routinePreferenceCategories.length} routine categories
                </span>
              </summary>
              <div className="notification-settings-content">
                <p className="muted">
                  Choose which routine updates appear here. Dues reminders and
                  officer alerts stay enabled for their intended recipients.
                  Email notifications are not enabled.
                </p>
                <ul className="notification-preferences">
                  {routinePreferenceCategories.map(([category, label]) => (
                    <li className="notification-card" key={category}>
                      <form
                        action={setNotificationPreferenceAction}
                        className="form-stack"
                      >
                        <input name="category" type="hidden" value={category} />
                        <label>
                          {label}
                          <select
                            defaultValue={
                              (preferences.get(category) ?? true)
                                ? "true"
                                : "false"
                            }
                            name="enabled"
                          >
                            <option value="true">On</option>
                            <option value="false">Off</option>
                          </select>
                        </label>
                        <button className="button-secondary" type="submit">
                          Save preference
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </section>
        </div>
      </section>
    </main>
  );
}
