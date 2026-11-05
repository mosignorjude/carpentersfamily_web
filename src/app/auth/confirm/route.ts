import { type NextRequest, NextResponse } from "next/server";
import {
  confirmNotice,
  readConfirmRequest,
} from "@/lib/auth-email-verification";
import { notifyRegistrationReceivedIfPending } from "@/lib/email/notifications";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = getSiteOrigin();
  if (!origin)
    return NextResponse.json(
      { error: "Email confirmation unavailable." },
      { status: 503 },
    );

  const params = readConfirmRequest(new URL(request.url).searchParams);
  if (!params)
    return NextResponse.redirect(
      new URL(`/portal?notice=${confirmNotice(false)}`, origin),
    );

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.verificationType,
    });
    if (error || !data.user)
      return NextResponse.redirect(
        new URL(`/portal?notice=${confirmNotice(false)}`, origin),
      );

    await notifyRegistrationReceivedIfPending(data.user.id);
    return NextResponse.redirect(
      new URL(`/portal?notice=${confirmNotice(true)}`, origin),
    );
  } catch {
    return NextResponse.redirect(
      new URL(`/portal?notice=${confirmNotice(false)}`, origin),
    );
  }
}
