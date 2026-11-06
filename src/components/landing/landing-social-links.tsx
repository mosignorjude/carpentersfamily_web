import { clubBrand } from "@/lib/brand";

interface LandingSocialLinksProps {
  /** onLight sits on the cream header, onDark on the forest footer. */
  tone?: "onLight" | "onDark";
  showHandle?: boolean;
  className?: string;
}

const SHELL = {
  onLight:
    "border border-forest/25 bg-forest/5 text-forest hover:bg-forest hover:text-cream",
  onDark: "bg-deep text-cream hover:bg-ochre hover:text-deep",
};

function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.47 6.27 6.27 0 0 0 1.86-4.47V8.77a8.16 8.16 0 0 0 4.91 1.63V6.95a4.84 4.84 0 0 1-1-.26z" />
    </svg>
  );
}

function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function LandingSocialLinks({
  tone = "onLight",
  showHandle = false,
  className = "",
}: LandingSocialLinksProps) {
  return (
    <ul
      aria-label="The club on social media"
      className={`flex items-center gap-2 ${className}`}
    >
      {clubBrand.socials.map((social) => {
        const isTikTok = social.network === "TikTok";
        return (
          <li key={social.network}>
            <a
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${clubBrand.shortName} on ${social.network} (${social.handle})`}
              title={`${social.network}: ${social.handle}`}
              className={`inline-flex min-h-[44px] min-w-[44px] h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-full transition-colors focus:outline-hidden ${SHELL[tone]}`}
            >
              {isTikTok ? <TikTokIcon /> : <InstagramIcon />}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
