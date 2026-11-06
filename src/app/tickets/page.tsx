import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import type { AppNotification } from "@/components/notifications/notifications-drawer";
import { PortalBoxOfficeView } from "@/components/tickets/portal-box-office-view";
import type {
  OfficerTicketSummary,
  PortalBoxOfficeEvent,
  PublicBankInfo,
  PublicTicketedEvent,
} from "@/components/tickets/ticket-types";
import { TicketsStorefrontView } from "@/components/tickets/tickets-storefront-view";
import { getActiveMemberNavigationItems } from "@/lib/app-navigation.mjs";
import { siteUrl } from "@/lib/site.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPrimaryRole } from "@/lib/user-profile";

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

export default async function TicketsStorefrontPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const viewParam = Array.isArray(params?.view) ? params.view[0] : params?.view;
  const forcePublic = viewParam === "public";

  let events: PublicTicketedEvent[] = [];
  let bank: PublicBankInfo | null = null;
  let isAuthenticatedMember = false;
  let unavailable = false;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null =
    null;
  let user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  } | null = null;

  try {
    supabase = await createSupabaseServerClient();
    const [{ data: authData }, rpcResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_public_ticketed_events"),
    ]);

    user = authData?.user ?? null;
    isAuthenticatedMember = Boolean(user);

    if (rpcResult.error) {
      unavailable = true;
    } else {
      const payload = (rpcResult.data ?? {}) as {
        bank?: PublicBankInfo | null;
        events?: PublicTicketedEvent[];
      };
      bank = payload.bank ?? null;
      events = Array.isArray(payload.events) ? payload.events : [];
    }
  } catch {
    unavailable = true;
  }

  // If user is authenticated and not explicitly requesting the public guest storefront view:
  if (user && supabase && !forcePublic && !unavailable) {
    try {
      const [
        profileResult,
        roleResult,
        notificationResult,
        unreadCountResult,
        eventsSearchResult,
        announcementsResult,
        pendingSalesResult,
      ] = await Promise.all([
        supabase
          .from("member_profiles")
          .select("status, full_name, username, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("member_role_assignments")
          .select("role")
          .eq("member_id", user.id)
          .is("revoked_at", null),
        supabase
          .from("notifications")
          .select(
            "id,category,title,body,event_id,source_type,source_id,created_at,read_at",
          )
          .eq("recipient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", user.id)
          .is("read_at", null),
        supabase
          .from("events")
          .select("id,title")
          .order("starts_at", { ascending: false })
          .limit(20),
        supabase
          .from("announcements")
          .select("id,title")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("event_ticket_sales")
          .select("id, event_id")
          .eq("verification_status", "recorded"),
      ]);

      const roles = (roleResult.data ?? []).map(
        (assignment) => assignment.role,
      );
      const isOfficer = roles.some((r) =>
        ["admin", "executive", "president"].includes(r),
      );

      const navItems = getActiveMemberNavigationItems(
        profileResult.error ? null : profileResult.data?.status,
        roles,
        Boolean(roleResult.error),
      );

      if (navItems) {
        const userProfile = {
          fullName:
            profileResult.data?.full_name ||
            (user.user_metadata?.full_name as string) ||
            "Club Member",
          username:
            profileResult.data?.username ||
            (user.user_metadata?.username as string) ||
            user.email?.split("@")[0] ||
            "member",
          role: formatPrimaryRole(roles),
          avatarUrl: profileResult.data?.avatar_url ?? null,
        };

        const notifications = (notificationResult.data ??
          []) as AppNotification[];
        const unreadCount =
          !unreadCountResult.error &&
          typeof unreadCountResult.count === "number"
            ? unreadCountResult.count
            : notifications.filter((n) => n.read_at === null).length;

        const searchData = {
          events: (eventsSearchResult.data ?? []).map((e) => ({
            id: e.id,
            title: e.title,
          })),
          announcements: (announcementsResult.data ?? []).map((a) => ({
            id: a.id,
            title: a.title,
          })),
        };

        const pendingSales = (pendingSalesResult.data ?? []) as {
          id: string;
          event_id: string;
        }[];
        const pendingTotalCount = pendingSales.length;

        let totalGrossNgn = 0;
        let totalPassesIssued = 0;
        let totalCapacity = 0;

        const portalEvents: PortalBoxOfficeEvent[] = events.map((event) => {
          const eventPending = pendingSales.filter(
            (s) => s.event_id === event.id,
          ).length;
          const tiers = event.tiers ?? [];
          const eventGross = tiers.reduce(
            (acc, t) => acc + (t.sold ?? 0) * t.price_ngn,
            0,
          );
          const eventPasses = tiers.reduce((acc, t) => acc + (t.sold ?? 0), 0);
          const eventCap = tiers.reduce((acc, t) => acc + (t.capacity ?? 0), 0);

          totalGrossNgn += eventGross;
          totalPassesIssued += eventPasses;
          totalCapacity += eventCap;

          return {
            ...event,
            pendingOrdersCount: eventPending,
            grossInflowNgn: eventGross,
          };
        });

        const officerSummary: OfficerTicketSummary = {
          totalGrossNgn,
          totalPassesIssued,
          totalCapacity,
          pendingVerificationCount: pendingTotalCount,
        };

        return (
          <AppShell
            currentUserId={user.id}
            dashboard
            initialNotifications={notifications}
            items={navItems}
            searchData={searchData}
            unreadCount={unreadCount}
            userProfile={userProfile}
          >
            <PortalBoxOfficeView
              bank={bank}
              canManage={isOfficer}
              events={portalEvents}
              isOfficer={isOfficer}
              summary={isOfficer ? officerSummary : null}
            />
          </AppShell>
        );
      }
    } catch {
      // Graceful fallback to storefront if member data lookup errors
    }
  }

  // Public Guest Storefront / Explicit Public Preview
  return (
    <TicketsStorefrontView
      bank={bank}
      events={events}
      isAuthenticatedMember={isAuthenticatedMember}
      unavailable={unavailable}
    />
  );
}
