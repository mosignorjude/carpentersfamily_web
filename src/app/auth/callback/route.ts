import { type NextRequest, NextResponse } from "next/server";
import {
  resolveAuthCallbackDestination,
  shouldNotifyPendingRegistrationOnCallback,
} from "@/lib/auth-callback";
import { notifyRegistrationReceivedIfPending } from "@/lib/email/notifications";
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
    return NextResponse.redirect(new URL("/portal?notice=auth-failed", origin));
  }

  const destination = resolveAuthCallbackDestination(
    requestUrl.searchParams.get("next"),
  );

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(
        new URL("/portal?notice=auth-failed", origin),
      );
    if (
      shouldNotifyPendingRegistrationOnCallback({
        destination,
        emailConfirmedAt: data.user?.email_confirmed_at,
      })
    ) {
      await notifyRegistrationReceivedIfPending(data.user.id);
    }
    return NextResponse.redirect(new URL(destination, origin));
  } catch {
    return NextResponse.redirect(new URL("/portal?notice=auth-failed", origin));
  }
}
