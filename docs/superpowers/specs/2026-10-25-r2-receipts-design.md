# Cloudflare R2 Receipt Uploads — Design

Date: 2026-10-25
Status: Approved for implementation planning
Scope: All financial entry flows in the club app

## 1. Summary

Replace typed payment reference numbers with required receipt screenshots (PDF/JPEG/PNG) stored in a private Cloudflare R2 bucket. Payment methods collapse to `bank_transfer` and `cash`. A paid bank transfer cannot be recorded unless its receipt is stored first. Cash and bank-transfer commitments in `pending`, `unpaid`, or `deposit` require no receipt until they become paid.

Receipts are stored in R2, metadata lives in one unified `finance_receipts` table, and every read goes through an authenticated Next.js proxy route that verifies access and the SHA-256 digest.

## 2. Goals

- Remove all reference-number inputs, storage, display, search, exports, and notification lines.
- Require at least one receipt for every **paid** bank-transfer transaction at entry time, and require one when a pending/unpaid/deposit bank transfer later becomes paid, across:
  - member dues payments (member requests and direct officer entry)
  - event income
  - event expenses
  - event ticket sales
  - club-level income and expenses
- Store receipt bytes in R2 only; retire Supabase Storage receipt code, tables, and bucket.
- Guarantee no **new or transitioned paid** transaction row exists without a receipt when the method is bank transfer, with a labelled exception for grandfathered legacy rows.
- Keep receipt visibility scoped: club/event receipts for active members; dues receipts only for the payer and finance officers.
- Let finance officers view receipts inline and download them from the dues approval screen.

## 3. Non-goals

- R2 backup and restore. The existing Supabase backup scripts become legacy; R2 backup is a documented follow-up.
- Paystack/online card integration. The option remains visible but unavailable.
- OCR or automatic field extraction from screenshots.
- Changing dues rates, approval governance, event budgets, or report calculations.
- Rewriting historical free-text that already contains "(Ref: ...)" (there is no production receipt data).

## 4. Current behavior (evidence)

- Event Record Transaction requires a reference, but it is not a column; it is folded into `source_note`/`description` in `event-dashboard-view.tsx:300,316`.
- The event ledger displays a synthetic reference derived from the transaction UUID (`dashboard/page.tsx:616`).
- Dues store `payment_reference` with a not-null/check constraint and display it in member history, officer approvals, and notification emails.
- Club finance forms have no payment-method field.
- Event expenses are forced to store `payment_method = null` by a DB check.
- `correct_event_financial_transaction` and `edit_event_ticket_sale` accept and update a payment method; the event write guard does not reject a method change on correction. `correct_club_financial_transaction` has no method parameter.
- Event corrections accept `pending`, `unpaid`, `deposit`, and `paid` statuses, so a bank-transfer commitment can become paid after entry.
- Direct officer dues entry (`DuesPaymentForm` → `record_dues_payment`) records a payment without a payment method and never touches `dues_payment_requests`. `dues_payments` has no link to a request.
- A Supabase Storage receipt subsystem exists for club and event transactions (pending → available, SHA-256, 4 MiB), but it is post-hoc and the event routes have no UI.
- There is no Cloudflare R2 client, config, or credential.

## 5. Decisions

| Decision | Choice |
|---|---|
| Trigger for receipt | `payment_method = 'bank_transfer' AND payment_status = 'paid'` |
| Receipt timing | `pending`, `unpaid`, and `deposit` bank transfers need no receipt; one is required when the row becomes `paid` |
| Reference numbers | Removed entirely |
| Stored payment methods | `bank_transfer`, `cash` only |
| Payment method on corrections | Immutable; a correction or edit cannot change it. Void/reverse and re-enter instead |
| Dues channels | Bank Transfer, Card (visible but unavailable), Secretariat POS (stored as `cash`) |
| Direct officer dues entry | Same channel and receipt rules as member dues requests |
| Event/ticket/club channels | Bank Transfer, Cash |
| Receipt formats | PDF, JPEG, PNG; maximum 4 MiB |
| Upload transport | Server-proxied through a Next.js server action |
| Upload ordering | Upload to R2 first, then one DB RPC inserts transaction + receipt |
| Failure behavior | Reject the whole entry; no transaction row |
| Existing receipt data | None; retire the Supabase tables/bucket outright |
| Extra receipts | One required when a bank transfer is paid; additional receipts allowed later for club/event/ticket records |
| Access | Club/event/ticket: active members. Dues: payer + Executive/Admin/Backup Admin |
| Receipt viewer | Images inline; PDFs rendered with PDF.js on a canvas (no iframe or `<object>`) |
| Backup | Out of scope; existing backup tooling marked legacy |

