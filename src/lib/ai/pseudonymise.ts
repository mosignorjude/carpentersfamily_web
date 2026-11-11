export interface PseudonymMemberInput {
  id: string;
  full_name: string;
  username?: string | null;
}

export interface PseudonymMaskStats {
  membersMatched: number;
  sharedNamesMatched: number;
  emailsMasked: number;
  phonesMasked: number;
  handlesMasked: number;
  tokensApplied: string[];
}

export interface PseudonymSession {
  readonly tokenMapSize: number;
  maskText(input: string): { maskedText: string; stats: PseudonymMaskStats };
  unmaskText(input: string): string;
  findUnresolvedTokens(input: string): string[];
}

interface TermEntry {
  folded: string;
  token: string;
  priority: number;
}

const NON_NAME_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "club",
  "admin",
  "officer",
  "member",
  "members",
  "guest",
  "guests",
  "chair",
  "chief",
  "sir",
  "madam",
  "mr",
  "mrs",
  "miss",
  "all",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "will",
  "can",
  "not",
  "but",
  "may",
]);

const PROTECTED_PLACEHOLDER_RE =
  /\[(?:Member|Name|Email|Phone|Handle|Guest)\s+[^\]]+\]/gi;

const UNRESOLVED_TOKEN_RE = /\[(?:Member|Name|Email|Phone|Handle)\s*[^\]]*\]/gi;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const HANDLE_RE = /(?<![A-Za-z0-9_])@[A-Za-z0-9_.-]{2,40}\b/g;
const PHONE_RE =
  /(?<!\d)(?:\+234(?:[\s-]?\d){9,10}|\+\d(?:[\s-]?\d){7,14}|\b0[789][01]\d(?:[\s-]?\d){7,8}\b)(?!\d)/g;

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

export function stripDiacriticsAndLower(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

interface FoldedText {
  folded: string;
  origStart: number[];
  origEnd: number[];
}

function foldWithOffsets(input: string): FoldedText {
  const foldedChars: string[] = [];
  const origStart: number[] = [];
  const origEnd: number[] = [];

  let i = 0;
  while (i < input.length) {
    const code = input.codePointAt(i) ?? 0;
    const step = code > 0xffff ? 2 : 1;
    let end = i + step;

    // Group base codepoint with any trailing Unicode combining marks
    while (end < input.length) {
      const nextCode = input.codePointAt(end) ?? 0;
      const nextStep = nextCode > 0xffff ? 2 : 1;
      const slice = input.slice(end, end + nextStep);
      if (/^\p{M}$/u.test(slice)) {
        end += nextStep;
      } else {
        break;
      }
    }

    const cluster = input.slice(i, end);
    const stripped = stripDiacriticsAndLower(cluster);
    if (stripped.length > 0) {
      for (const ch of stripped) {
        foldedChars.push(ch);
        origStart.push(i);
        origEnd.push(end);
      }
    }
    i = end;
  }

  return {
    folded: foldedChars.join(""),
    origStart,
    origEnd,
  };
}

function splitProtectedRanges(
  text: string,
): Array<{ start: number; end: number; protected: boolean }> {
  const segments: Array<{ start: number; end: number; protected: boolean }> =
    [];
  let cursor = 0;
  PROTECTED_PLACEHOLDER_RE.lastIndex = 0;
  for (const match of text.matchAll(PROTECTED_PLACEHOLDER_RE)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      segments.push({ start: cursor, end: idx, protected: false });
    }
    segments.push({
      start: idx,
      end: idx + match[0].length,
      protected: true,
    });
    cursor = idx + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ start: cursor, end: text.length, protected: false });
  }
  return segments;
}

function replaceOutsideProtected(
  input: string,
  pattern: RegExp,
  replacer: (matched: string) => string,
): string {
  const segments = splitProtectedRanges(input);
  let out = "";
  for (const seg of segments) {
    const slice = input.slice(seg.start, seg.end);
    if (seg.protected) {
      out += slice;
      continue;
    }
    out += slice.replace(pattern, (matched) => replacer(matched));
  }
  return out;
}

