import Link from "next/link";
import {
  completeProfileAction,
  googleSignInAction,
  requestPasswordResetAction,
  signInAction,
  signOutAction,
} from "@/app/actions";
import AppShell from "@/components/app-shell";
import HomeDashboardView from "@/components/home-dashboard-view";
import { getNavigationItems } from "@/lib/app-navigation.mjs";
import { clubBrand } from "@/lib/brand";
import { getHomeDashboardData } from "@/lib/home-dashboard.server";
import { isGoogleAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const notices: Record<string, string> = {
  credentials: "The email or password could not be verified.",
  configuration: "Authentication is not configured for this environment.",
  "google-unavailable": "Google sign-in is unavailable in this environment.",
  "reset-requested":
    "If an account exists for that address, password reset instructions will arrive by email.",
  "password-updated": "Your password was updated.",
  "sign-in": "Sign in again to continue.",
  "invalid-profile":
    "Use a name of at most 120 characters and a username of 3–30 letters, numbers, or underscores.",
  "profile-locked": "This profile can no longer be edited.",
  "profile-update-failed":
    "The profile could not be saved. The username may already be in use.",
  "profile-complete": "Your profile is complete and is waiting for approval.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const googleEnabled = isGoogleAuthConfigured();

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <div className="auth-brand">
            {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
            <img alt="" height={48} src={clubBrand.logoSrc} width={48} />
            <span>{clubBrand.shortName}</span>
          </div>
          <h1>{clubBrand.name}</h1>
          <p>
            Authentication is not configured. Add the public Supabase URL and
            publishable key to the local environment, then restart the app.
          </p>
        </section>
      </main>
    );
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return (
      <main className="shell">
        <section className="panel auth-entry-panel">
          <header className="auth-entry-heading">
            <div className="auth-brand">
              {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
              <img alt="" height={48} src={clubBrand.logoSrc} width={48} />
              <span>{clubBrand.shortName}</span>
            </div>
            <p className="eyebrow">Private member portal</p>
            <h1>{clubBrand.name}</h1>
            <p>Sign in to your member account to continue.</p>
          </header>
          {notice ? (
            <p className="notice" role="status">
              {notice}
            </p>
          ) : null}

          <section
            aria-labelledby="sign-in-heading"
            className="auth-entry-form"
          >
            <h2 id="sign-in-heading">Sign in</h2>
            <form action={signInAction} className="form-stack">
              <label>
                Email
                <input
                  autoComplete="email"
                  maxLength={254}
                  name="email"
                  required
                  type="email"
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="current-password"
                  maxLength={128}
                  name="password"
                  required
                  type="password"
                />
              </label>
              <button type="submit">Sign in</button>
            </form>

            <details className="secondary-form">
              <summary>Forgot your password?</summary>
              <form action={requestPasswordResetAction} className="form-stack">
                <label>
                  Account email
                  <input
                    autoComplete="email"
                    maxLength={254}
                    name="email"
                    required
                    type="email"
                  />
                </label>
                <button className="button-secondary" type="submit">
                  Send reset instructions
                </button>
              </form>
            </details>
          </section>

          <section className="google-section" aria-labelledby="google-heading">
            <h2 id="google-heading">Google sign-in</h2>
            <form action={googleSignInAction}>
              <button
                className="button-secondary"
                disabled={!googleEnabled}
                type="submit"
              >
                Continue with Google
              </button>
            </form>
            {!googleEnabled ? (
              <p className="muted">
                Available after Google OAuth credentials are configured in
                Supabase Auth.
              </p>
            ) : null}
          </section>

          <div className="auth-switcher">
            <p>New to the club?</p>
            <Link className="button-link" href="/signup">
              Request account access
            </Link>
          </div>
        </section>
      </main>
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
              <form action={completeProfileAction} className="form-stack">
                <label>
                  Full name
                  <input
                    autoComplete="name"
                    defaultValue={
                      profile.full_name === "Pending member"
                        ? ""
                        : profile.full_name
                    }
                    maxLength={120}
                    name="full_name"
                    required
                  />
                </label>
                <label>
                  Username
                  <input
                    autoComplete="username"
                    defaultValue={profile.username}
                    maxLength={30}
                    minLength={3}
                    name="username"
                    pattern="[A-Za-z0-9_]{3,30}"
                    required
                  />
                </label>
                <button type="submit">Save profile</button>
              </form>
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

  const [assignmentResult, dashboard] = await Promise.all([
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    getHomeDashboardData(supabase, authData.user.id),
  ]);
  const roles = assignmentResult.error
    ? []
    : (assignmentResult.data ?? []).map((assignment) => assignment.role);
  const navigationItems = getNavigationItems(roles);

  return (
    <AppShell items={navigationItems}>
      <HomeDashboardView
        dashboard={dashboard}
        memberName={profile.full_name}
        notice={notice}
      />
    </AppShell>
  );
}
