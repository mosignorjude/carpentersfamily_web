# Backup and restore

> **Current status — 2026-10-31:** Hosted snapshots, R2 receipt archives, and an
> isolated restore drill all pass. The six president/staff migrations were
> applied to production on 2026-10-31 after the drill. A nightly GitHub Actions
> backup is defined in
> [`database-backup.yml`](../.github/workflows/database-backup.yml); it needs the
> repository secrets listed below before its first run.

## What is backed up

| Item | Source | Restore target |
| --- | --- | --- |
| Roles (`01_roles.sql`) | Hosted cluster roles | Local/hosted Postgres |
| Application schema (`02_schema.sql`) | `pg_dump` schema, excludes managed `auth`/`storage` DDL | Local/hosted Postgres |
| Data (`03_data.sql`) | `pg_dump --data-only --use-copy`, includes Auth and Storage metadata rows | Local/hosted Postgres |
| Migration history (`04`/`05`) | `supabase_migrations` schema and rows | Local/hosted Postgres |
| Source snapshot | `git archive` of `supabase/`, `package.json`, `package-lock.json` at HEAD | Working tree |
| Receipt bytes | Cloudflare R2 bucket `carpenters-receipts`, `receipts/` prefix | R2 bucket |

The hosted project stores receipts in R2, not Supabase Storage. The snapshot
therefore records zero Storage buckets and objects, and the receipt archive is
restored to R2 rather than Storage.

Auth rows include password hashes and session metadata. Treat every database
archive as highly sensitive.

Snapshot facts at the last verified run: 13 Auth users, 13 member profiles,
9 receipts totalling 1,929,194 bytes, 56 applied migrations (62 after the
president/staff push), 36 public tables, all with RLS enabled and forced.

## Encryption and key custody

Both archives are encrypted with GnuPG symmetric AES-256 (SHA-512 S2K). The
passphrase is a 43-character base64url value stored outside the backup set:

```
%USERPROFILE%\Documents\CarpentersFamilyBackups-KEY\backup-key-20261031.txt
```

Move that file into a password manager, keep an offline copy, and never commit
it, print it, or paste it into chat or documents. Losing the key makes every
archive unrecoverable. The encrypted archives and their plaintext manifests are
kept in `Documents\CarpentersFamilyBackups` and mirrored to
`G:\My Drive\CarpentersFamilyBackups`; hash equality on the Drive mount does not
prove cloud sync finished.

## Taking a snapshot

```powershell
node scripts/backup-hosted-snapshot.mjs `
  --label pre-change `
  --local-dir "$env:USERPROFILE\Documents\CarpentersFamilyBackups" `
  --offsite-dir "G:\My Drive\CarpentersFamilyBackups" `
  --key-file "$env:USERPROFILE\Documents\CarpentersFamilyBackups-KEY\backup-key-20261031.txt"
```

The script refuses uncommitted migration/config changes, remote migrations that
are missing locally, missing R2 credentials, and any count change during the
dump. It verifies decryption, copies through `.partial` files, compares SHA-256
hashes, and writes the completion manifest last.

Add `--keep-staging` to keep the plaintext staging folder for the restore drill.
Delete that folder after the drill; the machine's C: volume is not encrypted.

In CI the same script reads `SUPABASE_DB_URL` (or uses
`supabase link --linked`) and `SUPABASE_PROJECT_REF` when no local link exists,
and R2 credentials come from `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`.

## Scheduled workflow

`.github/workflows/database-backup.yml` runs nightly at 02:17 UTC and on manual
dispatch with an optional `retention_days` input (default 90, minimum 7).

Required repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (`kgihmudjdvwrvteclodl`)
- `SUPABASE_DB_PASSWORD`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- `BACKUP_GPG_PASSPHRASE` (the same key file contents, at least 32 characters)

The job links the production project, creates and verifies an encrypted
snapshot, uploads the two archives plus manifest to
`r2://<bucket>/backups/production/`, verifies each uploaded size, and deletes
objects older than the retention window. The manifest uploads last, so a
snapshot without a manifest is incomplete. A failed run writes a failure note
to the job summary; GitHub's normal workflow-failure notifications apply.

## Restore drill

The verified drill restores the encrypted snapshot into a uniquely named,
isolated local Supabase project, then deletes it. It never writes to the
original local volume or to production.

1. Decrypt and unpack the database archive into a staging folder:

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-file "$KEY" \
     --decrypt CarpentersFamily-<stamp>.db.tar.gz.gpg > db.tar.gz
   mkdir -p /tmp/restore-staging
   tar -xzf db.tar.gz -C /tmp/restore-staging --force-local
   ```

2. The receipts archive supplies `receipts.manifest.json` for the metadata
   cross-check. The drill verifies each restored receipt row against the
   manifest hashes; it does not re-download R2 bytes.

3. Run the drill from the repository root:

   ```bash
   node scripts/restore-hosted-snapshot.mjs \
     --staging-dir /tmp/restore-staging \
     --test-commit b5f073f
   ```

   `b5f073f` is the last commit before the president/staff migrations and
   provides the matching pgTAP suite.

The drill:

- verifies every staging file against `manifest.summary.json`;
- rejects a staging tree that contains staff/president tests for the chosen
  pre-migration commit;
- stops the original local project with volumes preserved and restarts it at the
  end;
- disables migrations and seeds for the isolated project;
- loads roles as `supabase_admin`, resets postgres default privileges in
  `public`, creates the schema as `postgres`, then loads data and migration
  history;
- checks row counts (Auth users, profiles, receipts and bytes, migrations,
  tables, RLS enabled/forced, Storage), referential/receipt integrity, and
  receipt metadata against the R2 manifest;
- compares schema fingerprints with hosted: columns, functions and signatures,
  policies, triggers, constraints, indexes, and table/column/routine grants.

The pgTAP suite runs for information only. It assumes an empty database and
still checks function signatures removed by the receipts refactor, so it is red
on every populated database. The gate is fingerprint and data fidelity, not
pgTAP.

Last verified drill: 2026-10-31, all counts and the full fingerprint matched
hosted; pgTAP reported 102 tests across 16 files, failing for the pre-existing
drift described above.

## Restoring production

A production restore is a separate operator procedure and is not automated:

1. Create or reset the target hosted project and record its project ref.
2. Load `01_roles.sql`, then the schema and data dumps, then the migration
   history, recreating Auth users and password hashes from the data dump.
3. Re-upload the archived receipt bytes to the R2 bucket and confirm every
   `finance_receipts` row hash matches `receipts.manifest.json`.
4. Reapply Vault secrets, cron schedules, and Vercel environment values that are
   not part of the database dump.
5. Verify counts, RLS, the schema fingerprint, and the production health check
   before reopening access.

## Legacy scripts

`scripts/backup-supabase.ps1`, `scripts/storage-backup.mjs`, and
`scripts/restore-supabase-local.ps1` describe the earlier Supabase Storage
workflow. They are superseded by the snapshot scripts above and should not be
used for new backups or drills.
