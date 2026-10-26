import { Button, Section, Text } from "@react-email/components";
import { BaseEmailLayout } from "@/lib/email/templates/base-layout";

export interface EmailDetailRow {
  label: string;
  value: string;
}

export type NotificationCategory =
  | "membership"
  | "account_security"
  | "governance"
  | "dues"
  | "event"
  | "meeting"
  | "announcement"
  | "poll"
  | "attendance";

interface CategoryCopy {
  eyebrow: string;
  footerNote: string;
}

export const NOTIFICATION_CATEGORY_COPY: Record<
  NotificationCategory,
  CategoryCopy
> = {
  membership: {
    eyebrow: "Membership",
    footerNote:
      "Questions about your membership? Reply to this email and club leadership will help.",
  },
  account_security: {
    eyebrow: "Account Security",
    footerNote:
      "If you did not expect this change, contact club leadership immediately.",
  },
  governance: {
    eyebrow: "Governance & Roles",
    footerNote: "Role changes are recorded in the club governance audit trail.",
  },
  dues: {
    eyebrow: "Dues & Finance",
    footerNote:
      "Your dues ledger and receipts are always available in the member portal.",
  },
  event: {
    eyebrow: "Club Events",
    footerNote:
      "Event details can change; the portal always shows the latest schedule.",
  },
  meeting: {
    eyebrow: "Club Meetings",
    footerNote:
      "Meeting reminders are sent 24 hours and 2 hours before the start time.",
  },
  announcement: {
    eyebrow: "Club Announcements",
    footerNote:
      "Announcements are published on the club board for every active member.",
  },
  poll: {
    eyebrow: "Club Poll",
    footerNote: "Each member may cast one final vote while the poll is open.",
  },
  attendance: {
    eyebrow: "Event Attendance",
    footerNote:
      "Attendance can only be recorded while the check-in session is open.",
  },
};

export interface ClubNotificationEmailProps {
  previewText: string;
  eyebrow?: string;
  heading: string;
  greeting?: string;
  intro: string;
  detailsTitle?: string;
  details?: readonly EmailDetailRow[];
  bodyLabel?: string;
  bodyText?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  category?: NotificationCategory;
}

export function ClubNotificationEmail({
  previewText,
  eyebrow,
  heading,
  greeting,
  intro,
  detailsTitle = "Summary",
  details = [],
  bodyLabel,
  bodyText,
  ctaLabel,
  ctaUrl,
  footerNote,
  category,
}: ClubNotificationEmailProps) {
  const categoryCopy = category ? NOTIFICATION_CATEGORY_COPY[category] : null;

  return (
    <BaseEmailLayout
      previewText={previewText}
      eyebrow={eyebrow ?? categoryCopy?.eyebrow ?? "Carpenters Family"}
      heading={heading}
      footerNote={footerNote ?? categoryCopy?.footerNote}
    >
      {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
      <Text style={styles.paragraph}>{intro}</Text>

      {details.length > 0 ? (
        <Section style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>{detailsTitle}</Text>
          {details.map((row, index) => (
            <Text
              key={row.label}
              style={
                index === details.length - 1
                  ? styles.summaryRowLast
                  : styles.summaryRow
              }
            >
              <strong>{row.label}:</strong> {row.value}
            </Text>
          ))}
        </Section>
      ) : null}

      {bodyText ? (
        <Section style={styles.messageBox}>
          {bodyLabel ? (
            <Text style={styles.messageLabel}>{bodyLabel}</Text>
          ) : null}
          <Text style={styles.messageText}>{bodyText}</Text>
        </Section>
      ) : null}

      {ctaLabel && ctaUrl ? (
        <Section style={styles.ctaSection}>
          <Button href={ctaUrl} style={styles.button}>
            {ctaLabel}
          </Button>
        </Section>
      ) : null}
    </BaseEmailLayout>
  );
}

const styles = {
  greeting: {
    color: "#3D291F",
    fontSize: "15px",
    fontWeight: "600",
    lineHeight: "1.5",
    margin: "0 0 10px",
  },
  paragraph: {
    color: "#3D291F",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 20px",
  },
  summaryBox: {
    backgroundColor: "#FAF6F0",
    border: "1px solid #E5DDD3",
    borderRadius: "10px",
    padding: "16px 20px",
    margin: "0 0 20px",
  },
  summaryTitle: {
    color: "#174C37",
    fontSize: "12px",
    fontWeight: "700",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 10px",
  },
  summaryRow: {
    color: "#3D291F",
    fontSize: "14px",
    lineHeight: "1.5",
    margin: "0 0 6px",
  },
  summaryRowLast: {
    color: "#3D291F",
    fontSize: "14px",
    lineHeight: "1.5",
    margin: "0",
  },
  messageBox: {
    backgroundColor: "#FFFFFF",
    borderLeft: "4px solid #D6A23A",
    padding: "12px 16px",
    margin: "0 0 24px",
  },
  messageLabel: {
    color: "#6E584C",
    fontSize: "12px",
    fontWeight: "700",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    margin: "0 0 6px",
  },
  messageText: {
    color: "#3D291F",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0",
    whiteSpace: "pre-wrap" as const,
  },
  ctaSection: {
    margin: "8px 0 0",
  },
  button: {
    backgroundColor: "#174C37",
    borderRadius: "10px",
    color: "#FFFFFF",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    padding: "14px 24px",
    textDecoration: "none",
  },
};
