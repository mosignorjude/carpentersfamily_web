import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlyFinanceTrend,
  formatCompactMoney,
  formatMoney,
  isCalendarDate,
} from "../src/lib/event-finance-utils.mjs";

test("finance utils: formatMoney formats NGN values properly", () => {
  const result = formatMoney(50000);
  assert.match(result, /50,000/);
});

test("finance utils: formatCompactMoney shortens large amounts", () => {
  assert.equal(formatCompactMoney(500), "₦500");
  assert.equal(formatCompactMoney(5000), "₦5.0k");
  assert.equal(formatCompactMoney(2500000), "₦2.5m");
  assert.equal(formatCompactMoney(1000000000), "₦1.0b");
  assert.equal(formatCompactMoney(-15000), "−₦15.0k");
});

test("finance utils: isCalendarDate strictly validates YYYY-MM-DD", () => {
  assert.equal(isCalendarDate("2026-10-14"), true);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("invalid"), false);
  assert.equal(isCalendarDate(""), false);
  assert.equal(isCalendarDate(undefined), false);
});

test("finance utils: buildMonthlyFinanceTrend aggregates revenue and expenses over 6 months", () => {
  const today = "2026-10-14";
  const transactions = [
    {
      id: "tx-1",
      event_id: "evt-1",
      kind: "income",
      amount_ngn: 20000,
      transaction_date: "2026-10-05T00:00:00Z",
      payment_status: "paid",
      voided_at: null,
    },
    {
      id: "tx-2",
      event_id: "evt-1",
      kind: "expense",
      amount_ngn: 15000,
      transaction_date: "2026-10-06T00:00:00Z",
      payment_status: "paid",
      voided_at: null,
    },
    {
      id: "tx-3",
      event_id: "evt-1",
      kind: "expense",
      amount_ngn: 50000,
      transaction_date: "2026-10-07T00:00:00Z",
      payment_status: "paid",
      voided_at: "2026-10-08T00:00:00Z", // voided, should be ignored
    },
  ];

  const sales = [
    {
      id: "sale-1",
      event_id: "evt-1",
      tier_id: "tier-1",
      seller_id: "seller-1",
      quantity: 2,
      unit_price_ngn: 5000,
      amount_ngn: 10000,
      created_at: "2026-10-01T00:00:00Z",
      refunded_at: null,
    },
  ];

  const trend = buildMonthlyFinanceTrend(today, transactions, sales);
  assert.equal(trend.length, 6);

  const currentMonth = trend[trend.length - 1];
  assert.equal(currentMonth.key, "2026-10");
  assert.equal(currentMonth.revenue, 30000); // 20000 income + 10000 ticket sale
  assert.equal(currentMonth.expenses, 15000); // 15000 paid expense
});