## 6. Architecture

### 6.1 Configuration

Environment variables (server-only, never `NEXT_PUBLIC_`):

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT` (optional override; derived as `https://<account>.r2.cloudflarestorage.com`)

The bucket is private. No public domain, no CORS, no presigned URLs.

When configuration is missing:

- Paid bank-transfer submission is blocked with "Receipt storage is not configured".
- Cash and pending/unpaid/deposit bank transfers continue to work.
- Download requests return 503.

### 6.2 Dependencies

- Add `@aws-sdk/client-s3`, pinned in `package.json`. Server-only use.
- Add `pdfjs-dist`, pinned in `package.json`. Client-only use in the receipt viewer; import the worker through the bundler so it is served same-origin.
- Keep `@supabase/supabase-js`.
- Raise Next.js server-action body limit to `5mb`:

```ts
experimental: {
  serverActions: { bodySizeLimit: "5mb" },
}
```

The 5 MiB ceiling allows a 4 MiB file plus multipart overhead.

### 6.3 Modules

- `src/lib/supabase/admin.ts` — service-role client currently exposed through `createReceiptStorageClient`; used by email/notifications. Move it here and update imports.
- `src/lib/r2/client.ts` — S3 client factory plus `isReceiptStorageConfigured()`.
- `src/lib/receipt-storage.ts` — key construction, `putObject`, `getObject`, `deleteObject`, `headObject`, SHA-256 helpers, timeout/retry settings.
- `src/lib/receipt-entry.ts` — shared entry orchestrator with injectable storage and RPC callbacks for tests.
- `src/lib/finance-receipt-validation.ts` — retained pure magic-byte validator.
- `src/components/finances/receipt-viewer.tsx` — modal viewer: images via object URL, PDFs via PDF.js canvas.
- `src/app/api/receipts/[receiptId]/route.ts` — authenticated download proxy.
- `src/app/api/receipts/route.ts` — authenticated multipart upload for post-hoc extra receipts.
- `scripts/receipt-orphan-sweep.mjs` — lists R2 prefixes and deletes objects with no `finance_receipts` row after a grace period.
- Delete `src/lib/finance-receipts.ts`, `src/app/api/finance-receipts/**`, and `src/app/api/event-finance-receipts/**`.

### 6.4 Entry write flow

```
Server action receives FormData (transaction fields + optional file)
  -> authenticate and authorize the flow
  -> require a file when payment_method = 'bank_transfer' AND the row is paid
  -> forbid a file for cash and for bank transfers entered as pending/unpaid/deposit
  -> validate extension, MIME, magic bytes, and size
  -> compute SHA-256
  -> preflight: look up (actor, idempotency_key); if it exists, skip the upload
  -> generate transactionId and receiptId (UUID v4)
  -> PutObject receipts/<scope>/<targetId>/<receiptId>.<ext>
  -> RPC insert transaction + receipt in one DB transaction, returning
     (transaction_id, deduplicated)
       - deduplicated or returned id != generated id: DeleteObject, then show the
         existing success notice
       - on success: revalidate paths, redirect with success notice
       - on failure: DeleteObject, redirect with failure notice, preserve input
```

