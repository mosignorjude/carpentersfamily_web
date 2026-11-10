import { Button, Section, Text } from "@react-email/components";
import { BaseEmailLayout } from "@/lib/email/templates/base-layout";
import type { EmailDetailRow } from "@/lib/email/templates/club-notification-email";

export interface MonthlyOverviewEmailProps {
  previewText: string;
  heading: string;
  greeting?: string;
  periodLabel: string;
  headline: string;
  aiStatusNote?: string | null;
  details: readonly EmailDetailRow[];
  ctaLabel: string;
  ctaUrl: string;
}

export function MonthlyOverviewEmail({
  previewText,
  heading,
  greeting,
  periodLabel,
  headline,
  aiStatusNote,
  details,
  ctaLabel,
  ctaUrl,
}: MonthlyOverviewEmailProps) {
  return (
    <BaseEmailLayout
      eyebrow="Officer Treasury Overview"
      footerNote="No financial files are attached to email. Sign in to the portal to review, approve, or download the branded PDF."
      heading={heading}
      previewText={previewText}
    >
      {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
      <Text style={styles.paragraph}>
        The monthly club overview for <strong>{periodLabel}</strong> is ready
        for officer review.
      </Text>

      <Section style={styles.headlineBox}>
        <Text style={styles.headlineLabel}>Summary Headline</Text>
        <Text style={styles.headlineText}>{headline}</Text>
        {aiStatusNote ? (
          <Text style={styles.noteText}>{aiStatusNote}</Text>
        ) : null}
      </Section>

      {details.length > 0 ? (
        <Section style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Key Club Figures</Text>
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

      <Section style={styles.ctaSection}>
        <Button href={ctaUrl} style={styles.button}>
          {ctaLabel}
        </Button>
      </Section>
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
    margin: "0 0 18px",
  },
  headlineBox: {
    backgroundColor: "#FFFFFF",
    borderLeft: "4px solid #174C37",
    padding: "12px 16px",
    margin: "0 0 18px",
  },
  headlineLabel: {
    color: "#174C37",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 6px",
  },
  headlineText: {
    color: "#3D291F",
    fontSize: "14px",
    lineHeight: "1.5",
    margin: "0",
  },
  noteText: {
    color: "#8D5B0E",
    fontSize: "13px",
    lineHeight: "1.5",
    margin: "8px 0 0",
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
