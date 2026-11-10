import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { clubBrand } from "@/lib/brand";
import { ensurePdfFontsRegistered } from "./fonts";

export interface PdfNarrativeSummary {
  content: {
    headline: string;
    highlights: string[];
    risks: string[];
    recommendations: string[];
  };
  reviewedBy: string;
  reviewedAt: string;
}

export interface SummaryCardItem {
  label: string;
  value: string;
  tone?: "default" | "positive" | "danger" | "accent";
}

export interface DataTableColumn {
  key: string;
  label: string;
  width: string;
  align?: "left" | "right";
}

let cachedLogoDataUri: string | null | undefined;

function getLogoDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  const candidates = [
    path.join(process.cwd(), "public", "brand", "carpenters-family-mark.png"),
  ];
  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      const b64 = readFileSync(filePath).toString("base64");
      cachedLogoDataUri = `data:image/png;base64,${b64}`;
      return cachedLogoDataUri;
    }
  }
  cachedLogoDataUri = null;
  return null;
}

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Sans",
    fontSize: 9,
    color: "#3D291F",
    backgroundColor: "#FFFFFF",
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 32,
  },
  headerBanner: {
    backgroundColor: "#0C3325",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
    paddingRight: 10,
  },
  logo: {
    width: 24,
    height: 36,
    objectFit: "contain",
  },
  eyebrow: {
    color: "#D6A23A",
    fontSize: 7.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  clubTitle: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  slogan: {
    color: "#FAF6F0",
    fontSize: 8,
    opacity: 0.9,
  },
  headerRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  reportKind: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: 700,
    textAlign: "right",
  },
  periodText: {
    color: "#FAF6F0",
    fontSize: 8,
    marginTop: 2,
    textAlign: "right",
  },
  goldRule: {
    height: 3,
    backgroundColor: "#D6A23A",
    borderRadius: 2,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#3D291F",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 10,
  },
  cardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  card: {
    width: "31.5%",
    backgroundColor: "#FAF6F0",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cardLabel: {
    fontSize: 7.5,
    color: "#5C4638",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  cardValue: {
    fontSize: 11,
    fontWeight: 700,
    color: "#3D291F",
  },
  cardPositive: { color: "#174C37" },
  cardDanger: { color: "#BA3C2A" },
  cardAccent: { color: "#8D5B0E" },
  aiBox: {
    backgroundColor: "#FAF6F0",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    borderLeftWidth: 3.5,
    borderLeftColor: "#174C37",
    borderRadius: 6,
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  aiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DDD3",
  },
  aiBadge: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#174C37",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  aiReviewer: {
    fontSize: 7.5,
    color: "#5C4638",
  },
  aiHeadline: {
    fontSize: 10,
    fontWeight: 700,
    color: "#3D291F",
    marginBottom: 6,
    lineHeight: 1.35,
  },
  aiSubheading: {
    fontSize: 8,
    fontWeight: 700,
    color: "#174C37",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 5,
    marginBottom: 3,
  },
  aiBullet: {
    fontSize: 8.5,
    color: "#3D291F",
    lineHeight: 1.4,
    marginBottom: 2.5,
    paddingLeft: 6,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#E5DDD3",
    borderRadius: 6,
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0C3325",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    color: "#FFFFFF",
    fontSize: 7.5,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5DDD3",
  },
  tableRowAlt: {
    backgroundColor: "#FAF6F0",
  },
  tableCell: {
    fontSize: 8,
    color: "#3D291F",
    paddingRight: 4,
    lineHeight: 1.3,
  },
  emptyNotice: {
    padding: 12,
    fontSize: 8.5,
    color: "#5C4638",
    backgroundColor: "#FAF6F0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DDD3",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: "#E5DDD3",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#5C4638",
  },
});

