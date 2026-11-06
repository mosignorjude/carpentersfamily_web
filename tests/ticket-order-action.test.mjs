import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("src/app/actions.ts", "utf8");
const start = source.indexOf("export async function submitTicketOrderAction");

test("the guest order action exists", () => {
  assert.ok(start !== -1, "submitTicketOrderAction is not in src/app/actions.ts");
});

const action = source.slice(start, source.indexOf("\nexport ", start + 1));
const adminClientSource = readFileSync("src/lib/supabase/admin.ts", "utf8");

test("ticket submission uses a server-only credential source", () => {
  assert.match(adminClientSource, /import ["'']server-only["'']/);
  assert.match(adminClientSource, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(action, /createSupabaseAdminClient\(\)/);
});

test("missing server credentials fail closed before receipt upload", () => {
  const configCheck = action.indexOf("if (!serviceClient)");
  const receiptUpload = action.indexOf("runReceiptEntry(");
  assert.ok(configCheck !== -1 && configCheck < receiptUpload);
  assert.match(action, /intakeRejection\("configuration", formData\)/);
});
test("it is not gated on a session", () => {
  assert.doesNotMatch(action, /createSupabaseServerClient|clientOrRedirect|getActiveEventActor/);
  assert.doesNotMatch(action, /is_active_club_member|auth\.getUser/);
});

test("it validates through the shared parser, not inline", () => {
  assert.match(action, /parseTicketOrderForm\(/);
  assert.match(action, /notice=invalid-request|buildSubmitFailureUrl/);
});

test("it uploads through the R2 helper and never through Supabase Storage", () => {
  assert.match(action, /runReceiptEntry\(/);
  assert.match(action, /getR2StorageAdapter\(\)/);
  assert.match(action, /validateFinanceReceiptUpload/);
  assert.match(action, /scope: "event_ticket"/);
  assert.match(action, /paymentStatus: "paid"/);
});

test("it passes the generated sale id as the receipt target", () => {
  assert.match(action, /p_sale_id:/);
  assert.match(action, /values\.saleId/);
});

test("it calls the server-only RPC with every named parameter", () => {
  for (const name of [
    "p_event_id", "p_tier_id", "p_quantity", "p_buyer_name", "p_buyer_email",
    "p_buyer_phone", "p_idempotency_key", "p_sale_id", "p_receipt_id",
    "p_receipt_filename", "p_receipt_object_key", "p_receipt_content_type",
    "p_receipt_size_bytes", "p_receipt_sha256",
  ]) {
    assert.match(action, new RegExp(`${name}:`), `${name} is not passed`);
  }
  assert.match(action, /createSupabaseAdminClient\(\)/);
  assert.doesNotMatch(action, /createAnonClient/);
  assert.match(action, /rpc\(\s*"submit_ticket_order"/);
});

test("the success redirect carries the reference and nothing else", () => {
  assert.match(action, /\/tickets\/order\?ref=/);
  assert.doesNotMatch(action, /buyer_email=|&email=|buyerEmail\)/, "PII must not enter a URL");
  assert.doesNotMatch(action, /redirect\(`\/tickets\/order\$\{[^}]*buyerEmail/);
});

test("revalidation happens before the redirect, because redirect throws", () => {
  const revalidate = action.indexOf("revalidatePath");
  const redirect = action.indexOf("redirect(");
  assert.ok(revalidate !== -1, "no revalidatePath in the guest action");
  assert.ok(revalidate < redirect, "revalidatePath must precede redirect()");
});

test("every database refusal becomes a mapped notice", () => {
  assert.match(action, /rpcErrorNotice\(/);
});
