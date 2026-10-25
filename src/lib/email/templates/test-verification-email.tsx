import { Button, Section, Text } from "@react-email/components";
import {
  DEFAULT_FORWARD_TO_EMAIL,
  DEFAULT_FROM_EMAIL,
  DEFAULT_REPLY_TO_EMAIL,
} from "@/lib/email/config";
import { BaseEmailLayout } from "@/lib/email/templates/base-layout";

export interface TestVerificationEmailProps {
  recipientEmail: string;
  sentAtIso?: string;
  portalUrl?: string;
}

export function TestVerificationEmail({
  recipientEmail,
  sentAtIso = new Date().toISOString(),
  portalUrl = "http://127.0.0.1:3000",
}: TestVerificationEmailProps) {
  return (
    <BaseEmailLayout
      previewText="Carpenters Family email delivery verification"
      eyebrow="System Verification"
      heading="Resend Email Integration is Active"
      footerNote="This is an automated verification message generated from the Carpenters Family portal."
    >
      <Text style={styles.paragraph}>
        Hello, this test confirms that outbound notifications from the{" "}
        <strong>Carpenters Family Social Club</strong> portal are properly
        configured and delivering through Resend.
      </Text>

      <Section style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Active Routing Summary</Text>
        <Text style={styles.summaryRow}>
          <strong>From (Notifications):</strong> {DEFAULT_FROM_EMAIL}
        </Text>
        <Text style={styles.summaryRow}>
          <strong>Reply-To (Club Contact):</strong> {DEFAULT_REPLY_TO_EMAIL}
        </Text>
        <Text style={styles.summaryRow}>
          <strong>Contact Redirect Inbox:</strong> {DEFAULT_FORWARD_TO_EMAIL}
        </Text>
        <Text style={styles.summaryRow}>
          <strong>Delivered To:</strong> {recipientEmail}
        </Text>
        <Text style={styles.summaryRowLast}>
          <strong>Timestamp (UTC):</strong> {sentAtIso}
        </Text>
      </Section>

      <Section style={styles.ctaSection}>
        <Button href={portalUrl} style={styles.button}>
          Open Member Portal
        </Button>
      </Section>
    </BaseEmailLayout>
  );
}

const styles = {
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
    margin: "0 0 24px",
  },
  summaryTitle: {
    color: "#174C37",
    fontSize: "13px",
    fontWeight: "700",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 10px",
  },
  summaryRow: {
    color: "#3D291F",
    fontSize: "13px",
    lineHeight: "1.5",
    margin: "0 0 6px",
  },
  summaryRowLast: {
    color: "#3D291F",
    fontSize: "13px",
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
