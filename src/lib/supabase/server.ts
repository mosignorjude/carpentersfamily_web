import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase server configuration is unavailable.");

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes sessions
          // before rendering; Server Actions and Route Handlers can persist them.
        }
      },
    },
  });
}

/**
 * An anon-keyed server client, for the calls an anonymous visitor is allowed to make. It carries
 * no cookies and no session: `submit_ticket_order` and `lookup_ticket_order` raise 42501 for any
 * signed-in actor, so reusing createSupabaseServerClient here would break the till for every
 * logged-in buyer. Returns null when the public config is unusable, which is the same shape
 * createSupabaseBrowserClient (client.ts:6) uses — callers must not treat it as a thrown error.
 */
export async function createAnonClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
