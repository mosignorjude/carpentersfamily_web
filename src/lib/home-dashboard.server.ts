import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getHomeDashboardData as loadHomeDashboardData,
  announcementPreview as makeAnnouncementPreview,
} from "./home-dashboard.mjs";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export interface HomeDashboardDues {
  coveredMonth: string;
  amountNgn: number;
  status: "paid" | "unpaid" | "written_off";
  dueDate: string;
  isOverdue: boolean;
  receipt?: {
    paymentId: string;
    amountNgn: number;
    paymentDate: string;
    recordedAt: string;
    correctedAt: string | null;
  };
}

export interface HomeDashboardEvent {
  id: string;
  title: string;
  eventType: "meeting" | "party" | "other";
  startsAt: string;
  location: string;
  budgetEnabled: boolean;
  incomeEnabled: boolean;
  expensesEnabled: boolean;
  ticketingEnabled: boolean;
  attendanceEnabled?: boolean;
  attendanceStatus?:
    | "present"
    | "late"
    | "absent"
    | "rejected"
    | "unavailable"
    | null;
}

export interface HomeDashboardAnnouncement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  priority?: "standard" | "important" | "urgent";
  expiresAt?: string | null;
}

export type HomeDashboardPriorityUpdate =
  | {
      kind: "announcement";
      id: string;
      title: string;
      message: string;
      priority: "important" | "urgent";
      createdAt: string;
      expiresAt: string | null;
    }
  | {
      kind: "event";
      id: string;
      title: string;
      eventType: "meeting" | "party" | "other";
      startsAt: string;
      location: string;
      priority: "upcoming";
    };

export interface HomeDashboardPriorityUpdates {
  unavailable: boolean;
  rows: HomeDashboardPriorityUpdate[];
}

export interface HomeDashboardActivity {
  id: string;
  category: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  href: string;
}

export interface HomeDashboardTicketTier {
  id: string;
  name: string;
  capacity: number;
  sold: number;
  retired: boolean;
}

export interface HomeDashboardEventOverview {
  unavailable: boolean;
  event: HomeDashboardEvent | null;
  budgetNgn: number | null;
  budgetUnavailable: boolean;
  financeUnavailable: boolean;
  ticketingUnavailable: boolean;
  capacity: number | null;
  ticketsSold: number | null;
  ticketIncomeNgn: number | null;
  eventIncomeNgn: number | null;
  expensesNgn: number | null;
  netResultNgn: number | null;
  tiers: HomeDashboardTicketTier[];
}

export interface HomeDashboardFinanceSummary {
  unavailable: boolean;
  duesIncomeNgn?: number;
  otherIncomeNgn?: number;
  revenueNgn?: number;
  expensesNgn?: number;
  balanceNgn?: number;
}

interface DashboardSection<T> {
  unavailable: boolean;
  rows: T[];
}

export interface HomeDashboardData {
  currentMonth: string | null;
  currentYear: string | null;
  dues: DashboardSection<HomeDashboardDues>;
  events: DashboardSection<HomeDashboardEvent>;
  upcomingEventCount: { unavailable: boolean; count: number | null };
  announcements: DashboardSection<HomeDashboardAnnouncement>;
  priorityUpdates: HomeDashboardPriorityUpdates;
  ticketSales: { unavailable: boolean; count: number | null };
  clubFinance: HomeDashboardFinanceSummary;
  eventOverview: HomeDashboardEventOverview;
  activity: DashboardSection<HomeDashboardActivity> & {
    unreadCount: number | null;
    unreadCountUnavailable: boolean;
  };
}

export function getHomeDashboardData(
  supabase: ServerSupabaseClient,
  memberId: string,
  now: Date = new Date(),
): Promise<HomeDashboardData> {
  return loadHomeDashboardData(supabase, memberId, now);
}

export function announcementPreview(
  message: string,
  maximumLength = 240,
): string {
  return makeAnnouncementPreview(message, maximumLength);
}
