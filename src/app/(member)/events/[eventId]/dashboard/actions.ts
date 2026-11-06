"use server";

import { revalidatePath } from "next/cache";
import { notifyTicketOrderReviewed } from "@/lib/email/notifications";
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
  decision: "approved" | "rejected" | "cancelled";
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
    (params.decision === "rejected" || params.decision === "cancelled") &&
    (!params.reason || params.reason.trim().length < 5)
  ) {
    return {
      success: false,
      error:
        "A mandatory explanation of at least 5 characters is required to reject or cancel a ticket sale.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("verify_event_ticket_sale", {
      p_sale_id: params.saleId,
      p_decision: params.decision,
      p_reason: params.reason ? params.reason.trim() : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          buyer_email: string | null;
          buyer_name: string;
          public_reference: string | null;
          event_id: string;
          event_title: string;
          tier_name: string;
          quantity: number;
          amount_ngn: number;
        }
      | undefined;

    // A guest order has a buyer email; an officer-recorded sale may have none, and then there is
    // nothing to send. The decision itself is already committed.
    if (row?.buyer_email && row.public_reference) {
      await notifyTicketOrderReviewed({
        saleId: params.saleId,
        publicReference: row.public_reference,
        buyerEmail: row.buyer_email,
        buyerName: row.buyer_name,
        eventTitle: row.event_title,
        tierName: row.tier_name,
        quantity: row.quantity,
        amountNgn: Number(row.amount_ngn),
        decision: params.decision,
        reason: params.reason?.trim() ?? null,
      }).catch((err) =>
        console.error("[Ticket review] confirmation email failed:", err),
      );
    }

    revalidatePath(`/events/${params.eventId}/dashboard`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return { success: false, error: message };
  }
}
