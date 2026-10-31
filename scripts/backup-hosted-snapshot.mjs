import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { resolveR2Config } from "../src/lib/r2/config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "node_modules", "supabase", "dist", "supabase.js");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const supabaseCliVersion = packageJson.devDependencies?.supabase ?? "unknown";
const remoteDbUrl = process.env.SUPABASE_DB_URL?.trim() ?? "";
const dbTargetArgs = remoteDbUrl ? ["--db-url", remoteDbUrl] : ["--linked"];

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const label = argument("--label", "manual");
const localDir = path.resolve(
  argument("--local-dir", path.join(homedir(), "Documents", "CarpentersFamilyBackups")),
);
const offsiteDir = path.resolve(
  argument("--offsite-dir", "G:\\My Drive\\CarpentersFamilyBackups"),
);
const keyFile = path.resolve(
  argument("--key-file", path.join(homedir(), "Documents", "CarpentersFamilyBackups-KEY", "backup-key-20261031.txt")),
);
const keepStaging = process.argv.includes("--keep-staging");
const skipOffsite = process.argv.includes("--no-offsite");

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

function runCli(args, options = {}) {
  return run(process.execPath, [cliPath, ...args], options);
}

function queryJson(sql) {
  const result = runCli(["db", "query", ...dbTargetArgs, "--output-format", "json", sql]);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    fail(`Could not parse the database query output as JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    fail("The database query did not return exactly one row.");
  }
  return parsed[0];
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256(readFileSync(file));
}

function fileBytes(file) {
  return statSync(file).size;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeRelativeKey(key) {
  if (!key.startsWith("receipts/") || key.includes("..") || key.includes("\\")) {
    fail(`Unsafe receipt object key returned by the database: ${key}`);
  }
  return key;
}

function copyVerified(source, directory, name) {
  const destination = path.join(directory, name);
  const partial = `${destination}.partial`;
  copyFileSync(source, partial);
  const sourceHash = sha256File(source);
  if (sha256File(partial) !== sourceHash) fail(`Copy hash mismatch while staging ${name}.`);
  renameSync(partial, destination);
  if (sha256File(destination) !== sourceHash) fail(`Copy hash mismatch after writing ${name}.`);
  return { file: destination, sha256: sourceHash, bytes: fileBytes(destination) };
}

function encrypt(input, output) {
  run("gpg", [
    "--batch",
    "--yes",
    "--pinentry-mode",
    "loopback",
    "--passphrase-file",
    keyFile,
    "--symmetric",
    "--cipher-algo",
    "AES256",
    "--s2k-digest-algo",
    "SHA512",
    "--s2k-count",
    "65011712",
    "-o",
    output,
    input,
  ]);
}

function verifyDecryption(encrypted, expectedSha256, workDir) {
  const decrypted = path.join(workDir, "decrypt-verify.tmp");
  run("gpg", [
    "--batch",
    "--yes",
    "--pinentry-mode",
    "loopback",
    "--passphrase-file",
    keyFile,
    "--decrypt",
    "-o",
    decrypted,
    encrypted,
  ]);
  const actual = sha256File(decrypted);
  rmSync(decrypted, { force: true });
  if (actual !== expectedSha256) fail("The encrypted archive did not decrypt to the expected bytes.");
}

function localMigrationVersions() {
  return readdirSync(path.join(repoRoot, "supabase", "migrations"))
    .map((name) => name.match(/^(\d{14})_/)?.[1])
    .filter(Boolean)
    .sort();
}

function projectRef() {
  const linked = path.join(repoRoot, "supabase", ".temp", "project-ref");
  if (existsSync(linked)) return readFileSync(linked, "utf8").trim();
  const fromEnv = process.env.SUPABASE_PROJECT_REF?.trim();
  if (fromEnv) return fromEnv;
  fail("Could not determine the Supabase project ref. Set SUPABASE_PROJECT_REF or link the project locally.");
}

async function backupReceipts(staging) {
  const config = resolveR2Config();
  if (!config) {
    fail("R2 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.");
  }

  const receiptRow = queryJson(`
    select coalesce(jsonb_agg(jsonb_build_object(
      'object_key', object_key,
      'sha256', sha256,
      'size_bytes', size_bytes,
      'content_type', content_type
    ) order by object_key), '[]'::jsonb) as receipts
    from public.finance_receipts;
  `);
  const receipts = receiptRow.receipts;
  if (!Array.isArray(receipts)) fail("The finance_receipts query did not return an array.");

  const referenced = new Map(receipts.map((entry) => [safeRelativeKey(entry.object_key), entry]));
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    maxAttempts: 3,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const listed = [];
  let listAllowed = true;
  let continuationToken;
  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: "receipts/",
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) listed.push(object.Key);
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (error) {
    if (error?.name !== "AccessDenied" && error?.name !== "Forbidden") throw error;
    listAllowed = false;
  }

  const allKeys = [...new Set([...referenced.keys(), ...listed])].sort();
  const entries = [];
  let totalBytes = 0;

  for (const key of allKeys) {
    const object = await client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
    );
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    const digest = sha256(bytes);
    const metadata = referenced.get(key);
    if (metadata) {
      if (bytes.length !== Number(metadata.size_bytes)) {
        fail(`Receipt size mismatch for ${key}: metadata ${metadata.size_bytes}, object ${bytes.length}.`);
      }
      if (digest !== metadata.sha256) {
        fail(`Receipt SHA-256 mismatch for ${key}.`);
      }
      if (object.ContentType && object.ContentType !== metadata.content_type) {
        fail(`Receipt content-type mismatch for ${key}.`);
      }
    }
    const destination = path.join(staging, "receipts", ...key.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    totalBytes += bytes.length;
    entries.push({
      key,
      sha256: digest,
      bytes: bytes.length,
      contentType: object.ContentType ?? null,
      referenced: Boolean(metadata),
      matchesMetadata: Boolean(metadata),
    });
  }

  const missing = [...referenced.keys()].filter((key) => !entries.some((entry) => entry.key === key));
  if (missing.length > 0) fail(`The R2 bucket is missing ${missing.length} receipt object(s) referenced by the database.`);

  const manifest = {
    generatedAtUtc: new Date().toISOString(),
    bucket: config.bucketName,
    referencedCount: referenced.size,
    archivedObjectCount: entries.length,
    unreferencedCount: entries.filter((entry) => !entry.referenced).length,
    totalBytes,
    allReferencedHashesMatch: true,
    listAllowed,
    entries,
  };
  writeJson(path.join(staging, "receipts.manifest.json"), manifest);
  return manifest;
}

async function main() {
  if (!existsSync(keyFile)) fail(`The GPG key file does not exist: ${keyFile}`);
  if (readFileSync(keyFile, "utf8").trim().length < 32) fail("The GPG key file is too short.");
  if (!existsSync(localDir)) fail(`The local backup directory does not exist: ${localDir}`);
  if (!skipOffsite && !existsSync(offsiteDir)) {
    fail(`The off-site backup directory is not available: ${offsiteDir}`);
  }
  if (!existsSync(cliPath)) fail(`The pinned Supabase CLI was not found: ${cliPath}`);

  const dirty = run("git", ["status", "--porcelain", "--", "supabase/migrations", "supabase/config.toml"]).stdout;
  if (dirty.trim()) fail("Commit or clean pending Supabase migration/config changes before taking a snapshot.");

  const sourceCommit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const sourceBranch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const localVersions = localMigrationVersions();
  const remoteVersions = queryJson(
    "select coalesce(jsonb_agg(version order by version), '[]'::jsonb) as versions from supabase_migrations.schema_migrations;",
  ).versions;
  if (!Array.isArray(remoteVersions)) fail("Could not read remote migration versions.");
  const remoteOnly = remoteVersions.filter((version) => !localVersions.includes(version));
  if (remoteOnly.length > 0) {
    fail(
      `Production has migration(s) missing locally: ${remoteOnly.join(", ")}. Bring them into this branch before backing up.`,
    );
  }
  const pendingMigrations = localVersions.filter((version) => !remoteVersions.includes(version));

  const beforeCounts = queryJson(`
    select jsonb_build_object(
      'auth_users', (select count(*) from auth.users),
      'member_profiles', (select count(*) from public.member_profiles),
      'finance_receipts', (select count(*) from public.finance_receipts),
      'finance_receipt_bytes', (select coalesce(sum(size_bytes), 0) from public.finance_receipts),
      'migration_count', (select count(*) from supabase_migrations.schema_migrations),
      'database_bytes', pg_database_size(current_database()),
      'storage_buckets', (select count(*) from storage.buckets),
      'storage_objects', (select count(*) from storage.objects),
      'public_tables', (
        select count(*) from pg_class as c
        join pg_namespace as n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
      ),
      'public_rls_enabled_tables', (
        select count(*) from pg_class as c
        join pg_namespace as n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      ),
      'public_rls_forced_tables', (
        select count(*) from pg_class as c
        join pg_namespace as n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relforcerowsecurity
      ),
      'server_version', current_setting('server_version')
    ) as counts;
  `).counts;
  const lsnBefore = queryJson("select pg_current_wal_lsn()::text as lsn;").lsn;

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "manual";
  const baseName = `CarpentersFamily-${timestamp}-${safeLabel}`;
  const staging = mkdtempSync(path.join(tmpdir(), "cfsc-snapshot-"));
  const buildDir = mkdtempSync(path.join(tmpdir(), "cfsc-build-"));

  const dumpSpecs = [
    { name: "01_roles.sql", args: ["--role-only"], marker: /ALTER ROLE|CREATE ROLE/ },
    { name: "02_schema.sql", args: [], marker: /CREATE TABLE|CREATE FUNCTION|CREATE SCHEMA/ },
    {
      name: "03_data.sql",
      args: ["--data-only", "--use-copy"],
      marker: /COPY |INSERT INTO |session_replication_role/,
    },
    {
      name: "04_migration_history_schema.sql",
      args: ["--schema", "supabase_migrations"],
      marker: /supabase_migrations|schema_migrations/,
    },
    {
      name: "05_migration_history_data.sql",
      args: ["--data-only", "--use-copy", "--schema", "supabase_migrations"],
      marker: /schema_migrations|COPY |INSERT INTO /,
    },
  ];
  const files = [];
  try {
    for (const spec of dumpSpecs) {
      const output = path.join(staging, spec.name);
      runCli(["db", "dump", ...dbTargetArgs, ...spec.args, "-f", output]);
      if (!existsSync(output) || fileBytes(output) === 0) fail(`Dump ${spec.name} was empty.`);
      const text = readFileSync(output, "utf8");
      if (!spec.marker.test(text)) fail(`Dump ${spec.name} did not contain its expected SQL.`);
      files.push({ name: spec.name, bytes: fileBytes(output), sha256: sha256File(output) });
    }

    const afterCounts = queryJson(`
      select jsonb_build_object(
        'auth_users', (select count(*) from auth.users),
        'member_profiles', (select count(*) from public.member_profiles),
        'finance_receipts', (select count(*) from public.finance_receipts),
        'migration_count', (select count(*) from supabase_migrations.schema_migrations)
      ) as counts;
    `).counts;
    for (const field of ["auth_users", "member_profiles", "finance_receipts", "migration_count"]) {
      if (Number(afterCounts[field]) !== Number(beforeCounts[field])) {
        fail(`The ${field} count changed during the dump. No completed snapshot was written.`);
      }
    }
    const lsnAfter = queryJson("select pg_current_wal_lsn()::text as lsn;").lsn;

    writeFileSync(
      path.join(staging, "SOURCE.txt"),
      [
        "CarpentersFamily hosted snapshot",
        `Created: ${new Date().toISOString()}`,
        `Project: ${projectRef()}`,
        `Branch: ${sourceBranch}`,
        `Commit: ${sourceCommit}`,
        `Supabase CLI: ${supabaseCliVersion}`,
        `Node: ${process.version}`,
        `PostgreSQL: ${beforeCounts.server_version}`,
        `Pending local migrations: ${pendingMigrations.join(", ") || "none"}`,
        "Scope: roles, application schema, data (including Auth and Storage metadata), migration history, and the tracked Supabase source files at HEAD.",
        "Auth rows include password hashes and session metadata. Treat this archive as highly sensitive.",
        "Restore with the pre-migration test set from the commit before the earliest pending migration.",
        ""
      ].join("\n"),
      "utf8",
    );

    run("git", [
      "archive",
      "--format=tar.gz",
      "-o",
      path.join(staging, "source.tar.gz"),
      "HEAD",
      "supabase",
      "package.json",
      "package-lock.json",
    ]);
    if (fileBytes(path.join(staging, "source.tar.gz")) === 0) fail("The source archive was empty.");

    const receiptManifest = await backupReceipts(staging);

    const summary = {
      schemaVersion: 1,
      action: "hosted database and R2 receipt snapshot",
      label: safeLabel,
      createdAtUtc: new Date().toISOString(),
      projectRef: projectRef(),
      sourceBranch,
      sourceCommit,
      supabaseCli: supabaseCliVersion,
      nodeVersion: process.version,
      postgresVersion: beforeCounts.server_version,
      counts: beforeCounts,
      pendingMigrations,
      files,
      wal: { before: lsnBefore, after: lsnAfter, changed: lsnBefore !== lsnAfter },
      receipts: {
        referencedCount: receiptManifest.referencedCount,
        archivedObjectCount: receiptManifest.archivedObjectCount,
        unreferencedCount: receiptManifest.unreferencedCount,
        totalBytes: receiptManifest.totalBytes,
        allReferencedHashesMatch: true,
        listAllowed: receiptManifest.listAllowed,
      },
      encryption: "GnuPG symmetric AES-256; the passphrase is stored outside the backup set.",
      restoreNote:
        "Restore the schema and data into a local Supabase project; use the pre-migration test set. Receipt bytes are restored to R2, not Supabase Storage.",
    };
    writeJson(path.join(staging, "manifest.summary.json"), summary);

    const tarPrefix = process.platform === "win32" ? ["--force-local"] : [];
    const dbTar = path.join(buildDir, `${baseName}.db.tar.gz`);
    run("tar", [
      ...tarPrefix,
      "-czf",
      dbTar,
      "-C",
      staging,
      ...dumpSpecs.map((spec) => spec.name),
      "SOURCE.txt",
      "manifest.summary.json",
      "source.tar.gz",
    ]);
    const dbTarSha = sha256File(dbTar);

    const receiptsTar = path.join(buildDir, `${baseName}.receipts.tar.gz`);
    const receiptEntries = existsSync(path.join(staging, "receipts"))
      ? ["receipts", "receipts.manifest.json"]
      : ["receipts.manifest.json"];
    run("tar", [...tarPrefix, "-czf", receiptsTar, "-C", staging, ...receiptEntries]);
    const receiptsTarSha = sha256File(receiptsTar);

    const dbGpg = path.join(buildDir, `${baseName}.db.tar.gz.gpg`);
    const receiptsGpg = path.join(buildDir, `${baseName}.receipts.tar.gz.gpg`);
    encrypt(dbTar, dbGpg);
    encrypt(receiptsTar, receiptsGpg);
    verifyDecryption(dbGpg, dbTarSha, buildDir);
    verifyDecryption(receiptsGpg, receiptsTarSha, buildDir);

    const externalManifest = {
      ...summary,
      databaseFile: path.basename(dbGpg),
      databaseBytes: fileBytes(dbGpg),
      databaseSha256: sha256File(dbGpg),
      receiptsFile: path.basename(receiptsGpg),
      receiptsBytes: fileBytes(receiptsGpg),
      receiptsSha256: sha256File(receiptsGpg),
      keyFile,
      copies: { localDir, offsiteDir: skipOffsite ? null : offsiteDir },
      warnings: [
        ...(lsnBefore === lsnAfter
          ? []
          : ["WAL changed during the dump; the data dump is internally consistent but the separate dumps may not share one point-in-time snapshot."]),
        ...(receiptManifest.listAllowed
          ? []
          : ["The R2 token cannot list the bucket; only database-referenced receipt objects were archived."]),
      ],
    };
    const manifestPath = path.join(buildDir, `${baseName}.manifest.json`);
    writeJson(manifestPath, externalManifest);

    const localDb = copyVerified(dbGpg, localDir, path.basename(dbGpg));
    const localReceipts = copyVerified(receiptsGpg, localDir, path.basename(receiptsGpg));
    const localManifest = copyVerified(manifestPath, localDir, path.basename(manifestPath));
    let offsiteDb = null;
    let offsiteReceipts = null;
    let offsiteManifest = null;
    if (!skipOffsite) {
      offsiteDb = copyVerified(dbGpg, offsiteDir, path.basename(dbGpg));
      offsiteReceipts = copyVerified(receiptsGpg, offsiteDir, path.basename(receiptsGpg));
      offsiteManifest = copyVerified(manifestPath, offsiteDir, path.basename(manifestPath));
    }

    console.log("Snapshot complete.");
    console.log(`Project: ${summary.projectRef}`);
    console.log(`Source: ${sourceBranch} @ ${sourceCommit}`);
    console.log(`Auth users: ${beforeCounts.auth_users}; members: ${beforeCounts.member_profiles}; receipts: ${beforeCounts.finance_receipts}`);
    console.log(`Applied migrations: ${beforeCounts.migration_count}; pending local: ${pendingMigrations.length}`);
    console.log(`Database archive: ${localDb.file} (${localDb.bytes} bytes, sha256 ${localDb.sha256})`);
    console.log(`Receipts archive: ${localReceipts.file} (${localReceipts.bytes} bytes, sha256 ${localReceipts.sha256})`);
    console.log(`Manifest: ${localManifest.file}`);
    if (offsiteDb) console.log(`Off-site copies verified: ${offsiteDb.file}, ${offsiteReceipts.file}, ${offsiteManifest.file}`);
    console.log(`Key file (move to a password manager): ${keyFile}`);
    if (lsnBefore !== lsnAfter) console.log("Warning: WAL changed during the dump; see the manifest.");
    if (keepStaging) console.log(`Plaintext staging kept for the restore drill: ${staging}`);
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
    if (!keepStaging) rmSync(staging, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Snapshot failed: ${error.message}`);
  process.exitCode = 1;
}
