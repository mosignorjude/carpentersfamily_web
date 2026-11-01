import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

function createCsp(nonce: string, supabaseUrl: string | null): string {
  const connectSources = new Set(["'self'"]);

  if (supabaseUrl) {
    try {
      const supabaseOrigin = new URL(supabaseUrl);
      connectSources.add(supabaseOrigin.origin);
      connectSources.add(
        `${supabaseOrigin.protocol === "https:" ? "wss:" : "ws:"}//${supabaseOrigin.host}`,
      );
    } catch {
      // Invalid deployment configuration receives no external CSP allowance.
    }
  }

  const isDevelopment = process.env.NODE_ENV === "development";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${[...connectSources].join(" ")}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];

  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const contentSecurityPolicy = createCsp(nonce, config?.url ?? null);
  const hostHeader = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  ).toLowerCase();
  const isTicketsSubdomain = hostHeader.startsWith("tickets.");

  function nextWithSecurityHeaders() {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

    const nextResponse =
      isTicketsSubdomain && request.nextUrl.pathname === "/"
        ? NextResponse.rewrite(
            new URL(`/tickets${request.nextUrl.search}`, request.url),
            { request: { headers: requestHeaders } },
          )
        : NextResponse.next({
            request: { headers: requestHeaders },
          });
    nextResponse.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return nextResponse;
  }

  let response = nextWithSecurityHeaders();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = nextWithSecurityHeaders();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
  const IDLE_COOKIE_NAME = "cf_last_active";
  const now = Date.now();
  const lastActiveRaw = request.cookies.get(IDLE_COOKIE_NAME)?.value;
  const lastActiveMs = lastActiveRaw ? Number(lastActiveRaw) : null;

  // Refresh cookie-backed sessions only. Authorization remains in PostgreSQL
  // RLS/RPCs and in each Server Action, never in this routing layer.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (claimsData?.claims) {
    if (
      lastActiveMs !== null &&
      Number.isFinite(lastActiveMs) &&
      now - lastActiveMs > IDLE_TIMEOUT_MS
    ) {
      await supabase.auth.signOut();
      response.cookies.delete(IDLE_COOKIE_NAME);
    } else {
      response.cookies.set(IDLE_COOKIE_NAME, String(now), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.floor(IDLE_TIMEOUT_MS / 1000),
      });
    }
  } else if (lastActiveRaw) {
    response.cookies.delete(IDLE_COOKIE_NAME);
  }

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