- `scope` is `club`, `event`, `event_ticket`, or `dues`.
- The path ID is the transaction ID for `club`/`event`, the sale ID for `event_ticket`, the request ID for a member dues request, and the payment ID for direct officer dues entry.
- Object metadata: `ContentType` from the validator; `CacheControl: "private, no-store"`.
- The RPC receives pre-generated IDs so the object key and DB row agree.
- If the RPC fails, the uploaded object is deleted. If deletion also fails, the error is logged and the orphan cleanup script reconciles later.
- Idempotency: club, event, and ticket-sale records keep their existing unique `(actor, idempotency_key)` constraints. **A same-value replay returns the existing row without raising an error**, so the orchestrator must use the RPC's `deduplicated` flag (and the returned ID) rather than waiting for `23505`. A different-value replay still raises `23505` and is treated as a failure.
- The cleanup sweep needs `ListBucket` permission (or an upload ledger) because object read/write alone cannot list a prefix.

### 6.5 Extra-receipt flow

`POST /api/receipts` accepts `scope`, `transactionId`, and one file for an existing non-voided club/event/event-ticket record.

```
authenticate -> authorize uploader -> validate file -> upload to R2
  -> RPC attach_finance_receipt inserts the metadata row
  -> on RPC failure: DeleteObject
  -> 303 redirect back with a notice
```

Dues requests accept exactly one receipt at submission and do not support post-hoc attachments.

Attachments are additive; there is no delete path. They also repair legacy paid bank-transfer rows that predate this rule. The invariant applies to new writes and to status transitions after the migration, not to grandfathered rows.

### 6.6 Read flow and viewer

```
GET /api/receipts/[receiptId]
  -> authenticate; require active membership
  -> security-definer lookup returns metadata only when access is allowed
  -> GetObject
  -> verify byte length and SHA-256
  -> respond as attachment with no-store, nosniff, CSP sandbox, CORP same-origin,
     X-Robots-Tag noindex, and a sanitized filename
```

