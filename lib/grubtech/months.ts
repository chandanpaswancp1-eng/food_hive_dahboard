import { fmtRange, type PeriodBucket } from "./weeks";

/**
 * Calendar-month bucketing for the Monthly Comparison tab. Works on
 * "YYYY-MM-DD" Dubai-local date keys (the same shape as Order.receivedDateKey)
 * with plain UTC date arithmetic, like weeks.ts.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

/** Hard cap on months in one view — beyond this the charts/tables stop being comparable at a glance. */
export const MAX_MONTHS = 12;

const pad = (n: number) => String(n).padStart(2, "0");

/** Months since year 0 — a single number to count and compare calendar months with. */
function monthIndex(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return year * 12 + (month - 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Resolves the range the monthly view covers. With no start picked it begins
 * on the first day that has any orders (`earliestKey`), so months before the
 * business started trading don't show up as empty columns — and that first
 * month is honestly partial (e.g. 17-31 Aug), not padded out to a full month.
 * A future end is clamped to today; the start moves forward to keep the view
 * within MAX_MONTHS and `clipped` says so.
 */
export function resolveMonthlyRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  todayKey: string,
  earliestKey: string | null | undefined,
): { from: string; to: string; clipped: boolean } {
  const to = dateTo && dateTo < todayKey ? dateTo : todayKey;
  let from = dateFrom ?? earliestKey ?? `${to.slice(0, 7)}-01`;
  if (from > to) from = to;

  const clipped = monthIndex(to) - monthIndex(from) + 1 > MAX_MONTHS;
  if (clipped) {
    const m = monthIndex(to) - (MAX_MONTHS - 1);
    from = `${Math.floor(m / 12)}-${pad((m % 12) + 1)}-01`;
  }

  return { from, to, clipped };
}

/**
 * One bucket per calendar month overlapping [from, to]. The first and last
 * can be partial (clipped to the range); `fullDays` is the month's real
 * length, so `days < fullDays` marks them. Months with zero orders are included.
 */
export function buildMonths(from: string, to: string): PeriodBucket[] {
  const months: PeriodBucket[] = [];
  for (let m = monthIndex(from); m <= monthIndex(to); m++) {
    const year = Math.floor(m / 12);
    const month = (m % 12) + 1;
    const fullDays = daysInMonth(year, month);
    const first = `${year}-${pad(month)}-01`;
    const last = `${year}-${pad(month)}-${pad(fullDays)}`;
    const start = first < from ? from : first;
    const end = last > to ? to : last;
    const index = months.length;
    months.push({
      index,
      label: `${MONTHS[month - 1]} ${year}`,
      shortLabel: MONTHS[month - 1],
      start,
      end,
      days: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1,
      fullDays,
      rangeLabel: fmtRange(start, end),
    });
  }
  return months;
}
