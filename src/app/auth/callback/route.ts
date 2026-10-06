import { type NextRequest, NextResponse } from "next/server";
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(new URL("/?notice=auth-failed", origin));
    return NextResponse.redirect(new URL(destination, origin));
  } catch {
    return NextResponse.redirect(new URL("/?notice=auth-failed", origin));
  }
}
