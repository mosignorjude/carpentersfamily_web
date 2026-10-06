const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(["operation", "member_id", "role", "reason"]);

function containsControlCharacters(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

/**
 * Validate the complete untrusted Server Action payload. The role remains
 * fixed to Executive; callers cannot use this action to grant admin roles.
 * @param {FormData} formData
 * @returns {{operation: "grant" | "revoke", memberId: string, reason: string} | null}
 */
export function parseExecutiveRoleRequest(formData) {
  const keys = Array.from(formData.keys());
  if (
    keys.length !== ALLOWED_FIELDS.size ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !ALLOWED_FIELDS.has(key))
  ) {
    return null;
  }

  const operation = formData.get("operation");
  const memberId = formData.get("member_id");
  const role = formData.get("role");
  const rawReason = formData.get("reason");
  if (
    typeof operation !== "string" ||
    (operation !== "grant" && operation !== "revoke") ||
    typeof memberId !== "string" ||
    !UUID_PATTERN.test(memberId) ||
    role !== "executive" ||
    typeof rawReason !== "string" ||
    rawReason.length > 500 ||
    containsControlCharacters(rawReason)
  ) {
    return null;
  }

  const reason = rawReason.trim();
  if (!reason) return null;

  return { operation, memberId, reason };
}
