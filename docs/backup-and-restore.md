# Backup and restore

> **Current status — 2026-10-07:** Full database/file backup and restore is deferred by the user. It is not a production blocker or major completion criterion for the current project. Preserve the local encrypted app-records CSV export option as a limited archival extract; it is not a restorable database backup and its current working-tree implementation has not been re-verified. The latest synthetic marker backup attempt failed password authentication, produced no archive, and performed no restore. Do not resume this workflow until requested.


## Step 15 status

Step 15 is **in progress and not complete**. The approved design backs up the database and receipt files into separate GnuPG-encrypted archives, then copies both to the local Documents folder and the connected Google Drive mount. C: encryption is off, so the runner streams the SQL and receipt bytes to GnuPG without staging plaintext archives.

All 22 migrations, including the Storage RLS policy, are applied to the linked hosted Supabase project and recorded in its migration history. Local pgTAP suites for club and event receipt access pass 107 assertions; the archive helper passes six Node tests. Hosted catalog checks confirm all 31 public base tables have RLS enabled and forced, the dues status view uses security_invoker, and the sole receipt bucket is private with the reviewed 4 MiB PDF/JPEG/PNG allowlist. The hosted project has zero Auth users and zero Storage objects, so no real hosted receipt download, completed backup, Google Drive sync, or full database-plus-Storage restore has been verified.

The post-migration hosted aggregate check found exactly one private `club-finance-receipts` bucket with the reviewed 4 MiB limit and PDF/JPEG/PNG allowlist, zero objects, and zero Auth users. The runner rejects unexpected buckets, orphaned or unavailable objects, mismatched receipt metadata, and changes during export. No actual hosted receipt bytes or authenticated member account are available to validate the file-download branch.

## Approved access model

Only an active Admin or Backup Admin may directly read available receipt objects through Storage. Ordinary members continue to access receipts through the existing authorized application download routes. Pending/failed receipts, inactive members, pending applicants, Executives, event roles, and ordinary members are denied direct Storage reads. Direct Storage writes remain denied to these application roles.

The RLS helper is in the non-exposed `private` schema, uses a fixed empty search path, checks current active membership and current role assignments, and only returns true for an available club or event receipt. The backup client signs in through Supabase Auth and downloads each object with that user session. It does not use a service-role key. Supabase documents Storage RLS as the control for object access and recommends using the Storage API rather than writing Storage metadata through SQL; the SQL fixtures in the pgTAP tests are temporary and roll back.

This adds no paid worker or backup service. Downloads use the project's existing Storage egress and quotas. The Google Drive mount must be signed into a club-controlled account, have enough quota, and finish syncing before a copy is treated as off-site.

## What the runner backs up

Run [`backup-supabase.ps1`](../scripts/backup-supabase.ps1) from the repository root in PowerShell. It requires the pinned Supabase CLI, Docker Desktop, Git for Windows GnuPG, a linked project reference, the Supavisor Session pooler, and the local/Drive destination folders.

Before export it checks the linked project suffix, CLI version, Docker engine, database size, Auth-user count, exact bucket configuration, and every Storage object against its available receipt row. It requires one private `club-finance-receipts` bucket with the reviewed PDF/JPEG/PNG allowlist and a 4 MiB limit. A missing or additional bucket stops the run.

The database archive streams role definitions, the application schema, data, and Supabase migration history through GnuPG. The pinned CLI 2.119.0 data-only dry run selects all schemas except platform-maintained schemas/tables, so it includes Auth and Storage metadata as well as application rows. Auth rows include password hashes and must be treated as highly sensitive. The schema-only dump excludes managed `auth` and `storage` schemas; the exact source commit and its migrations are therefore part of the recovery set for custom policies and functions. The runner refuses uncommitted migration/config changes and checks the database WAL position before and after its separate dump sections; any intervening database write fails the run closed. Hosted schema drift against those migrations has not yet been independently verified.

Storage bytes are backed up separately. The helper accepts only available receipt files whose bucket, path, MIME type, size, SHA-256 digest, and basic file signature match the database. It caps an archive at 10,000 objects and 1 GiB. Receipt bytes are buffered one file at a time in memory and streamed into GnuPG; receipt paths and hashes are inside the encrypted Storage manifest. Unknown or orphaned objects fail closed.

The database password is entered through a hidden prompt and supplied only in the environment of the Supabase link command, which validates the linked project and saves the password to the CLI's native credential storage. Database dumps use linked-project mode so the CLI retrieves the saved credential; dump processes receive neither the password in their environment nor in command-line arguments. The preflight's Docker psql process receives it as PGPASSWORD in that child process environment. If receipt objects exist, the runner also requests the project's publishable key and the email/password of an active Admin or Backup Admin; those values go to the Node helper through stdin. The encryption passphrase is entered through GnuPG's pinentry prompt. Never paste any of these credentials into chat.

