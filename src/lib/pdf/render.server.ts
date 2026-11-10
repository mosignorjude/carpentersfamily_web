import "server-only";

import type { DocumentProps } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { MAX_REPORT_EXPORT_BYTES } from "@/lib/report-export";

export async function renderReportPdf(
  document: ReactElement,
  maxBytes = MAX_REPORT_EXPORT_BYTES,
): Promise<Uint8Array | null> {
  const buffer = await renderToBuffer(document as ReactElement<DocumentProps>);
  if (buffer.byteLength > maxBytes) {
    return null;
  }
  return new Uint8Array(buffer);
}