export function ReportShell({
  reportTitle,
  subtitle,
  periodLabel,
  generatedDate,
  children,
}: {
  reportTitle: string;
  subtitle: string;
  periodLabel: string;
  generatedDate: string;
  children: ReactNode;
}) {
  ensurePdfFontsRegistered();
  const logoUri = getLogoDataUri();

  return (
    <Page size="A4" style={pdfStyles.page} wrap>
      <View style={pdfStyles.headerBanner}>
        <View style={pdfStyles.headerLeft}>
          {logoUri ? <Image src={logoUri} style={pdfStyles.logo} /> : null}
          <View>
            <Text style={pdfStyles.eyebrow}>{clubBrand.location}</Text>
            <Text style={pdfStyles.clubTitle}>{clubBrand.name}</Text>
            <Text style={pdfStyles.slogan}>{clubBrand.slogan}</Text>
          </View>
        </View>
        <View style={pdfStyles.headerRight}>
          <Text style={pdfStyles.reportKind}>{reportTitle}</Text>
          <Text style={pdfStyles.periodText}>{subtitle}</Text>
          <Text style={pdfStyles.periodText}>{periodLabel}</Text>
        </View>
      </View>
      <View style={pdfStyles.goldRule} />

      {children}

      <View fixed style={pdfStyles.footer}>
        <Text>
          {clubBrand.name} · Generated {generatedDate} WAT
        </Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

export function SummaryCards({ items }: { items: readonly SummaryCardItem[] }) {
  return (
    <View style={pdfStyles.cardsRow} wrap={false}>
      {items.map((item) => {
        const valueStyle =
          item.tone === "positive"
            ? pdfStyles.cardPositive
            : item.tone === "danger"
              ? pdfStyles.cardDanger
              : item.tone === "accent"
                ? pdfStyles.cardAccent
                : null;
        return (
          <View key={item.label} style={pdfStyles.card}>
            <Text style={pdfStyles.cardLabel}>{item.label}</Text>
            <Text
              style={
                valueStyle
                  ? [pdfStyles.cardValue, valueStyle]
                  : pdfStyles.cardValue
              }
            >
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function uniqueTextItems(lines: readonly string[], prefix: string) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const count = (seen.get(line) ?? 0) + 1;
    seen.set(line, count);
    return { key: `${prefix}:${line.slice(0, 48)}:${count}`, text: line };
  });
}

export function AiSummarySection({
  narrative,
}: {
  narrative: PdfNarrativeSummary;
}) {
  const { content, reviewedBy, reviewedAt } = narrative;
  const highlightItems = uniqueTextItems(content.highlights, "h");
  const riskItems = uniqueTextItems(content.risks, "r");
  const recommendationItems = uniqueTextItems(content.recommendations, "rec");
  return (
    <View style={pdfStyles.aiBox} wrap={false}>
      <View style={pdfStyles.aiHeader}>
        <Text style={pdfStyles.aiBadge}>AI Summary</Text>
        <Text style={pdfStyles.aiReviewer}>
          AI-assisted · Reviewed by {reviewedBy} ({reviewedAt})
        </Text>
      </View>
      <Text style={pdfStyles.aiHeadline}>{content.headline}</Text>

      {highlightItems.length > 0 && (
        <View>
          <Text style={pdfStyles.aiSubheading}>Highlights</Text>
          {highlightItems.map((item) => (
            <Text key={item.key} style={pdfStyles.aiBullet}>
              • {item.text}
            </Text>
          ))}
        </View>
      )}

      {riskItems.length > 0 && (
        <View>
          <Text style={pdfStyles.aiSubheading}>Watchpoints</Text>
          {riskItems.map((item) => (
            <Text key={item.key} style={pdfStyles.aiBullet}>
              • {item.text}
            </Text>
          ))}
        </View>
      )}

      {recommendationItems.length > 0 && (
        <View>
          <Text style={pdfStyles.aiSubheading}>Recommendations</Text>
          {recommendationItems.map((item) => (
            <Text key={item.key} style={pdfStyles.aiBullet}>
              • {item.text}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function DataTable({
  columns,
  rows,
  emptyMessage,
}: {
  columns: readonly DataTableColumn[];
  rows: ReadonlyArray<Record<string, string>>;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <Text style={pdfStyles.emptyNotice}>{emptyMessage}</Text>;
  }

  const seenRows = new Map<string, number>();
  const keyedRows = rows.map((row, position) => {
    const signature = columns.map((col) => row[col.key] ?? "").join("|");
    const occurrence = (seenRows.get(signature) ?? 0) + 1;
    seenRows.set(signature, occurrence);
    return {
      key: `${signature.slice(0, 64)}#${occurrence}`,
      isAlt: position % 2 === 1,
      row,
    };
  });

  return (
    <View style={pdfStyles.tableContainer}>
      <View fixed style={pdfStyles.tableHeader}>
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[
              pdfStyles.tableHeaderText,
              {
                width: col.width,
                textAlign: col.align ?? "left",
                paddingRight: 4,
              },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>
      {keyedRows.map((entry) => (
        <View
          key={entry.key}
          style={
            entry.isAlt
              ? [pdfStyles.tableRow, pdfStyles.tableRowAlt]
              : pdfStyles.tableRow
          }
          wrap={false}
        >
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                pdfStyles.tableCell,
                {
                  width: col.width,
                  textAlign: col.align ?? "left",
                },
              ]}
            >
              {entry.row[col.key] ?? "—"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
