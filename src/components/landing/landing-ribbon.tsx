import Link from "next/link";

interface LandingRibbonProps {
  nextEvent?: {
    title: string;
    starts_at: string;
  } | null;
}

export function LandingRibbon({ nextEvent }: LandingRibbonProps) {
  const displayTitle = nextEvent?.title ?? "Annual End-of-Year Gala & Rave";

  return (
    <div className="bg-deep text-cream text-xs sm:text-sm border-b border-forest/40">
      <div className="mx-auto max-w-6xl px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
        <span>
          Next gathering:{" "}
          <strong className="text-ochre font-bold">{displayTitle}</strong> ·
          Asaba
        </span>
        <span className="rounded-full bg-ochre/20 text-ochre px-3 py-0.5 font-bold text-xs">
          2026 Season
        </span>
        <Link
          href="/tickets"
          className="underline underline-offset-4 min-h-[32px] inline-flex items-center hover:text-ochre font-medium transition-colors"
        >
          RSVP / Tickets
        </Link>
      </div>
    </div>
  );
}
