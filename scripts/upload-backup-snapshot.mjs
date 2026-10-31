import {
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { resolveR2Config } from "../src/lib/r2/config.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const inputDir = path.resolve(argument("--in-dir", ""));
const prefix = (argument("--prefix", "backups/production")).replace(/^\/+|\/+$/g, "");
const retentionDays = Number(argument("--retention-days", "90"));
const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  throw new Error(message);
}

function requireConfig() {
  const config = resolveR2Config();
  if (!config) {
    fail("R2 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.");
  }
  return config;
}

function uploadFiles(directory) {
  if (!existsSync(directory)) fail(`The backup directory does not exist: ${directory}`);
  const manifests = readdirSync(directory).filter((name) => name.endsWith(".manifest.json"));
  if (manifests.length !== 1) {
    fail(`Expected exactly one *.manifest.json in ${directory}, found ${manifests.length}.`);
  }
  const manifestName = manifests[0];
  const manifest = JSON.parse(readFileSync(path.join(directory, manifestName), "utf8"));
  const names = [manifest.databaseFile, manifest.receiptsFile, manifestName].filter(Boolean);
  for (const name of names) {
    const file = path.join(directory, name);
    if (!existsSync(file)) fail(`The manifest references a missing file: ${name}`);
  }
  return names;
}

async function main() {
  if (!inputDir) fail("Pass --in-dir with the folder holding the encrypted snapshot.");
  if (!Number.isInteger(retentionDays) || retentionDays < 7) {
    fail("--retention-days must be an integer of at least 7.");
  }

  const config = requireConfig();
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

  // Archives first, manifest last: the manifest is the completion marker.
  const names = uploadFiles(inputDir);
  for (const name of names) {
    const file = path.join(inputDir, name);
    const bytes = statSync(file).size;
    const key = `${prefix}/${name}`;
    if (dryRun) {
      console.log(`Would upload ${file} (${bytes} bytes) to r2://${config.bucketName}/${key}`);
      continue;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: readFileSync(file),
        ContentType: name.endsWith(".json") ? "application/json" : "application/octet-stream",
      }),
    );
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.bucketName, Key: key }),
    );
    if (Number(head.ContentLength) !== bytes) {
      fail(`Uploaded size mismatch for ${key}: local ${bytes}, remote ${head.ContentLength}.`);
    }
    console.log(`Uploaded ${key} (${bytes} bytes).`);
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const expired = [];
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: `${prefix}/`,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < cutoff) {
        expired.push({ Key: object.Key });
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  if (expired.length === 0) {
    console.log(`No backups older than ${retentionDays} days under ${prefix}/.`);
  } else if (dryRun) {
    console.log(`Would delete ${expired.length} expired object(s) older than ${retentionDays} days:`);
    for (const object of expired) console.log(`  ${object.Key}`);
  } else {
    for (let index = 0; index < expired.length; index += 1000) {
      const batch = expired.slice(index, index + 1000);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucketName,
          Delete: { Objects: batch, Quiet: true },
        }),
      );
    }
    console.log(`Deleted ${expired.length} expired object(s) older than ${retentionDays} days.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`Backup upload failed: ${error.message}`);
  process.exitCode = 1;
}
