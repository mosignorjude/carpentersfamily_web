import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  APP_RECORDS_TABLES,
  buildAppRecordsCsvCopyQuery,
  childEnvironmentWithoutSecrets,
} from "../scripts/app-records-csv.mjs";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const exportHelperSource = await readFile(
  new URL("../scripts/app-records-csv.mjs", import.meta.url),
  "utf8",
);
const exportScriptSource = await readFile(
  new URL("../scripts/export-app-records-csv.ps1", import.meta.url),
  "utf8",
);

describe("encrypted app records CSV export", () => {
  it("allowlists every app-owned table declared in the project migrations", async () => {
    const migrationFiles = (await readdir(migrationsDirectory)).filter((name) =>
      name.endsWith(".sql"),
    );
    const discoveredTables = [];
    for (const name of migrationFiles) {
      const sql = await readFile(new URL(name, migrationsDirectory), "utf8");
      for (const match of sql.matchAll(
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(public|private)\.([a-z_][a-z0-9_]*)/giu,
      )) {
        discoveredTables.push(
          match[1].toLowerCase() + "." + match[2].toLowerCase(),
        );
      }
    }

    const allowlistedTables = APP_RECORDS_TABLES.map(
      ([schema, table]) => schema + "." + table,
    );
    assert.equal(allowlistedTables.length, 40);
    assert.equal(new Set(allowlistedTables).size, allowlistedTables.length);
    assert.deepEqual(
      [...allowlistedTables].sort(),
      [...discoveredTables].sort(),
    );
    assert.ok(!allowlistedTables.some((table) => table.startsWith("auth.")));
    assert.ok(!allowlistedTables.some((table) => table.startsWith("storage.")));
  });

  it("uses one PostgreSQL COPY CSV statement with object-shaped JSON records", () => {
    const query = buildAppRecordsCsvCopyQuery();
    assert.match(query, /^COPY \(/u);
    assert.match(
      query,
      /TO STDOUT WITH \(FORMAT CSV, HEADER TRUE, ENCODING 'UTF8'\);$/u,
    );
    assert.equal(
      (query.match(/\bUNION ALL\b/gu) ?? []).length,
      APP_RECORDS_TABLES.length - 1,
    );
    assert.equal(
      (query.match(/to_jsonb\(app_row\)::text AS record_json/gu) ?? []).length,
      APP_RECORDS_TABLES.length,
    );
    assert.doesNotMatch(
      query,
      /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/iu,
    );
  });

  it("keeps formula-like member text inside an inert JSON object cell", () => {
    for (const value of [
      '=HYPERLINK("https://example.invalid","open")',
      "+SUM(1,2)",
      "-1+1",
      "@SUM(1,2)",
      "  =1+1",
      "\t+1+1",
      "\r\n-1+1",
    ]) {
      const jsonRecord = JSON.stringify({ member_text: value });
      assert.equal(jsonRecord[0], "{");
      assert.doesNotMatch(jsonRecord, /^\s*[=+\-@]/u);
      assert.equal(JSON.parse(jsonRecord).member_text, value);
    }

    assert.match(buildAppRecordsCsvCopyQuery(), /FORMAT CSV/u);
  });

  it("passes the database password through the process environment, never a CLI argument", () => {
    assert.match(
      exportHelperSource,
      /dockerEnv\.PGPASSWORD = databasePassword/u,
    );
    assert.match(exportHelperSource, /"--env",\s*"PGPASSWORD"/u);
    assert.doesNotMatch(
      exportHelperSource,
      /"--password",\s*databasePassword/u,
    );
    assert.match(
      exportHelperSource,
      /delete env\.CARPENTERS_APP_CSV_DB_PASSWORD/u,
    );
    assert.match(exportHelperSource, /delete env\.PGPASSWORD/u);
  });

  it("strips unrelated password, token, key, and database URL environment variables from child processes", () => {
    const childEnv = childEnvironmentWithoutSecrets({
      PATH: "safe-path",
      DOCKER_HOST: "docker-context",
      SUPABASE_DB_PASSWORD: "db-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-secret",
      GITHUB_TOKEN: "github-secret",
      DATABASE_URL: "db-url",
      PGPASSWORD: "old-password",
      PGSSLMODE: "old-mode",
    });
    assert.deepEqual(childEnv, {
      PATH: "safe-path",
      DOCKER_HOST: "docker-context",
    });
  });
  it("does not mark an extract complete before GPG verification and copy hashes pass", () => {
    assert.match(
      exportHelperSource,
      /await runGpgVerification\(gpgPath, partialPath, databasePassword\)/u,
    );
    assert.match(exportScriptSource, /Get-FileHash .*SHA256/u);
    assert.match(exportScriptSource, /\$localHash -cne \$drivePartialHash/u);
    assert.match(exportScriptSource, /\$localHash -cne \$driveHash/u);
    assert.match(exportScriptSource, /\$completed = \$true/u);
    assert.match(
      exportScriptSource,
      /finally\s*\{[\s\S]*Remove-Item .*localPartialPath/su,
    );
  });
});
