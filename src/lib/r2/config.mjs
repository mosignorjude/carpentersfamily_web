export function resolveR2Config(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = env.R2_BUCKET_NAME?.trim();
  const endpointOverride = env.R2_ENDPOINT?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  const endpoint =
    endpointOverride || `https://${accountId}.r2.cloudflarestorage.com`;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, endpoint };
}
