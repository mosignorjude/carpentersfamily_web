# Cloudflare R2 Receipt Uploads — Design

Date: 2026-10-25
Status: Approved for implementation planning
Scope: All financial entry flows in the club app

## 1. Summary

Replace typed payment reference numbers with required receipt screenshots (PDF/JPEG/PNG) stored in a private Cloudflare R2 bucket. Payment methods collapse to `bank_transfer` and `cash`. A bank transfer cannot be recorded unless its receipt is stored first. Cash entries require no receipt.

Receipts are stored in R2, metadata lives in one unified `finance_receipts` table, and every read goes through an authenticated Next.js proxy route that verifies access and the SHA-256 digest.

## 2. Goals

- Remove all reference-number inputs, storage, display, search, exports, and notification lines.
- Require exactly one receipt for every bank-transfer transaction at entry time, across:
  - member dues payments
  - event income
  - event expenses
  - event ticket sales
  - club-level income and expenses
- Store receipt bytes in R2 only; retire Supabase Storage receipt code, tables, and bucket.
- Guarantee no transaction row exists without its receipt when the method is bank transfer.
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
- A Supabase Storage receipt subsystem exists for club and event transactions (pending → available, SHA-256, 4 MiB), but it is post-hoc and the event routes have no UI.
- There is no Cloudflare R2 client, config, or credential.

## 5. Decisions

| Decision | Choice |
|---|---|
| Trigger for receipt | `payment_method = 'bank_transfer'` |
| Reference numbers | Removed entirely |
| Stored payment methods | `bank_transfer`, `cash` only |
| Dues channels | Bank Transfer, Card (visible but unavailable), Secretariat POS (stored as `cash`) |
| Event/ticket/club channels | Bank Transfer, Cash |
| Receipt formats | PDF, JPEG, PNG; maximum 4 MiB |
| Upload transport | Server-proxied through a Next.js server action |
| Upload ordering | Upload to R2 first, then one DB RPC inserts transaction + receipt |
| Failure behavior | Reject the whole entry; no transaction row |
| Existing receipt data | None; retire the Supabase tables/bucket outright |
| Extra receipts | One required at entry; additional receipts allowed later for club/event/ticket records |
| Access | Club/event/ticket: active members. Dues: payer + Executive/Admin/Backup Admin |
| Officer review | Inline viewer plus download link |
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

- Bank-transfer submission is blocked with "Receipt storage is not configured".
- Cash submission continues to work.
- Download requests return 503.

### 6.2 Dependencies

- Add `@aws-sdk/client-s3`, pinned in `package.json`. Server-only use.
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
- `src/app/api/receipts/[receiptId]/route.ts` — authenticated download proxy.
- `src/app/api/receipts/route.ts` — authenticated multipart upload for post-hoc extra receipts.
- Delete `src/lib/finance-receipts.ts`, `src/app/api/finance-receipts/**`, and `src/app/api/event-finance-receipts/**`.

### 6.4 Entry write flow

```
Server action receives FormData (transaction fields + optional file)
  -> authenticate and authorize the flow
  -> require file when payment_method = bank_transfer
  -> validate extension, MIME, magic bytes, and size
  -> compute SHA-256
  -> generate transactionId and receiptId (UUID v4)
  -> PutObject receipts/<scope>/<transactionId>/<receiptId>.<ext>
  -> RPC insert transaction + receipt in one DB transaction
       - on success: revalidate paths, redirect with success notice
       - on failure: DeleteObject, redirect with failure notice, preserve input
```

- `scope` is `club`, `event`, `event_ticket`, or `dues`.
- The path ID is the transaction ID for `club`/`event`, the sale ID for `event_ticket`, and the dues request ID for `dues`.
- Object metadata: `ContentType` from the validator; `CacheControl: "private, no-store"`.
- The RPC receives pre-generated IDs so the object key and DB row agree.
- If the RPC fails, the uploaded object is deleted. If deletion also fails, the error is logged and the orphan cleanup script reconciles later.
- Idempotency: club/event transactions keep their existing unique `(actor, idempotency_key)` constraint. On a duplicate-key error, the orchestrator deletes the newly uploaded object and shows the existing "already recorded" success notice.

### 6.5 Extra-receipt flow

`POST /api/receipts` accepts `scope`, `transactionId`, and one file for an existing non-voided club/event/event-ticket record.

```
authenticate -> authorize uploader -> validate file -> upload to R2
  -> RPC attach_finance_receipt inserts the metadata row
  -> on RPC failure: DeleteObject
  -> 303 redirect back with a notice
```

Dues requests accept exactly one receipt at submission and do not support post-hoc attachments.

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
- The viewer fetches the same route with `fetch`, builds an object URL, renders images in `<img>`, and renders PDFs in a sandboxed `<iframe>`. Object URLs are revoked on close. This avoids changing the app-wide `X-Frame-Options: DENY`.
- Download remains a normal attachment link.

## 7. Data model

### 7.1 Payment methods

