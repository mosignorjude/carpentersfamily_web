import type { DashboardTransaction } from "@/components/events/dashboard/dashboard-types";
import { csvCell } from "@/lib/report-export";

/**
 * Formats a monetary value in Nigerian Naira (₦).
 * Accepts number, numeric string, or null/undefined with graceful fallback to ₦0.
 */
export function formatNaira(
  value: number | string | null | undefined,
  showDecimals = false,
  fallback = "₦0",
): string {
  if (value === null || value === undefined || value === "") return fallback;
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return fallback;
  const formatted = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(num);
  return `₦${formatted}`;
}

/**
 * Formats a percentage value (e.g., 25.5%).
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value))
    return "0.0%";
  return `${value.toFixed(1)}%`;
}

/**
 * Client-side helper to export and trigger browser download of an event transaction ledger CSV.
 * Uses strict CSV cell escaping and formula neutralization defense.
 */
export function downloadLedgerCSV(transactions: DashboardTransaction[]): void {
  const headers = [
    "Transaction ID",
    "Date",
    "Type",
    "Category",
    "Description",
    "Amount (NGN)",
    "Payer / Payee",
    "Payment Method",
    "Authorized By",
    "Status",
    "Audit Notes / Void Reason",
  ];

  const rows = transactions.map((t) => [
    csvCell(t.id),
    csvCell(t.date),
    csvCell(t.type.toUpperCase()),
    csvCell(t.categoryLabel),
    csvCell(t.description),
    t.amount,
    csvCell(t.payerPayee),
    csvCell(t.paymentMethod),
    csvCell(t.authorizedBy),
    csvCell(t.status.toUpperCase()),
    csvCell(t.voidReason || ""),
  ]);

  const csvContent = [
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `CarpentersClub_Event_FinanceLedger_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
