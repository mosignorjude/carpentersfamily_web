import { Button, Section, Text } from "@react-email/components";
import { BaseEmailLayout } from "@/lib/email/templates/base-layout";

export interface EmailDetailRow {
  label: string;
  value: string;
}

export interface ClubNotificationEmailProps {
  previewText: string;
  eyebrow: string;
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
}: ClubNotificationEmailProps) {
  return (
    <BaseEmailLayout
      previewText={previewText}
      eyebrow={eyebrow}
      heading={heading}
      footerNote={footerNote}
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
