import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const FINANCE_RECEIPTS_BUCKET = "club-finance-receipts";
export {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_REQUEST_BYTES,
  validateReceiptBytes,
} from "@/lib/finance-receipt-validation";

export function createReceiptStorageClient() {
  const config = getSupabasePublicConfig();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !secretKey) return null;

  return createClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
