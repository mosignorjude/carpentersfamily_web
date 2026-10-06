import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

export const MAX_RECEIPT_BYTES = 4_194_304;
export const MAX_OBJECT_COUNT = 10_000;
export const MAX_TOTAL_BYTES = 1_073_741_824;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_EXTENSION = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);
const ALLOWED_BUCKET = "club-finance-receipts";

export function validateReceiptObject(record) {
  if (!record || record.bucket_id !== ALLOWED_BUCKET) {
    throw new Error("Unsupported Storage bucket.");
  }
  if (!["club", "event"].includes(record.receipt_kind)) {
    throw new Error("A Storage object is not attached to an available receipt.");
  }
  if (record.status !== "available") {
    throw new Error("A Storage object is not attached to an available receipt.");
  }
  if (!UUID.test(record.receipt_id ?? "") || !UUID.test(record.transaction_id ?? "")) {
    throw new Error("Receipt identifiers are invalid.");
  }
  const extension = MIME_EXTENSION.get(record.content_type);
  if (!extension) throw new Error("Receipt content type is not supported.");
  const prefix = record.receipt_kind === "event" ? "event/" : "";
  const expectedPath = prefix + record.transaction_id + "/" + record.receipt_id + "." + extension;
  if (record.name !== expectedPath) throw new Error("Receipt Storage path is invalid.");

  const size = Number(record.size_bytes);
  const storedSize = Number(record.storage_size_bytes);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_RECEIPT_BYTES || storedSize !== size) {
    throw new Error("Receipt size does not match its Storage metadata.");
  }
  if (record.storage_content_type !== record.content_type) {
    throw new Error("Receipt content type does not match its Storage metadata.");
  }
  if (!/^[0-9a-f]{64}$/.test(record.sha256 ?? "")) {
    throw new Error("Receipt checksum is missing or invalid.");
  }
  return {
    bucketId: record.bucket_id,
    path: record.name,
    receiptId: record.receipt_id,
    transactionId: record.transaction_id,
    receiptKind: record.receipt_kind,
    contentType: record.content_type,
    sizeBytes: size,
    sha256: record.sha256,
    cacheControl: normalizeCacheControl(record.cache_control),
  };
}

function normalizeCacheControl(value) {
  if (typeof value !== "string") return "3600";
  const match = /(?:^|[,; ]*)max-age=(\d{1,8})(?:$|[,; ]*)/i.exec(value);
  return match?.[1] ?? "3600";
}

export function validateReceiptBytes(object, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== object.sizeBytes || bytes.length === 0) {
    throw new Error("Receipt byte length does not match the database record.");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== object.sha256) {
    throw new Error("Receipt bytes failed SHA-256 verification.");
  }
  const validSignature =
    object.contentType === "application/pdf"
      ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
      : object.contentType === "image/jpeg"
        ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : object.contentType === "image/png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : false;
  if (!validSignature) throw new Error("Receipt file signature does not match its content type.");
}

