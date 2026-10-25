/**
 * @fileoverview Event form and payload validation helpers.
 */

/**
 * Checks whether a string contains disallowed ASCII control characters (code points < 32 or 127).
 * @param {string} value
 * @returns {boolean}
 */
export function containsControlCharacters(value) {
  if (typeof value !== "string") return false;
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

/**
 * Validates and converts an HTML datetime-local string to an Africa/Lagos (+01:00) ISO string.
 * Supports both standard minute precision (YYYY-MM-DDTHH:mm) and second precision (YYYY-MM-DDTHH:mm:ss).
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function eventDateTimeToISOString(value) {
  if (
    typeof value !== "string" ||
    !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(
      value,
    )
  ) {
    return null;
  }
  const cleanValue = value.length === 16 ? value : value.slice(0, 16);
  const localWallClock = new Date(`${cleanValue}:00.000Z`);
  if (
    Number.isNaN(localWallClock.getTime()) ||
    localWallClock.toISOString().slice(0, 16) !== cleanValue
  ) {
    return null;
  }
  return new Date(`${cleanValue}:00+01:00`).toISOString();
}

/**
 * Ensures that FormData only contains allowlisted event field names.
 * Automatically ignores React / Next.js internal action routing fields (starting with '$', e.g. '$ACTION_ID_...').
 *
 * @param {FormData} formData
 * @param {string[]} allowed
 * @returns {boolean}
 */
export function eventFieldsOnly(formData, allowed) {
  if (!formData || typeof formData.keys !== "function") return false;
  const allowedSet = new Set(allowed);
  return Array.from(formData.keys())
    .filter((key) => !key.startsWith("$"))
    .every((key) => allowedSet.has(key));
}

/**
 * Ensures that FormData only contains allowlisted communication field names.
 * Automatically ignores React / Next.js internal action routing fields (starting with '$').
 *
 * @param {FormData} formData
 * @param {string[]} allowed
 * @returns {boolean}
 */
export function communicationFieldsOnly(formData, allowed) {
  if (!formData || typeof formData.keys !== "function") return false;
  const allowedSet = new Set(allowed);
  return Array.from(formData.keys())
    .filter((key) => !key.startsWith("$"))
    .every((key) => allowedSet.has(key));
}

/**
 * Extracts and normalizes optional event text (e.g. description).
 * Replaces CRLF, newlines, and tabs with single spaces so multiline textareas comply
 * with database single-line / control-character constraints without rejecting user input.
 *
 * @param {FormData} formData
 * @param {string} key
 * @param {number} maxLength
 * @returns {string | null | undefined} null if empty, string if valid, undefined if invalid
 */
export function optionalEventText(formData, key, maxLength) {
  const values = formData.getAll(key);
  if (values.length === 0) return null;
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  // Normalize CRLF, newlines, and tabs to single spaces so multiline textareas comply with DB constraints
  const normalized = values[0].replace(/[\r\n\t]+/g, " ");
  if (containsControlCharacters(normalized)) return undefined;
  const value = normalized.trim();
  if (!value) return null;
  return value.length <= maxLength && !containsControlCharacters(value)
    ? value
    : undefined;
}
