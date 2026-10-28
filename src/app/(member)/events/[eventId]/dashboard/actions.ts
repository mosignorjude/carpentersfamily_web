"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface VerifyTransactionParams {
  eventId: string;
  transactionId: string;
  decision: "approved" | "rejected";
  reason?: string;
}

export interface VerifyTicketSaleParams {
  eventId: string;
  saleId: string;
  decision: "approved" | "rejected";
  reason?: string;
}

export async function verifyEventFinancialTransactionAction(
  params: VerifyTransactionParams,
): Promise<{ success: boolean; error?: string }> {
  if (!params.transactionId || !params.decision) {
    return {
      success: false,
      error: "Missing required transaction verification parameters.",
    };
  }

  if (
    params.decision === "rejected" &&
    (!params.reason || params.reason.trim().length < 5)
  ) {
    return {
      success: false,
      error:
        "A mandatory explanation of at least 5 characters is required to reject/reverse a transaction.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("verify_event_financial_transaction", {
      p_transaction_id: params.transactionId,
      p_decision: params.decision,
      p_reason: params.reason ? params.reason.trim() : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/events/${params.eventId}/dashboard`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return { success: false, error: message };
  }
}

export async function verifyEventTicketSaleAction(
  params: VerifyTicketSaleParams,
): Promise<{ success: boolean; error?: string }> {
  if (!params.saleId || !params.decision) {
    return {
      success: false,
      error: "Missing required ticket sale verification parameters.",
    };
  }

  if (
    params.decision === "rejected" &&
    (!params.reason || params.reason.trim().length < 5)
  ) {
    return {
      success: false,
      error:
        "A mandatory explanation of at least 5 characters is required to reject/reverse a ticket sale.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("verify_event_ticket_sale", {
      p_sale_id: params.saleId,
      p_decision: params.decision,
      p_reason: params.reason ? params.reason.trim() : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/events/${params.eventId}/dashboard`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return { success: false, error: message };
  }
}