function tarHeader(name, size) {
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(name) || name.startsWith("/") || name.split("/").includes("..")) {
    throw new Error("The encrypted archive entry name is invalid.");
  }
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("The encrypted archive entry size is invalid.");
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "ascii");
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const check = checksum.toString(8).padStart(6, "0");
  header.write(check, 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeOctal(buffer, offset, width, value) {
  const digits = Number(value).toString(8);
  if (digits.length > width - 1) throw new Error("The encrypted archive entry is too large.");
  buffer.write(digits.padStart(width - 1, "0") + "\0", offset, width, "ascii");
}

async function writeBuffer(stream, buffer) {
  if (!stream.write(buffer)) await once(stream, "drain");
}

async function writeTarEntry(stream, name, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await writeBuffer(stream, tarHeader(name, bytes.length));
  await writeBuffer(stream, bytes);
  const padding = (512 - (bytes.length % 512)) % 512;
  if (padding > 0) await writeBuffer(stream, Buffer.alloc(padding));
}

function createClientForAuth(url, publicKey) {
  return createClient(url, publicKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function authorizeBackupOperator(config) {
  const client = createClientForAuth(config.supabaseUrl, config.publishableKey);
  const { data: sessionData, error: signInError } = await client.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  config.password = "";
  if (signInError || !sessionData.user) throw new Error("Admin sign-in failed.");
  const { data: profile, error: profileError } = await client
    .from("member_profiles")
    .select("id,status")
    .eq("id", sessionData.user.id)
    .maybeSingle();
  const { data: assignments, error: roleError } = await client
    .from("member_role_assignments")
    .select("role,revoked_at")
    .eq("member_id", sessionData.user.id)
    .is("revoked_at", null);
  if (profileError || roleError || profile?.status !== "active") {
    throw new Error("The signed-in account is not an active club member.");
  }
  const roles = new Set((assignments ?? []).map((entry) => entry.role));
  if (!roles.has("admin") && !roles.has("backup_admin")) {
    throw new Error("Only an active Admin or Backup Admin can back up receipt files.");
  }
  return {
    client,
    role: roles.has("admin") ? "admin" : "backup_admin",
  };
}

async function downloadAuthorizedReceipt(client, object) {
  const { data, error } = await client.storage.from(object.bucketId).download(object.path);
  if (error || !data) throw new Error("An RLS-authorized receipt download failed.");
  const bytes = Buffer.from(await data.arrayBuffer());
  validateReceiptBytes(object, bytes);
  return bytes;
}

function buildManifest(config, objects, actorRole) {
  return {
    format: "cfsc-storage-backup-v1",
    projectRef: config.projectRef,
    createdAtUtc: new Date().toISOString(),
    bucketIds: [...new Set(objects.map((object) => object.bucketId))],
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
    objects: objects.map((object, index) => ({
      archiveEntry: "objects/" + String(index + 1).padStart(8, "0"),
      bucketId: object.bucketId,
      path: object.path,
      receiptKind: object.receiptKind,
      receiptId: object.receiptId,
      transactionId: object.transactionId,
      contentType: object.contentType,
      sizeBytes: object.sizeBytes,
      sha256: object.sha256,
      cacheControl: object.cacheControl,
    })),
    storageReadRole: actorRole,
  };
}

export function validateArchiveManifest(manifest) {
  if (
    !manifest ||
    manifest.format !== "cfsc-storage-backup-v1" ||
    !/^[a-z0-9]{20}$/i.test(manifest.projectRef ?? "") ||
    !Array.isArray(manifest.objects) ||
    manifest.objects.length > MAX_OBJECT_COUNT
  ) {
    throw new Error("The encrypted Storage archive manifest is invalid.");
  }
  let totalBytes = 0;
  const entries = new Set();
  const paths = new Set();
  for (let index = 0; index < manifest.objects.length; index += 1) {
    const object = manifest.objects[index];
    const expectedEntry = "objects/" + String(index + 1).padStart(8, "0");
    if (object.archiveEntry !== expectedEntry || entries.has(object.archiveEntry)) {
      throw new Error("The encrypted Storage archive entry list is invalid.");
    }
    entries.add(object.archiveEntry);
    const normalized = validateReceiptObject({
      bucket_id: object.bucketId,
      name: object.path,
      receipt_kind: object.receiptKind,
      receipt_id: object.receiptId,
      transaction_id: object.transactionId,
      content_type: object.contentType,
      size_bytes: object.sizeBytes,
      storage_size_bytes: object.sizeBytes,
      storage_content_type: object.contentType,
      sha256: object.sha256,
      cache_control: object.cacheControl,
      status: "available",
    });
    const pathKey = normalized.bucketId + "\0" + normalized.path;
    if (paths.has(pathKey)) throw new Error("The archive repeats a Storage object.");
    paths.add(pathKey);
    totalBytes += normalized.sizeBytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("The Storage archive exceeds the backup size limit.");
  }
  if (Number(manifest.objectCount) !== manifest.objects.length || Number(manifest.totalBytes) !== totalBytes) {
    throw new Error("The Storage archive manifest totals do not match its entries.");
  }
  return { objectCount: manifest.objects.length, totalBytes };
}

function startGpg(gpgPath, args, stdio) {
  return spawn(gpgPath, args, { stdio, windowsHide: false, shell: false });
}

export async function writeStorageTar(stream, manifest, objectEntries) {
  validateArchiveManifest(manifest);
  await writeTarEntry(stream, "manifest.json", Buffer.from(JSON.stringify(manifest), "utf8"));
  let count = 0;
  for await (const entry of objectEntries) {
    const metadata = manifest.objects[count];
    if (!metadata || entry.name !== metadata.archiveEntry) {
      throw new Error("The Storage archive object order is invalid.");
    }
    const bytes = Buffer.from(entry.bytes);
    validateReceiptBytes({
      sizeBytes: Number(metadata.sizeBytes),
      sha256: metadata.sha256,
      contentType: metadata.contentType,
    }, bytes);
    await writeTarEntry(stream, entry.name, bytes);
    count += 1;
  }
  if (count !== manifest.objects.length) {
    throw new Error("The Storage archive object count is incomplete.");
  }
  await writeBuffer(stream, Buffer.alloc(1024));
}

async function encryptStorageTar(config, gpgPath, outputPath, objects, client, actorRole) {
  const manifest = buildManifest(config, objects, actorRole);
  validateArchiveManifest(manifest);
  const gpg = startGpg(
    gpgPath,
    [
      "--no-symkey-cache",
      "--pinentry-mode", "ask",
      "--force-mdc",
      "--s2k-mode", "3",
      "--s2k-digest-algo", "SHA256",
      "--s2k-count", "65011712",
      "--symmetric",
      "--cipher-algo", "AES256",
      "--compress-algo", "ZIP",
      "--output", outputPath,
    ],
    ["pipe", "ignore", "pipe"],
  );
  let stderr = "";
  gpg.stderr.setEncoding("utf8");
  gpg.stderr.on("data", (chunk) => {
    if (stderr.length < 4096) stderr += chunk.slice(0, 4096 - stderr.length);
  });
  const closed = once(gpg, "close");
  try {
    async function* downloadEntries() {
      for (const [index, object] of objects.entries()) {
        const bytes = await downloadAuthorizedReceipt(client, object);
        yield {
          name: manifest.objects[index].archiveEntry,
          bytes,
        };
      }
    }
    await writeStorageTar(gpg.stdin, manifest, downloadEntries());
    gpg.stdin.end();
    const [code] = await closed;
    if (code !== 0) throw new Error("GnuPG could not finish the Storage archive.");
  } catch (error) {
    gpg.stdin.destroy();
    if (gpg.exitCode === null) gpg.kill();
    await closed.catch(() => {});
    throw error;
  }
  return {
    objectCount: manifest.objectCount,
    totalBytes: manifest.totalBytes,
    storageReadRole: actorRole,
  };
}

export async function createEncryptedStorageArchive(config, gpgPath, outputPath) {
  if (!/^[a-z0-9]{20}$/i.test(config.projectRef ?? "")) {
    throw new Error("The linked Supabase project reference is invalid.");
  }
  const objects = (config.objects ?? []).map(validateReceiptObject);
  if (objects.length > MAX_OBJECT_COUNT) throw new Error("The Storage object count exceeds the backup limit.");
  const totalBytes = objects.reduce((sum, object) => sum + object.sizeBytes, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("The Storage archive exceeds the backup size limit.");
  const uniquePaths = new Set(objects.map((object) => object.bucketId + "\0" + object.path));
  if (uniquePaths.size !== objects.length) throw new Error("The database returned a duplicate Storage object.");

  let client = null;
  let actorRole = "not required; no receipt objects";
  if (objects.length > 0) {
    if (!config.publishableKey || !config.email || !config.password) {
      throw new Error("A signed-in backup operator is required when receipt objects exist.");
    }
    if (config.supabaseUrl !== "https://" + config.projectRef + ".supabase.co") {
      throw new Error("The Supabase URL does not match the confirmed linked project.");
    }
    const authorized = await authorizeBackupOperator(config);
    client = authorized.client;
    actorRole = authorized.role;
  }
  return encryptStorageTar(config, gpgPath, outputPath, objects, client, actorRole);
}

function parseOctal(buffer) {
  const text = buffer.toString("ascii").replace(/\0.*$/s, "").trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error("The encrypted tar archive contains an invalid size.");
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) throw new Error("The encrypted tar archive contains an invalid size.");
  return value;
}

function makeTarReader(stream) {
  const iterator = stream[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  return {
    async read(length) {
      while (pending.length < length) {
        const next = await iterator.next();
        if (next.done) {
          if (pending.length === 0) return null;
          throw new Error("The encrypted tar archive is truncated.");
        }
        pending = Buffer.concat([pending, Buffer.from(next.value)]);
      }
      const result = pending.subarray(0, length);
      pending = pending.subarray(length);
      return result;
    },
    async drainZeroes() {
      if (pending.some((byte) => byte !== 0)) throw new Error("The encrypted tar archive has trailing data.");
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        if (Buffer.from(next.value).some((byte) => byte !== 0)) {
          throw new Error("The encrypted tar archive has trailing data.");
        }
      }
    },
  };
}

export async function* readTarEntries(stream) {
  const reader = makeTarReader(stream);
  for (;;) {
    const header = await reader.read(512);
    if (header === null) throw new Error("The encrypted tar archive has no end marker.");
    if (header.every((byte) => byte === 0)) {
      await reader.drainZeroes();
      return;
    }
    const expectedChecksum = Number.parseInt(header.toString("ascii", 148, 154), 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (!Number.isInteger(expectedChecksum) || expectedChecksum !== actualChecksum) {
      throw new Error("The encrypted tar archive header failed its checksum.");
    }
    if (header.toString("ascii", 257, 263) !== "ustar\0") {
      throw new Error("The encrypted tar archive format is unsupported.");
    }
    const type = header[156];
    if (type !== 0 && type !== "0".charCodeAt(0)) {
      throw new Error("The encrypted tar archive contains an unsupported entry type.");
    }
    const name = header.toString("ascii", 0, 100).replace(/\0.*$/s, "");
    const size = parseOctal(header.subarray(124, 136));
    if (size > 64 * 1024 * 1024 && name === "manifest.json") {
      throw new Error("The encrypted Storage archive manifest is too large.");
    }
    if (size > MAX_RECEIPT_BYTES && name !== "manifest.json") {
      throw new Error("A Storage archive object exceeds the receipt size limit.");
    }
    const content = await reader.read(size);
    if (content === null) throw new Error("The encrypted tar archive is truncated.");
    const padding = (512 - (size % 512)) % 512;
    if (padding > 0 && await reader.read(padding) === null) {
      throw new Error("The encrypted tar archive is truncated.");
    }
    yield { name, content };
  }
}

export function assertLoopbackSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The restore target URL is invalid.");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.port !== "54321" ||
    url.pathname !== "/" ||
    url.search || url.hash || url.username || url.password
  ) {
    throw new Error("Storage restore accepts only the local Supabase endpoint at port 54321.");
  }
  return url.origin;
}

export async function restoreEncryptedStorageArchive(config, gpgPath, archivePath) {
  const localUrl = assertLoopbackSupabaseUrl(config.supabaseUrl);
  if (!config.localServiceRoleKey) throw new Error("The local Supabase service key is required for isolated restore.");
  const client = createClient(localUrl, config.localServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const gpg = startGpg(
    gpgPath,
    ["--no-symkey-cache", "--pinentry-mode", "ask", "--decrypt", archivePath],
    ["ignore", "pipe", "pipe"],
  );
  let stderr = "";
  gpg.stderr.setEncoding("utf8");
  gpg.stderr.on("data", (chunk) => {
    if (stderr.length < 4096) stderr += chunk.slice(0, 4096 - stderr.length);
  });
  const closed = once(gpg, "close");
  try {
    const entries = readTarEntries(gpg.stdout);
    const first = await entries.next();
    if (first.done || first.value.name !== "manifest.json" || first.value.content.length > 64 * 1024 * 1024) {
      throw new Error("The encrypted Storage archive manifest is missing or too large.");
    }
    const manifest = JSON.parse(first.value.content.toString("utf8"));
    const totals = validateArchiveManifest(manifest);
    for (const object of manifest.objects) {
      const entry = await entries.next();
      if (entry.done || entry.value.name !== object.archiveEntry) {
        throw new Error("The encrypted Storage archive object order is invalid.");
      }
      const normalized = validateReceiptObject({
        bucket_id: object.bucketId,
        name: object.path,
        receipt_kind: object.receiptKind,
        receipt_id: object.receiptId,
        transaction_id: object.transactionId,
        content_type: object.contentType,
        size_bytes: object.sizeBytes,
        storage_size_bytes: object.sizeBytes,
        storage_content_type: object.contentType,
        sha256: object.sha256,
        cache_control: object.cacheControl,
        status: "available",
      });
      validateReceiptBytes(normalized, entry.value.content);
      const { error: uploadError } = await client.storage.from(normalized.bucketId).upload(
        normalized.path,
        entry.value.content,
        { upsert: true, contentType: normalized.contentType, cacheControl: normalized.cacheControl },
      );
      if (uploadError) throw new Error("The local Storage restore upload failed.");
      const { data: restored, error: downloadError } = await client.storage
        .from(normalized.bucketId)
        .download(normalized.path);
      if (downloadError || !restored) throw new Error("The restored local Storage object could not be read.");
      validateReceiptBytes(normalized, Buffer.from(await restored.arrayBuffer()));
    }
    const extra = await entries.next();
    if (!extra.done) throw new Error("The encrypted Storage archive contains an unexpected entry.");
    const [code] = await closed;
    if (code !== 0) throw new Error("GnuPG could not verify the encrypted Storage archive.");
    return { objectCount: totals.objectCount, totalBytes: totals.totalBytes };
  } catch (error) {
    if (gpg.exitCode === null) gpg.kill();
    await closed.catch(() => {});
    if (error instanceof SyntaxError) throw new Error("The encrypted Storage archive manifest is invalid.");
    throw error;
  }
}

async function readJsonInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const data = Buffer.concat(chunks).toString("utf8");
  if (!data || Buffer.byteLength(data) > 16 * 1024 * 1024) {
    throw new Error("The backup operator input is missing or too large.");
  }
  return JSON.parse(data);
}

async function main() {
  const [operation, gpgPath, filePath] = process.argv.slice(2);
  if (!gpgPath || !filePath || !["backup", "restore"].includes(operation)) {
    throw new Error("Use the PowerShell backup or restore wrapper.");
  }
  const config = await readJsonInput();
  const result = operation === "backup"
    ? await createEncryptedStorageArchive(config, gpgPath, filePath)
    : await restoreEncryptedStorageArchive(config, gpgPath, filePath);
  process.stdout.write(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeMessage = error instanceof Error ? error.message : "Backup operation failed.";
    process.stderr.write(safeMessage + "\n");
    process.exitCode = 1;
  });
}