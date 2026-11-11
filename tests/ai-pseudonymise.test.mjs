import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let tempDir = null;

async function loadPseudonymise() {
  if (!tempDir) {
    const cacheParent = path.join(projectRoot, "node_modules");
    await mkdir(cacheParent, { recursive: true });
    tempDir = await mkdtemp(path.join(cacheParent, ".tmp-ai-pseudo-"));
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    const source = await readFile(
      path.join(projectRoot, "src", "lib", "ai", "pseudonymise.ts"),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    await writeFile(path.join(tempDir, "pseudonymise.js"), compiled, "utf8");
  }
  return import(pathToFileURL(path.join(tempDir, "pseudonymise.js")).href);
}

after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("Meeting minutes member & contact pseudonymisation", () => {
  it("masks diacritics, mixed case, partial names, usernames, emails, phones, and @handles deterministically", async () => {
    const { createPseudonymSession } = await loadPseudonymise();

    const members = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        full_name: "Chinedu Okafor",
        username: "chinedu_o",
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        full_name: "Ọlámidé Adeyemi",
        username: "olamide.a",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        full_name: "Ngozi Okafor",
        username: "ngozi",
      },
    ];

    const notes =
      "olamide adeyemi called the meeting to order. " +
      "ỌLÁMIDÉ presented the treasury note, while Chinedu Okafor and ngozi seconded. " +
      "Okafor welfare fund was reviewed. Reach treasurer@carpentersfamily.com or +234 803 555 0199 or 08023456789 or @treasury_desk.";

    const session = createPseudonymSession(members, [notes]);
    const { maskedText, stats } = session.maskText(notes);

    // Deterministic sorted ID order: 0001 = Ọlámidé Adeyemi ([Member 1]), 0002 = Chinedu Okafor ([Member 2]), 0003 = Ngozi Okafor ([Member 3])
    assert.doesNotMatch(maskedText, /olamide/i);
    assert.doesNotMatch(maskedText, /adeyemi/i);
    assert.doesNotMatch(maskedText, /chinedu/i);
    assert.doesNotMatch(maskedText, /ngozi/i);
    assert.doesNotMatch(maskedText, /okafor/i);
    assert.doesNotMatch(maskedText, /treasurer@carpentersfamily\.com/i);
    assert.doesNotMatch(maskedText, /803\s*555/);
    assert.doesNotMatch(maskedText, /08023456789/);
    assert.doesNotMatch(maskedText, /@treasury_desk/);

    assert.match(maskedText, /\[Member 1\]/);
    assert.match(maskedText, /\[Member 2\]/);
    assert.match(maskedText, /\[Member 3\]/);
    assert.match(maskedText, /\[Name \d+\]/); // shared surname Okafor
    assert.match(maskedText, /\[Email 1\]/);
    assert.match(maskedText, /\[Phone 1\]/);
    assert.match(maskedText, /\[Phone 2\]/);
    assert.match(maskedText, /\[Handle 1\]/);
    assert.equal(stats.emailsMasked, 1);
    assert.equal(stats.phonesMasked, 2);

    // Unmasking restores original real identities cleanly
    const aiStructured =
      "Attendance: [Member 1], [Member 2], [Member 3]. " +
      "Discussion: [Member 1] reviewed [Name 1] item. " +
      "Action Items: Contact [Email 1], [Phone 1], [Phone 2], [Handle 1].";
    const restored = session.unmaskText(aiStructured);

    assert.match(restored, /Ọlámidé Adeyemi/);
    assert.match(restored, /Chinedu Okafor/);
    assert.match(restored, /Ngozi Okafor/);
    assert.match(restored, /Okafor/);
    assert.match(restored, /treasurer@carpentersfamily\.com/);
    assert.match(restored, /\+234 803 555 0199/);
    assert.match(restored, /08023456789/);
    assert.match(restored, /@treasury_desk/);
    assert.deepEqual(session.findUnresolvedTokens(restored), []);
  });

  it("handles NFD decomposed diacritics, word boundaries, and flags leftover or invented tokens", async () => {
    const { createPseudonymSession, findUnresolvedTokens } =
      await loadPseudonymise();

    const members = [
      {
        id: "00000000-0000-4000-8000-000000000010",
        full_name: "Adaeze Nwosu",
        username: "ada",
      },
      {
        id: "00000000-0000-4000-8000-000000000011",
        full_name: "Ọlámidé Bamidele",
        username: "bami",
      },
    ];

    const nfdNotes =
      "O\u0323la\u0301mide\u0301 coordinated Agenda item (not standard/data word boundary for 'ada').";
    const session = createPseudonymSession(members, [nfdNotes]);
    const { maskedText } = session.maskText(nfdNotes);

    assert.match(maskedText, /^\[Member 2\] coordinated Agenda item/);
    // Must not partially replace 'ada' inside 'standard' or 'data'
    assert.match(maskedText, /standard\/data/);

    // Verify manual guest edits inside already-masked text do not double-mask
    const handEdited = maskedText.replace("Agenda", "[Guest 1] agenda");
    const secondPass = session.maskText(handEdited);
    assert.equal(secondPass.maskedText, handEdited);

    // Invented / hallucinated AI tokens must be detected after unmasking
    const restored = session.unmaskText(
      "[Member 2] assigned [Member 99] and [Email 4] to verify.",
    );
    assert.match(restored, /Ọlámidé Bamidele/);
    assert.deepEqual(findUnresolvedTokens(restored), [
      "[Email 4]",
      "[Member 99]",
    ]);
  });
});
