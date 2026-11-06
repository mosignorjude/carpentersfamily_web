import { clubBrand } from "@/lib/brand";

interface ClubLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  variant?: "light" | "dark";
}

export function ClubLogo({
  className = "",
  size = "md",
  showText = false,
  variant = "dark",
}: ClubLogoProps) {
  const sizeMap = {
    sm: { width: 18, height: 32, circleClass: "h-10 w-10 sm:h-11 sm:w-11" },
    md: { width: 26, height: 46, circleClass: "h-14 w-14" },
    lg: { width: 36, height: 64, circleClass: "h-20 w-20" },
    xl: { width: 48, height: 86, circleClass: "h-24 w-24" },
  };

  const currentSize = sizeMap[size] ?? sizeMap.md;
  const textColor = variant === "light" ? "text-white" : "text-[#3D291F]";
  const subtextColor =
    variant === "light" ? "text-[#E5DDD3]/80" : "text-[#7A685D]";

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`rounded-full bg-white border border-[#E5DDD3] flex items-center justify-center shrink-0 shadow-2xs ${currentSize.circleClass}`}
      >
        {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
        <img
          alt={clubBrand.logoAlt}
          className="object-contain shrink-0"
          height={currentSize.height}
          src={clubBrand.logoSrc}
          width={currentSize.width}
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span
            className={`text-base font-bold uppercase tracking-tight font-sans ${textColor}`}
          >
            {clubBrand.shortName}
          </span>
          <span className={`text-xs font-medium ${subtextColor}`}>
            {clubBrand.name} · {clubBrand.location}
          </span>
        </div>
      )}
    </div>
  );
}

export default ClubLogo;
