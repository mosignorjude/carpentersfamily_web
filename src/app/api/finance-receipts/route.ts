import { createHash, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { readBoundedFormData } from "@/lib/bounded-form-data";
import {
  createReceiptStorageClient,
  FINANCE_RECEIPTS_BUCKET,
  MAX_RECEIPT_REQUEST_BYTES,
  validateReceiptBytes,
} from "@/lib/finance-receipts";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function financeRedirect(origin: string | null, notice: string) {
  if (!origin)
    return new NextResponse("Receipt service unavailable.", { status: 503 });
  return NextResponse.redirect(
    new URL(`/finances?notice=${encodeURIComponent(notice)}`, origin),
    303,
  );
}

function isSameSiteRequest(request: NextRequest, expectedOrigin: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isFinanceOfficer(roles: Set<string>) {
  return ["executive", "admin", "backup_admin"].some((role) => roles.has(role));
}

async function cleanUpPendingReceipt(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storage: NonNullable<ReturnType<typeof createReceiptStorageClient>>,
  receiptId: string,
  objectPath: string,
) {
  await Promise.allSettled([
    storage.storage.from(FINANCE_RECEIPTS_BUCKET).remove([objectPath]),
    supabase.rpc("fail_club_finance_receipt_upload", {
      p_receipt_id: receiptId,
    }),
  ]);
}

export async function POST(request: NextRequest) {
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) return financeRedirect(null, "receipt-unavailable");
  if (!isSameSiteRequest(request, siteOrigin)) {
    return financeRedirect(siteOrigin, "denied");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && !/^\d{1,8}$/.test(contentLength)) {
    return financeRedirect(siteOrigin, "receipt-invalid");
  }
  if (contentLength && Number(contentLength) > MAX_RECEIPT_REQUEST_BYTES) {
    return financeRedirect(siteOrigin, "receipt-too-large");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return financeRedirect(siteOrigin, "receipt-unavailable");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return financeRedirect(siteOrigin, "denied");

  const [profileResult, roleResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("status")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
  ]);
  if (profileResult.error || profileResult.data?.status !== "active") {
    return financeRedirect(siteOrigin, "denied");
  }
  if (roleResult.error)
    return financeRedirect(siteOrigin, "receipt-unavailable");
  const roles = new Set((roleResult.data ?? []).map((row) => row.role));
  if (!isFinanceOfficer(roles)) return financeRedirect(siteOrigin, "denied");

  const storage = createReceiptStorageClient();
  if (!storage) return financeRedirect(siteOrigin, "receipt-unavailable");

  const formResult = await readBoundedFormData(
    request,
    MAX_RECEIPT_REQUEST_BYTES,
  );
  if (formResult.kind === "too-large") {
    return financeRedirect(siteOrigin, "receipt-too-large");
  }
  if (formResult.kind === "invalid") {
    return financeRedirect(siteOrigin, "receipt-invalid");
  }
  const { form } = formResult;

  const entries = [...form.entries()];
  if (
    entries.length !== 2 ||
    form.getAll("transactionId").length !== 1 ||
    form.getAll("receipt").length !== 1 ||
    entries.some(([key]) => key !== "transactionId" && key !== "receipt")
  ) {
    return financeRedirect(siteOrigin, "receipt-invalid");
  }

  const transactionId = form.get("transactionId");
  const file = form.get("receipt");
  if (
    typeof transactionId !== "string" ||
    !UUID_PATTERN.test(transactionId) ||
    typeof File === "undefined" ||
    !(file instanceof File) ||
    file.size < 1
  ) {
    return financeRedirect(siteOrigin, "receipt-invalid");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return financeRedirect(siteOrigin, "receipt-invalid");
  }
  const validated = validateReceiptBytes(file.name, file.type, bytes);
  if (!validated) {
    return financeRedirect(siteOrigin, "receipt-invalid");
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("club_financial_transactions")
    .select("id, voided_at")
    .eq("id", transactionId)
    .maybeSingle();
  if (transactionError || !transaction || transaction.voided_at !== null) {
    return financeRedirect(siteOrigin, "denied");
  }

  const receiptId = randomUUID();
  const extension =
    validated.contentType === "image/jpeg" ? "jpg" : validated.extension;
  const expectedPath = `${transaction.id}/${receiptId}.${extension}`;
  const { data: objectPath, error: reserveError } = await supabase.rpc(
    "reserve_club_finance_receipt",
    {
      p_receipt_id: receiptId,
      p_transaction_id: transaction.id,
      p_original_filename: validated.filename,
      p_content_type: validated.contentType,
      p_size_bytes: bytes.length,
    },
  );
  if (reserveError || objectPath !== expectedPath) {
    if (!reserveError) {
      await supabase.rpc("fail_club_finance_receipt_upload", {
        p_receipt_id: receiptId,
      });
    }
    return financeRedirect(siteOrigin, "receipt-failed");
  }

  try {
    const { error: uploadError } = await storage.storage
      .from(FINANCE_RECEIPTS_BUCKET)
      .upload(objectPath, bytes, {
        cacheControl: "0",
        contentType: validated.contentType,
        upsert: false,
      });
    if (uploadError) {
      await cleanUpPendingReceipt(supabase, storage, receiptId, objectPath);
      return financeRedirect(siteOrigin, "receipt-failed");
    }

    const checksum = createHash("sha256").update(bytes).digest("hex");
    const { error: finalizeError } = await supabase.rpc(
      "finalize_club_finance_receipt",
      { p_receipt_id: receiptId, p_sha256: checksum },
    );
    if (finalizeError) {
      await cleanUpPendingReceipt(supabase, storage, receiptId, objectPath);
      return financeRedirect(
        siteOrigin,
        finalizeError.code === "23505" ? "receipt-duplicate" : "receipt-failed",
      );
    }
  } catch {
    await cleanUpPendingReceipt(supabase, storage, receiptId, objectPath);
    return financeRedirect(siteOrigin, "receipt-failed");
  }

  return financeRedirect(siteOrigin, "receipt-uploaded");
}
