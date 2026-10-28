// biome-ignore-all lint/a11y/noNoninteractiveTabindex: a horizontal scroll region needs a keyboard stop so the clipped-away columns stay reachable.
// biome-ignore-all lint/a11y/useSemanticElements: the wrapper must keep role="region" plus tabIndex, which a bare <section> cannot carry.
import type { ReactNode } from "react";

export function TableScroll({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`table-scroll-region min-w-0 ${className}`}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
