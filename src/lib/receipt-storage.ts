import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getReceiptStorageClient } from "@/lib/r2/client";
import { resolveR2Config } from "@/lib/r2/config.mjs";

export type ReceiptStorage = {
  putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getObject(
    key: string,
  ): Promise<{ bytes: Uint8Array; contentType?: string } | null>;
  deleteObject(key: string): Promise<void>;
};

export function createReceiptStorage(): ReceiptStorage | null {
  const config = resolveR2Config();
  const client = getReceiptStorageClient();
  if (!config || !client) return null;

  return {
    async putObject(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: "private, no-store",
        }),
      );
    },
    async getObject(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
        );
        if (!response.Body) return null;
        const bytes = await response.Body.transformToByteArray();
        return { bytes, contentType: response.ContentType };
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }),
      );
    },
  };
}

export const getR2StorageAdapter = createReceiptStorage;
