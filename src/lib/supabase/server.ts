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
 * An anon-keyed client for buyer status lookup. Ticket submission uses the server-only admin
 * client after the server action validates and uploads the receipt; the anon role cannot execute
 * submit_ticket_order. This client carries no cookies or session and returns null when public
 * configuration is unavailable.
 */
export async function createAnonClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
