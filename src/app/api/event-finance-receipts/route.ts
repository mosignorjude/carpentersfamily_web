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

function financeRedirect(
  origin: string | null,
  eventId: string | null,
  notice: string,
) {
  if (!origin)
    return new NextResponse("Receipt service unavailable.", { status: 503 });
  return NextResponse.redirect(
    new URL(
      eventId
        ? `/events/${encodeURIComponent(eventId)}/finance?notice=${encodeURIComponent(notice)}`
        : `/events?notice=${encodeURIComponent(notice)}`,
      origin,
    ),
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

async function cleanupPendingReceipt(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storage: NonNullable<ReturnType<typeof createReceiptStorageClient>>,
  receiptId: string,
  objectPath: string,
) {
  await Promise.allSettled([
    storage.storage.from(FINANCE_RECEIPTS_BUCKET).remove([objectPath]),
    supabase.rpc("fail_event_finance_receipt_upload", {
      p_receipt_id: receiptId,
    }),
  ]);
}

export async function POST(request: NextRequest) {
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin)
    return new NextResponse("Receipt service unavailable.", { status: 503 });
  const contentLength = request.headers.get("content-length");
  if (
    !isSameSiteRequest(request, siteOrigin) ||
    (contentLength !== null && !/^\d{1,8}$/.test(contentLength))
  ) {
    return financeRedirect(siteOrigin, null, "denied");
  }
  if (contentLength && Number(contentLength) > MAX_RECEIPT_REQUEST_BYTES) {
    return financeRedirect(siteOrigin, null, "receipt-too-large");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return new NextResponse("Receipt service unavailable.", { status: 503 });
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return financeRedirect(siteOrigin, null, "denied");
  }
  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    return financeRedirect(siteOrigin, null, "denied");
  }

  const formResult = await readBoundedFormData(
    request,
    MAX_RECEIPT_REQUEST_BYTES,
  );
  if (formResult.kind === "too-large") {
    return financeRedirect(siteOrigin, null, "receipt-too-large");
  }
  if (formResult.kind === "invalid") {
    return financeRedirect(siteOrigin, null, "receipt-invalid");
  }
  const { form } = formResult;
  const entries = [...form.entries()];
  if (
    entries.length !== 3 ||
    form.getAll("eventId").length !== 1 ||
    form.getAll("transactionId").length !== 1 ||
    form.getAll("receipt").length !== 1 ||
    entries.some(
      ([key]) => !["eventId", "transactionId", "receipt"].includes(key),
    )
  ) {
    return financeRedirect(siteOrigin, null, "receipt-invalid");
  }
  const eventId = form.get("eventId");
  const transactionId = form.get("transactionId");
  const file = form.get("receipt");
  if (
    typeof eventId !== "string" ||
    !UUID_PATTERN.test(eventId) ||
    typeof transactionId !== "string" ||
    !UUID_PATTERN.test(transactionId) ||
    typeof File === "undefined" ||
    !(file instanceof File) ||
    file.size < 1
  ) {
    return financeRedirect(siteOrigin, null, "receipt-invalid");
  }

  const [roleResult, eventRoleResult, transactionResult] = await Promise.all([
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select("role")
      .eq("event_id", eventId)
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_financial_transactions")
      .select("id, event_id, voided_at")
      .eq("id", transactionId)
      .maybeSingle(),
  ]);
  if (roleResult.error || eventRoleResult.error || transactionResult.error) {
    return financeRedirect(siteOrigin, eventId, "receipt-failed");
  }
  const roles = new Set((roleResult.data ?? []).map((row) => row.role));
  const eventRoles = new Set(
    (eventRoleResult.data ?? []).map((row) => row.role),
  );
  const isManager =
    ["executive", "admin", "backup_admin"].some((role) => roles.has(role)) ||
    eventRoles.has("lead") ||
    eventRoles.has("assistant");
  if (
    !isManager ||
    !transactionResult.data ||
    transactionResult.data.event_id !== eventId ||
    transactionResult.data.voided_at !== null
  ) {
    return financeRedirect(siteOrigin, eventId, "denied");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return financeRedirect(siteOrigin, eventId, "receipt-invalid");
  }
  const validated = validateReceiptBytes(file.name, file.type, bytes);
  if (!validated)
    return financeRedirect(siteOrigin, eventId, "receipt-invalid");

  const storage = createReceiptStorageClient();
  if (!storage)
    return financeRedirect(siteOrigin, eventId, "receipt-unavailable");
  const receiptId = randomUUID();
  const { data: objectPath, error: reserveError } = await supabase.rpc(
    "reserve_event_finance_receipt",
    {
      p_receipt_id: receiptId,
      p_transaction_id: transactionId,
      p_original_filename: validated.filename,
      p_content_type: validated.contentType,
      p_size_bytes: bytes.length,
    },
  );
  if (reserveError || typeof objectPath !== "string") {
    return financeRedirect(siteOrigin, eventId, "receipt-failed");
  }
  const extension =
    validated.contentType === "image/jpeg" ? "jpg" : validated.extension;
  const expectedPath = `event/${transactionId}/${receiptId}.${extension}`;
  if (objectPath !== expectedPath) {
    await supabase.rpc("fail_event_finance_receipt_upload", {
      p_receipt_id: receiptId,
    });
    return financeRedirect(siteOrigin, eventId, "receipt-failed");
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
      await cleanupPendingReceipt(supabase, storage, receiptId, objectPath);
      return financeRedirect(siteOrigin, eventId, "receipt-failed");
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const { error: finalizeError } = await supabase.rpc(
      "finalize_event_finance_receipt",
      {
        p_receipt_id: receiptId,
        p_sha256: checksum,
      },
    );
    if (finalizeError) {
      await cleanupPendingReceipt(supabase, storage, receiptId, objectPath);
      return financeRedirect(siteOrigin, eventId, "receipt-failed");
    }
  } catch {
    await cleanupPendingReceipt(supabase, storage, receiptId, objectPath);
    return financeRedirect(siteOrigin, eventId, "receipt-failed");
  }
  return financeRedirect(siteOrigin, eventId, "receipt-uploaded");
}
