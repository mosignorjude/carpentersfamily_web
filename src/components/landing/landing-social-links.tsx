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

export function LandingSocialLinks({
  tone = "onLight",
  showHandle = false,
  className = "",
}: LandingSocialLinksProps) {
  return (
    <ul
      aria-label="The club on social media"
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {clubBrand.socials.map((social) => (
        <li key={social.network}>
          <a
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${clubBrand.shortName} on ${social.network} (${social.handle})`}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors focus:outline-hidden ${SHELL[tone]}`}
          >
            <span>{social.network}</span>
            {showHandle && (
              <span className="font-medium opacity-80">{social.handle}</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