function maskTermsOutsideProtected(
  input: string,
  terms: readonly TermEntry[],
  matchedMemberTokens: Set<string>,
  matchedSharedTokens: Set<string>,
): string {
  if (terms.length === 0 || input.length === 0) return input;

  const segments = splitProtectedRanges(input);
  let out = "";

  for (const seg of segments) {
    const slice = input.slice(seg.start, seg.end);
    if (seg.protected) {
      out += slice;
      continue;
    }

    const folded = foldWithOffsets(slice);
    const candidates: Array<{ start: number; end: number; token: string }> = [];

    for (const term of terms) {
      let searchFrom = 0;
      while (searchFrom <= folded.folded.length - term.folded.length) {
        const idx = folded.folded.indexOf(term.folded, searchFrom);
        if (idx === -1) break;
        const endIdx = idx + term.folded.length;

        const leftChar = idx > 0 ? folded.folded[idx - 1] : "";
        const rightChar =
          endIdx < folded.folded.length ? folded.folded[endIdx] : "";
        const leftOk = idx === 0 || !WORD_CHAR_RE.test(leftChar);
        const rightOk =
          endIdx === folded.folded.length || !WORD_CHAR_RE.test(rightChar);

        if (leftOk && rightOk) {
          const origStartIdx = folded.origStart[idx];
          const origEndIdx = folded.origEnd[endIdx - 1];
          if (origStartIdx !== undefined && origEndIdx !== undefined) {
            candidates.push({
              start: origStartIdx,
              end: origEndIdx,
              token: term.token,
            });
          }
        }
        searchFrom = idx + 1;
      }
    }

    if (candidates.length === 0) {
      out += slice;
      continue;
    }

    // Prefer earliest start, then longest match (lowest length negative)
    candidates.sort(
      (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
    );

    const accepted: typeof candidates = [];
    let busyUntil = 0;
    for (const cand of candidates) {
      if (cand.start < busyUntil) continue;
      accepted.push(cand);
      busyUntil = cand.end;
    }

    let cursor = 0;
    for (const hit of accepted) {
      out += slice.slice(cursor, hit.start);
      out += hit.token;
      if (hit.token.startsWith("[Member ")) {
        matchedMemberTokens.add(hit.token);
      } else {
        matchedSharedTokens.add(hit.token);
      }
      cursor = hit.end;
    }
    out += slice.slice(cursor);
  }

  return out;
}

export function findUnresolvedTokens(input: string): string[] {
  const found = new Set<string>();
  UNRESOLVED_TOKEN_RE.lastIndex = 0;
  for (const match of input.matchAll(UNRESOLVED_TOKEN_RE)) {
    found.add(match[0]);
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

export function createPseudonymSession(
  members: readonly PseudonymMemberInput[],
  seedTexts: readonly string[] = [],
): PseudonymSession {
  const sortedMembers = [...members]
    .filter((m) => m.id && m.full_name.trim().length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  const tokenToValue = new Map<string, string>();
  const terms: TermEntry[] = [];

  // Track single-part ownership to avoid wrongly conflating shared names
  const partOwners = new Map<
    string,
    Array<{ token: string; display: string }>
  >();

  sortedMembers.forEach((member, index) => {
    const token = `[Member ${index + 1}]`;
    const cleanFull = member.full_name.trim().replace(/\s+/g, " ");
    tokenToValue.set(token, cleanFull);

    const foldedFull = stripDiacriticsAndLower(cleanFull);
    if (foldedFull.length >= 2) {
      terms.push({ folded: foldedFull, token, priority: 0 });
    }

    const rawUsername = member.username?.trim().replace(/^@/, "") ?? "";
    const foldedUser = stripDiacriticsAndLower(rawUsername);
    if (foldedUser.length >= 3 && !NON_NAME_WORDS.has(foldedUser)) {
      terms.push({ folded: foldedUser, token, priority: 1 });
    }

    const parts = cleanFull.split(/[\s\-'.]+/).filter(Boolean);
    const seenParts = new Set<string>();
    for (const part of parts) {
      const foldedPart = stripDiacriticsAndLower(part);
      if (foldedPart.length < 3 || NON_NAME_WORDS.has(foldedPart)) continue;
      if (seenParts.has(foldedPart)) continue;
      seenParts.add(foldedPart);
      const list = partOwners.get(foldedPart) ?? [];
      list.push({ token, display: part });
      partOwners.set(foldedPart, list);
    }
  });

  let sharedCounter = 0;
  const sortedParts = [...partOwners.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [foldedPart, owners] of sortedParts) {
    if (owners.length === 1) {
      terms.push({
        folded: foldedPart,
        token: owners[0].token,
        priority: 2,
      });
    } else {
      sharedCounter += 1;
      const sharedToken = `[Name ${sharedCounter}]`;
      tokenToValue.set(sharedToken, owners[0].display);
      terms.push({
        folded: foldedPart,
        token: sharedToken,
        priority: 3,
      });
    }
  }

  terms.sort(
    (a, b) =>
      b.folded.length - a.folded.length ||
      a.priority - b.priority ||
      a.folded.localeCompare(b.folded),
  );

  const emailToToken = new Map<string, string>();
  const handleToToken = new Map<string, string>();
  const phoneToToken = new Map<string, string>();

  const registerEmail = (raw: string): string => {
    const key = raw.toLowerCase();
    const existing = emailToToken.get(key);
    if (existing) return existing;
    const token = `[Email ${emailToToken.size + 1}]`;
    emailToToken.set(key, token);
    tokenToValue.set(token, raw);
    return token;
  };

  const registerHandle = (raw: string): string => {
    const key = raw.toLowerCase();
    const existing = handleToToken.get(key);
    if (existing) return existing;
    const token = `[Handle ${handleToToken.size + 1}]`;
    handleToToken.set(key, token);
    tokenToValue.set(token, raw);
    return token;
  };

  const registerPhone = (raw: string): string => {
    const key = raw.replace(/[\s-]+/g, "");
    const existing = phoneToToken.get(key);
    if (existing) return existing;
    const token = `[Phone ${phoneToToken.size + 1}]`;
    phoneToToken.set(key, token);
    tokenToValue.set(token, raw);
    return token;
  };

  // Seed deterministic contact indices before processing any edited preview text
  for (const seed of seedTexts) {
    if (!seed) continue;
    const afterEmail = replaceOutsideProtected(seed, EMAIL_RE, registerEmail);
    const afterHandle = replaceOutsideProtected(
      afterEmail,
      HANDLE_RE,
      registerHandle,
    );
    replaceOutsideProtected(afterHandle, PHONE_RE, registerPhone);
  }

  const maskText = (input: string) => {
    const appliedEmails = new Set<string>();
    const appliedHandles = new Set<string>();
    const appliedPhones = new Set<string>();
    const appliedMembers = new Set<string>();
    const appliedShared = new Set<string>();

    let text = replaceOutsideProtected(input, EMAIL_RE, (m) => {
      const tok = registerEmail(m);
      appliedEmails.add(tok);
      return tok;
    });

    text = replaceOutsideProtected(text, HANDLE_RE, (m) => {
      const tok = registerHandle(m);
      appliedHandles.add(tok);
      return tok;
    });

    text = replaceOutsideProtected(text, PHONE_RE, (m) => {
      const tok = registerPhone(m);
      appliedPhones.add(tok);
      return tok;
    });

    text = maskTermsOutsideProtected(
      text,
      terms,
      appliedMembers,
      appliedShared,
    );

    const tokensApplied = [
      ...appliedMembers,
      ...appliedShared,
      ...appliedEmails,
      ...appliedHandles,
      ...appliedPhones,
    ].sort((a, b) => a.localeCompare(b));

    return {
      maskedText: text,
      stats: {
        membersMatched: appliedMembers.size,
        sharedNamesMatched: appliedShared.size,
        emailsMasked: appliedEmails.size,
        phonesMasked: appliedPhones.size,
        handlesMasked: appliedHandles.size,
        tokensApplied,
      },
    };
  };

  // Case-insensitive lookup table for token restoration
  const normalizedTokenLookup = new Map<string, string>();
  for (const [token, val] of tokenToValue.entries()) {
    normalizedTokenLookup.set(token.replace(/\s+/g, " ").toLowerCase(), val);
  }

  const unmaskText = (input: string): string => {
    return input.replace(
      /\[(Member|Name|Email|Phone|Handle)\s+(\d+)\]/gi,
      (full, kind: string, num: string) => {
        const key = `[${kind.toLowerCase()} ${num}]`;
        return normalizedTokenLookup.get(key) ?? full;
      },
    );
  };

  return {
    tokenMapSize: tokenToValue.size,
    maskText,
    unmaskText,
    findUnresolvedTokens,
  };
}
