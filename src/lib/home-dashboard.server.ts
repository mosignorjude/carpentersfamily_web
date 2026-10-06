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
  amountNgn: number;
  status: "paid" | "unpaid" | "written_off";
  dueDate: string;
  isOverdue: boolean;
}

export interface HomeDashboardEvent {
  id: string;
  title: string;
  eventType: "meeting" | "party" | "other";
  startsAt: string;
  location: string;
}

export interface HomeDashboardAnnouncement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
}

interface DashboardSection<T> {
  unavailable: boolean;
  rows: T[];
}

export interface HomeDashboardData {
  currentMonth: string | null;
  dues: DashboardSection<HomeDashboardDues>;
  events: DashboardSection<HomeDashboardEvent>;
  announcements: DashboardSection<HomeDashboardAnnouncement>;
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
