/**
 * Brace-counting CSS scanner shared by the layout tests.
 *
 * Three separate hand-rolled parsers in this directory each missed the same half
 * of a cascade question: a regex that anchored on the rule's dot could not tell
 * which rules came after it, a single literal space in a compound selector made a
 * reflowed rule invisible, and picking a @media block by its body picked whichever
 * block the file happens to list first. Parsing once removes that whole failure
 * class, so a guard can ask "which rules reach this class, in what order, under
 * which query" instead of pattern-matching a spelling.
 *
 * Values are offsets into the original source, so a caller can compare rule order
 * against a block's start. Comments and quoted strings are both skipped, so neither
 * a brace in prose nor `content: "}"` can end a rule early.
 */

/** At-rules whose children are ordinary rules, so they must be descended into. */
const NESTABLE = /^@(?:media|supports|layer)\b/;

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Index of the next character that is neither whitespace nor a comment. */
function skipTrivia(source, from) {
  let i = from;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i += 1;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else {
      break;
    }
  }
  return i;
}

/** Index just past the `}` that closes the `{` at `open`. Comments are skipped, so
 *  a brace written in prose cannot end the rule early, and neither can one inside a
 *  string: `content: "}"` is a value, not a close. */
function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return source.length;
      i = end + 1;
    } else if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
    } else if (source[i] === "{") {
      depth += 1;
    } else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

/**
 * Every rule in `source`, in order.
 *
 * `media` is the enclosing query text (`""` when the rule is at top level), so
 * "equal specificity, later source order wins" can be asked per rule without
 * re-deriving which block it fell inside. `mediaAt` is the offset of the `@media`
 * that carries it, or `null` at top level: query text alone cannot tell two blocks
 * that ask the same question apart, and a rule moved from one to the other has
 * different neighbours even while the text matches. `layer` is the enclosing
 * `@layer` name, or `null` when the rule is unlayered — and the difference decides
 * real fights, because an unlayered author rule outranks every layered one, `base`
 * loses to `utilities`, and specificity cannot arbitrate across layers at all.
 * `start` is an offset into the original source, so two rules can be compared for
 * order.
 */
export function parseCss(source) {
  const rules = [];

  function scan(from, to, media, layer, mediaAt) {
    let i = from;
    while (i < to) {
      const start = skipTrivia(source, i);
      const brace = source.indexOf("{", start);
      if (brace === -1 || brace >= to) return;
      const end = matchingBrace(source, brace);
      const prelude = stripComments(source.slice(start, brace))
        .replace(/\s+/g, " ")
        .trim();
      const body = source.slice(brace + 1, end - 1);
      if (NESTABLE.test(prelude)) {
        const query = /^@media\b/.test(prelude)
          ? prelude.slice(6).trim()
          : media;
        const named = /^@layer\b/.exec(prelude);
        scan(
          brace + 1,
          end - 1,
          query,
          named ? prelude.slice(named[0].length).trim() || named[0] : layer,
          /^@media\b/.test(prelude) ? start : mediaAt,
        );
      } else if (!prelude.startsWith("@")) {
        rules.push({
          selector: prelude,
          body,
          start,
          end,
          media,
          mediaAt,
          layer,
        });
      }
      i = end;
    }
  }

  scan(0, source.length, "", null);
  return { rules };
}

/** True when the selector reaches elements carrying exactly this class. */
export function carriesClass(selector, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(selector);
}

/**
 * True when `className` sits in the selector's subject — the element the rule
 * actually styles — rather than only in an ancestor prefix. `.app-sidebar
 * .app-signout-form button { display: flex }` does not make the sidebar a flex
 * box, so a cascade question asked of `.app-sidebar` must not read it.
 */
export function stylesClass(selector, className) {
  return carriesClass(selector.split(/[\s>+~]+/).at(-1), className);
}

/**
 * The value `prop` is set to in this rule body, or null when the rule skips it.
 *
 * Comments are stripped first. A value reader that walks from separator to
 * separator cannot see a documented declaration: when a comment sits between the
 * previous semicolon and the property, the reader stops at the comment and reports
 * the property as absent, so every guard using it passes on a rule it never read.
 */
export function declares(body, prop) {
  const pattern = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;}]+)`, "i");
  const match = pattern.exec(stripComments(body));
  return match ? match[1].trim() : null;
}

/** Rules whose subject is `className`, in source order. */
export function rulesFor({ rules }, className) {
  return rules.filter((rule) => stylesClass(rule.selector, className));
}
