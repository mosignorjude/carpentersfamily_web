import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";
import { AuthBrand, AuthPageLayout } from "@/components/auth-page-layout";
import AuthSubmitButton from "@/components/auth-submit-button";
import AuthValidatedForm, {
  AuthFieldError,
} from "@/components/auth-validated-form";

const notices: Record<string, { message: string; isError: boolean }> = {
  "reset-requested": {
    message:
      "If an account exists for that address, password reset instructions will arrive by email.",
    isError: false,
  },
  configuration: {
    message: "Password recovery is not configured for this environment.",
    isError: true,
  },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;

  return (
    <AuthPageLayout>
      <div className="signin-content">
        <AuthBrand />
        <header className="signin-heading">
          <p className="signin-eyebrow">Account recovery</p>
          <h1 id="forgot-password-heading">Forgot your password?</h1>
          <p className="signin-intro">
            Enter the email address for your member account. We’ll send reset
            instructions if an account exists.
          </p>
        </header>

        {notice ? (
          <p
            className={`signin-notice${notice.isError ? " signin-notice-error" : " signin-notice-success"}`}
            role={notice.isError ? "alert" : "status"}
          >
            {notice.message}
          </p>
        ) : null}

        <AuthValidatedForm
          action={requestPasswordResetAction}
          aria-labelledby="forgot-password-heading"
          className="signin-credentials-form"
        >
          <label className="signin-field">
            <span>Email</span>
            <input
              autoComplete="email"
              aria-describedby="forgot-password-email-error"
              id="forgot-password-email"
              maxLength={254}
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            <AuthFieldError id="forgot-password-email-error" />
          </label>
          <AuthSubmitButton
            className="signin-primary-button"
            pendingLabel="Sending instructions…"
          >
            Send reset instructions
          </AuthSubmitButton>
        </AuthValidatedForm>

        <p className="signin-account-prompt">
          Remember your password? <Link href="/">Sign in</Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
