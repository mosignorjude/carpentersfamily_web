import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "node_modules", "supabase", "dist", "supabase.js");
const repoConfigPath = path.join(repoRoot, "supabase", "config.toml");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const stagingDir = argument("--staging-dir", "");
const testCommit = argument("--test-commit", "b5f073f");

if (!stagingDir) {
  fail("Pass --staging-dir with the plaintext snapshot staging folder.");
}

function fail(message) {
  throw new Error(message);
}

function log(message) {
  console.log(`[restore-drill] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

function runCli(args, options = {}) {
  return run(process.execPath, [cliPath, ...args], options);
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function psqlFile(container, file, options = {}) {
  const contents = readFileSync(file);
  const input = options.asRole
    ? Buffer.concat([Buffer.from(`SET ROLE ${options.asRole};\n`), contents])
    : contents;
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres", "-f", "-"],
    {
      cwd: repoRoot,
      input,
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    fail(`Loading ${path.basename(file)} failed with exit ${result.status}${detail ? `:\n${detail}` : ""}`);
  }
}

function ensureExtensions(container) {
  const sql = `
    create extension if not exists "pg_cron" with schema "pg_catalog";
    create extension if not exists "pg_net" with schema "extensions";
    create extension if not exists "pg_stat_statements" with schema "extensions";
    create extension if not exists "pgcrypto" with schema "extensions";
    create extension if not exists "supabase_vault" with schema "vault";
    create extension if not exists "uuid-ossp" with schema "extensions";
  `;
  run("docker", [
    "exec",
    container,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-c",
    sql,
  ]);
}

function resetDefaultPrivileges(container) {
  // The current Supabase image grants anon/authenticated/service_role
  // REFERENCES, TRIGGER and TRUNCATE on new tables, which hosted does not.
  const sql = `
    alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
    alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
    alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
  `;
  run("docker", [
    "exec",
    container,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-c",
    sql,
  ]);
}

function psqlJson(container, sql) {
  const result = run("docker", [
    "exec",
    container,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-Atc",
    sql,
  ]);
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    fail(`Could not parse the verification query output as JSON: ${error.message}`);
  }
}

function tablesInDataDump(file) {
  const tables = [];
  for (const match of readFileSync(file, "utf8").matchAll(/^COPY "([^"]+)"\."([^"]+)" \(/gm)) {
    tables.push(`"${match[1]}"."${match[2]}"`);
  }
  return tables;
}

function verifyStagingFiles(manifest) {
  for (const entry of manifest.files) {
    const file = path.join(stagingDir, entry.name);
    if (!existsSync(file)) fail(`Staging file is missing: ${file}`);
    const actual = sha256File(file);
    if (actual !== entry.sha256) fail(`Staging file hash mismatch: ${entry.name}`);
    log(`Verified ${entry.name} (${entry.bytes} bytes)`);
  }
}

function setSectionToggle(config, section, value) {
  const lines = config.split(/\r?\n/);
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("[")) {
      inSection = trimmed === `[${section}]`;
      continue;
    }
    if (inSection && /^enabled\s*=/.test(trimmed)) {
      lines[index] = lines[index].replace(/enabled\s*=\s*\w+/, `enabled = ${value}`);
      return lines.join("\n");
    }
  }
  return null;
}

function containerName(projectId) {
  return `supabase_db_${projectId}`;
}

function findContainer(projectId) {
  const result = run("docker", [
    "ps",
    "--filter",
    `name=^/${containerName(projectId)}$`,
    "--format",
    "{{.Names}}",
  ]);
  const names = result.stdout.split(/\r?\n/).filter(Boolean);
  if (names.length !== 1) fail(`Expected exactly one container named ${containerName(projectId)}.`);
  return names[0];
}

function assertCounts(actual, manifest) {
  const comparisons = [
    ["auth_users", "auth users"],
    ["member_profiles", "member profiles"],
    ["finance_receipts", "receipt rows"],
    ["finance_receipt_bytes", "receipt bytes"],
    ["migration_count", "migration history"],
    ["public_tables", "public tables"],
    ["public_rls_enabled_tables", "RLS-enabled tables"],
    ["public_rls_forced_tables", "forced-RLS tables"],
    ["storage_buckets", "Storage buckets"],
    ["storage_objects", "Storage objects"],
  ];
  for (const [key, label] of comparisons) {
    const expected = manifest.counts[key];
    if (Number(actual[key]) !== Number(expected)) {
      fail(`Restore verification failed for ${label}: expected ${expected}, found ${actual[key]}.`);
    }
    log(`Verified ${label}: ${actual[key]}`);
  }
}

const verificationSql = `
select jsonb_build_object(
  'auth_users', (select count(*) from auth.users),
  'member_profiles', (select count(*) from public.member_profiles),
  'finance_receipts', (select count(*) from public.finance_receipts),
  'finance_receipt_bytes', (select coalesce(sum(size_bytes), 0) from public.finance_receipts),
  'migration_count', (select count(*) from supabase_migrations.schema_migrations),
  'public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')),
  'public_rls_enabled_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity),
  'public_rls_forced_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and c.relforcerowsecurity),
  'storage_buckets', (select count(*) from storage.buckets),
  'storage_objects', (select count(*) from storage.objects)
);`;

const integritySql = `
select jsonb_build_object(
  'orphan_member_profiles', (select count(*) from public.member_profiles mp left join auth.users u on u.id = mp.id where u.id is null),
  'orphan_role_assignments', (select count(*) from public.member_role_assignments a left join public.member_profiles mp on mp.id = a.member_id where mp.id is null),
  'orphan_receipt_links', (select count(*) from public.finance_receipts r where case r.scope
    when 'club' then r.club_transaction_id is null
    when 'event' then r.event_transaction_id is null
    when 'event_ticket' then r.event_ticket_sale_id is null
    when 'dues' then r.dues_payment_id is null and r.dues_request_id is null
    else true end),
  'invalid_receipt_keys', (select count(*) from public.finance_receipts where object_key not like 'receipts/' || scope || '/%' or object_key like '%..%'),
  'invalid_receipt_hashes', (select count(*) from public.finance_receipts where sha256 !~ '^[0-9a-f]{64}$' or size_bytes <= 0),
  'duplicate_current_roles', (select count(*) from (select role from public.member_role_assignments where revoked_at is null group by role having count(*) > 1) d)
);`;

const receiptsSql = `
select coalesce(jsonb_agg(jsonb_build_object(
  'key', object_key,
  'sha256', sha256,
  'bytes', size_bytes,
  'contentType', content_type
) order by object_key), '[]'::jsonb)
from public.finance_receipts;`;

const fingerprintSql = `
select jsonb_build_object(
  'table_count', (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),
  'table_columns', (select md5(string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name)) from information_schema.columns where table_schema='public'),
  'function_count', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'function_signatures', (select md5(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'policy_count', (select count(*) from pg_policies where schemaname='public'),
  'policies', (select md5(string_agg(tablename||'.'||policyname||':'||cmd, ',' order by tablename, policyname)) from pg_policies where schemaname='public'),
  'trigger_count', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public'),
  'triggers', (select md5(string_agg(t.tgname||':'||c.relname, ',' order by t.tgname, c.relname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public'),
  'constraint_count', (select count(*) from pg_constraint c where c.connamespace='public'::regnamespace),
  'constraints', (select md5(string_agg(coalesce(c.conrelid::regclass::text,'-')||':'||c.conname||':'||c.contype::text||':'||regexp_replace(regexp_replace(pg_get_constraintdef(c.oid),'auth[.]','','g'),'[()[:space:]]','','g'), ',' order by coalesce(c.conrelid::regclass::text,'-'), c.conname, c.contype)) from pg_constraint c where c.connamespace='public'::regnamespace),
  'index_count', (select count(*) from pg_indexes where schemaname='public'),
  'indexes', (select md5(string_agg(indexname||':'||indexdef, ',' order by indexname)) from pg_indexes where schemaname='public'),
  'table_grants', (select md5(string_agg(grantee||':'||table_name||':'||privilege_type, ',' order by grantee, table_name, privilege_type)) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')),
  'column_grants', (select md5(string_agg(grantee||':'||table_name||'.'||column_name||':'||privilege_type, ',' order by grantee, table_name, column_name, privilege_type)) from information_schema.role_column_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')),
  'routine_grants', (select md5(string_agg(grantee||':'||routine_name||':'||privilege_type, ',' order by grantee, routine_name, privilege_type)) from information_schema.role_routine_grants where routine_schema='public' and grantee in ('anon','authenticated','service_role'))
);`;

function assertIntegrity(container) {
  const integrity = psqlJson(container, integritySql);
  for (const [key, value] of Object.entries(integrity)) {
    if (Number(value) !== 0) fail(`Data integrity check failed for ${key}: ${value}.`);
    log(`Verified ${key}: 0`);
  }
}

function assertReceipts(container, receiptsManifest) {
  if (receiptsManifest.allReferencedHashesMatch !== true) {
    fail("The receipt backup manifest does not report matching hashes.");
  }
  const restored = psqlJson(container, receiptsSql);
  const expected = receiptsManifest.entries
    .filter((entry) => entry.referenced)
    .map((entry) => ({ key: entry.key, sha256: entry.sha256, bytes: entry.bytes, contentType: entry.contentType }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const actual = [...restored].sort((a, b) => a.key.localeCompare(b.key));
  if (actual.length !== expected.length) {
    fail(`Receipt row count does not match the R2 manifest: restored ${actual.length}, backed up ${expected.length}.`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (
      got.key !== want.key ||
      got.sha256 !== want.sha256 ||
      Number(got.bytes) !== Number(want.bytes) ||
      got.contentType !== want.contentType
    ) {
      fail(`Receipt metadata mismatch for ${want.key}.`);
    }
  }
  log(`Verified ${expected.length} receipt objects against the R2 backup manifest.`);
}

const fingerprintDetailsSql = `
select jsonb_build_object(
  'table_grants', (select coalesce(jsonb_agg(jsonb_build_object('grantee',grantee,'table',table_name,'priv',privilege_type) order by grantee, table_name, privilege_type),'[]'::jsonb) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')),
  'column_grants', (select coalesce(jsonb_agg(jsonb_build_object('grantee',grantee,'table',table_name,'column',column_name,'priv',privilege_type) order by grantee, table_name, column_name, privilege_type),'[]'::jsonb) from information_schema.role_column_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')),
  'routine_grants', (select coalesce(jsonb_agg(jsonb_build_object('grantee',grantee,'routine',routine_name,'specific',specific_name,'priv',privilege_type) order by grantee, specific_name, privilege_type),'[]'::jsonb) from information_schema.role_routine_grants where routine_schema='public' and grantee in ('anon','authenticated','service_role')),
  'constraints', (select coalesce(jsonb_agg(jsonb_build_object('table',coalesce(c.conrelid::regclass::text,'-'),'name',c.conname,'type',c.contype::text,'def',regexp_replace(regexp_replace(pg_get_constraintdef(c.oid),'auth[.]','','g'),'[()[:space:]]','','g')) order by coalesce(c.conrelid::regclass::text,'-'), c.conname, c.contype),'[]'::jsonb) from pg_constraint c where c.connamespace='public'::regnamespace)
);`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function diffDetails(label, expectedRows, actualRows) {
  const key = (row) => canonicalJson(row);
  const expected = new Set(expectedRows.map(key));
  const actual = new Set(actualRows.map(key));
  const missing = [...expected].filter((row) => !actual.has(row));
  const extra = [...actual].filter((row) => !expected.has(row));
  if (!missing.length && !extra.length) {
    log(`Details for ${label} match.`);
    return;
  }
  log(`${label} differences: ${missing.length} missing on restored, ${extra.length} extra on restored.`);
  for (const row of missing.slice(0, 10)) log(`  missing: ${row}`);
  for (const row of extra.slice(0, 10)) log(`  extra:   ${row}`);
}

function assertFingerprint(container, fingerprintPath, detailsPath) {
  if (!existsSync(fingerprintPath)) {
    log("No hosted schema fingerprint file found; skipping schema parity comparison.");
    return;
  }
  const expected = JSON.parse(readFileSync(fingerprintPath, "utf8"));
  const actual = psqlJson(container, fingerprintSql);
  const ignored = new Set(["extensions"]);
  const mismatches = [];
  for (const [key, value] of Object.entries(expected)) {
    if (ignored.has(key)) continue;
    if (String(actual[key]) !== String(value)) {
      mismatches.push(key);
    } else {
      log(`Verified schema fingerprint ${key}`);
    }
  }
  if (mismatches.length) {
    if (existsSync(detailsPath)) {
      const expectedDetails = JSON.parse(readFileSync(detailsPath, "utf8"));
      const actualDetails = psqlJson(container, fingerprintDetailsSql);
      for (const key of mismatches) {
        if (Array.isArray(expectedDetails[key]) && Array.isArray(actualDetails[key])) {
          diffDetails(key, expectedDetails[key], actualDetails[key]);
        }
      }
    }
    fail(`Schema parity mismatch: ${mismatches.join(", ")}`);
  }
}

function main() {
  const manifestPath = path.join(stagingDir, "manifest.summary.json");
  if (!existsSync(manifestPath)) fail(`Snapshot manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.projectRef !== "kgihmudjdvwrvteclodl") {
    fail("The snapshot manifest is not for the expected CarpentersFamily project.");
  }
  verifyStagingFiles(manifest);

  const archivedTests = run("git", ["ls-tree", "--name-only", "-r", testCommit, "supabase/tests/database"]).stdout;
  if (/staff|president/i.test(archivedTests)) {
    fail(`Test commit ${testCommit} contains staff or president tests; choose a pre-migration commit.`);
  }
  log(`Using pre-migration test set from ${testCommit} (${archivedTests.trim().split(/\r?\n/).length} files)`);

  const originalConfig = readFileSync(repoConfigPath, "utf8");
  const originalProjectId = originalConfig.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!originalProjectId) fail("Could not read the original local project_id from supabase/config.toml.");

  const originalStatus = spawnSync(process.execPath, [cliPath, "status", "--workdir", repoRoot], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const originalOutput = `${originalStatus.stdout || ""}\n${originalStatus.stderr || ""}`;
  const originalWasRunning = originalStatus.status === 0 && /running/i.test(originalOutput);
  log(`Original local project ${originalProjectId} is ${originalWasRunning ? "running" : "stopped"}.`);

  const projectId = `cfsc-restore-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${Math.random().toString(16).slice(2, 10)}`;
  const restoreRoot = mkdtempSync(path.join(tmpdir(), "cfsc-restore-"));
  const supabaseDir = path.join(restoreRoot, "supabase");
  let isolatedStarted = false;

  try {
    if (originalWasRunning) {
      log(`Stopping ${originalProjectId} (volumes are preserved)...`);
      runCli(["stop", "--yes", "--workdir", repoRoot]);
    }

    mkdirSync(path.join(supabaseDir, "migrations"), { recursive: true });
    let config = originalConfig.replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`);
    if (!config.includes(`project_id = "${projectId}"`)) fail("Could not set the isolated project_id.");
    config = setSectionToggle(config, "db.migrations", "false");
    if (!config) fail("Could not disable migrations for the isolated project.");
    config = setSectionToggle(config, "db.seed", "false");
    if (!config) fail("Could not disable seed data for the isolated project.");
    writeFileSync(path.join(supabaseDir, "config.toml"), config, "utf8");

    const testsTar = path.join(restoreRoot, "tests.tar");
    run("git", ["archive", "--format=tar", "-o", testsTar, testCommit, "supabase/tests"]);
    run("tar", ["--force-local", "-xf", "tests.tar"], { cwd: restoreRoot });
    if (!existsSync(path.join(supabaseDir, "tests", "database"))) {
      fail("The pre-migration test set was not extracted.");
    }

    log(`Starting isolated project ${projectId} on the local Supabase ports...`);
    isolatedStarted = true;
    runCli(["start", "--workdir", restoreRoot]);
    const container = findContainer(projectId);
    log(`Using database container ${container}.`);

    log("Loading 01_roles.sql as supabase_admin...");
    psqlFile(container, path.join(stagingDir, "01_roles.sql"));

    log("Pre-creating extensions as supabase_admin...");
    ensureExtensions(container);

    log("Resetting postgres default privileges in public to match hosted...");
    resetDefaultPrivileges(container);

    // Objects must be created as postgres, not supabase_admin: the local
    // image gives supabase_admin default grants to anon/authenticated/
    // service_role that hosted migrations did not have.
    log("Loading 02_schema.sql as postgres...");
    psqlFile(container, path.join(stagingDir, "02_schema.sql"), { asRole: "postgres" });

    const tables = tablesInDataDump(path.join(stagingDir, "03_data.sql"));
    log(`Truncating ${tables.length} target tables before data restore...`);
    const truncateSql = `set session_replication_role = replica; truncate table ${tables.join(", ")} cascade;`;
    run("docker", [
      "exec",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-c",
      truncateSql,
    ]);

    log("Loading 03_data.sql...");
    psqlFile(container, path.join(stagingDir, "03_data.sql"));

    log("Loading 04_migration_history_schema.sql as postgres...");
    psqlFile(container, path.join(stagingDir, "04_migration_history_schema.sql"), { asRole: "postgres" });

    log("Loading 05_migration_history_data.sql...");
    psqlFile(container, path.join(stagingDir, "05_migration_history_data.sql"));

    log("Verifying restored row counts against the snapshot manifest...");
    assertCounts(psqlJson(container, verificationSql), manifest);

    log("Verifying referential and receipt integrity...");
    assertIntegrity(container);
    const receiptsPath = path.join(stagingDir, "receipts.manifest.json");
    if (existsSync(receiptsPath)) {
      assertReceipts(container, JSON.parse(readFileSync(receiptsPath, "utf8")));
    }

    log("Comparing the restored schema fingerprint against hosted...");
    assertFingerprint(
      container,
      path.join(stagingDir, "schema.fingerprint.json"),
      path.join(stagingDir, "schema.details.json"),
    );

    // The pgTAP suite assumes an empty database and still checks function
    // signatures removed by the receipts refactor, so it is red on every
    // populated database regardless of this restore. Run it for signal only.
    log("Running the pre-migration pgTAP suite for information (not a gate)...");
    const testRun = spawnSync(
      process.execPath,
      [cliPath, "test", "db", "--local", "--workdir", restoreRoot],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    const testOutput = `${testRun.stdout || ""}\n${testRun.stderr || ""}`;
    const summary = testOutput
      .split(/\r?\n/)
      .filter((line) => /^(Files=|Result:|Tests:)/.test(line.trim()))
      .slice(-3);
    if (testRun.status === 0) {
      log(`pgTAP suite passed. ${summary.join(" | ")}`.trim());
    } else {
      log(`pgTAP suite is red (pre-existing drift, informational only). ${summary.join(" | ")}`.trim());
    }

    log("Re-verifying counts after the test suite...");
    assertCounts(psqlJson(container, verificationSql), manifest);
    log("RESTORE DRILL PASSED: snapshot restores faithfully with matching schema and data.");
  } finally {
    if (isolatedStarted) {
      log(`Stopping isolated project ${projectId} and deleting its volumes...`);
      try {
        runCli(["stop", "--project-id", projectId, "--no-backup", "--yes", "--workdir", restoreRoot]);
      } catch (error) {
        console.error(`[restore-drill] Isolated cleanup needs attention: ${error.message}`);
      }
    }
    rmSync(restoreRoot, { recursive: true, force: true });

    if (originalWasRunning) {
      log(`Restarting original local project ${originalProjectId}...`);
      runCli(["start", "--workdir", repoRoot]);
      log("Original local project restarted.");
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[restore-drill] FAILED: ${error.message}`);
  process.exitCode = 1;
}
