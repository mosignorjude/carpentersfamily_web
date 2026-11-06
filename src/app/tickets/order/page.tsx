import Link from "next/link";
import ClubLogo from "@/components/club-logo";
import { TicketStatusView } from "@/components/tickets/ticket-status-view";
import { WhatsAppSupportButton } from "@/components/tickets/whatsapp-support-button";
import { clubBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

const REFERENCE_PATTERN = /^CF-[0-9A-Za-z-]{6,20}$/;

export default async function TicketOrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string | string[];
    notice?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const reference =
    raw && REFERENCE_PATTERN.test(raw.toUpperCase()) ? raw.toUpperCase() : "";

  return (
    <div className="min-h-screen bg-cream text-espresso font-sans antialiased">
      {/* Top Header matching Storefront and Mockup */}
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-md border-b border-linen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            className="flex items-center gap-3 min-w-0 no-underline text-espresso"
            href="/tickets"
          >
            <ClubLogo size="sm" variant="dark" />
            <div className="min-w-0">
              <span className="text-sm font-extrabold tracking-tight block leading-tight text-espresso truncate sm:hidden">
                {clubBrand.shortName}
              </span>
              <span className="text-sm font-extrabold tracking-tight hidden sm:block leading-tight text-espresso">
                {clubBrand.name}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-forest block truncate">
                Official Event Box Office
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              className="text-xs font-semibold text-body hover:text-espresso transition-colors no-underline hidden sm:inline-flex items-center gap-1.5"
              href="/tickets/order"
            >
              <span>Check ticket status</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 min-h-[44px] whitespace-nowrap px-4 py-2 rounded-xl border border-linen bg-white hover:bg-cream text-xs font-bold text-forest transition-colors no-underline shadow-2xs"
              href="/portal"
            >
              <span>Member Portal</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <TicketStatusView initialReference={reference} />
      </main>

      <WhatsAppSupportButton />
    </div>
  );
}
