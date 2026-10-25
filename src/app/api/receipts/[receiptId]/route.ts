import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getR2StorageAdapter } from "@/lib/receipt-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await params;
  if (!receiptId || !/^[0-9a-f-]{36}$/i.test(receiptId)) {
    return new NextResponse("Invalid receipt ID", { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 1. Query metadata through security-definer helper
  const { data: metaRows, error: metaError } = await supabase.rpc(
    "get_finance_receipt_download",
    { p_receipt_id: receiptId },
  );

  if (metaError || !metaRows || metaRows.length === 0) {
    return new NextResponse("Receipt not found or access denied", {
      status: 404,
    });
  }

  const meta = metaRows[0];
  const storage = getR2StorageAdapter();
  if (!storage) {
    return new NextResponse("Receipt storage unavailable", { status: 503 });
  }

  // 2. Fetch object bytes from R2
  let objectResult: { bytes: Uint8Array; contentType?: string } | null = null;
  try {
    objectResult = await storage.getObject(meta.object_key);
  } catch {
    return new NextResponse("Failed to retrieve receipt from storage", {
      status: 503,
    });
  }

  if (!objectResult) {
    return new NextResponse("Receipt object not found in storage", {
      status: 404,
    });
  }

  // 3. Verify SHA-256 and byte length integrity
  if (objectResult.bytes.byteLength !== meta.size_bytes) {
    return new NextResponse("Receipt size mismatch", { status: 502 });
  }

  const calculatedHash = createHash("sha256")
    .update(objectResult.bytes)
    .digest("hex");

  if (calculatedHash !== meta.sha256) {
    return new NextResponse("Receipt digest verification failed", {
      status: 502,
    });
  }

  // 4. Return as attachment with security headers
  const sanitizedFilename = meta.original_filename.replace(/["\r\n\\]/g, "_");

  return new Response(Buffer.from(objectResult.bytes), {
    status: 200,
    headers: {
      "Content-Type": meta.content_type,
      "Content-Length": meta.size_bytes.toString(),
      "Content-Disposition": `attachment; filename="${sanitizedFilename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Robots-Tag": "noindex",
    },
  });
}
