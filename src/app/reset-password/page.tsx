import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction, updatePasswordAction } from "@/app/actions";
import { AuthBrand, AuthPageLayout } from "@/components/auth-page-layout";
import AuthPasswordInput from "@/components/auth-password-input";
import AuthSubmitButton from "@/components/auth-submit-button";
import AuthValidatedForm, {
  AuthFieldError,
} from "@/components/auth-validated-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const notices: Record<string, string> = {
  "invalid-password": "Use matching passwords of at least 12 characters.",
  expired: "This password reset link is invalid or expired. Request a new one.",
  "update-failed":
    "The password could not be updated. Request a new reset link and try again.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <AuthPageLayout variant="reset-password">
        <div className="signin-content signin-config-state">
          <AuthBrand />
          <p className="signin-eyebrow">Account security</p>
          <h1>Reset password</h1>
          <p className="signin-intro" role="alert">
            Authentication is not configured for this environment.
          </p>
          <p className="signup-return-link">
            <Link href="/">Return to sign in</Link>
          </p>
        </div>
      </AuthPageLayout>
    );
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/?notice=sign-in");

  const notice = params.notice ? notices[params.notice] : undefined;
  return (
    <AuthPageLayout variant="reset-password">
      <div className="signin-content reset-password-content">
        <AuthBrand />
        <header className="signin-heading">
          <p className="signin-eyebrow">Account security</p>
          <h1 id="reset-password-heading">Choose a new password</h1>
          <p className="signin-intro">
            Create a strong password to secure your Carpenters Family account.
          </p>
        </header>

        {notice ? (
          <p className="signin-notice signin-notice-error" role="alert">
            {notice}
          </p>
        ) : null}

        <AuthValidatedForm
          action={updatePasswordAction}
          aria-labelledby="reset-password-heading"
          className="signin-credentials-form"
        >
          <label className="signin-field" htmlFor="reset-new-password">
            <span>New password</span>
            <AuthPasswordInput
              autoComplete="new-password"
              aria-describedby="reset-new-password-hint reset-new-password-error"
              id="reset-new-password"
              maxLength={128}
              minLength={12}
              name="password"
              placeholder="At least 12 characters"
              required
            />
            <AuthFieldError id="reset-new-password-error" />
            <span className="signin-field-hint" id="reset-new-password-hint">
              Use at least 12 characters.
            </span>
          </label>
          <label className="signin-field" htmlFor="reset-confirm-password">
            <span>Confirm new password</span>
            <AuthPasswordInput
              autoComplete="new-password"
              aria-describedby="reset-confirm-password-error"
              id="reset-confirm-password"
              maxLength={128}
              minLength={12}
              name="confirm_password"
              placeholder="Re-enter your new password"
              required
            />
            <AuthFieldError id="reset-confirm-password-error" />
          </label>
          <AuthSubmitButton
            className="signin-primary-button"
            pendingLabel="Updating password…"
          >
            Update password
          </AuthSubmitButton>
        </AuthValidatedForm>

        <form action={signOutAction} className="auth-cancel-form">
          <AuthSubmitButton
            className="signin-secondary-button auth-cancel-button"
            pendingLabel="Signing out…"
          >
            Cancel and sign out
          </AuthSubmitButton>
        </form>
      </div>
    </AuthPageLayout>
  );
}
