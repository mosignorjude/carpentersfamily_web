import { spawn, spawnSync } from "node:child_process";
import { access, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const PSQL_IMAGE = "public.ecr.aws/supabase/postgres:17.11.0.002";
export const APP_RECORDS_TABLES = Object.freeze([
  ["public", "member_profiles"],
  ["public", "member_role_assignments"],
  ["public", "audit_log"],
  ["public", "dues_rates"],
  ["public", "dues_membership_periods"],
  ["public", "dues_payments"],
  ["public", "dues_month_dispositions"],
  ["public", "dues_payment_requests"],
  ["public", "finance_categories"],
  ["public", "finance_receipts"],
  ["public", "club_financial_transactions"],
  ["public", "club_financial_receipts"],
  ["public", "club_payment_settings"],
  ["public", "events"],
  ["public", "event_role_assignments"],
  ["public", "event_budgets"],
  ["public", "event_budget_allocations"],
  ["public", "event_finance_categories"],
  ["public", "event_ticket_tiers"],
  ["public", "event_financial_transactions"],
  ["public", "event_ticket_sales"],
  ["public", "event_ledger_entries"],
  ["public", "event_financial_receipts"],
  ["public", "club_attendance_settings"],
  ["public", "event_minutes"],
  ["public", "event_minutes_revisions"],
  ["public", "event_attendance_sessions"],
  ["public", "event_attendance"],
  ["public", "announcements"],
  ["public", "announcement_revisions"],
  ["public", "announcement_reads"],
  ["public", "announcement_polls"],
  ["public", "announcement_poll_options"],
  ["public", "announcement_poll_revisions"],
  ["public", "notification_preferences"],
  ["public", "notifications"],
  ["public", "notification_outbox"],
  ["public", "notification_reminders"],
  ["private", "administration_guard"],
  ["private", "poll_voter_eligibility"],
  ["private", "poll_ballots"],
  ["private", "notification_job_runs"],
]);

export function buildAppRecordsCsvCopyQuery() {
  const selectStatements = APP_RECORDS_TABLES.map(([schema, table]) => {
    if (
      !/^[a-z_][a-z0-9_]*$/.test(schema) ||
      !/^[a-z_][a-z0-9_]*$/.test(table)
    ) {
      throw new Error(
        "The application table allowlist contains an invalid identifier.",
      );
    }
    return (
      "SELECT '" +
      schema +
      "'::text AS schema_name, '" +
      table +
      "'::text AS table_name, to_jsonb(app_row)::text AS record_json FROM " +
      schema +
      "." +
      table +
      " AS app_row"
    );
  });
  return (
    "COPY (\n  " +
    selectStatements.join("\n  UNION ALL\n  ") +
    "\n) TO STDOUT WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');"
  );
}

function waitForClose(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) =>
      reject(new Error(label + " could not start: " + error.message)),
    );
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

function captureStderr(stream, maximum = 12_000) {
  let result = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    if (result.length < maximum)
      result += chunk.slice(0, maximum - result.length);
  });
  return () => result;
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
  } else {
    child.kill("SIGTERM");
  }
}

function sanitizeDiagnostic(value, password) {
  let safe = String(value ?? "");
  if (password)
    safe = safe.split(password).join("[database password redacted]");
  safe = safe.replace(
    /postgres(?:ql)?:\/\/[^\s"'<>]+/giu,
    "[database connection redacted]",
  );
  safe = safe.replace(
    /sbp_[A-Za-z0-9_-]+/gu,
    "[Supabase access token redacted]",
  );
  safe = safe.replace(
    /sb_(?:publishable|secret)_[A-Za-z0-9_-]+/gu,
    "[Supabase key redacted]",
  );
  safe = safe.replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,
    "[session token redacted]",
  );
  return safe.trim().slice(-6000);
}

export function childEnvironmentWithoutSecrets(source = process.env) {
  const env = {};
  const sensitiveName =
    /(?:^|[_-])(?:PASS(?:WORD|PHRASE)?|SECRET|TOKEN|API[_-]?KEY|SERVICE[_-]?ROLE[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|DATABASE[_-]?URL)(?:$|[_-])/iu;
  for (const [name, value] of Object.entries(source)) {
    if (!sensitiveName.test(name)) env[name] = value;
  }
  delete env.CARPENTERS_APP_CSV_DB_PASSWORD;
  delete env.PGPASSWORD;
  delete env.PGSSLMODE;
  return env;
}

async function runGpgVerification(gpgPath, encryptedPath, password) {
  const args = [
    "--no-symkey-cache",
    "--pinentry-mode",
    "ask",
    "--decrypt",
    "--output",
    "NUL",
    encryptedPath,
  ];
  const child = spawn(gpgPath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: false,
    shell: false,
    env: childEnvironmentWithoutSecrets(),
  });
  const getStderr = captureStderr(child.stderr, 12_000);
  const closed = waitForClose(child, "GnuPG verification");
  const result = await closed;
  if (result.code !== 0) {
    throw new Error(
      "GnuPG could not decrypt-verify the encrypted CSV: " +
        sanitizeDiagnostic(getStderr(), password),
    );
  }
}