The runner compares counts/configuration and receipt metadata before and after export, verifies each encrypted file, copies to `.partial` paths in both destinations, compares SHA-256 hashes, and only writes the completion manifest after both copies match. Hash equality on the Drive mount does not prove that cloud synchronization has finished. The manifest is not encrypted; it contains project/commit identifiers, counts, roles, tool versions, and archive hashes, but no receipt paths or file contents.

The runner does not prune old backups automatically. Keep the last verified weekly pair until its replacement passes checks; retain the approved month-end and major-change recovery points. Do not remove a verified archive after a failed run.

## Restore status and procedure

[`restore-supabase-local.ps1`](../scripts/restore-supabase-local.ps1) restores a complete matching database-plus-Storage pair into a uniquely named local Supabase project. It requires the exact confirmation `RESTORE TO LOCAL`, checks both encrypted archive hashes and the source migration/config/test revision, disables local migrations and seeds, and refuses any API URL other than loopback. SQL is streamed from GnuPG directly into local Postgres; Storage metadata policies omitted by Supabase-managed-schema dumps are replayed from the matching repository revision. Receipt bytes are restored through the local Storage API, not by editing Storage metadata with SQL. The local service key is passed to the helper through stdin and is not printed.

The restore drill compares Auth-user, migration, bucket, object and byte counts with the manifest; checks bucket configuration, forced RLS on every public table and all six receipt policies; runs the restored database pgTAP suite; then checks the counts and policies again. By default it stops the uniquely identified temporary Supabase project with `--no-backup` and removes its uniquely named working folder. `-KeepRestoreProject` intentionally retains a plaintext local database volume and should not be used on this PC because C: encryption is off. Cleanup is not secure erasure. A production restore is a separate operator procedure and is not implemented by this local-only wrapper.

The existing `restore-storage-local.ps1` remains available for a Storage-only recovery, but the full paired restore script is the normal drill. The earlier local database-only restore passed 529 assertions before the current backup policy and had no real receipt objects; it is historic evidence, not proof that this paired workflow works. The old hosted archive also lacks the new paired manifest and is intentionally not accepted. Create a fresh paired backup first. A successful local mount hash comparison still does not prove Google Drive cloud sync; verify the files are visible in Drive and sync is complete before treating that copy as off-site.

## Prior local drill evidence

A previous isolated PostgreSQL 17.11 restore drill matched structural digests/counts and passed all 11 database suites with 529 assertions. That drill predated the new Storage backup policy and did not contain real Storage files. The current focused club/event receipt tests pass 107 pgTAP assertions after the new policy; the six archive-helper unit tests pass. Those results do not establish a complete hosted restore.

## Classified findings

- **Medium residual risk, deferred — full recovery remains unverified.** Hosted database/receipt recovery and direct Storage API behavior are not proven. The user has accepted this as non-blocking for current scope; do not describe a full recovery path as verified.
- **Medium — hosted direct Storage behavior remains unverified.** **Affected component:** receipt object download and Storage RLS. **Impact:** policy behavior could differ from the local database or hosted object API. **Verification:** local pgTAP covers allowed and denied metadata reads; no hosted receipt file exists for an API download test. **Recommended fix:** after a controlled receipt is present, test actual Admin/Backup Admin downloads and denials for other roles. **Blocks:** none for current scope; full receipt recovery remains deferred and unverified.
- **Informational — Drive synchronization is not proven by local hashes.** **Affected component:** Google Drive mount. **Impact:** a local mounted copy may not yet exist in cloud storage. **Recommended fix:** wait for Drive's sync-complete state and confirm the file is visible through Drive.
- **Low — receipt type inspection is limited.** **Affected component:** Storage backup helper. **Impact:** a valid-looking PDF or image signature does not detect embedded malware. **Recommended fix:** keep downloads restricted and served as attachments; consider malware scanning if the file workflow or threat profile expands.

## Deferred follow-up when the user reopens Step 15

1. Run the pinned read-only psql image pull once if the backup runner reports it is not cached; then run the paired backup from the actual repository root. The source commit must be reachable from the current GitHub upstream; publishing a new commit is not needed if the current branch is already synchronized.
2. After an approved member and available receipt exist, verify hosted Storage API downloads for Admin/Backup Admin and denials for other roles. The current hosted project has no Auth users or Storage objects, so this role/file behavior cannot yet be proven.
3. Confirm Google Drive reports sync complete and the manifest plus both encrypted archives are visible there.
4. Run `restore-supabase-local.ps1` and require its full count, RLS, policy, and pgTAP checks to pass.
5. Demonstrate backup-operator access removal and credential rotation during role removal/deactivation.

Step 15 remains incomplete and deferred; these checks are not production gates under the user's current decision. The completed local work and prior synthetic restore do not establish a complete hosted recovery path.


Latest synthetic marker attempt (2026-10-07): the marker row was verified in the synthetic source; the next SimpleBackups run failed authentication, produced no archive, and was not restored. The production project was not used.