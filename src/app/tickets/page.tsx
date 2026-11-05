import type { Metadata } from "next";
import {
  type PublicBankInfo,
  type PublicTicketedEvent,
  TicketsStorefrontView,
} from "@/components/tickets/tickets-storefront-view";
import { siteUrl } from "@/lib/site.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TITLE = "Box Office & Event Tickets · Carpenters Family Social Club";
const DESCRIPTION =
  "The official Carpenters Family Social Club box office — ticket tiers, prices and reservations for our shows and celebrations in Asaba, Delta State.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/tickets" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl("/tickets"),
    siteName: "Carpenters Family Social Club",
    images: [
      {
        url: "/landing/og-share.jpg",
        width: 1200,
        height: 630,
        alt: "Carpenters Family Social Club box office",
      },
    ],
    locale: "en_NG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/landing/og-share.jpg"],
  },
};

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
