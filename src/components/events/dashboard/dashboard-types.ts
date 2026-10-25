export type DashboardTab =
  | "overview"
  | "tickets"
  | "expenses"
  | "budget"
  | "revenue"
  | "reports"
  | "team_roles"
  | "audit_log";

export type TicketTierStatus = "active" | "sold_out" | "limited";

export interface DashboardTicketTier {
  id: string;
  name: string;
  price: number;
  sold: number;
  capacity: number;
  description: string;
  benefits: string[];
  status: TicketTierStatus;
}

export type RevenueCategory =
  | "ticket_sales"
  | "bar_merch"
  | "sponsorships"
  | "vendor_booths"
  | "donations"
  | (string & {});

export interface RevenueStreamBreakdown {
  source: string;
  amount: number;
  status: "received" | "projected" | "invoiced";
}

export interface DashboardRevenueStream {
  id: RevenueCategory;
  name: string;
  target: number;
  actual: number;
  pending: number;
  description: string;
  breakdown: RevenueStreamBreakdown[];
}

export type ExpenseCategory =
  | "talent_booking"
  | "venue_production"
  | "marketing_promotion"
  | "operations_safety"
  | (string & {});

export interface ExpenseItem {
  name: string;
  allocated: number;
  spent: number;
  vendor: string;
}

export interface DashboardCostCenter {
  id: ExpenseCategory;
  name: string;
  allocated: number;
  percentage?: number;
  categoryId?: string;
  spent: number;
  committed: number;
  items: ExpenseItem[];
}

export type TransactionType = "revenue" | "expense";

export interface DashboardTransaction {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  categoryLabel: string;
  description: string;
  amount: number;
  payerPayee: string;
  paymentMethod: string;
  paymentRef?: string;
  paymentStatus?: string;
  receipt?: {
    id: string;
    filename: string;
    contentType: string;
    sizeBytes?: number;
  } | null;
  isLegacy?: boolean;
  authorizedBy: string;
  authorizerRole: string;
  receiptFileName?: string;
  receiptSize?: string;
  status: "posted" | "voided";
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
  notes?: string;
}

export interface ActivityLogItem {
  id: string;
  action: string;
  category: string;
  details: string;
  user: string;
  userRole: string;
  timestamp: string;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: "info" | "warning" | "success";
}

export interface DashboardTeamMember {
  id: string;
  name: string;
  role: string;
  chapter: string;
  phone?: string;
}

export interface DashboardEventInfo {
  id: string;
  title: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt?: string;
  dateFormatted: string;
  timeWAT: string;
  location: string;
  details?: string;
  budgetCeiling: number;
  archivedAt?: string | null;
  dressCode?: string;
  attendanceEnabled?: boolean;
  minutesEnabled?: boolean;
}

export interface EventFinanceCategoryItem {
  id: string;
  category_type: "budget_allocation" | "expense" | "revenue";
  name: string;
  created_at: string;
  retired_at: string | null;
}