- Allowed stored values everywhere: `bank_transfer`, `cash`.
- `event_financial_transactions`: add nullable `payment_method`; drop the check that forces expenses to `null`; new RPC calls require a value for both income and expenses. Legacy rows may be `null` and display "Not recorded".
- `club_financial_transactions`: add nullable `payment_method`; new RPC calls require a value. Legacy rows may be `null`.
- `event_ticket_sales`: tighten the allowed values to the two methods.
- `dues_payment_requests`: tighten allowed values to the two methods and drop `payment_reference` and its constraint. Existing local reference data is discarded; there is no production data.
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
| `object_key` | text unique, not null |
| `original_filename` | text, trimmed, 5–120 chars, no control chars or path separators |
| `content_type` | text, one of `application/pdf`, `image/jpeg`, `image/png` |
| `size_bytes` | integer, 1–4,194,304 |
| `sha256` | text, 64 lowercase hex chars |
| `uploaded_by` | uuid FK to `member_profiles` |
| `created_at` | timestamptz default `clock_timestamp()` |

Constraints:

- Exactly one transaction/request FK is set, and it matches `scope`.
- `object_key = 'receipts/' || scope || '/' || <linked id> || '/' || id || '.' || extension`, where extension is derived from `content_type`.
- Filename, content type, size, and hash checks mirror the retired tables.
- Unique index on `(scope, coalesce(club_transaction_id, event_transaction_id, event_ticket_sale_id, dues_request_id), sha256)` to prevent duplicate evidence.
- No status/pending column. Rows exist only after the object is stored.

Access:

- RLS enabled and forced.
- Column-level `select` granted to `authenticated`.
- No direct insert, update, or delete grants.
- A security-definer helper returns true when:
  - the caller is an active member and `scope` is `club`, `event`, or `event_ticket`, or
  - `scope = 'dues'` and the caller is the request's `member_id` or holds Executive/Admin/Backup Admin.
- The select policy and the download lookup both use the helper.

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

Every entry RPC enforces: all six values present for `bank_transfer`, all six null for `cash`.

`record_club_financial_transaction`

- Existing fields plus `p_payment_method`, `p_transaction_id`, and receipt metadata.
- Insert the transaction with `id = coalesce(p_transaction_id, gen_random_uuid())`.
- Bank transfer: all receipt parameters required; insert the receipt row with `scope = 'club'`.
- Cash: receipt parameters must all be null.
- Preserve category/audit behavior.

`record_event_financial_transaction`

- Existing fields plus `p_transaction_id` and receipt metadata.
- `p_payment_method` now required for both income and expenses.
- Bank transfer inserts a receipt with `scope = 'event'`; cash forbids receipt parameters.
- Preserve budget-allocation and audit behavior.

`record_event_ticket_sale`

- Existing fields plus `p_sale_id` and receipt metadata.
- Bank transfer inserts a receipt with `scope = 'event_ticket'`; cash forbids receipt parameters.
- Preserve tier capacity and ledger behavior.

`submit_dues_payment_request`

- Remove `p_payment_reference`.
- Add `p_request_id` and receipt metadata.
- Bank transfer requires receipt metadata and inserts `scope = 'dues'`.
- Cash forbids receipt metadata.
- Preserve rate, month, pending-overlap, audit, and notification behavior.

`attach_finance_receipt`

- New function for extra receipts on existing club/event/event-ticket records.
- Reject voided/refunded transactions and locked/completed/cancelled events.
- Authorize club uploads to finance officers; event uploads to club officers, event lead, or event assistant.
- Validate the key pattern and insert one row; write an audit entry.

`get_finance_receipt_download`

- Returns metadata only when the access helper allows the caller.
- Used by the download route.

All functions are security-definer with `search_path = ''`, validate every parameter, and are granted only to `authenticated` where appropriate.

### 7.4 Migration and retirement

A single new migration:

1. Drop the old receipt Storage policies and, after verifying it is empty, the `club-finance-receipts` bucket. Abort the migration if the bucket contains objects.
2. Drop `club_financial_receipts`, `event_financial_receipts`, and their reserve/finalize/fail functions.
3. Add/tighten the payment-method columns and constraints described above.
4. Create `finance_receipts`, indexes, RLS, helper functions, and RPCs.
5. Grant only the required column selects and function executions.

No data backfill is required. Legacy transaction rows keep a null method and render "Not recorded".

## 8. UI changes

### 8.1 Event Record Transaction

- Payment Channel: Bank Transfer, Cash.
- Bank Transfer reveals a required receipt picker. Cash reveals nothing.
- Remove the reference input, auto-generated reference strings, and mock receipt filename/size.
- Ticket-sale branch includes the file when bank transfer.
- Expense submissions now persist the selected method.

### 8.2 Club finance forms

- Add Payment Channel (Bank Transfer, Cash) to income and expense forms.
- Bank Transfer requires the file.
- The existing Receipt modal remains for viewing and extra attachments.

### 8.3 Dues Pay modal

- Keep three channel buttons: Bank Transfer, Card, Secretariat POS.
- Stored values: Bank Transfer → `bank_transfer`; Secretariat POS → `cash`; Card → nothing (no submission).
- Card click shows "Online payment is not available yet" and blocks submission.
- Bank Transfer shows bank details and a required receipt picker; submit stores `bank_transfer`.
- Secretariat POS stores `cash`; no file.
- Remove the reference input and its validation.

