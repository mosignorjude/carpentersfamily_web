import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { resolveR2Config } from "@/lib/r2/config.mjs";

let cached: { key: string; client: S3Client } | null = null;

export function isReceiptStorageConfigured() {
  return resolveR2Config() !== null;
}

export function getReceiptBucketName() {
  return resolveR2Config()?.bucketName ?? null;
}

export function getReceiptStorageClient() {
  const config = resolveR2Config();
  if (!config) return null;

  const key = `${config.endpoint}|${config.accessKeyId}|${config.bucketName}`;
  if (cached?.key === key) return cached.client;

  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cached = { key, client };
  return client;
}
