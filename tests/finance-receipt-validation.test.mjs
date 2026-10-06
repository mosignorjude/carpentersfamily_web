import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/finance-receipt-validation.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const validation = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const boundedSource = await readFile(
  new URL("../src/lib/bounded-form-data.ts", import.meta.url),
  "utf8",
);
const boundedCompiled = ts.transpileModule(boundedSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const bounded = await import(
  `data:text/javascript;base64,${Buffer.from(boundedCompiled).toString("base64")}`
);
const { MAX_RECEIPT_BYTES, validateReceiptBytes } = validation;
const { readBoundedFormData } = bounded;

const pdfBytes = new TextEncoder().encode("%PDF-1.7 receipt");
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("receipt file validation", () => {
  it("accepts PDF, JPEG, and PNG only when extension, MIME, and content agree", () => {
    assert.equal(
      validateReceiptBytes("receipt.pdf", "application/pdf", pdfBytes)
        ?.contentType,
      "application/pdf",
    );
    assert.equal(
      validateReceiptBytes("receipt.jpeg", "image/jpeg", jpegBytes)
        ?.extension,
      "jpeg",
    );
    assert.equal(
      validateReceiptBytes("receipt.png", "image/png", pngBytes)?.extension,
      "png",
    );
  });

  it("rejects empty, over-limit, renamed, and signature-spoofed files", () => {
    assert.equal(validateReceiptBytes("empty.pdf", "application/pdf", new Uint8Array()), null);
    assert.equal(
      validateReceiptBytes(
        "large.pdf",
        "application/pdf",
        new Uint8Array(MAX_RECEIPT_BYTES + 1),
      ),
      null,
    );
    assert.equal(
      validateReceiptBytes("script.html", "application/pdf", pdfBytes),
      null,
    );
    assert.equal(
      validateReceiptBytes("fake.pdf", "application/pdf", new TextEncoder().encode("<script>")),
      null,
    );
    assert.equal(
      validateReceiptBytes("fake.png", "image/jpeg", jpegBytes),
      null,
    );
  });

  it("strips path components and neutralizes unsafe filename characters", () => {
    assert.equal(
      validateReceiptBytes("../../club\\<receipt>.pdf", "application/pdf", pdfBytes)
        ?.filename,
      "_receipt_.pdf",
    );
  });

  it("keeps the normalized output filename bounded and inert", () => {
    const result = validateReceiptBytes(
      `${"A".repeat(200)}.pdf`,
      "application/pdf",
      pdfBytes,
    );
    assert.ok(result);
    assert.ok(result.filename.length <= 120);
    assert.doesNotMatch(result.filename, /[\\/\r\n"<>]/);
  });

  it("parses bounded multipart data when Content-Length is absent", async () => {
    const form = new FormData();
    form.set("transactionId", "11111111-1111-1111-1111-111111111111");
    form.set("receipt", new Blob([pdfBytes], { type: "application/pdf" }), "receipt.pdf");
    const request = new Request("https://club.example/api/finance-receipts", {
      method: "POST",
      body: form,
    });

    const result = await readBoundedFormData(request, 1024);
    assert.equal(result.kind, "ok");
    assert.equal(result.form.get("transactionId"), "11111111-1111-1111-1111-111111111111");
  });

  it("rejects a streamed request as soon as it exceeds the request cap", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(16));
        controller.close();
      },
    });
    const request = new Request("https://club.example/api/finance-receipts", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=test" },
      body: stream,
      duplex: "half",
    });

    assert.deepEqual(await readBoundedFormData(request, 8), {
      kind: "too-large",
    });
  });
});
