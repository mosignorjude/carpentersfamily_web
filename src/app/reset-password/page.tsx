import { redirect } from "next/navigation";
import { signOutAction, updatePasswordAction } from "@/app/actions";
import AuthPasswordInput from "@/components/auth-password-input";
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
      <main className="shell">
        <section className="panel narrow-panel">
          <h1>Reset password</h1>
          <p>Authentication is not configured for this environment.</p>
        </section>
      </main>
    );
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/?notice=sign-in");

  const notice = params.notice ? notices[params.notice] : undefined;
  return (
    <main className="shell">
      <section className="panel narrow-panel">
        <p className="eyebrow">Account security</p>
        <h1>Choose a new password</h1>
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
        <AuthValidatedForm action={updatePasswordAction} className="form-stack">
          <label htmlFor="reset-new-password">
            New password
            <AuthPasswordInput
              autoComplete="new-password"
              id="reset-new-password"
              aria-describedby="reset-new-password-error"
              maxLength={128}
              minLength={12}
              name="password"
              placeholder="At least 12 characters"
              required
            />
            <AuthFieldError id="reset-new-password-error" />
          </label>
          <label htmlFor="reset-confirm-password">
            Confirm new password
            <AuthPasswordInput
              autoComplete="new-password"
              id="reset-confirm-password"
              aria-describedby="reset-confirm-password-error"
              maxLength={128}
              minLength={12}
              name="confirm_password"
              placeholder="Re-enter your new password"
              required
            />
            <AuthFieldError id="reset-confirm-password-error" />
          </label>
          <button type="submit">Update password</button>
        </AuthValidatedForm>
        <form action={signOutAction}>
          <button className="button-secondary" type="submit">
            Cancel and sign out
          </button>
        </form>
      </section>
    </main>
  );
}
