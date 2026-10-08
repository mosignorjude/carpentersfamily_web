# Security maintenance and incident response

This guide covers suspected account compromise, exposed credentials, unauthorized data access, and service-security incidents affecting the club app. Do not place passwords, tokens, receipt files, or unnecessary member data in incident notes.

## Routine maintenance

- Review the weekly dependency-audit workflow result and Dependabot pull requests. Updates are proposals: review their diff and CI results; do not enable automatic merging.
- Keep production secrets in the relevant provider’s secret manager. Never paste a secret into an issue, chat, log, or commit.
- Review Primary Admin and Backup Admin access when officers change. Preserve at least one active Primary Admin. Backup Admin role-specific boundaries have not been live-tested; do not assume that an untested account can perform emergency recovery.
- Review failures in authentication, database, Storage, Vercel, and GitHub Actions logs. Export only the minimum redacted evidence needed.

## Suspected incident procedure

1. **Record and triage.** Note the discovery time and timezone, affected component, relevant request/deployment identifiers, and observed symptoms. Do not copy credentials or unnecessary member records into the report. If active misuse is continuing, contain it promptly.
2. **Contain affected access.** For a suspected member-account takeover, use the admin lifecycle controls to deactivate the account and revoke its sessions through the supported Auth controls. For a suspected administrator takeover, use another trusted administrator only if that account is known to be available; preserve at least one active Primary Admin. If the only Primary Admin is affected, recover control through the identity provider before changing the last-primary-admin invariant.
3. **Contain exposed credentials at their source.** Identify which credential was exposed, rotate that credential using its provider, update the corresponding server-side secret, and redeploy or restart the affected service as required. Rotate only credentials plausibly affected, but treat Supabase secret/service-role keys, database passwords, OAuth secrets, GitHub tokens, and Vercel tokens as high impact if exposed. Keep all replacement values out of Git and incident notes.
4. **Preserve and review evidence.** Review relevant Supabase Auth, database, and Storage logs; Vercel deployment/runtime logs; GitHub Actions history; and application audit records. Preserve timestamps and identifiers. Avoid altering or deleting audit history.
5. **Assess data and integrity impact.** Identify affected member, financial, receipt, event, or notification records. Compare audit history and current state. Do not silently overwrite historical financial records; use the application’s authorized correction or reversal path.
6. **Restore service safely.** Patch or disable the affected path, verify account status and authorization boundaries, and run the security regression suite before restoring normal use. The currently approved CSV export is limited archival output and is not a full database or receipt restore. Full backup/restore remains deferred.
7. **Communicate and close.** Notify the Primary Admin and any affected members through a private club channel when the impact is understood. Record the timeline, containment, credential rotations, affected data categories, verification performed, and follow-up actions without including secrets or unnecessary personal data.

## Escalation

If containment could deactivate the last active Primary Admin, expose a service-role credential, compromise financial integrity, or requires a paid service, stop and get a deliberate owner decision before proceeding. Do not weaken RLS, role boundaries, or historical controls to restore convenience.
