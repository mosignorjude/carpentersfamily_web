/**
 * The shapes the public box office reads and writes. They live here, not inside a client component,
 * so that a server route can name them without importing a component.
 */

export interface PublicTicketTier {
  id: string;
  name: string;
  price_ngn: number;
  capacity: number | null;
  /** Approved online + officer-recorded tickets only — see the approved-only rule in the plan header. */
  sold: number;
}

export interface PublicTicketedEvent {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  description: string | null;
  tiers: PublicTicketTier[];
}

export interface PublicBankInfo {
  bank_name: string;
  account_name: string;
  account_number: string;
  instructions: string | null;
}

/** One row of `public.lookup_ticket_order(p_reference, p_email)`, never more. */
export interface TicketOrderStatus {
  public_reference: string;
  event_title: string;
  event_starts_at: string;
  tier_name: string;
  quantity: number;
  amount_ngn: number;
  payment_method: string;
  verification_status: "recorded" | "approved" | "rejected" | "cancelled";
  created_at: string;
  /** Set only for `rejected` and `cancelled`; the officer's explanation, verbatim. */
  outcome_reason: string | null;
}

export interface TicketLookupState {
  status: TicketOrderStatus | null;
  /** True when the reference/email pair matched nothing — the same answer as a wrong reference. */
  notFound: boolean;
  /** A notice code, never a database message. */
  error: string | null;
  pendingReference: string;
}
