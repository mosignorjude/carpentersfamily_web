/**
 * Maps a percentage to a pre-generated `cf-w-<n>` utility class in globals.css.
 * Inline `style` attributes are blocked by the CSP (`style-src-attr 'none'`),
 * so dynamic bar widths must be expressed as classes.
 */
export function percentWidthClass(percent: number): string {
  const safe = Number.isFinite(percent) ? percent : 0;
  return `cf-w-${Math.min(100, Math.max(0, Math.round(safe)))}`;
}
