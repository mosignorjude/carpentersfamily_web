import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

async function loadApiSchemas() {
  const source = await readFile(
    new URL("../src/lib/ai/api-schemas.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

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
});
