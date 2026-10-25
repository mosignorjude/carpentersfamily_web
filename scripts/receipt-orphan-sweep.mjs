import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const isDryRun = process.argv.includes("--dry-run");
const olderThanHoursArgIndex = process.argv.indexOf("--older-than-hours");
const olderThanHours =
  olderThanHoursArgIndex !== -1 && process.argv[olderThanHoursArgIndex + 1]
    ? Number(process.argv[olderThanHoursArgIndex + 1])
    : 2;
const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
  console.error("Missing R2 configuration in environment.");
  process.exit(1);
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSweep() {
  console.log(
    `Starting R2 receipt orphan sweep (dryRun: ${isDryRun}, cutoff: ${cutoffTime.toISOString()})...`,
  );

  // 1. Fetch all DB object keys
  const { data: dbRows, error: dbError } = await supabase
    .from("finance_receipts")
    .select("object_key");

  if (dbError) {
    console.error("Failed to query finance_receipts:", dbError.message);
    process.exit(1);
  }

  const dbKeys = new Set((dbRows || []).map((r) => r.object_key));
  console.log(`Found ${dbKeys.size} valid receipt keys in database.`);

  // 2. Scan R2 prefix receipts/
  let continuationToken = undefined;
  let scannedCount = 0;
  let orphanCount = 0;

  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: "receipts/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of listRes.Contents || []) {
      scannedCount++;
      if (
        !dbKeys.has(obj.Key) &&
        obj.LastModified &&
        obj.LastModified < cutoffTime
      ) {
        orphanCount++;
        console.log(
          `[ORPHAN] ${obj.Key} (modified ${obj.LastModified.toISOString()})`,
        );
        if (!isDryRun) {
          await s3.send(
            new DeleteObjectCommand({ Bucket: bucketName, Key: obj.Key }),
          );
          console.log(`  Deleted ${obj.Key}`);
        }
      }
    }

    continuationToken = listRes.NextContinuationToken;
  } while (continuationToken);

  console.log(
    `Sweep complete: scanned ${scannedCount} objects, found ${orphanCount} orphans.`,
  );
}

runSweep().catch((err) => {
  console.error("Sweep failed:", err);
  process.exit(1);
});
