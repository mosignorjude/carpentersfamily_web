import { Document, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { FormalDocumentDraftContent } from "@/lib/ai/document-drafts";
import { clubBrand } from "@/lib/brand";
import { formatNgn, owedByMember, wholeNgn } from "@/lib/report-export";
import type {
  AgmComparisonRow,
  AgmStatementFacts,
} from "@/lib/reports/drafts-core";
import {
  AiSummarySection,
  DataTable,
  type DataTableColumn,
  type PdfNarrativeSummary,
  pdfStyles,
  ReportShell,
  SummaryCards,
} from "./components";

function formatMoneyLabel(value: string | number | null | undefined): string {
  const parsed = wholeNgn(value);
  if (parsed === null) {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "NGN 0";
    const abs = Math.trunc(Math.abs(num)).toLocaleString("en-US");
    return num < 0 ? `-NGN ${abs}` : `NGN ${abs}`;
  }
  const abs = parsed < BigInt(0) ? -parsed : parsed;
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parsed < BigInt(0) ? `-NGN ${formatted}` : `NGN ${formatted}`;
}

export interface ClubFinancePdfProps {
  year: number;
  asOf: string;
  generatedDate: string;
  summary: Record<string, string | number>;
  transactions: Array<{
    id: string;
    kind: string;
    amount_ngn: string | number;
    transaction_date: string;
    description: string | null;
    category_name_snapshot: string | null;
    payer_payee: string | null;
    source_note: string | null;
    is_opening_balance: boolean;
    voided_at: string | null;
    void_reason: string | null;
    payment_method?: string | null;
  }>;
  receiptsByTransaction: Map<string, string[]>;
  narrative: PdfNarrativeSummary | null;
}

const FINANCE_COLUMNS: readonly DataTableColumn[] = [
  { key: "date", label: "Date", width: "13%" },
  { key: "type", label: "Type", width: "13%" },
  { key: "category", label: "Category", width: "16%" },
  { key: "details", label: "Description & Counterparty", width: "30%" },
  { key: "status", label: "Status", width: "12%" },
  { key: "amount", label: "Amount", width: "16%", align: "right" },
];

export function ClubFinancePdfDocument(props: ClubFinancePdfProps) {
  const rows = props.transactions.map((txn) => {
    const receipts = props.receiptsByTransaction.get(txn.id) ?? [];
    const typeLabel = txn.is_opening_balance
      ? "Opening"
      : txn.kind === "income"
        ? "Income"
        : "Expense";
    const detailParts = [
      txn.description || txn.source_note || "—",
      txn.payer_payee ? `Party: ${txn.payer_payee}` : null,
      receipts.length > 0 ? `Receipts: ${receipts.join(", ")}` : null,
      txn.void_reason ? `Void: ${txn.void_reason}` : null,
    ].filter(Boolean);

    return {
      date: txn.transaction_date,
      type: typeLabel,
      category: txn.category_name_snapshot || "Uncategorized",
      details: detailParts.join(" · "),
      status: txn.voided_at ? "Voided" : "Posted",
      amount: formatMoneyLabel(txn.amount_ngn),
    };
  });

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | Club Finance ${props.year}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={`Year ${props.year} · As of ${props.asOf}`}
        reportTitle="Club Finance Report"
        subtitle="Shared club treasury & ledger"
      >
        <SummaryCards
          items={[
            {
              label: "Current Club Balance",
              value: formatMoneyLabel(props.summary.balance),
              tone: "positive",
            },
            {
              label: "All-time Dues Income",
              value: formatMoneyLabel(props.summary.dues_income),
            },
            {
              label: "All-time Other Income",
              value: formatMoneyLabel(props.summary.other_income),
            },
            {
              label: "All-time Expenses",
              value: formatMoneyLabel(props.summary.expenses),
              tone: "danger",
            },
            {
              label: "All-time Event Cash In",
              value: formatMoneyLabel(props.summary.event_inflow),
              tone: "positive",
            },
            {
              label: "All-time Event Cash Out",
              value: formatMoneyLabel(props.summary.event_outflow),
              tone: "danger",
            },
          ]}
        />

        {props.narrative ? (
          <AiSummarySection narrative={props.narrative} />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Transactions ({props.year}-01-01 to {props.year}-12-31 · {rows.length}
          )
        </Text>
        <DataTable
          columns={FINANCE_COLUMNS}
          emptyMessage="No transactions were recorded in this report year."
          rows={rows}
        />
      </ReportShell>
    </Document>
  );
}

export interface DuesPdfProps {
  year: number;
  asOf: string;
  generatedDate: string;
  duesRows: Array<{
    member_id: string;
    full_name: string;
    username: string;
    covered_month: string;
    amount_ngn: string | number | null;
    status: string;
    due_date: string;
    is_overdue: boolean;
  }>;
  profilesById: Map<
    string,
    { id: string; full_name: string; username: string }
  >;
  narrative: PdfNarrativeSummary | null;
}

const DUES_COLUMNS: readonly DataTableColumn[] = [
  { key: "member", label: "Member", width: "28%" },
  { key: "month", label: "Month", width: "12%" },
  { key: "status", label: "Status", width: "20%" },
  { key: "dueDate", label: "Due Date", width: "14%" },
  { key: "amount", label: "Amount", width: "13%", align: "right" },
  { key: "owed", label: "Year Owed", width: "13%", align: "right" },
];

export function DuesPdfDocument(props: DuesPdfProps) {
  const totalsByMember = owedByMember(props.duesRows, props.asOf) ?? new Map();
  const currentMonth = props.asOf.slice(0, 7);

  let paidCount = 0;
  let overdueCount = 0;
  let totalOwed = BigInt(0);

  for (const [_, owed] of totalsByMember) {
    totalOwed += owed;
  }

  const rows = props.duesRows.map((row) => {
    const profile = props.profilesById.get(row.member_id);
    const amount = wholeNgn(row.amount_ngn) ?? BigInt(0);
    let statusLabel = "Unpaid";
    if (row.status === "paid") {
      statusLabel = "Paid";
      paidCount += 1;
    } else if (row.status === "written_off") {
      statusLabel = "Written off";
    } else if (row.is_overdue) {
      statusLabel = "Overdue";
      overdueCount += 1;
    } else if (row.covered_month.slice(0, 7) > currentMonth) {
      statusLabel = "Upcoming";
    } else if (row.covered_month.slice(0, 7) === currentMonth) {
      statusLabel = "Due at month end";
    }

    return {
      member: profile
        ? `${profile.full_name} (@${profile.username})`
        : "Member",
      month: row.covered_month.slice(0, 7),
      status: statusLabel,
      dueDate: row.due_date,
      amount: `NGN ${formatNgn(amount)}`,
      owed: formatMoneyLabel(
        totalsByMember.get(row.member_id)?.toString() ?? "0",
      ),
    };
  });

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | Member Dues ${props.year}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={`Year ${props.year} · As of ${props.asOf}`}
        reportTitle="Member Dues Report"
        subtitle="Private dues schedule"
      >
        <SummaryCards
          items={[
            {
              label: "Members Covered",
              value: String(props.profilesById.size),
            },
            {
              label: "Dues Months Returned",
              value: String(props.duesRows.length),
            },
            {
              label: "Paid / Overdue",
              value: `${paidCount} paid · ${overdueCount} overdue`,
              tone: overdueCount > 0 ? "accent" : "positive",
            },
            {
              label: "Total Owed Through Date",
              value: formatMoneyLabel(totalOwed.toString()),
              tone: totalOwed > BigInt(0) ? "danger" : "positive",
            },
          ]}
        />

        {props.narrative ? (
          <AiSummarySection narrative={props.narrative} />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Dues Schedule ({rows.length} rows)
        </Text>
        <DataTable
          columns={DUES_COLUMNS}
          emptyMessage="No dues months were found in this report year."
          rows={rows}
        />
      </ReportShell>
    </Document>
  );
}

export interface EventFinancePdfProps {
  eventTitle: string;
  from: string | null;
  to: string | null;
  generatedDate: string;
  summary: {
    paid_income_ngn: number | string;
    pending_income_ngn: number | string;
    unpaid_income_ngn: number | string;
    actual_expense_ngn: number | string;
    committed_expense_ngn: number | string;
    ticket_income_ngn: number | string;
    tickets_sold: number | string;
    net_result_ngn: number | string;
  };
  ledgerRows: Array<{
    date: string;
    type: string;
    category: string;
    description: string;
    status: string;
    counterparty: string;
    amount: string;
  }>;
  narrative: PdfNarrativeSummary | null;
}

const EVENT_COLUMNS: readonly DataTableColumn[] = [
  { key: "date", label: "Date", width: "12%" },
  { key: "type", label: "Type", width: "13%" },
  { key: "category", label: "Category", width: "15%" },
  { key: "description", label: "Description / Tier", width: "22%" },
  { key: "status", label: "Status", width: "12%" },
  { key: "counterparty", label: "Party", width: "12%" },
  { key: "amount", label: "Amount", width: "14%", align: "right" },
];

export function EventFinancePdfDocument(props: EventFinancePdfProps) {
  const netResult = Number(props.summary.net_result_ngn ?? 0);
  const periodLabel = `${props.from ?? "All dates"} to ${props.to ?? "All dates"}`;

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | ${props.eventTitle}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={periodLabel}
        reportTitle="Event Finance Report"
        subtitle={props.eventTitle}
      >
        <SummaryCards
          items={[
            {
              label: "Net Event Result",
              value: formatMoneyLabel(props.summary.net_result_ngn),
              tone: netResult >= 0 ? "positive" : "danger",
            },
            {
              label: "Paid Other Income",
              value: formatMoneyLabel(props.summary.paid_income_ngn),
              tone: "positive",
            },
            {
              label: "Ticket Revenue (Net)",
              value: `${formatMoneyLabel(props.summary.ticket_income_ngn)} (${props.summary.tickets_sold} sold)`,
            },
            {
              label: "Paid & Deposit Expenses",
              value: formatMoneyLabel(props.summary.actual_expense_ngn),
              tone: "danger",
            },
            {
              label: "Expense Commitments",
              value: formatMoneyLabel(props.summary.committed_expense_ngn),
              tone: "accent",
            },
            {
              label: "Pending / Unpaid Income",
              value: formatMoneyLabel(
                Number(props.summary.pending_income_ngn ?? 0) +
                  Number(props.summary.unpaid_income_ngn ?? 0),
              ),
            },
          ]}
        />

        {props.narrative ? (
          <AiSummarySection narrative={props.narrative} />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Transactions &amp; Ticket Releases ({props.ledgerRows.length})
        </Text>
        <DataTable
          columns={EVENT_COLUMNS}
          emptyMessage="No transactions or ticket releases recorded in this period."
          rows={props.ledgerRows}
        />
      </ReportShell>
    </Document>
  );
}

export interface ClubOverviewPdfProps {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedDate: string;
  facts: {
    club_finance: {
      period_dues_collected_ngn: number;
      period_other_income_ngn: number;
      period_expenses_ngn: number;
      current_club_balance_ngn: number;
      expense_by_category: Array<{
        category: string;
        amount: number;
        share_pct: number;
      }>;
    };
    dues: {
      active_members: number;
      paid_rows_in_period: number;
      unpaid_rows_in_period: number;
      overdue_rows_as_of_end: number;
      overdue_three_plus_members: number;
      paid_amount_ngn: number;
      owed_through_end_ngn: number;
      collection_rate_pct: number;
    };
    events: {
      events_count: number;
      completed_count: number;
      scheduled_count: number;
      cancelled_count: number;
      event_cash_in_ngn: number;
      event_cash_out_ngn: number;
      net_event_cash_ngn: number;
      ticket_revenue_ngn: number;
      tickets_sold: number;
      top_events: Array<{ title: string; net_result_ngn: number }>;
    };
    attendance: {
      sessions_count: number;
      total_checkins: number;
    };
  };
  narrative: PdfNarrativeSummary | null;
}

const OVERVIEW_CAT_COLUMNS: readonly DataTableColumn[] = [
  { key: "category", label: "Expense Category", width: "55%" },
  { key: "share", label: "Share", width: "20%", align: "right" },
  { key: "amount", label: "Amount", width: "25%", align: "right" },
];

const OVERVIEW_EVENT_COLUMNS: readonly DataTableColumn[] = [
  { key: "title", label: "Event", width: "70%" },
  { key: "net", label: "Net Cash Result", width: "30%", align: "right" },
];

export function ClubOverviewPdfDocument(props: ClubOverviewPdfProps) {
  const { facts } = props;

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | Club Overview ${props.periodLabel}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={`${props.periodStart} to ${props.periodEnd}`}
        reportTitle="Club Overview Report"
        subtitle={`Period ${props.periodLabel} · Officer Summary`}
      >
        <SummaryCards
          items={[
            {
              label: "Current Club Balance",
              value: formatMoneyLabel(
                facts.club_finance.current_club_balance_ngn,
              ),
              tone: "positive",
            },
            {
              label: "Period Dues Collected",
              value: formatMoneyLabel(
                facts.club_finance.period_dues_collected_ngn,
              ),
            },
            {
              label: "Period Operating Expenses",
              value: formatMoneyLabel(facts.club_finance.period_expenses_ngn),
              tone: "danger",
            },
            {
              label: "Dues Collection Rate",
              value: `${facts.dues.collection_rate_pct}% (${facts.dues.active_members} members)`,
              tone:
                facts.dues.collection_rate_pct >= 75 ? "positive" : "accent",
            },
            {
              label: "Net Event Cash",
              value: formatMoneyLabel(facts.events.net_event_cash_ngn),
              tone:
                facts.events.net_event_cash_ngn >= 0 ? "positive" : "danger",
            },
            {
              label: "Attendance Check-ins",
              value: `${facts.attendance.total_checkins} (${facts.attendance.sessions_count} sessions)`,
            },
          ]}
        />

        {props.narrative ? (
          <AiSummarySection narrative={props.narrative} />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Operating Expenses by Category
        </Text>
        <DataTable
          columns={OVERVIEW_CAT_COLUMNS}
          emptyMessage="No club operating expenses were recorded during this period."
          rows={facts.club_finance.expense_by_category.map((row) => ({
            category: row.category,
            share: `${row.share_pct}%`,
            amount: formatMoneyLabel(row.amount),
          }))}
        />

        <View style={{ marginTop: 10 }}>
          <Text style={pdfStyles.sectionTitle}>
            Dues &amp; Event Activity Breakdown
          </Text>
          <SummaryCards
            items={[
              {
                label: "Overdue Dues Months",
                value: `${facts.dues.overdue_rows_as_of_end} (${facts.dues.overdue_three_plus_members} at 3+ mos)`,
                tone:
                  facts.dues.overdue_three_plus_members > 0
                    ? "danger"
                    : "default",
              },
              {
                label: "Events in Period",
                value: `${facts.events.events_count} total · ${facts.events.completed_count} completed`,
              },
              {
                label: "Tickets Sold",
                value: `${facts.events.tickets_sold} (${formatMoneyLabel(facts.events.ticket_revenue_ngn)})`,
              },
            ]}
          />
          <DataTable
            columns={OVERVIEW_EVENT_COLUMNS}
            emptyMessage="No active event cash movements in this period."
            rows={facts.events.top_events.map((ev) => ({
              title: ev.title,
              net: formatMoneyLabel(ev.net_result_ngn),
            }))}
          />
        </View>
      </ReportShell>
    </Document>
  );
}

export interface CustomReportPdfProps {
  title: string;
  subtitle: string;
  periodLabel: string;
  generatedDate: string;
  isMonetary: boolean;
  metricLabel: string;
  totalCount: number;
  totalAmountNgn: number | null;
  averageAmountNgn: number | null;
  rows: Array<{
    groupLabel: string;
    count: number;
    totalAmountNgn: number | null;
    averageAmountNgn: number | null;
    sharePct: number;
  }>;
  narrative: PdfNarrativeSummary | null;
}

const CUSTOM_MONETARY_COLUMNS: readonly DataTableColumn[] = [
  { key: "group", label: "Group", width: "36%" },
  { key: "count", label: "Count", width: "12%", align: "right" },
  { key: "total", label: "Total", width: "20%", align: "right" },
  { key: "average", label: "Average", width: "18%", align: "right" },
  { key: "share", label: "Share", width: "14%", align: "right" },
];

const CUSTOM_COUNT_COLUMNS: readonly DataTableColumn[] = [
  { key: "group", label: "Group", width: "60%" },
  { key: "count", label: "Count", width: "20%", align: "right" },
  { key: "share", label: "Share", width: "20%", align: "right" },
];

export function CustomReportPdfDocument(props: CustomReportPdfProps) {
  const topGroup = props.rows[0];
  const cards = props.isMonetary
    ? [
        {
          label: "Total Amount",
          value: formatMoneyLabel(props.totalAmountNgn ?? 0),
          tone: "positive" as const,
        },
        {
          label: "Records Matched",
          value: String(props.totalCount),
        },
        {
          label: "Average Amount",
          value: formatMoneyLabel(props.averageAmountNgn ?? 0),
        },
        ...(topGroup
          ? [
              {
                label: "Leading Group",
                value: `${topGroup.groupLabel} (${topGroup.sharePct}%)`,
                tone: "accent" as const,
              },
            ]
          : []),
      ]
    : [
        {
          label: "Records Matched",
          value: String(props.totalCount),
          tone: "positive" as const,
        },
        ...(topGroup
          ? [
              {
                label: "Leading Group",
                value: `${topGroup.groupLabel} (${topGroup.count})`,
                tone: "accent" as const,
              },
            ]
          : []),
      ];

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | ${props.title}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={props.periodLabel}
        reportTitle={props.title}
        subtitle={props.subtitle}
      >
        <SummaryCards items={cards} />

        {props.narrative ? (
          <AiSummarySection narrative={props.narrative} />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Breakdown ({props.metricLabel} · {props.rows.length} groups)
        </Text>
        <DataTable
          columns={
            props.isMonetary ? CUSTOM_MONETARY_COLUMNS : CUSTOM_COUNT_COLUMNS
          }
          emptyMessage="No matching records were found for the selected period and filters."
          rows={props.rows.map((row) => ({
            group: row.groupLabel,
            count: String(row.count),
            total: formatMoneyLabel(row.totalAmountNgn ?? 0),
            average: formatMoneyLabel(row.averageAmountNgn ?? 0),
            share: `${row.sharePct}%`,
          }))}
        />
      </ReportShell>
    </Document>
  );
}

const formalPdfStyles = StyleSheet.create({
  sectionCard: {
    backgroundColor: "#FAF6F0",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#174C37",
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: 8.5,
    color: "#3D291F",
    lineHeight: 1.45,
  },
  summaryBanner: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    borderLeftWidth: 3.5,
    borderLeftColor: "#D6A23A",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  summaryBannerLabel: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#8D5B0E",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  signatureBlock: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5DDD3",
  },
  signatureMeta: {
    fontSize: 7.5,
    color: "#5C4638",
    marginBottom: 10,
  },
  signatureGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  signatureCol: {
    flex: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#3D291F",
    height: 18,
    marginBottom: 4,
  },
  signatureCaption: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#5C4638",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

function uniqueRecs(items: readonly string[]) {
  const seen = new Map<string, number>();
  return items.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);
    return { key: `${text.slice(0, 32)}#${count}`, text };
  });
}

function FormalSectionsBlock({
  draft,
  approvedBy,
  approvedAt,
  badgeLabel,
}: {
  draft: FormalDocumentDraftContent;
  approvedBy?: string | null;
  approvedAt?: string | null;
  badgeLabel: string;
}) {
  const recItems = uniqueRecs(draft.recommendations);
  return (
    <View>
      <View style={formalPdfStyles.summaryBanner} wrap={false}>
        <Text style={formalPdfStyles.summaryBannerLabel}>
          {badgeLabel}
          {approvedBy && approvedAt
            ? ` · Approved by ${approvedBy} (${approvedAt})`
            : ""}
        </Text>
        <Text style={pdfStyles.aiHeadline}>{draft.title}</Text>
        <Text style={formalPdfStyles.sectionBody}>{draft.summary}</Text>
      </View>

      {draft.sections.map((section) => (
        <View
          key={section.key}
          style={formalPdfStyles.sectionCard}
          wrap={false}
        >
          <Text style={formalPdfStyles.sectionHeading}>{section.heading}</Text>
          <Text style={formalPdfStyles.sectionBody}>{section.body}</Text>
        </View>
      ))}

      {recItems.length > 0 ? (
        <View style={pdfStyles.aiBox} wrap={false}>
          <Text style={pdfStyles.aiSubheading}>
            Recommendations &amp; Action Priorities
          </Text>
          {recItems.map((item) => (
            <Text key={item.key} style={pdfStyles.aiBullet}>
              • {item.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SignatureRow({
  signatories,
  attestationLine,
}: {
  signatories: readonly string[];
  attestationLine: string;
}) {
  return (
    <View style={formalPdfStyles.signatureBlock} wrap={false}>
      <Text style={formalPdfStyles.signatureMeta}>{attestationLine}</Text>
      <View style={formalPdfStyles.signatureGrid}>
        {signatories.map((roleLabel) => (
          <View key={roleLabel} style={formalPdfStyles.signatureCol}>
            <View style={formalPdfStyles.signatureLine} />
            <Text style={formalPdfStyles.signatureCaption}>{roleLabel}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface AgmStatementPdfProps {
  fiscalYear: number;
  generatedDate: string;
  facts: AgmStatementFacts;
  comparisonRows: AgmComparisonRow[];
  draft: FormalDocumentDraftContent | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

const AGM_YOY_COLUMNS: readonly DataTableColumn[] = [
  { key: "item", label: "Statement Line Item", width: "36%" },
  { key: "cur", label: "Current FY", width: "22%", align: "right" },
  { key: "prev", label: "Prior FY", width: "20%", align: "right" },
  { key: "var", label: "YoY Change", width: "22%", align: "right" },
];

const AGM_EXP_COLUMNS: readonly DataTableColumn[] = [
  { key: "category", label: "Operating Category", width: "55%" },
  { key: "share", label: "Share", width: "20%", align: "right" },
  { key: "amount", label: "Amount", width: "25%", align: "right" },
];

function formatCompCell(value: number, unit: AgmComparisonRow["unit"]): string {
  if (unit === "NGN") return formatMoneyLabel(value);
  if (unit === "PCT") return `${value}%`;
  return String(value);
}

export function AgmStatementPdfDocument(props: AgmStatementPdfProps) {
  const { current, fiscal_year, prior_fiscal_year } = props.facts;

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | AGM Financial Statement FY ${fiscal_year}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={`FY ${fiscal_year} vs FY ${prior_fiscal_year}`}
        reportTitle="AGM Financial Statement"
        subtitle="Annual General Meeting Report"
      >
        <SummaryCards
          items={[
            {
              label: "Closing Club Balance",
              value: formatMoneyLabel(current.closing_club_balance_ngn),
              tone: "positive",
            },
            {
              label: `FY ${fiscal_year} Total Inflows`,
              value: formatMoneyLabel(current.total_inflows_ngn),
              tone: "positive",
            },
            {
              label: `FY ${fiscal_year} Total Outflows`,
              value: formatMoneyLabel(current.total_outflows_ngn),
              tone: "danger",
            },
            {
              label: "Net Surplus / (Deficit)",
              value: formatMoneyLabel(current.net_surplus_ngn),
              tone: current.net_surplus_ngn >= 0 ? "positive" : "danger",
            },
            {
              label: "Dues Collection Rate",
              value: `${current.dues_collection_rate_pct}% (${current.active_members} members)`,
              tone:
                current.dues_collection_rate_pct >= 75 ? "positive" : "accent",
            },
            {
              label: "3+ Months Arrears",
              value: `${current.overdue_three_plus_members} members`,
              tone:
                current.overdue_three_plus_members > 0 ? "danger" : "default",
            },
          ]}
        />

        {props.draft ? (
          <FormalSectionsBlock
            approvedAt={props.approvedAt}
            approvedBy={props.approvedByName}
            badgeLabel="AGM Financial Commentary"
            draft={props.draft}
          />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Comparative Statement of Income &amp; Expenditure (FY {fiscal_year} vs
          FY {prior_fiscal_year})
        </Text>
        <DataTable
          columns={AGM_YOY_COLUMNS}
          emptyMessage="No financial movements recorded for the selected years."
          rows={props.comparisonRows.map((row) => ({
            item: row.lineItem,
            cur: formatCompCell(row.currentValue, row.unit),
            prev: formatCompCell(row.priorValue, row.unit),
            var:
              row.variancePct !== null
                ? `${formatCompCell(row.varianceValue, row.unit)} (${row.variancePct > 0 ? "+" : ""}${row.variancePct}%)`
                : formatCompCell(row.varianceValue, row.unit),
          }))}
        />

        <Text style={pdfStyles.sectionTitle}>
          FY {fiscal_year} Operating Expenses by Category
        </Text>
        <DataTable
          columns={AGM_EXP_COLUMNS}
          emptyMessage="No club operating expenses were recorded during this fiscal year."
          rows={current.expense_by_category.map((cat) => ({
            category: cat.category,
            share: `${cat.share_pct}%`,
            amount: formatMoneyLabel(cat.amount),
          }))}
        />

        <SignatureRow
          attestationLine={
            props.approvedByName && props.approvedAt
              ? `Prepared for the Annual General Meeting · Officer review attested by ${props.approvedByName} on ${props.approvedAt} WAT.`
              : `Prepared for the Annual General Meeting of ${clubBrand.name} on ${props.generatedDate} WAT.`
          }
          signatories={[
            "Club Treasurer / Date",
            "Financial Secretary / Date",
            "Club President / Date",
          ]}
        />
      </ReportShell>
    </Document>
  );
}

export interface TreasurerReportPdfProps {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedDate: string;
  facts: {
    treasury_totals: {
      total_inflows_ngn: number;
      total_outflows_ngn: number;
      net_period_cash_flow_ngn: number;
      closing_club_balance_ngn: number;
    };
    club_finance: {
      period_dues_collected_ngn: number;
      period_other_income_ngn: number;
      period_expenses_ngn: number;
      expense_by_category: Array<{
        category: string;
        amount: number;
        share_pct: number;
      }>;
    };
    dues: {
      active_members: number;
      collection_rate_pct: number;
      owed_through_end_ngn: number;
      overdue_three_plus_members: number;
    };
    events: {
      events_count: number;
      net_event_cash_ngn: number;
      top_events: Array<{ title: string; net_result_ngn: number }>;
    };
  };
  draft: FormalDocumentDraftContent | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

export function TreasurerReportPdfDocument(props: TreasurerReportPdfProps) {
  const { treasury_totals, club_finance, dues, events } = props.facts;

  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | Treasurer's Report ${props.periodLabel}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={`${props.periodStart} to ${props.periodEnd}`}
        reportTitle="Treasurer's Report"
        subtitle={`Period ${props.periodLabel} · Treasury Office`}
      >
        <SummaryCards
          items={[
            {
              label: "Closing Club Balance",
              value: formatMoneyLabel(treasury_totals.closing_club_balance_ngn),
              tone: "positive",
            },
            {
              label: "Total Period Inflows",
              value: formatMoneyLabel(treasury_totals.total_inflows_ngn),
              tone: "positive",
            },
            {
              label: "Total Period Outflows",
              value: formatMoneyLabel(treasury_totals.total_outflows_ngn),
              tone: "danger",
            },
            {
              label: "Net Period Cash Flow",
              value: formatMoneyLabel(treasury_totals.net_period_cash_flow_ngn),
              tone:
                treasury_totals.net_period_cash_flow_ngn >= 0
                  ? "positive"
                  : "danger",
            },
            {
              label: "Dues Collection Rate",
              value: `${dues.collection_rate_pct}% (${dues.active_members} members)`,
              tone: dues.collection_rate_pct >= 75 ? "positive" : "accent",
            },
            {
              label: "Dues Owed Through End",
              value: formatMoneyLabel(dues.owed_through_end_ngn),
              tone: dues.overdue_three_plus_members > 0 ? "danger" : "default",
            },
          ]}
        />

        {props.draft ? (
          <FormalSectionsBlock
            approvedAt={props.approvedAt}
            approvedBy={props.approvedByName}
            badgeLabel="Treasurer's Narrative"
            draft={props.draft}
          />
        ) : null}

        <Text style={pdfStyles.sectionTitle}>
          Operating Expenditure by Category
        </Text>
        <DataTable
          columns={OVERVIEW_CAT_COLUMNS}
          emptyMessage="No club operating expenses occurred during this period."
          rows={club_finance.expense_by_category.map((cat) => ({
            category: cat.category,
            share: `${cat.share_pct}%`,
            amount: formatMoneyLabel(cat.amount),
          }))}
        />

        <Text style={pdfStyles.sectionTitle}>
          Event Cash Performance ({events.events_count} events)
        </Text>
        <DataTable
          columns={OVERVIEW_EVENT_COLUMNS}
          emptyMessage="No event cash transactions occurred during this period."
          rows={events.top_events.map((ev) => ({
            title: ev.title,
            net: formatMoneyLabel(ev.net_result_ngn),
          }))}
        />

        <SignatureRow
          attestationLine={
            props.approvedByName && props.approvedAt
              ? `Submitted by the Office of the Treasurer · Reviewed & approved by ${props.approvedByName} on ${props.approvedAt} WAT.`
              : `Submitted by the Office of the Treasurer on ${props.generatedDate} WAT.`
          }
          signatories={[
            "Club Treasurer Signature & Date",
            "President / Attestation & Date",
          ]}
        />
      </ReportShell>
    </Document>
  );
}

export interface MeetingMinutesPdfProps {
  meetingTitle: string;
  meetingDateLabel: string;
  location: string;
  generatedDate: string;
  revisionLabel: string;
  attendanceSummaryLabel: string;
  draft: FormalDocumentDraftContent | null;
  plainPublishedText?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

export function MeetingMinutesPdfDocument(props: MeetingMinutesPdfProps) {
  return (
    <Document
      author={clubBrand.name}
      creator={clubBrand.name}
      title={`${clubBrand.name} | Meeting Minutes — ${props.meetingTitle}`}
    >
      <ReportShell
        generatedDate={props.generatedDate}
        periodLabel={props.meetingDateLabel}
        reportTitle="Official Meeting Minutes"
        subtitle="Secretariat Record"
      >
        <SummaryCards
          items={[
            {
              label: "Meeting",
              value: props.meetingTitle,
            },
            {
              label: "Venue / Location",
              value: props.location,
            },
            {
              label: "Attendance & Record",
              value: `${props.attendanceSummaryLabel} · ${props.revisionLabel}`,
              tone: "positive",
            },
          ]}
        />

        {props.draft ? (
          <FormalSectionsBlock
            approvedAt={props.approvedAt}
            approvedBy={props.approvedByName}
            badgeLabel="Structured Secretariat Minutes"
            draft={props.draft}
          />
        ) : props.plainPublishedText ? (
          <View style={formalPdfStyles.sectionCard}>
            <Text style={formalPdfStyles.sectionHeading}>Recorded Minutes</Text>
            <Text style={formalPdfStyles.sectionBody}>
              {props.plainPublishedText}
            </Text>
          </View>
        ) : (
          <Text style={pdfStyles.emptyNotice}>
            No minutes have been published or approved for this meeting yet.
          </Text>
        )}

        <SignatureRow
          attestationLine={
            props.approvedByName && props.approvedAt
              ? `Secretariat record verified by ${props.approvedByName} on ${props.approvedAt} WAT.`
              : `Issued from the Club Secretariat on ${props.generatedDate} WAT.`
          }
          signatories={[
            "General Secretary / Date",
            "Meeting Chair / President / Date",
          ]}
        />
      </ReportShell>
    </Document>
  );
}
