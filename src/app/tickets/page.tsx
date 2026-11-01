import {
  type PublicBankInfo,
  type PublicTicketedEvent,
  TicketsStorefrontView,
} from "@/components/tickets/tickets-storefront-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TicketsStorefrontPage() {
  let events: PublicTicketedEvent[] = [];
  let bank: PublicBankInfo | null = null;
  let isAuthenticatedMember = false;

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: authData }, { data: rpcData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_public_ticketed_events"),
    ]);

    isAuthenticatedMember = Boolean(authData?.user);

    if (rpcData && typeof rpcData === "object") {
      const payload = rpcData as {
        bank?: PublicBankInfo | null;
        events?: PublicTicketedEvent[];
      };
      if (payload.bank) {
        bank = payload.bank;
      }
      if (Array.isArray(payload.events)) {
        events = payload.events;
      }
    }
  } catch {
    // Render empty storefront state gracefully if Supabase is unreachable
  }

  return (
    <TicketsStorefrontView
      bank={bank}
      events={events}
      isAuthenticatedMember={isAuthenticatedMember}
    />
  );
}
