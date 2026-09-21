/**
 * Week bucketing for the Weekly Comparison tab: 7-day blocks counted from the
 * first day of the range, so for a month Week 1 is always days 1-7, Week 2 is
 * 8-14, and so on — every month starts its weeks on the 1st.
 *
 * Everything here works on "YYYY-MM-DD" Dubai-local date keys (the same shape
 * as Order.receivedDateKey) using plain UTC date arithmetic — the keys are
 * already Dubai-local calendar dates, so no timezone shifting is involved.
 */

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Hard cap on weeks in one view — beyond this the charts/tables stop being comparable at a glance. */
export const MAX_WEEKS = 12;

export interface WeekBucket {
  /** 0-based position in the range. */
  index: number;
  /** "Week 1", "Week 2", ... */
  label: string;
  /** "W1", "W2", ... — compact form for card subtitles. */
  shortLabel: string;
  /** First day of the week. */
  start: string;
  /** Last day of the week inside the range (clipped to the range end for the last week). */
  end: string;
  /** Days in the bucket — 7 for a full week. */
  days: number;
  /** e.g. "1–7 Sep" or "29 Sep – 5 Oct". */
  rangeLabel: string;
}

function toMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return fromMs(toMs(key) + n * DAY_MS);
}

function fmtDay(key: string): string {
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(start);
  const [, startMonth, startDay] = start.split("-").map(Number);
  const [, endMonth] = end.split("-").map(Number);
  return startMonth === endMonth ? `${startDay}–${fmtDay(end)}` : `${fmtDay(start)} – ${fmtDay(end)}`;
}

/**
 * Resolves the range the weekly view actually covers. With no range picked
 * it's the current month so far (1st -> today); a lone end date falls back
 * to the start of its own month. A future end is clamped to today (days that
 * haven't happened yet can't have orders and would only dilute the last
 * week). If the range would need more than MAX_WEEKS weeks, the start moves
 * forward by whole weeks — so the 7-day blocks stay aligned to the original
 * start — and `clipped` says so.
 */
export function resolveWeeklyRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  todayKey: string,
): { from: string; to: string; clipped: boolean } {
  const to = dateTo && dateTo < todayKey ? dateTo : todayKey;
  let from = dateFrom ?? `${to.slice(0, 7)}-01`;
  if (from > to) from = to;

  const weekCount = Math.ceil(((toMs(to) - toMs(from)) / DAY_MS + 1) / 7);
  const clipped = weekCount > MAX_WEEKS;
  if (clipped) from = addDays(from, 7 * (weekCount - MAX_WEEKS));

  return { from, to, clipped };
}

/**
 * Splits [from, to] into consecutive 7-day weeks numbered from 1, the first
 * starting on `from` itself (for a month: 1-7, 8-14, 15-21, 22-28, 29-end).
 * Only the last week can be shorter than 7 days — the month's leftover days,
 * or the week still in progress. Weeks with zero orders are included.
 */
export function buildWeeks(from: string, to: string): WeekBucket[] {
  const weeks: WeekBucket[] = [];
  for (let start = from; start <= to; start = addDays(start, 7)) {
    const sunday = addDays(start, 6);
    const end = sunday > to ? to : sunday;
    const index = weeks.length;
    weeks.push({
      index,
      label: `Week ${index + 1}`,
      shortLabel: `W${index + 1}`,
      start,
      end,
      days: Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1,
      rangeLabel: fmtRange(start, end),
    });
  }
  return weeks;
}

/** Index of the bucket a date key falls in, or -1 if it's outside every bucket. */
export function bucketIndexOf(dateKey: string, weeks: WeekBucket[]): number {
  return weeks.findIndex((w) => dateKey >= w.start && dateKey <= w.end);
}
