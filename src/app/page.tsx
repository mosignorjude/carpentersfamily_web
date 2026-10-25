import Link from "next/link";
import {
  completeProfileAction,
  googleSignInAction,
  signInAction,
  signOutAction,
} from "@/app/actions";
import AppShell from "@/components/app-shell";
import { AuthBrand, AuthPageLayout } from "@/components/auth-page-layout";
import AuthPasswordInput from "@/components/auth-password-input";
import AuthSubmitButton from "@/components/auth-submit-button";
import AuthValidatedForm, {
  AuthFieldError,
} from "@/components/auth-validated-form";
import { ClubIcon } from "@/components/club-icon";
import GoogleMark from "@/components/google-mark";
import HomeDashboardView from "@/components/home-dashboard-view";
import type { AppNotification } from "@/components/notifications/notifications-drawer";
import { getNavigationItems } from "@/lib/app-navigation.mjs";
import { clubBrand } from "@/lib/brand";
import { getTimeOfDayGreeting } from "@/lib/greeting";
import { getHomeDashboardData } from "@/lib/home-dashboard.server";
import { isGoogleAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPrimaryRole } from "@/lib/user-profile";

const notices: Record<string, string> = {
  credentials: "The email or password could not be verified.",
  "auth-failed":
    "Sign in could not be completed. Try again or use a different sign-in method.",
  configuration: "Authentication is not configured for this environment.",
  "google-unavailable": "Google isn’t available in this environment.",
  "password-updated": "Your password was updated.",
  "sign-in": "Sign in again to continue.",
  "invalid-profile":
    "Use a name of at most 120 characters and a username of 3–30 letters, numbers, or underscores.",
  "profile-locked": "This profile can no longer be edited.",
  "profile-update-failed":
    "The profile could not be saved. The username may already be in use.",
  "profile-complete": "Your profile is complete and is waiting for approval.",
};

