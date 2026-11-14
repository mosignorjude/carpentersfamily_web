import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let tempDir = null;

async function loadApiSchemas() {
  if (!tempDir) {
    const cacheParent = path.join(projectRoot, "node_modules");
    await mkdir(cacheParent, { recursive: true });
    tempDir = await mkdtemp(path.join(cacheParent, ".tmp-ai-api-"));
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    for (const file of [
      "facts.ts",
      "report-spec.ts",
      "request-guard.ts",
      "api-schemas.ts",
    ]) {
      const source = await readFile(
        path.join(projectRoot, "src", "lib", "ai", file),
        "utf8",
      );
      const compiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
        .replace(/from\s+["']\.\/facts["']/g, 'from "./facts.js"')
        .replace(/from\s+["']\.\/report-spec["']/g, 'from "./report-spec.js"')
        .replace(
          /from\s+["']\.\/request-guard["']/g,
          'from "./request-guard.js"',
        );
      await writeFile(
        path.join(tempDir, file.replace(/\.ts$/, ".js")),
        compiled,
        "utf8",
      );
    }
  }
  return import(pathToFileURL(path.join(tempDir, "api-schemas.js")).href);
}

after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("AI report API schemas and route contracts", () => {
  it("validates generate request payloads strictly by reportType", async () => {
    const schemas = await loadApiSchemas();

    assert.equal(
      schemas.parseGenerateRequest({ reportType: "club_finance" }).ok,
      true,
    );
    assert.equal(schemas.parseGenerateRequest({ reportType: "dues" }).ok, true);
    assert.equal(
      schemas.parseGenerateRequest({
        reportType: "event_finance",
        eventId: "11111111-1111-4111-8111-111111111111",
      }).ok,
      true,
    );
    assert.equal(
      schemas.parseGenerateRequest({ reportType: "event_finance" }).ok,
      false,
    );
    assert.equal(
      schemas.parseGenerateRequest({
        reportType: "club_overview",
        period: "month:2026-10",
      }).ok,
      true,
    );
    assert.equal(
      schemas.parseGenerateRequest({
        reportType: "club_overview",
        period: "invalid",
      }).ok,
      false,
    );
    assert.equal(
      schemas.parseGenerateRequest({ reportType: "arbitrary_sql" }).ok,
      false,
    );
  });

  it("validates narrative edit payloads and rejects malformed IDs", async () => {
    const schemas = await loadApiSchemas();

    assert.equal(schemas.isUuid("11111111-1111-4111-8111-111111111111"), true);
    assert.equal(schemas.isUuid("not-a-uuid"), false);

    assert.equal(
      schemas.parsePatchNarrativeBody({
        content: {
          headline: "Club reserve remains steady at NGN 1,000,000.",
          highlights: ["Dues inflows remained steady across the month."],
          risks: [],
          recommendations: [],
        },
      }).ok,
      true,
    );
    assert.equal(schemas.parsePatchNarrativeBody({ content: {} }).ok, false);
  });

  it("enforces officer auth, same-origin checks, bounded bodies, and maxDuration on AI report routes", () => {
    const readRoute = async (relPath) =>
      readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

    return Promise.all([
      readRoute("src/app/api/ai-reports/route.ts"),
      readRoute("src/app/api/ai-reports/[id]/route.ts"),
      readRoute("src/app/api/ai-reports/[id]/approve/route.ts"),
      readRoute("src/app/api/ai-reports/[id]/regenerate/route.ts"),
      readRoute("src/app/api/reports/overview/route.ts"),
      readRoute("src/app/api/reports/[report]/route.ts"),
      readRoute("src/app/api/events/[eventId]/finance-report/route.ts"),
    ]).then(
      ([
        aiReportsRoute,
        patchRoute,
        approveRoute,
        regenRoute,
        overviewRoute,
        reportsRoute,
        eventFinanceRoute,
      ]) => {
        for (const route of [
          aiReportsRoute,
          patchRoute,
          approveRoute,
          regenRoute,
          overviewRoute,
        ]) {
          assert.match(route, /requireOfficer/);
        }

        for (const mutatingRoute of [
          aiReportsRoute,
          patchRoute,
          approveRoute,
          regenRoute,
        ]) {
          assert.match(mutatingRoute, /isSameSiteOrigin/);
        }

        assert.match(aiReportsRoute, /readBoundedJsonBody/);
        assert.match(patchRoute, /readBoundedJsonBody/);
        assert.match(aiReportsRoute, /export const maxDuration = 30;/);
        assert.match(regenRoute, /export const maxDuration = 30;/);

        for (const pdfRoute of [
          overviewRoute,
          reportsRoute,
          eventFinanceRoute,
        ]) {
          assert.match(pdfRoute, /loadApprovedNarrativeForReport/);
          assert.match(pdfRoute, /renderReportPdf/);
          assert.match(pdfRoute, /createSimplePdf/);
        }
      },
    );
  });

  it("counts custom NL-to-Spec translations against officer quota and documents GROQ_API_KEY in banner", async () => {
    const [customRoute, overviewClient, quotaMigration] = await Promise.all([
      readFile(
        new URL("../src/app/api/ai-reports/custom/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/components/reports/club-overview-client.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20261114120000_ai_translation_quota.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    assert.match(customRoute, /log_ai_custom_translation/);
    assert.match(overviewClient, /GEMINI_API_KEY/);
    assert.match(overviewClient, /GROQ_API_KEY/);
    assert.match(quotaMigration, /log_ai_custom_translation/);
    assert.match(quotaMigration, /ai_report_custom_translated/);
  });
});