### 8.4 Officer dues approvals

- Replace the reference field with payment method and receipt actions.
- Bank transfer rows show View and Download. View opens the receipt viewer; Download fetches the attachment.
- Cash rows show "Cash — no receipt required".

### 8.5 Ledgers, detail views, search, exports

- Remove `paymentRef` from dashboard types, mock data, ledger tables, transaction detail, void modal, audit search, and CSV export.
- Add payment method and receipt presence:
  - bank transfer with receipt: "Receipt" view/download link
  - cash: "Cash"
  - legacy null: "Not recorded"
- Replace the Reference column in the event CSV with Payment Method, and include Payment Method in club exports.

### 8.6 Emails and notifications

- Remove `paymentReference` from dues notification parameters and templates.
- Include payment method.
- For bank transfers, state that receipt evidence is attached; do not attach the file.

## 9. Error handling

| Situation | Behavior |
|---|---|
| R2 not configured | Block bank transfer with "Receipt storage is not configured"; cash still submits |
| Missing file for bank transfer | Inline field error; no request |
| Wrong extension/MIME/magic bytes or >4 MiB | Inline error; no upload |
| R2 upload failure | Reject entry; preserve form values; no DB row |
| RPC failure after upload | Delete object; reject entry; no DB row |
| Cleanup delete failure | Log; orphan cleanup script reconciles |
| Duplicate idempotency key | Delete redundant upload; show existing success notice |
| Unauthorized/unknown download | 404 |
| Digest or size mismatch | 502 |
| R2 outage/timeout | 503; bounded retries so the form fails fast |
| Card channel clicked | Inline unavailable notice; submit blocked |

## 10. Testing

Test-first, per project convention.

Unit tests:

- File validation (valid/invalid signatures, MIME mismatch, size boundaries).
- Key construction per scope.
- Bank-transfer/cash rule.
- Orchestrator: success, upload failure, RPC failure cleanup, duplicate idempotency, missing config.
- Format/export functions no longer emit a Reference column.
- Notification payloads contain method, not reference.

SQL tests (local Supabase):

- Method constraints accept only `bank_transfer` and `cash`.
- Bank transfer without receipt parameters is rejected.
- Cash with receipt parameters is rejected.
- Receipt row and transaction roll back together on failure.
- Object-key, filename, size, and hash checks.
- Duplicate evidence index.
- Dues receipt visibility: payer and officers only.
- Club/event/ticket receipt visibility: active members.
- Post-hoc attachment authorization and locked/voided rejection.

Update or remove existing tests that reference retired tables, including `supabase/tests/database/club_finance_receipts_test.sql` and receipt assertions in the event ledger tests.

Browser verification:

- Production build served on `127.0.0.1:3001` per project convention.
- Each flow: bank transfer success, bank transfer missing/invalid file, cash success.
- Card unavailable state.
- Missing-R2 configuration state.
- Dues officer View and Download.
- Unauthorized download from another member.
- If R2 credentials are unavailable locally, state explicitly that upload success paths were not browser-verified.

Static checks: `npm run lint`, `npm test`, `next build`.

## 11. Rollout

1. Create the private R2 bucket and a bucket-scoped Object Read & Write API token.
2. Add the five env vars to `.env.example`, `.env.vercel`, local `.env.local`, and Vercel.
3. Apply the migration locally and run SQL tests.
4. Deploy code and migration together.
5. Smoke-test one bank-transfer and one cash entry per flow.
6. Verify officer receipt view/download and member-scoped access.
7. Mark `scripts/storage-backup.mjs`, `scripts/backup-supabase.ps1`, and their tests as legacy in documentation; do not rewire them.

## 12. Acceptance criteria

- No reference-number input exists in any financial flow.
- No reference is stored, exported, searched, or emailed for new transactions.
- Every bank-transfer transaction across all five flows has at least one stored receipt and a DB row created atomically with the transaction; additional receipts remain possible later where allowed.
- Cash transactions store no receipt and still succeed.
- A failed upload or RPC leaves no transaction row and no object (or a logged orphan for cleanup).
- Dues receipts are visible only to the payer and finance officers; club/event receipts remain member-visible.
- Officers can view and download dues receipts.
- Card shows as unavailable for dues.
- Missing R2 config blocks bank transfers only.
- Lint, tests, build, and browser verification pass.

## 13. Risks and follow-ups

- R2 outage blocks bank-transfer entry; this is accepted and surfaced clearly.
- Rare orphan objects after a crash are handled by a small cleanup script.
- R2 backup/restore is deferred; receipts are unbacked up until that follow-up ships.
- The migration drops local dues reference data. Production has none.
- `bodySizeLimit` applies to all server actions, not just uploads; 5 MiB is acceptable.
- Adding parameters to Postgres functions requires dropping the old signatures to avoid overload ambiguity.
- When online dues payments ship, add the online method to the allowed enum and replace the unavailable Card state; the two-method receipt rule must be revisited at that point.
