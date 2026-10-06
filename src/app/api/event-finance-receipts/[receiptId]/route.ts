import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createReceiptStorageClient,
  FINANCE_RECEIPTS_BUCKET,
  MAX_RECEIPT_BYTES,
  validateReceiptBytes,
} from "@/lib/finance-receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function notFound() {
  return new NextResponse("Receipt unavailable.", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await context.params;
  if (!UUID_PATTERN.test(receiptId)) return notFound();
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return notFound();
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return notFound();
  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") return notFound();

  const { data: receiptRows, error: receiptError } = await supabase.rpc(
    "get_event_finance_receipt_download",
    { p_receipt_id: receiptId },
  );
  const receipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
  if (
    receiptError ||
    !receipt ||
    receipt.id !== receiptId ||
    !UUID_PATTERN.test(receipt.transaction_id) ||
    !ALLOWED_TYPES.has(receipt.content_type) ||
    !Number.isInteger(receipt.size_bytes) ||
    receipt.size_bytes < 1 ||
    receipt.size_bytes > MAX_RECEIPT_BYTES ||
    typeof receipt.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(receipt.sha256)
  ) {
    return notFound();
  }
  const extension =
    receipt.content_type === "application/pdf"
      ? "pdf"
      : receipt.content_type === "image/jpeg"
        ? "jpg"
        : "png";
  const expectedPath = `event/${receipt.transaction_id}/${receipt.id}.${extension}`;
  if (receipt.object_path !== expectedPath) return notFound();

  const storage = createReceiptStorageClient();
  if (!storage) {
    return new NextResponse("Receipt service unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const { data: file, error: downloadError } = await storage.storage
      .from(FINANCE_RECEIPTS_BUCKET)
      .download(receipt.object_path);
    if (downloadError || !file || file.size !== receipt.size_bytes) {
      return new NextResponse("Receipt could not be verified.", {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (
      createHash("sha256").update(bytes).digest("hex") !== receipt.sha256 ||
      !validateReceiptBytes(
        receipt.original_filename,
        receipt.content_type,
        bytes,
      )
    ) {
      return new NextResponse("Receipt could not be verified.", {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const safeFilename = validateReceiptBytes(
      receipt.original_filename,
      receipt.content_type,
      bytes,
    )?.filename;
    if (!safeFilename) return notFound();
    const encodedFilename = encodeURIComponent(safeFilename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(bytes, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(bytes.byteLength),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": receipt.content_type,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, noarchive",
      },
    });
  } catch {
    return new NextResponse("Receipt service unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
