export const slkRaveTierPresets = [
  { name: "Early Bird", price_ngn: 5000, capacity: 150 },
  { name: "Regular", price_ngn: 8000, capacity: 540 },
  { name: "VIP Experience", price_ngn: 150000, capacity: 10 },
];

export const notices = {
  saved: "The event financial record was saved.",
  "budget-saved": "The event budget and allocations were saved.",
  "role-saved": "The event team assignment was saved.",
  corrected: "The record was corrected and its prior values were audited.",
  voided: "The record was voided and retained in history.",
  "tier-saved": "The ticket tier was saved.",
  "tier-retired":
    "The ticket tier was retired; previous sales remain recorded.",
  "sale-saved": "The ticket sale was recorded.",
  "sale-edited": "The ticket sale was updated and its change was audited.",
  refunded: "The sale was refunded and retained in the event history.",
  "receipt-uploaded": "The receipt was securely attached to this event record.",
  "receipt-invalid": "Choose a valid PDF, JPEG, or PNG receipt under 4 MiB.",
  "receipt-too-large": "The receipt upload is too large.",
  "receipt-failed": "The receipt could not be attached. Try again later.",
  "receipt-unavailable": "Receipt storage is not configured or is unavailable.",
  "category-created": "The category was added.",
  "category-renamed":
    "The category name was changed and recorded in the audit history.",
  "category-retired":
    "The category was retired and remains visible in this list.",
  denied: "You are not allowed to perform that event-finance action.",
  "invalid-request": "Check the values and try again.",
  "operation-failed":
    "The request was rejected. Check event state, capacity, and required values.",
};

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function formatMoney(value) {
  return money.format(typeof value === "number" ? value : BigInt(value));
}

export function formatDay(value) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

export function formatCompactMoney(value) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (absolute >= 1000000000) {
    return `${sign}₦${(absolute / 1000000000).toFixed(absolute >= 10000000000 ? 0 : 1)}b`;
  }
  if (absolute >= 1000000) {
    return `${sign}₦${(absolute / 1000000).toFixed(absolute >= 10000000 ? 0 : 1)}m`;
  }
  if (absolute >= 1000) {
    return `${sign}₦${(absolute / 1000).toFixed(absolute >= 100000 ? 0 : 1)}k`;
  }
  return `${sign}₦${Math.round(absolute).toLocaleString("en-NG")}`;
}

export function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export function isCalendarDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01"
  );
}

export function buildMonthlyFinanceTrend(today, transactions, sales) {
  const anchor = new Date(`${today}T00:00:00.000Z`);
  const months = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (5 - index), 1),
    );
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: new Intl.DateTimeFormat("en-NG", {
        month: "short",
        timeZone: "UTC",
      }).format(month),
      revenue: 0,
      expenses: 0,
    };
  });
  const byMonth = new Map(months.map((month) => [month.key, month]));

  for (const transaction of transactions) {
    if (transaction.voided_at) continue;
    const month = byMonth.get(transaction.transaction_date.slice(0, 7));
    if (!month) continue;
    if (
      transaction.kind === "income" &&
      transaction.payment_status === "paid"
    ) {
      month.revenue += Number(BigInt(transaction.amount_ngn));
    } else if (
      transaction.kind === "expense" &&
      ["paid", "deposit"].includes(transaction.payment_status)
    ) {
      month.expenses += Number(BigInt(transaction.amount_ngn));
    }
  }

  for (const sale of sales) {
    const amount = Number(BigInt(sale.amount_ngn));
    const saleMonth = byMonth.get(sale.created_at.slice(0, 7));
    if (saleMonth) saleMonth.revenue += amount;
    if (sale.refunded_at) {
      const refundMonth = byMonth.get(sale.refunded_at.slice(0, 7));
      if (refundMonth) refundMonth.revenue -= amount;
    }
  }

  return months;
}
