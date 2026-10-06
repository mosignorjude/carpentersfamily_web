export const MAX_REPORT_ROWS = 1000;
export const MAX_REPORT_EXPORT_BYTES = 4 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const PDF_LINES_PER_PAGE = 56;
const PDF_LINE_WIDTH = 88;

export type ReportFormat = "csv" | "pdf";

export function getWATDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isFormulaLikeText(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      character === "\uFEFF" ||
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      /\p{White_Space}/u.test(character)
    ) {
      continue;
    }
    return "=+-@".includes(character);
  }
  return false;
}

export function csvCell(value: string | number | boolean | null | undefined) {
  let cell = value === null || value === undefined ? "" : String(value);
  if (isFormulaLikeText(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}

export function toCsvRows(
  rows: Array<Array<string | number | boolean | null>>,
) {
  const serializedRows = rows.map((row) => row.map(csvCell).join(","));
  return `\uFEFF${serializedRows.join("\r\n")}\r\n`;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>,
) {
  return toCsvRows([headers, ...rows]);
}

const WIN_ANSI_SPECIALS = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);
const LATIN_TRANSLITERATION = new Map<string, string>([
  ["Æ", "AE"],
  ["æ", "ae"],
  ["Œ", "OE"],
  ["œ", "oe"],
  ["ß", "ss"],
  ["Ø", "O"],
  ["ø", "o"],
  ["Ð", "D"],
  ["ð", "d"],
  ["Þ", "TH"],
  ["þ", "th"],
  ["Ł", "L"],
  ["ł", "l"],
  ["ı", "i"],
]);

function pdfSafeText(value: string) {
  const normalized = value.normalize("NFKD").replace(/\p{Mark}/gu, "");
  let result = "";
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0x3f;
    if (codePoint <= 0x20 || codePoint === 0x7f) {
      result += " ";
    } else if (codePoint <= 0x7e) {
      result += character;
    } else if (codePoint >= 0xa0 && codePoint <= 0xff) {
      result += character;
    } else if (WIN_ANSI_SPECIALS.has(codePoint)) {
      result += character;
    } else if (LATIN_TRANSLITERATION.has(character)) {
      result += LATIN_TRANSLITERATION.get(character);
    } else {
      result += "?";
    }
  }
  return result;
}

function winAnsiHex(value: string) {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0x3f;
    if (codePoint <= 0x7e) bytes.push(codePoint);
    else if (codePoint >= 0xa0 && codePoint <= 0xff) bytes.push(codePoint);
    else bytes.push(WIN_ANSI_SPECIALS.get(codePoint) ?? 0x3f);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function wrapPdfLine(line: string, width = PDF_LINE_WIDTH) {
  const safeLine = pdfSafeText(line).trim();
  if (!safeLine) return [""];
  const words = safeLine.split(/\s+/u);
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) wrapped.push(current);
      current = "";
      for (let offset = 0; offset < word.length; offset += width) {
        const segment = word.slice(offset, offset + width);
        if (segment.length === width) wrapped.push(segment);
        else current = segment;
      }
      continue;
    }
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else {
      wrapped.push(current);
      current = word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
}

function pdfTextCommand(text: string, fontSize: number, x: number, y: number) {
  return `BT /F1 ${fontSize} Tf 1 0 0 1 ${x} ${y} Tm <${winAnsiHex(text)}> Tj ET`;
}

function pdfObject(id: number, body: string) {
  return Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, "ascii");
}

export function createSimplePdf(
  title: string,
  subtitle: string,
  lines: string[],
) {
  const wrappedLines = lines.flatMap((line) => wrapPdfLine(line));
  const pages: string[][] = [];
  for (
    let offset = 0;
    offset < wrappedLines.length;
    offset += PDF_LINES_PER_PAGE
  ) {
    pages.push(wrappedLines.slice(offset, offset + PDF_LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  if (pages.length > MAX_PDF_PAGES) return null;

  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const objects: Buffer[] = [];
  objects[1] = pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = pdfObject(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects[3] = pdfObject(
    3,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  );

  for (const [index, pageLines] of pages.entries()) {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const commands = [
      pdfTextCommand(title, 14, 36, 754),
      pdfTextCommand(subtitle, 9, 36, 736),
      ...pageLines.map((line, lineIndex) =>
        pdfTextCommand(line, 9, 36, 714 - lineIndex * 12),
      ),
      pdfTextCommand(`Page ${index + 1} of ${pages.length}`, 8, 500, 28),
    ].join("\n");
    const stream = Buffer.from(commands, "ascii");
    objects[pageId] = pdfObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects[contentId] = pdfObject(
      contentId,
      `<< /Length ${stream.length} >>\nstream\n${stream.toString("ascii")}\nendstream`,
    );
  }

  const header = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary");
  const chunks: Buffer[] = [header];
  const offsets = [0];
  let length = header.length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = length;
    chunks.push(objects[id]);
    length += objects[id].length;
  }
  const xrefOffset = length;
  const xrefLines = [
    `xref\n0 ${objects.length}\n`,
    "0000000000 65535 f \n",
    ...offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ];
  chunks.push(Buffer.from(xrefLines.join(""), "ascii"));
  const result = Buffer.concat(chunks);
  if (result.length > MAX_REPORT_EXPORT_BYTES) return null;
  return new Uint8Array(result);
}

export function wholeNgn(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!/^-?\d{1,18}$/u.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

export function formatNgn(value: bigint) {
  return value.toString();
}

export type DuesAmountRow = {
  member_id: string;
  status: string;
  due_date: string;
  amount_ngn: string | number | null;
};

export function owedByMember(rows: readonly DuesAmountRow[], asOf: string) {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const amount = wholeNgn(row.amount_ngn);
    if (amount === null) return null;
    if (row.status === "unpaid" && row.due_date <= asOf) {
      totals.set(
        row.member_id,
        (totals.get(row.member_id) ?? BigInt(0)) + amount,
      );
    }
  }
  return totals;
}
