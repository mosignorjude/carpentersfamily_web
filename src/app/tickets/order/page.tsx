import ClubLogo from "@/components/club-logo";
import { TicketStatusView } from "@/components/tickets/ticket-status-view";
import { clubBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

const REFERENCE_PATTERN = /^CF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

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
    <main className="min-h-screen bg-warm-canvas text-espresso font-sans antialiased">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-14 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-white border border-linen shadow-2xs">
            <ClubLogo size="sm" variant="dark" />
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight block text-espresso">
              {clubBrand.name}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-forest block">
              Box office · your order
            </span>
          </div>
        </div>
        <TicketStatusView initialReference={reference} />
      </div>
    </main>
  );
}
