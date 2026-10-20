const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(["member_id", "role", "reason"]);
const ALLOWED_ROLES = new Set(["member", "executive", "admin", "backup_admin"]);

function containsControlCharacters(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

/**
 * Validate the complete untrusted Server Action payload.
 * @param {FormData} formData
 * @returns {{memberId: string, role: string, reason: string} | null}
 */
export function parseClubRoleRequest(formData) {
  const keys = Array.from(formData.keys());
  if (
    keys.length !== ALLOWED_FIELDS.size ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !ALLOWED_FIELDS.has(key))
  ) {
    return null;
  }

  const memberId = formData.get("member_id");
  const role = formData.get("role");
  const rawReason = formData.get("reason");
  if (
    typeof memberId !== "string" ||
    !UUID_PATTERN.test(memberId) ||
    typeof role !== "string" ||
    !ALLOWED_ROLES.has(role) ||
    typeof rawReason !== "string" ||
    rawReason.length > 500 ||
    containsControlCharacters(rawReason)
  ) {
    return null;
  }

  const reason = rawReason.trim();
  if (!reason) return null;

  return { memberId, role, reason };
}
