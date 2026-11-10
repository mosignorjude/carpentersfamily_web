export interface OverviewPeriod {
  periodParam: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
}

function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function formatWatDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function previousMonthPeriodWAT(now = new Date()): OverviewPeriod {
  const watToday = formatWatDate(now);
  const [yearStr, monthStr] = watToday.split("-");
  let year = Number(yearStr);
  let month = Number(monthStr) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  const monthPadded = String(month).padStart(2, "0");
  const lastDay = String(daysInUtcMonth(year, month - 1)).padStart(2, "0");
  const periodLabel = `${year}-${monthPadded}`;
  return {
    periodParam: `month:${periodLabel}`,
    periodLabel,
    periodStart: `${periodLabel}-01`,
    periodEnd: `${periodLabel}-${lastDay}`,
  };
}

export function currentMonthPeriodWAT(now = new Date()): OverviewPeriod {
  const watToday = formatWatDate(now);
  const [yearStr, monthStr] = watToday.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthPadded = String(month).padStart(2, "0");
  const lastDay = String(daysInUtcMonth(year, month - 1)).padStart(2, "0");
  const periodLabel = `${year}-${monthPadded}`;
  return {
    periodParam: `month:${periodLabel}`,
    periodLabel,
    periodStart: `${periodLabel}-01`,
    periodEnd: `${periodLabel}-${lastDay}`,
  };
}

export function parseOverviewPeriod(
  raw: string | null | undefined,
): OverviewPeriod | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const monthMatch = /^month:(\d{4})-(\d{2})$/.exec(trimmed);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return null;
    }
    const label = `${monthMatch[1]}-${monthMatch[2]}`;
    const lastDay = String(daysInUtcMonth(year, month - 1)).padStart(2, "0");
    return {
      periodParam: `month:${label}`,
      periodLabel: label,
      periodStart: `${label}-01`,
      periodEnd: `${label}-${lastDay}`,
    };
  }

  const yearMatch = /^year:(\d{4})$/.exec(trimmed);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (year < 2020 || year > 2100) {
      return null;
    }
    const label = yearMatch[1];
    return {
      periodParam: `year:${label}`,
      periodLabel: label,
      periodStart: `${label}-01-01`,
      periodEnd: `${label}-12-31`,
    };
  }

  return null;
}

export function periodParamForRow(
  reportType: string,
  periodStart: string,
  periodEnd: string,
): string | null {
  if (reportType !== "club_overview") return null;
  if (periodStart.slice(0, 7) === periodEnd.slice(0, 7)) {
    return `month:${periodStart.slice(0, 7)}`;
  }
  if (
    periodStart.endsWith("-01-01") &&
    periodEnd.endsWith("-12-31") &&
    periodStart.slice(0, 4) === periodEnd.slice(0, 4)
  ) {
    return `year:${periodStart.slice(0, 4)}`;
  }
  return null;
}
