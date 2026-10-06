import { isAuthSessionMissingError } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { googleSignInAction, signUpAction } from "@/app/actions";
import { clubBrand } from "@/lib/brand";
import { isGoogleAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const notices: Record<string, string> = {
  "check-email":
    "If this address can be registered, check its inbox to confirm it.",
  "invalid-signup": "Check the name, username, email, and password fields.",
  "signup-unavailable": "Sign-up is temporarily unavailable. Try again later.",
  configuration: "Account requests are unavailable in this environment.",
  "google-unavailable": "Google sign-in is unavailable in this environment.",
};

export default async function SignupPage({
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
        <section className="panel narrow-panel auth-entry-panel">
          <div className="auth-brand">
            {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
            <img alt="" height={48} src={clubBrand.logoSrc} width={48} />
            <span>{clubBrand.shortName}</span>
          </div>
          <p className="eyebrow">Membership request</p>
          <h1>Request account access</h1>
          <p role="alert">
            Account requests are unavailable right now. Please try again later.
          </p>
          <Link href="/">Return to sign in</Link>
        </section>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authData.user) redirect("/");
  if (authError && !isAuthSessionMissingError(authError)) {
    return (
      <main className="shell">
        <section className="panel narrow-panel auth-entry-panel">
          <div className="auth-brand">
            {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
            <img alt="" height={48} src={clubBrand.logoSrc} width={48} />
            <span>{clubBrand.shortName}</span>
          </div>
          <p className="eyebrow">Membership request</p>
          <h1>Request account access</h1>
          <p role="alert">
            We could not verify the current session. Account requests are
            unavailable right now.
          </p>
          <Link href="/">Return to sign in</Link>
        </section>
      </main>
    );
  }

  const googleEnabled = isGoogleAuthConfigured();
  return (
    <main className="shell">
      <section className="panel narrow-panel auth-entry-panel signup-panel">
        <header className="auth-entry-heading">
          <div className="auth-brand">
            {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
            <img alt="" height={48} src={clubBrand.logoSrc} width={48} />
            <span>{clubBrand.shortName}</span>
          </div>
          <p className="eyebrow">Membership request</p>
          <h1>Request account access</h1>
          <p>
            Create your account and profile, then confirm your email. New
            accounts remain pending until an authorized club officer approves
            them.
          </p>
        </header>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}

        <section aria-labelledby="signup-form-heading">
          <h2 id="signup-form-heading">Your details</h2>
          <form action={signUpAction} className="form-stack signup-form">
            <label>
              Full name
              <input
                autoComplete="name"
                maxLength={120}
                name="full_name"
                required
              />
            </label>
            <label>
              Username
              <input
                autoComplete="username"
                maxLength={30}
                minLength={3}
                name="username"
                pattern="[A-Za-z0-9_]{3,30}"
                required
              />
              <span className="muted">
                3–30 letters, numbers, or underscores.
              </span>
            </label>
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
                autoComplete="new-password"
                maxLength={128}
                minLength={12}
                name="password"
                required
                type="password"
              />
              <span className="muted">Use at least 12 characters.</span>
            </label>
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                maxLength={128}
                minLength={12}
                name="confirm_password"
                required
                type="password"
              />
            </label>
            <button type="submit">Request access</button>
          </form>
        </section>

        <section className="google-section" aria-labelledby="google-heading">
          <h2 id="google-heading">Or continue with Google</h2>
          <form action={googleSignInAction}>
            <button
              className="button-secondary"
              disabled={!googleEnabled}
              type="submit"
            >
              Continue with Google
            </button>
          </form>
          <p className="muted">
            New Google accounts also remain pending until an authorized officer
            approves the membership request.
          </p>
          {!googleEnabled ? (
            <p className="muted">
              Google is available after its OAuth credentials are configured in
              Supabase Auth.
            </p>
          ) : null}
        </section>

        <div className="auth-switcher">
          <p>Already have an account?</p>
          <Link className="button-link button-link-secondary" href="/">
            Return to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