export async function createEncryptedAppRecordsCsv({
  dockerPath,
  gpgPath,
  projectRef,
  partialPath,
  databasePassword,
}) {
  if (!/^[a-z0-9]{20}$/i.test(projectRef ?? "")) {
    throw new Error("The linked Supabase project reference is invalid.");
  }
  if (typeof databasePassword !== "string" || databasePassword.length === 0) {
    throw new Error("The database password is missing.");
  }
  if (!path.isAbsolute(partialPath ?? "")) {
    throw new Error("The encrypted output path must be absolute.");
  }
  try {
    await access(partialPath);
    throw new Error(
      "The encrypted partial output already exists; no file was overwritten.",
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const image = PSQL_IMAGE;
  const query =
    "BEGIN TRANSACTION READ ONLY;\n" +
    buildAppRecordsCsvCopyQuery() +
    "\nCOMMIT;";
  const dockerArgs = [
    "run",
    "--rm",
    "--pull=never",
    "--env",
    "PGPASSWORD",
    "--env",
    "PGSSLMODE",
    "--entrypoint",
    "psql",
    image,
    "--host",
    "aws-0-eu-west-1.pooler.supabase.com",
    "--port",
    "5432",
    "--username",
    "postgres." + projectRef,
    "--dbname",
    "postgres",
    "--no-psqlrc",
    "--quiet",
    "--no-password",
    "--set=ON_ERROR_STOP=1",
    "--command",
    query,
  ];
  const dockerEnv = childEnvironmentWithoutSecrets();
  dockerEnv.PGPASSWORD = databasePassword;
  dockerEnv.PGSSLMODE = "require";

  const gpgArgs = [
    "--no-symkey-cache",
    "--pinentry-mode",
    "ask",
    "--force-mdc",
    "--s2k-mode",
    "3",
    "--s2k-digest-algo",
    "SHA256",
    "--s2k-count",
    "65011712",
    "--symmetric",
    "--cipher-algo",
    "AES256",
    "--compress-algo",
    "ZIP",
    "--output",
    partialPath,
  ];

  let docker;
  let gpg;
  let dockerClosed;
  let gpgClosed;
  try {
    docker = spawn(dockerPath, dockerArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
      env: dockerEnv,
    });
    gpg = spawn(gpgPath, gpgArgs, {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: false,
      shell: false,
      env: childEnvironmentWithoutSecrets(),
    });
    const dockerStderr = captureStderr(docker.stderr);
    const gpgStderr = captureStderr(gpg.stderr);
    dockerClosed = waitForClose(docker, "Docker/PostgreSQL export");
    gpgClosed = waitForClose(gpg, "GnuPG encryption");
    console.log(
      "Streaming a read-only CSV extract directly into GnuPG; no plaintext file is created.",
    );
    console.log(
      "GnuPG will prompt once to encrypt and again to verify the encrypted extract.",
    );
    const [, dockerResult, gpgResult] = await Promise.all([
      pipeline(docker.stdout, gpg.stdin),
      dockerClosed,
      gpgClosed,
    ]);

    if (dockerResult.code !== 0) {
      throw new Error(
        "The read-only Supabase export failed (exit " +
          dockerResult.code +
          "): " +
          sanitizeDiagnostic(dockerStderr(), databasePassword),
      );
    }
    if (gpgResult.code !== 0) {
      throw new Error(
        "GnuPG encryption failed (exit " +
          gpgResult.code +
          "): " +
          sanitizeDiagnostic(gpgStderr(), databasePassword),
      );
    }

    const output = await stat(partialPath);
    if (!output.isFile() || output.size < 128) {
      throw new Error("The encrypted CSV is missing or unexpectedly small.");
    }
    await runGpgVerification(gpgPath, partialPath, databasePassword);
    console.log("Encrypted CSV integrity check passed.");
    return {
      encryptedBytes: output.size,
      tableCount: APP_RECORDS_TABLES.length,
    };
  } catch (error) {
    killProcessTree(docker);
    killProcessTree(gpg);
    if (dockerClosed) await Promise.allSettled([dockerClosed]);
    if (gpgClosed) await Promise.allSettled([gpgClosed]);
    try {
      await rm(partialPath, { force: true });
    } catch {
      // Keep the original operation error; incomplete ciphertext is never retained as a completed export.
    }
    throw error;
  }
}

async function main() {
  const [mode, dockerPath, gpgPath, projectRef, partialPath, ...extra] =
    process.argv.slice(2);
  if (
    mode !== "export" ||
    extra.length !== 0 ||
    !dockerPath ||
    !gpgPath ||
    !projectRef ||
    !partialPath
  ) {
    throw new Error(
      "Usage: node app-records-csv.mjs export <docker> <gpg> <project-ref> <encrypted-partial-path>",
    );
  }
  const databasePassword = process.env.CARPENTERS_APP_CSV_DB_PASSWORD;
  try {
    const result = await createEncryptedAppRecordsCsv({
      dockerPath,
      gpgPath,
      projectRef,
      partialPath,
      databasePassword,
    });
    console.log(
      "Encrypted records exported: " +
        result.tableCount +
        " allowlisted tables, " +
        result.encryptedBytes +
        " ciphertext bytes.",
    );
  } finally {
    delete process.env.CARPENTERS_APP_CSV_DB_PASSWORD;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error?.message ?? "The app records export failed.");
    process.exitCode = 1;
  });
}