const signInErrorNotices = new Set([
  "credentials",
  "configuration",
  "google-unavailable",
  "sign-in",
  "auth-failed",
]);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const noticeIsError = signInErrorNotices.has(params.notice ?? "");
  const googleEnabled = isGoogleAuthConfigured();

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <AuthPageLayout variant="signin">
        <div className="signin-content signin-config-state">
          <AuthBrand />
          <p className="signin-eyebrow">Private member portal</p>
          <h1>{clubBrand.name}</h1>
          <p className="signin-intro" role="alert">
            Authentication is not configured. Add the public Supabase URL and
            publishable key to the local environment, then restart the app.
          </p>
        </div>
      </AuthPageLayout>
    );
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return (
      <AuthPageLayout variant="signin">
        <div className="signin-content">
          <AuthBrand />
          <header className="signin-heading">
            <h1 id="sign-in-heading">Sign in</h1>
            <p className="signin-intro">
              Access your account to continue with Carpenters Family.
            </p>
          </header>

          {notice ? (
            <p
              className={`signin-notice${noticeIsError ? " signin-notice-error" : " signin-notice-success"}`}
              role={noticeIsError ? "alert" : "status"}
            >
              {notice}
            </p>
          ) : null}

          <section className="signin-google-section">
            <form action={googleSignInAction}>
              <AuthSubmitButton
                className="signin-secondary-button signin-google-button"
                disabled={!googleEnabled}
                pendingLabel="Connecting to Google…"
              >
                <GoogleMark />
                Continue with Google
              </AuthSubmitButton>
            </form>
          </section>

          <div className="signin-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <AuthValidatedForm
            action={signInAction}
            className="signin-credentials-form"
          >
            <label className="signin-field">
              <span>Email</span>
              <span className="signin-field-control">
                <ClubIcon className="signin-field-icon" name="mail" />
                <input
                  autoComplete="email"
                  aria-describedby="sign-in-email-error"
                  id="sign-in-email"
                  maxLength={254}
                  name="email"
                  required
                  placeholder="you@example.com"
                  type="email"
                />
              </span>
              <AuthFieldError id="sign-in-email-error" />
            </label>
            <label className="signin-field" htmlFor="sign-in-password">
              <span>Password</span>
              <AuthPasswordInput
                autoComplete="current-password"
                aria-describedby="sign-in-password-error"
                id="sign-in-password"
                maxLength={128}
                name="password"
                placeholder="Enter your password"
                required
              />
              <AuthFieldError id="sign-in-password-error" />
            </label>
            <Link className="signin-forgot-link" href="/forgot-password">
              Forgot your password?
            </Link>
            <AuthSubmitButton
              className="signin-primary-button"
              pendingLabel="Signing in…"
            >
              Sign in
              <ClubIcon name="arrow-right" />
            </AuthSubmitButton>
          </AuthValidatedForm>

          <p className="signin-account-prompt">
            New to the club? <Link href="/signup">Request account access</Link>
          </p>
        </div>
      </AuthPageLayout>
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status, profile_completed_at")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Access status</p>
          <h1>We could not verify your membership</h1>
          <p>
            No member features have been loaded. Contact a club administrator if
            this continues.
          </p>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (profile.status === "pending") {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Membership request</p>
          <h1>
            Welcome,{" "}
            {profile.full_name === "Pending member"
              ? "new member"
              : profile.full_name}
          </h1>
          {notice ? (
            <p className="notice" role="status">
              {notice}
            </p>
          ) : null}
          {profile.profile_completed_at ? (
            <p>
              Your email is confirmed and your profile is complete. An
              authorized officer must approve the request before member access
              is enabled.
            </p>
          ) : (
            <>
              <p>
                Complete your profile. An authorized officer must approve the
                request before member access is enabled.
              </p>
              <AuthValidatedForm
                action={completeProfileAction}
                className="form-stack"
              >
                <label>
                  Full name
                  <input
                    autoComplete="name"
                    aria-describedby="complete-profile-full-name-error"
                    defaultValue={
                      profile.full_name === "Pending member"
                        ? ""
                        : profile.full_name
                    }
                    maxLength={120}
                    name="full_name"
                    required
                  />
                  <AuthFieldError id="complete-profile-full-name-error" />
                </label>
                <label>
                  Username
                  <input
                    autoComplete="username"
                    aria-describedby="complete-profile-username-error"
                    defaultValue={profile.username}
                    maxLength={30}
                    minLength={3}
                    name="username"
                    pattern="[A-Za-z0-9_]{3,30}"
                    required
                  />
                  <AuthFieldError id="complete-profile-username-error" />
                </label>
                <button type="submit">Save profile</button>
              </AuthValidatedForm>
            </>
          )}
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (profile.status === "deactivated") {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Membership status</p>
          <h1>Account deactivated</h1>
          <p>
            Your account does not currently have access to member features.
            Contact a club administrator if you believe this is incorrect.
          </p>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (profile.status === "rejected") {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Membership status</p>
          <h1>Membership request declined</h1>
          <p>
            This request was not approved, so member features are unavailable.
            Contact a club administrator if you need more information.
          </p>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  const [
    assignmentResult,
    dashboard,
    notificationResult,
    eventsResult,
    announcementsResult,
  ] = await Promise.all([
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    getHomeDashboardData(supabase, authData.user.id),
    supabase
      .from("notifications")
      .select(
        "id,category,title,body,event_id,source_type,source_id,created_at,read_at",
      )
      .eq("recipient_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("events")
      .select("id,title")
      .order("starts_at", { ascending: false })
      .limit(20),
    supabase
      .from("announcements")
      .select("id,title")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const roles = assignmentResult.error
    ? []
    : (assignmentResult.data ?? []).map((assignment) => assignment.role);
  const navigationItems = getNavigationItems(roles);
  const notifications = (notificationResult.data ?? []) as AppNotification[];
  const unreadCount =
    typeof dashboard.activity.unreadCount === "number"
      ? dashboard.activity.unreadCount
      : notifications.filter((n) => n.read_at === null).length;
  const searchData = {
    events: (eventsResult.data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
    })),
    announcements: (announcementsResult.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
    })),
  };

  const userProfile = {
    fullName:
      profile.full_name ||
      (authData.user.user_metadata?.full_name as string) ||
      "Club Member",
    username:
      profile.username ||
      (authData.user.user_metadata?.username as string) ||
      authData.user.email?.split("@")[0] ||
      "member",
    role: formatPrimaryRole(roles),
  };

  const greeting = getTimeOfDayGreeting();

  return (
    <AppShell
      currentUserId={authData.user.id}
      dashboard
      initialNotifications={notifications}
      items={navigationItems}
      searchData={searchData}
      unreadCount={unreadCount}
      userProfile={userProfile}
    >
      <HomeDashboardView
        dashboard={dashboard}
        greeting={greeting}
        memberName={profile.full_name}
        notice={notice}
        roles={roles}
        username={profile.username || userProfile.username}
      />
    </AppShell>
  );
}
