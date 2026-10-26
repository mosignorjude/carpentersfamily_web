import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isValidCronToken(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const expected = secret?.trim();
  if (!expected) return false;
  if (!authorization?.startsWith("Bearer ")) return false;

  const provided = authorization.slice("Bearer ".length).trim();
  if (!provided) return false;

  return timingSafeEqual(digest(provided), digest(expected));
}
