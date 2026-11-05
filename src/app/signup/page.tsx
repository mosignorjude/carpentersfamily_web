import { isAuthSessionMissingError } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/actions";
import { AuthBrand, AuthPageLayout } from "@/components/auth-page-layout";
import AuthPasswordInput from "@/components/auth-password-input";
import AuthSubmitButton from "@/components/auth-submit-button";
import AuthValidatedForm, {
  AuthFieldError,
} from "@/components/auth-validated-form";
import { ClubIcon } from "@/components/club-icon";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const notices: Record<string, string> = {
  "check-email":
    "If this address can be registered, check its inbox to confirm it.",
  "invalid-signup": "Check the name, username, email, and password fields.",
  "signup-unavailable": "Sign-up is temporarily unavailable. Try again later.",
  configuration: "Account requests are unavailable in this environment.",
  "invite-invalid": "This invitation link is invalid or has already been used.",
  "invite-expired": "This invitation link has expired. Please submit a new membership request.",
};

const errorNotices = new Set([
  "invalid-signup",
  "signup-unavailable",
  "configuration",
  "invite-invalid",
  "invite-expired",
]);

function SignupUnavailable({ children }: { children: string }) {
  return (
    <AuthPageLayout variant="signup">
      <div className="signin-content signin-config-state">
        <AuthBrand />
        <h1>Request account access</h1>
        <p className="signin-intro" role="alert">
          {children}
        </p>
        <p className="signup-return-link">
          <Link href="/portal">Return to sign in</Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}

function SignupInvitationRequired({
  title = "Invitation Required",
  message = "Membership in Carpenters Family Social Club is strictly by invitation and vetted merit. Prospective members must first submit an application for review by the Executive Committee.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <AuthPageLayout variant="signup">
      <div className="signin-content signup-auth-content text-center">
        <AuthBrand />
        <header className="signin-heading">
          <h1 id="signup-heading" className="text-2xl font-serif text-[#3D291F]">
            {title}
          </h1>
          <p className="signin-intro mt-2 text-[#7A6B63] max-w-sm mx-auto" role="alert">
            {message}
          </p>
        </header>

        <div className="mt-8 flex flex-col gap-3 max-w-xs mx-auto">
          <Link
            href="/?modal=membership"
            className="w-full inline-flex justify-center items-center px-6 py-3 rounded-xl bg-[#174C37] text-white font-medium hover:bg-[#123D2C] transition-colors"
          >
            Request Membership
          </Link>
          <p className="signin-account-prompt mt-4 text-sm text-[#7A6B63]">
            Already a member?{" "}
            <Link href="/portal" className="text-[#174C37] font-semibold underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthPageLayout>
  );
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; token?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const noticeIsError = errorNotices.has(params.notice ?? "");
  const token = params.token ? params.token.trim().toLowerCase() : undefined;

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
  if (authData?.user) redirect("/portal");
  if (authError && !isAuthSessionMissingError(authError)) {
    return (
      <SignupUnavailable>
        We could not verify the current session. Account requests are
        unavailable right now.
      </SignupUnavailable>
    );
  }

  // Invitation-only gate: without a token, show Invitation Required screen
  if (!token) {
    return (
      <SignupInvitationRequired
        title={params.notice === "invite-expired" ? "Invitation Expired" : "Invitation Required"}
        message={notice}
      />
    );
  }

  // Validate the cryptographic token via security definer RPC
  const { data: inviteValidation, error: validateError } = await supabase.rpc(
    "validate_invite_token",
    { p_token: token }
  );

  if (validateError || !inviteValidation?.valid) {
    const isExpired = inviteValidation?.reason === "expired";
    return (
      <SignupInvitationRequired
        title={isExpired ? "Invitation Expired" : "Invitation Required"}
        message={
          isExpired
            ? "This invitation link has expired. Please submit a new membership request to obtain a fresh invitation."
            : "This invitation link is invalid or has already been used. Please request an invitation to join."
        }
      />
    );
  }

  const invitedEmail = typeof inviteValidation.email === "string" ? inviteValidation.email : "";

  return (
    <AuthPageLayout variant="signup">
      <div className="signin-content signup-auth-content">
        <AuthBrand />
        <header className="signin-heading">
          <h1 id="signup-heading">Accept Club Invitation</h1>
          <p className="signin-intro">
            Complete your profile to register your account
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
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={invitedEmail} />

          <label className="signin-field">
            <span>Email</span>
            <span className="signin-field-control">
              <ClubIcon className="signin-field-icon" name="mail" />
              <input
                disabled
                id="signup-email-display"
                value={invitedEmail}
                type="email"
                className="opacity-75 cursor-not-allowed bg-stone-50"
              />
            </span>
          </label>

          <label className="signin-field">
            <span>Full name</span>
            <input
              autoComplete="name"
              aria-describedby="signup-full-name-error"
              data-field-name="full name"
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
              data-field-name="username"
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

          <label className="signin-field" htmlFor="signup-password">
            <span>Password</span>
            <AuthPasswordInput
              autoComplete="new-password"
              aria-describedby="signup-password-hint signup-password-error"
              data-field-name="password"
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
              data-field-name="password confirmation"
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
            pendingLabel="Registering account…"
          >
            Create account
          </AuthSubmitButton>
        </AuthValidatedForm>

        <p className="signin-account-prompt">
          Already have an account? <Link href="/portal">Sign in</Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
