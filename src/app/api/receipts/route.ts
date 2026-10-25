import { createHash, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { validateFinanceReceiptUpload } from "@/lib/finance-receipt-validation";
import { buildReceiptObjectKey } from "@/lib/receipt-rules.mjs";
import { getR2StorageAdapter } from "@/lib/receipt-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.redirect(new URL("/?notice=sign-in", request.url));
  }

  const formData = await request.formData();
  const scope = formData.get("scope") as string | null;
  const targetId = formData.get("target_id") as string | null;
  const file = formData.get("file") as File | null;
  const returnUrl =
    (formData.get("return_url") as string | null) || "/finances";

  if (
    !scope ||
    !targetId ||
    !file ||
    !["club", "event", "event_ticket"].includes(scope)
  ) {
    return NextResponse.redirect(
      new URL(`${returnUrl}?notice=invalid-request`, request.url),
    );
  }

  const storage = getR2StorageAdapter();
  if (!storage) {
    return NextResponse.redirect(
      new URL(`${returnUrl}?notice=receipt-storage-unavailable`, request.url),
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateFinanceReceiptUpload(file.name, file.type, bytes);
  if (!validated) {
    return NextResponse.redirect(
      new URL(`${returnUrl}?notice=receipt-invalid`, request.url),
    );
  }

  const receiptId = randomUUID();
  const objectKey = buildReceiptObjectKey({
    scope: scope as "club" | "event" | "event_ticket",
    targetId,
    receiptId,
    contentType: validated.contentType,
  });

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // 1. Upload to R2 first
  try {
    await storage.putObject(objectKey, bytes, validated.contentType);
  } catch {
    return NextResponse.redirect(
      new URL(`${returnUrl}?notice=receipt-upload-failed`, request.url),
    );
  }

  // 2. Call DB attach RPC
  const { error: rpcError } = await supabase.rpc("attach_finance_receipt", {
    p_scope: scope,
    p_target_id: targetId,
    p_receipt_id: receiptId,
    p_object_key: objectKey,
    p_original_filename: validated.filename,
    p_content_type: validated.contentType,
    p_size_bytes: bytes.byteLength,
    p_sha256: sha256,
  });

  if (rpcError) {
    await storage.deleteObject(objectKey).catch(() => undefined);
    return NextResponse.redirect(
      new URL(`${returnUrl}?notice=operation-failed`, request.url),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnUrl}?notice=receipt-attached`, request.url),
  );
}
