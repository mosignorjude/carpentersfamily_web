import { existsSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

function resolveFontDir(): string {
  const candidates = [
    path.join(process.cwd(), "src", "fonts", "pdf"),
    path.resolve(process.cwd(), "..", "..", "src", "fonts", "pdf"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "ibm-plex-sans-400.ttf"))) {
      return candidate;
    }
  }
  return candidates[0];
}

export function ensurePdfFontsRegistered(): void {
  if (registered) return;
  registered = true;

  const fontDir = resolveFontDir();

  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      {
        src: path.join(fontDir, "ibm-plex-sans-400.ttf"),
        fontWeight: 400,
      },
      {
        src: path.join(fontDir, "ibm-plex-sans-600.ttf"),
        fontWeight: 600,
      },
      {
        src: path.join(fontDir, "ibm-plex-sans-700.ttf"),
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: "Fraunces",
    fonts: [
      {
        src: path.join(fontDir, "fraunces-700.ttf"),
        fontWeight: 700,
      },
    ],
  });

  // Disable automatic mid-word hyphenation for names and NGN figures.
  Font.registerHyphenationCallback((word) => [word]);
}
