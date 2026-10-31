import { getSystemNotice } from "@/lib/system-notices";

export interface StaffNoticeCopy {
  message: string;
  isError: boolean;
}

const sharedCodes = [
  "denied",
  "invalid-request",
  "operation-failed",
  "self-action-denied",
  "invalid-state",
  "duplicate-record",
  "already-processed",
];

export function resolveStaffNotice(
  code: string | undefined,
  pageNotices: Record<string, StaffNoticeCopy>,
): StaffNoticeCopy | undefined {
  if (!code) return undefined;
  if (Object.hasOwn(pageNotices, code)) return pageNotices[code];
  if (sharedCodes.includes(code)) {
    const definition = getSystemNotice(code);
    if (definition) {
      return {
        message: definition.message,
        isError: definition.type === "error",
      };
    }
  }
  return undefined;
}
