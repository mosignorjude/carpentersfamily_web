import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { clubBrand } from "@/lib/brand";
import { DEFAULT_REPLY_TO_EMAIL, getEmailLogoUrl } from "@/lib/email/config";

export interface BaseEmailLayoutProps {
  previewText: string;
  heading: string;
  eyebrow?: string;
  children: ReactNode;
  footerNote?: string;
}

export function BaseEmailLayout({
  previewText,
  heading,
  eyebrow = clubBrand.shortName,
  children,
  footerNote,
}: BaseEmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.headerBanner}>
            <Img
              alt={clubBrand.name}
              height="60"
              src={getEmailLogoUrl()}
              style={styles.logoImage}
              width="60"
            />
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Heading as="h1" style={styles.headerTitle}>
              {clubBrand.name}
            </Heading>
            <Text style={styles.headerSlogan}>{clubBrand.slogan}</Text>
          </Section>

          <Section style={styles.accentBar} />

          <Section style={styles.contentCard}>
            <Heading as="h2" style={styles.contentHeading}>
              {heading}
            </Heading>
            {children}
          </Section>

          <Section style={styles.footer}>
            {footerNote ? (
              <Text style={styles.footerText}>{footerNote}</Text>
            ) : null}
            <Hr style={styles.divider} />
            <Text style={styles.footerMeta}>
              {clubBrand.name} · {clubBrand.location}
            </Text>
            <Text style={styles.footerMeta}>
              Questions or inquiries? Reply to this email or write to{" "}
              <Link
                href={`mailto:${DEFAULT_REPLY_TO_EMAIL}`}
                style={styles.footerLink}
              >
                {DEFAULT_REPLY_TO_EMAIL}
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#FAF6F0",
    fontFamily:
      '"DM Sans", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    margin: "0",
    padding: "32px 16px",
    color: "#3D291F",
  },
  container: {
    maxWidth: "580px",
    margin: "0 auto",
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    border: "1px solid #E5DDD3",
    overflow: "hidden" as const,
  },
  headerBanner: {
    backgroundColor: "#0C3325",
    padding: "28px 32px 24px",
  },
  logoImage: {
    display: "block",
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    backgroundColor: "#FFFFFF",
    margin: "0 0 14px",
    border: "0",
  },
  eyebrow: {
    color: "#D6A23A",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    margin: "0 0 6px",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: "22px",
    fontWeight: "700",
    lineHeight: "1.3",
    margin: "0 0 4px",
  },
  headerSlogan: {
    color: "#FAF6F0",
    fontSize: "13px",
    margin: "0",
    opacity: 0.85,
  },
  accentBar: {
    height: "4px",
    backgroundColor: "#D6A23A",
    width: "100%",
  },
  contentCard: {
    padding: "32px",
  },
  contentHeading: {
    color: "#3D291F",
    fontSize: "20px",
    fontWeight: "700",
    lineHeight: "1.35",
    margin: "0 0 16px",
  },
  footer: {
    backgroundColor: "#FAF6F0",
    padding: "20px 32px 28px",
    borderTop: "1px solid #E5DDD3",
  },
  divider: {
    borderColor: "#E5DDD3",
    margin: "12px 0",
  },
  footerText: {
    color: "#5C473C",
    fontSize: "13px",
    lineHeight: "1.5",
    margin: "0 0 12px",
  },
  footerMeta: {
    color: "#6E584C",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0 0 4px",
  },
  footerLink: {
    color: "#174C37",
    textDecoration: "underline",
    fontWeight: "600",
  },
};
