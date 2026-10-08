import { isAuthSessionMissingError } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { googleSignInAction, signUpAction } from "@/app/actions";
import { AuthBrand, AuthPageLayout } from "@/components/auth-page-layout";
import AuthPasswordInput from "@/components/auth-password-input";
import AuthSubmitButton from "@/components/auth-submit-button";
import AuthValidatedForm, {
  AuthFieldError,
} from "@/components/auth-validated-form";
import GoogleMark from "@/components/google-mark";
import { isGoogleAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const notices: Record<string, string> = {
  "check-email":
    "If this address can be registered, check its inbox to confirm it.",
  "invalid-signup": "Check the name, username, email, and password fields.",
  "signup-unavailable": "Sign-up is temporarily unavailable. Try again later.",
  configuration: "Account requests are unavailable in this environment.",
  "google-unavailable": "Google isn’t available in this environment.",
};

const errorNotices = new Set([
  "invalid-signup",
  "signup-unavailable",
  "configuration",
  "google-unavailable",
]);

function SignupUnavailable({ children }: { children: string }) {
  return (
    <AuthPageLayout variant="signup">
      <div className="signin-content signin-config-state">
        <AuthBrand />
        <p className="signin-eyebrow">Membership request</p>
        <h1>Request account access</h1>
        <p className="signin-intro" role="alert">
          {children}
        </p>
        <p className="signup-return-link">
          <Link href="/">Return to sign in</Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const noticeIsError = errorNotices.has(params.notice ?? "");
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <SignupUnavailable>
        Account requests are unavailable right now. Please try again later.
      </SignupUnavailable>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authData.user) redirect("/");
  if (authError && !isAuthSessionMissingError(authError)) {
    return (
      <SignupUnavailable>
        We could not verify the current session. Account requests are
        unavailable right now.
      </SignupUnavailable>
    );
  }

  const googleEnabled = isGoogleAuthConfigured();
  return (
    <AuthPageLayout variant="signup">
      <div className="signin-content signup-auth-content">
        <AuthBrand />
        <header className="signin-heading">
          <p className="signin-eyebrow">Membership request</p>
          <h1 id="signup-heading">Request account access</h1>
          <p className="signin-intro">
            Create your profile to join the Carpenters Family community. After
            confirming your email, an authorized club officer reviews your
            request.
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

        <AuthValidatedForm
          action={signUpAction}
          aria-labelledby="signup-heading"
          className="signin-credentials-form signup-request-form"
        >
          <label className="signin-field">
            <span>Full name</span>
            <input
              autoComplete="name"
              aria-describedby="signup-full-name-error"
              id="signup-full-name"
              maxLength={120}
              name="full_name"
              placeholder="Your full name"
              required
            />
            <AuthFieldError id="signup-full-name-error" />
          </label>
          <label className="signin-field">
            <span>Username</span>
            <input
              autoComplete="username"
              aria-describedby="signup-username-hint signup-username-error"
              data-error-message="Use 3–30 letters, numbers, or underscores."
              id="signup-username"
              maxLength={30}
              minLength={3}
              name="username"
              pattern="[A-Za-z0-9_]{3,30}"
              placeholder="Choose a username"
              required
            />
            <AuthFieldError id="signup-username-error" />
            <span className="signin-field-hint" id="signup-username-hint">
              3–30 letters, numbers, or underscores.
            </span>
          </label>
          <label className="signin-field">
            <span>Email</span>
            <input
              autoComplete="email"
              aria-describedby="signup-email-error"
              id="signup-email"
              maxLength={254}
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            <AuthFieldError id="signup-email-error" />
          </label>
          <label className="signin-field" htmlFor="signup-password">
            <span>Password</span>
            <AuthPasswordInput
              autoComplete="new-password"
              aria-describedby="signup-password-hint signup-password-error"
              id="signup-password"
              maxLength={128}
              minLength={12}
              name="password"
              placeholder="Create a password"
              required
            />
            <AuthFieldError id="signup-password-error" />
            <span className="signin-field-hint" id="signup-password-hint">
              Use at least 12 characters.
            </span>
          </label>
          <label className="signin-field" htmlFor="signup-confirm-password">
            <span>Confirm password</span>
            <AuthPasswordInput
              autoComplete="new-password"
              aria-describedby="signup-confirm-password-error"
              id="signup-confirm-password"
              maxLength={128}
              minLength={12}
              name="confirm_password"
              placeholder="Re-enter your password"
              required
            />
            <AuthFieldError id="signup-confirm-password-error" />
          </label>
          <AuthSubmitButton
            className="signin-primary-button"
            pendingLabel="Submitting request…"
          >
            Request access
          </AuthSubmitButton>
        </AuthValidatedForm>

        <div className="signin-divider" aria-hidden="true">
          <span>or</span>
        </div>

        <section aria-label="Google sign-in" className="signin-google-section">
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

        <p className="signin-account-prompt">
          Already have an account? <Link href="/">Sign in</Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
