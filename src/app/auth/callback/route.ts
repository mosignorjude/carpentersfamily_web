import { type NextRequest, NextResponse } from "next/server";
import { notifyWelcomeIfActive } from "@/lib/email/notifications";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = getSiteOrigin();
  if (!origin)
    return NextResponse.json(
      { error: "Authentication callback unavailable." },
      { status: 503 },
    );

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!code || code.length > 4096) {
    return NextResponse.redirect(new URL("/?notice=auth-failed", origin));
  }

  const destination =
    requestUrl.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/";

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(new URL("/?notice=auth-failed", origin));
    if (data.user?.email_confirmed_at) {
      await notifyWelcomeIfActive(data.user.id);
    }
    return NextResponse.redirect(new URL(destination, origin));
  } catch {
    return NextResponse.redirect(new URL("/?notice=auth-failed", origin));
  }
}
