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
    sm: { width: 22, height: 40, imgClass: "w-[22px] h-[40px]" },
    md: { width: 31, height: 56, imgClass: "w-[31px] h-[56px]" },
    lg: { width: 44, height: 80, imgClass: "w-[44px] h-[80px]" },
    xl: { width: 55, height: 100, imgClass: "w-[55px] h-[100px]" },
  };

  const currentSize = sizeMap[size] ?? sizeMap.md;
  const textColor = variant === "light" ? "text-white" : "text-[#3D291F]";
  const subtextColor =
    variant === "light" ? "text-[#E5DDD3]/80" : "text-[#7A685D]";

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
      <img
        alt={clubBrand.logoAlt}
        className={`${currentSize.imgClass} object-contain shrink-0`}
        height={currentSize.height}
        src={clubBrand.logoSrc}
        width={currentSize.width}
      />
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