- Unknown or unauthorized IDs return 404. Digest/size mismatch returns 502. Storage failure returns 503.
- The viewer fetches the same route with `fetch`. Images are rendered in `<img>` from an object URL and PDFs are rendered with PDF.js into a `<canvas>`. No iframe or `<object>` is used.
- This is required because the app sets `frame-src 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, and `X-Frame-Options: DENY` on every response. A blob iframe is blocked before it loads.
- The PDF.js worker is bundled and served same-origin; `worker-src 'self' blob:` already permits it. No global CSP or frame-header change is needed.
- Object URLs are revoked when the viewer closes or the selection changes.
- Download remains a normal attachment link.

## 7. Data model

### 7.1 Payment methods

- Allowed values for new writes everywhere: `bank_transfer`, `cash`.
- Historical rows may hold retired values (`mobile_money`, `card`, `cheque`, `paystack`, `pos`, `other`). The tightened checks are installed `NOT VALID` so the migration does not fail on them; those rows display the recorded value and are not rewritten.
- Receipt invariant: a new row, or a row transitioned into `paid`, with `payment_method = 'bank_transfer'` must have at least one `finance_receipts` row. Bank transfers in `pending`, `unpaid`, or `deposit` need none. When a correction moves a bank transfer into `paid`, the correction must provide a receipt through the upload-first path if the row has none.
- Legacy exception: event transactions recorded before the migration may already be `bank_transfer` and paid with no receipt. They are grandfathered, display "Receipt not recorded (legacy)", and can be repaired through the extra-receipt flow.
- `event_financial_transactions`: add nullable `payment_method`; drop the check that forces expenses to `null`; new RPC calls require a value for both income and expenses. Legacy rows may be `null` and display "Not recorded".
- `club_financial_transactions`: add nullable `payment_method` and its column-level `select` grant; new RPC calls require a value. Legacy rows may be `null`.
- `event_ticket_sales`: tighten the allowed values to the two methods. Ticket sales are always paid.
- `dues_payment_requests`: tighten allowed values to the two methods and drop `payment_reference` and its constraint. Existing local reference data is discarded; there is no production data.
- `dues_payments`: add `payment_method` (`bank_transfer` / `cash`) and a nullable `request_id` FK to `dues_payment_requests`. Direct officer entries have `request_id = null`; `approve_dues_payment_request` sets it to the approved request.
- Payment method is immutable after entry. `correct_event_financial_transaction`, `edit_event_ticket_sale`, and `correct_club_financial_transaction` stop accepting a method parameter, and the event write guard rejects a method change. A wrong method must be voided/reversed and re-entered (with a receipt when it is a paid bank transfer).
- Historical text already containing "(Ref: ...)" is not rewritten.

### 7.2 Unified `finance_receipts` table

| Column | Definition |
|---|---|
| `id` | uuid primary key, app-generated |
| `scope` | text, one of `club`, `event`, `event_ticket`, `dues` |
| `club_transaction_id` | uuid FK to `club_financial_transactions`, nullable |
| `event_transaction_id` | uuid FK to `event_financial_transactions`, nullable |
| `event_ticket_sale_id` | uuid FK to `event_ticket_sales`, nullable |
| `dues_request_id` | uuid FK to `dues_payment_requests`, nullable |
| `dues_payment_id` | uuid FK to `dues_payments`, nullable |
| `object_key` | text unique, not null |
| `original_filename` | text, trimmed, 5–120 chars, no control chars or path separators |
| `content_type` | text, one of `application/pdf`, `image/jpeg`, `image/png` |
| `size_bytes` | integer, 1–4,194,304 |
| `sha256` | text, 64 lowercase hex chars |
| `uploaded_by` | uuid FK to `member_profiles` |
| `created_at` | timestamptz default `clock_timestamp()` |

Constraints:

- Exactly one target FK is set, and it matches `scope`. For `scope = 'dues'`, exactly one of `dues_request_id` or `dues_payment_id` is set.
- `object_key = 'receipts/' || scope || '/' || <target id> || '/' || id || '.' || extension`, where `target id` is the request ID for a member dues request and the payment ID for direct officer dues entry. The extension is derived from `content_type` (`application/pdf` → `pdf`, `image/jpeg` → `jpg`, `image/png` → `png`), never from the uploaded filename.
- Filename, content type, size, and hash checks mirror the retired tables.
- Unique index on `(scope, coalesce(club_transaction_id, event_transaction_id, event_ticket_sale_id, dues_request_id, dues_payment_id), sha256)` to prevent duplicate evidence.
- No status/pending column. Rows exist only after the object is stored.
- No delete/update grants. Removing evidence would require a deliberate administrative operation that is out of scope.

Access:

- RLS enabled and forced.
- Column-level `select` granted to `authenticated`.
- No direct insert, update, or delete grants.
- A security-definer helper returns true when:
  - the caller is an active member and `scope` is `club`, `event`, or `event_ticket`, or
  - `scope = 'dues'` and the caller is the request's `member_id` (request-linked receipt) or the payment's `member_id` (payment-linked receipt), or holds Executive/Admin/Backup Admin.
- The select policy and the download lookup both use the helper.

Linking a member request to its payment:

- `approve_dues_payment_request` inserts the `dues_payments` row with `request_id = p_request_id`.
- The receipt stays linked to the request; the payment reaches it through `dues_payments.request_id`.
- Direct officer entries link their receipt to `dues_payment_id` and leave `request_id` null.
- A dues payment therefore resolves exactly one receipt on either path, and the exactly-one-target constraint is never violated by relinking.
- A rejected request keeps its receipt row for audit; the object is not orphaned and is not deleted by the sweep.

### 7.3 RPC contracts

All replaced functions are dropped first to avoid Postgres overload ambiguity, then recreated with these contracts.

Receipt metadata is passed as this parameter block:

```
p_receipt_id uuid
p_receipt_object_key text
p_receipt_filename text
p_receipt_content_type text
p_receipt_size_bytes integer
p_receipt_sha256 text
```

Every entry RPC enforces: all six values present when `payment_method = 'bank_transfer'` and the row is paid at entry; all six null for cash and for bank transfers entered as `pending`, `unpaid`, or `deposit`.

The club, event, and ticket entry RPCs return `(transaction_id uuid, deduplicated boolean)`. A new insert returns `(new_id, false)`. A same-value replay returns `(existing_id, true)`. A different-value replay raises `23505`. Dues paths have no idempotency key; their existing overlap/disposition checks reject a duplicate before a second row is written.

`record_club_financial_transaction`

- Existing fields plus `p_payment_method`, `p_transaction_id`, and receipt metadata.
- Insert the transaction with `id = coalesce(p_transaction_id, gen_random_uuid())`.
- Bank transfer: all receipt parameters required; insert the receipt row with `scope = 'club'`.
- Cash: receipt parameters must all be null.
- Preserve category/audit behavior.

`record_event_financial_transaction`

- Existing fields plus `p_transaction_id` and receipt metadata.
- `p_payment_method` is required for both income and expenses.
- `bank_transfer` + `paid`: all receipt parameters required; insert a receipt with `scope = 'event'`.
- `bank_transfer` + `pending`/`unpaid`/`deposit`: all receipt parameters must be null.
- Cash: all receipt parameters must be null.
- Preserve budget-allocation and audit behavior.

`record_event_ticket_sale`

- Existing fields plus `p_sale_id` and receipt metadata.
- Ticket sales are always paid, so `bank_transfer` requires all receipt parameters; insert a receipt with `scope = 'event_ticket'`.
- Cash forbids receipt parameters.
- Preserve tier capacity and ledger behavior.

`submit_dues_payment_request`

- Remove `p_payment_reference`.
- Add `p_request_id` and receipt metadata.
- Bank transfer requires receipt metadata and inserts `scope = 'dues'` linked to `dues_request_id`.
- Cash forbids receipt metadata.
- Preserve rate, month, pending-overlap, audit, and notification behavior.

`record_dues_payment` (direct officer entry)

- Add `p_payment_method` and receipt metadata to the existing signature.
- Bank transfer requires receipt metadata and inserts `scope = 'dues'` linked to `dues_payment_id`; cash forbids receipt metadata.
- Bank Transfer and Secretariat POS (`cash`) follow the member channel rules; Card remains unavailable.
- Preserve amount, month, rate, disposition, audit, and notification behavior.
- `approve_dues_payment_request` sets `dues_payments.request_id`; it does not move or duplicate the request's receipt.

`correct_event_financial_transaction`

- Drop `p_payment_method`; the stored method is immutable.
- Add receipt metadata for the status transition only.
- If the stored method is `bank_transfer` and the correction **moves the row into `paid`** while it has no receipt, all six receipt parameters are required and a receipt is inserted with `scope = 'event'`.
- If the row already has a receipt, or the correction does not move it into `paid`, receipt parameters must be null.
- Moving away from `paid` keeps the existing receipt.
- A legacy paid bank transfer with no receipt may still be edited without attaching one; it keeps the legacy label. The transition rule applies only when entering `paid`, not to edits of an already-paid legacy row.

`edit_event_ticket_sale`

- Drop `p_payment_method`; the stored method is immutable.
- No receipt parameters; a bank-transfer sale already has its receipt from creation.

`correct_club_financial_transaction`

- No method parameter and no receipt parameters; the stored method is immutable.

`attach_finance_receipt`

- New function for extra receipts on existing club/event/event-ticket records.
- Reject voided/refunded transactions and locked/completed/cancelled events.
- Authorize club uploads to finance officers; event uploads to club officers, event lead, or event assistant.
- Allows repairing a grandfathered paid bank-transfer row that has no receipt.
- Does not change the payment method or status.
- Validate the key pattern and insert one row; write an audit entry.
- A ticket-sale receipt audit entry must resolve its event through `event_ticket_sales`, so `append_event_finance_audit` gains that branch.

`get_finance_receipt_download`

- Returns metadata only when the access helper allows the caller.
- Used by the download route.

All functions are security-definer with `search_path = ''`, validate every parameter, and are granted only to `authenticated` where appropriate.

### 7.4 Migration and retirement

A single new migration:

1. Drop the old receipt Storage policies (`club_finance_receipts_deny_direct_select`, `club_finance_receipts_deny_direct_select_anon`, `club_finance_receipts_deny_direct_insert`, `club_finance_receipts_deny_direct_update`, `club_finance_receipts_deny_direct_delete`, `club_finance_receipts_backup_admin_read`), then `private.can_read_finance_receipt_storage_object`, then the `club-finance-receipts` bucket after verifying it is empty. Abort if the bucket contains objects.
2. Drop `club_financial_receipts`, `event_financial_receipts`, their indexes/policies/grants, and all `reserve_*` / `finalize_*` / `fail_*` receipt functions.
3. Add/tighten payment data:
   - `club_financial_transactions`: add nullable `payment_method`, add its column-level `select` grant, and add a two-value check as `NOT VALID`.
   - `event_financial_transactions`: drop the expense-method-null check; add a two-value check as `NOT VALID`.
   - `event_ticket_sales`: replace the six-value check with a two-value `NOT VALID` check.
   - `dues_payment_requests`: drop `payment_reference` and its check; replace the method check with a two-value `NOT VALID` check.
   - `dues_payments`: add nullable `payment_method` and `request_id`; add a two-value `NOT VALID` check.
4. Drop and recreate `correct_event_financial_transaction`, `edit_event_ticket_sale`, and `correct_club_financial_transaction` without method parameters. Update the event-transaction and ticket-sale write guards to reject a `payment_method` change outside the insert path.
5. Create `finance_receipts`, indexes, RLS, the access helper, and the RPCs described above.
6. Update `approve_dues_payment_request` to set `dues_payments.request_id`, and add the ticket-sale branch to `private.append_event_finance_audit`.
7. Grant only the required column selects and function executions.
8. In the same release, update the report route and finances page to read `finance_receipts` with `scope = 'club'` and `created_at`.

No receipt backfill is required. Legacy rows keep their existing method/status and render "Receipt not recorded (legacy)" where a paid bank transfer has no receipt. Rows with a null method render "Not recorded".

## 8. UI changes

### 8.1 Event Record Transaction

- Payment Channel: Bank Transfer, Cash.
- Bank Transfer reveals a required receipt picker only when the payment status is `paid`. `pending`, `unpaid`, and `deposit` reveal no file input.
- Cash reveals nothing.
- Remove the reference input, auto-generated reference strings, and mock receipt filename/size.
- Ticket-sale branch includes the file when bank transfer (ticket sales are always paid).
- Expense submissions now persist the selected method.
- Corrections cannot change the payment method. When a correction changes the status to `paid` on a bank transfer with no receipt, the correction modal requires a receipt and submits it through the upload-first action.
- The modal holds the selected `File` in React state, threads it through `RecordedTransactionSubmission`, and sets it on the action's `FormData`. The idempotency key is generated once per open modal and rotated only after a success notice.

### 8.2 Club finance forms

- Add Payment Channel (Bank Transfer, Cash) to income and expense forms.
- Bank Transfer requires the file; club transactions have no pending status, so every row is paid.
- The existing Receipt modal remains for viewing and extra attachments.
- Club corrections do not expose a payment-method control; the stored method is preserved.

### 8.3 Dues Pay modal

- Keep three channel buttons: Bank Transfer, Card, Secretariat POS.
- Stored values: Bank Transfer → `bank_transfer`; Secretariat POS → `cash`; Card → nothing (no submission).
- Card click shows "Online payment is not available yet" and blocks submission.
- Bank Transfer shows bank details and a required receipt picker; submit stores `bank_transfer`.
- Secretariat POS stores `cash`; no file.
- Remove the reference input and its validation.
- Direct officer entry in `DuesPaymentForm` follows the same channel and receipt rules: Bank Transfer requires a receipt, Secretariat POS stores `cash` without one, and Card is unavailable. `record_dues_payment` receives the method and receipt metadata.

### 8.4 Officer dues approvals

- Replace the reference field with payment method and receipt actions.
- Bank transfer rows show View and Download. View opens the receipt viewer (images inline, PDFs via PDF.js); Download fetches the attachment.
- Cash rows show "Cash — no receipt required".
- Legacy bank-transfer rows without a receipt show "Receipt not recorded (legacy)" and allow an officer to attach one.

### 8.5 Ledgers, detail views, search, exports

- Remove `paymentRef` from dashboard types, mock data, ledger tables, transaction detail, void modal, audit search, and CSV export.
- Add payment method and receipt presence:
  - bank transfer with receipt: "Receipt" view/download link
  - bank transfer marked pending/unpaid/deposit: method shown, no receipt expected
  - cash: "Cash"
  - legacy null method: "Not recorded"
  - legacy retired method: show the recorded value
  - legacy paid bank transfer without a receipt: "Receipt not recorded (legacy)"
- Replace the Reference column in the event CSV with Payment Method, and include Payment Method in club exports.
- Correction and edit forms remove the payment-method control; method changes require void/reversal and re-entry.
- Rename `FinanceReceipt.uploaded_at` to `created_at` in the type, queries, and display.
- Point every receipt link and upload form at `/api/receipts` and `/api/receipts/[receiptId]`; remove `/api/finance-receipts` references.

### 8.6 Emails and notifications

- Remove `paymentReference` from dues notification parameters and templates.
- Include payment method.
- For paid bank transfers, state that receipt evidence is attached; do not attach the file.
- For pending/unpaid/deposit bank transfers, do not claim receipt evidence.

### 8.7 Receipt viewer

- One modal component is reused by club finances, event ledgers, and dues approvals.
- Images render in `<img>` from a revoked-on-close object URL.
- PDFs load with PDF.js, render page-by-page into a `<canvas>`, and support page navigation and zoom.
- No iframe, `<object>`, or `<embed>`; the app-wide frame policies stay unchanged.
- The download action uses the receipt route's attachment response.

## 9. Error handling

| Situation | Behavior |
|---|---|
| R2 not configured | Block paid bank transfer with "Receipt storage is not configured"; cash and pending/unpaid/deposit bank transfers still submit |
| Missing file for a paid bank transfer | Inline field error; no request |
| File supplied for cash or pending/unpaid/deposit bank transfer | Reject before upload |
| Wrong extension/MIME/magic bytes or >4 MiB | Inline error; no upload |
| R2 upload failure | Reject entry; preserve form values; no DB row |
| RPC failure after upload | Delete object; reject entry; no DB row |
| Cleanup delete failure | Log; orphan cleanup script reconciles |
| Duplicate idempotency key, same values | RPC returns `deduplicated = true`; delete the new object; show existing success notice |
| Duplicate idempotency key, different values | `23505`; delete the new object; reject |
| Correction attempts to change the method | Reject; method is immutable |
| Correction moves a bank transfer to `paid` without a receipt | Reject unless receipt metadata is supplied |
| Legacy paid bank transfer without a receipt | Allow; show legacy label and offer extra-receipt attachment |
| PDF.js render failure | Show inline error and the Download action |
| Unauthorized/unknown download | 404 |
| Digest or size mismatch | 502 |
| R2 outage/timeout | 503; bounded retries so the form fails fast |
| Card channel clicked | Inline unavailable notice; submit blocked |

## 10. Testing

Test-first, per project convention.

Unit tests:

- File validation (valid/invalid signatures, MIME mismatch, size boundaries).
- Key construction per scope, including `.jpeg` → `image/jpeg` → `jpg`.
- Receipt rule: required for paid bank transfer; forbidden for cash and pending/unpaid/deposit bank transfers.
- Orchestrator: success, upload failure, RPC failure cleanup, same-value replay (`deduplicated`), different-value replay, missing config.
- Correction orchestration: status change to `paid` uploads a receipt; a method change is rejected before upload.
- Format/export functions no longer emit a Reference column.
- Notification payloads contain method, not reference, and only claim evidence for paid bank transfers.

SQL tests (local Supabase):

- New writes accept only `bank_transfer` and `cash`; `NOT VALID` checks preserve historical rows.
- Paid bank transfer without receipt parameters is rejected.
- Pending/unpaid/deposit bank transfer with receipt parameters is rejected.
- Cash with receipt parameters is rejected.
- Same-value idempotent replay returns the existing ID with `deduplicated = true` and writes no second row.
- Correction rejects a payment-method change.
- Correction from pending bank transfer to paid without a receipt is rejected; with a receipt it attaches one.
- Direct officer dues entry requires a receipt for bank transfer and none for cash.
- Approving a dues request sets `dues_payments.request_id`; the receipt remains reachable through the request.
- Receipt row and transaction roll back together on failure.
- Object-key, filename, size, and hash checks.
- Duplicate evidence index.
- Dues receipt visibility: payer and officers only, for both request-linked and payment-linked receipts.
- Club/event/ticket receipt visibility: active members.
- Post-hoc attachment authorization, legacy repair, and locked/voided rejection.
- `club_financial_transactions.payment_method` is selectable through PostgREST after the grant.

Update or remove existing tests that reference retired tables, including `supabase/tests/database/club_finance_receipts_test.sql` and receipt assertions in the event ledger tests.

Browser verification:

- Production build served on `127.0.0.1:3001` per project convention.
- Each flow: paid bank transfer success, paid bank transfer missing/invalid file, cash success.
- Pending/unpaid/deposit bank transfer saves without a file.
- Correction changes a pending bank transfer to paid and requires a receipt.
- Correction cannot change the payment method.
- Direct officer dues entry: bank transfer with receipt and POS cash without one.
- Card unavailable state.
- Missing-R2 configuration state.
- Dues officer View (image and PDF) and Download.
- PDF.js canvas renders, navigates pages, and falls back to Download on error.
- Unauthorized download from another member.
- If R2 credentials are unavailable locally, state explicitly that upload success paths were not browser-verified.

Static checks: `npm run lint`, `npm test`, `next build`.

## 11. Rollout

1. Create the private R2 bucket and a bucket-scoped token with Object Read & Write **and ListBucket** (needed by the orphan sweep).
2. Add the five env vars to `.env.example`, `.env.vercel`, local `.env.local`, and Vercel.
3. Install `@aws-sdk/client-s3` and `pdfjs-dist`.
4. Apply the migration locally and run SQL tests.
5. Run the orphan sweep in dry-run mode against an empty bucket to verify list/delete wiring.
6. Deploy code and migration together.
7. Smoke-test one paid bank-transfer, one pending bank-transfer, one correction-to-paid, and one cash entry per flow.
8. Verify officer receipt view (image and PDF), download, direct dues entry, and member-scoped access.
9. Mark `scripts/storage-backup.mjs`, `scripts/backup-supabase.ps1`, and their tests as legacy in documentation; do not rewire them.

## 12. Acceptance criteria

- No reference-number input exists in any financial flow.
- No reference is stored, exported, searched, or emailed for new transactions.
- Every new or transitioned **paid** bank-transfer transaction across all five flows has at least one stored receipt and a DB row created atomically with the transaction; additional receipts remain possible later where allowed.
- `pending`, `unpaid`, and `deposit` bank transfers store no receipt; the receipt is required when they become paid.
- Correction and edit RPCs cannot change the payment method.
- Direct officer dues entry follows the same method and receipt rules as member requests.
- Cash transactions store no receipt and still succeed.
- A failed upload or RPC leaves no transaction row and no object (or a logged orphan for cleanup).
- A same-value idempotent replay leaves no second object and no second row.
- Dues receipts are visible only to the payer and finance officers; club/event receipts remain member-visible.
- Officers can view and download dues receipts; PDFs render in the modal through PDF.js.
- Legacy rows are clearly labelled and repairable through the extra-receipt flow.
- Card shows as unavailable for dues.
- Missing R2 config blocks paid bank transfers only; pending/unpaid/deposit commitments and cash still work.
- Lint, tests, build, and browser verification pass.

## 13. Risks and follow-ups

- R2 outage blocks paid bank-transfer entry; this is accepted and surfaced clearly.
- Idempotent replay is the highest-risk orphan path: the RPC must return `deduplicated`, and the orchestrator must delete the new object. The cleanup sweep is the backstop, not the primary mechanism.
- Rare orphan objects after a crash are handled by a cleanup script that needs ListBucket.
- PDF.js adds client bundle weight and a worker; load it only when the viewer opens a PDF.
- The two-value checks are `NOT VALID` so historical rows with retired methods do not break the migration; new writes are still constrained.
- R2 backup/restore is deferred; receipts are unbacked up until that follow-up ships.
- The migration drops local dues reference data. Production has none.
- `bodySizeLimit` applies to all server actions, not just uploads; 5 MiB is acceptable.
- Adding parameters to Postgres functions requires dropping the old signatures to avoid overload ambiguity.
- When online dues payments ship, add the online method to the allowed enum and replace the unavailable Card state; the paid-only receipt rule must be revisited at that point.
