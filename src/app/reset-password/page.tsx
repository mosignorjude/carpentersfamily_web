import { redirect } from "next/navigation";
import { signOutAction, updatePasswordAction } from "@/app/actions";
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
        <form action={updatePasswordAction} className="form-stack">
          <label>
            New password
            <input
              autoComplete="new-password"
              maxLength={128}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <label>
            Confirm new password
            <input
              autoComplete="new-password"
              maxLength={128}
              minLength={12}
              name="confirm_password"
              required
              type="password"
            />
          </label>
          <button type="submit">Update password</button>
        </form>
        <form action={signOutAction}>
          <button className="button-secondary" type="submit">
            Cancel and sign out
          </button>
        </form>
      </section>
    </main>
  );
}
