import { resolveNoticeCopy } from "@/lib/staff-notice-resolution.mjs";
import { getSystemNotice } from "@/lib/system-notices";

export interface StaffNoticeCopy {
  message: string;
  isError: boolean;
}

/**
 * Banner copy for a staff page notice: the page's own wording if it declares
 * the code, otherwise the shared system notice. Unknown codes render nothing.
 */
export function resolveStaffNotice(
  code: string | undefined,
  pageNotices: Record<string, StaffNoticeCopy>,
): StaffNoticeCopy | undefined {
  return resolveNoticeCopy(code, pageNotices, getSystemNotice);
}
