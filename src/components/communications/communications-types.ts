export type AnnouncementPriority = "standard" | "important" | "urgent";

export interface AnnouncementRevisionItem {
  id: string;
  revisionNumber: number;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  expiresAt: string | null;
  editedAt: string;
  reason: string;
}

export interface AnnouncementItem {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  title: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  revisionNumber: number;
  priority: AnnouncementPriority;
  expiresAt: string | null;
  isRead: boolean;
  readStatusUnavailable: boolean;
  canManage: boolean;
  revisions: AnnouncementRevisionItem[];
}

export interface PollOptionItem {
  optionId: string;
  position: number;
  label: string;
  votes: number | null;
  hasVoted: boolean;
  resultsVisible: boolean;
}

export interface PollRevisionItem {
  id: string;
  revisionNumber: number;
  question: string;
  pollType: string;
  options: string[];
  closesAt: string;
  editedAt: string;
  reason: string;
}

export interface PollItem {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  question: string;
  pollType: "yes_no" | "multiple_choice";
  createdAt: string;
  closesAt: string;
  lockedAt: string | null;
  revisionNumber: number;
  options: PollOptionItem[];
  hasVoted: boolean;
  resultsVisible: boolean;
  totalVotes: number | null;
  state: "unavailable" | "released" | "hidden" | "loading";
  isOpen: boolean;
  isClosingSoon: boolean;
  canManage: boolean;
  durationMinutes: number;
  revisions: PollRevisionItem[];
}

export interface EventOption {
  id: string;
  title: string;
  archivedAt: string | null;
}
