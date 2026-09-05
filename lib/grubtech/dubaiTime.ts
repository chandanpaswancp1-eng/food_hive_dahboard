/**
 * GrubCenter and this business operate in Asia/Dubai (UTC+4, fixed offset —
 * no DST since 1972), but `receivedAt` is stored as a true UTC instant.
 * Every place that needs a "calendar day" for this business (daily charts,
 * date-range filters, day-of-week/hour breakdowns) must bucket by Dubai
 * local time, not UTC — otherwise orders placed 00:00-03:59 Dubai time get
 * silently reassigned to the previous UTC day, which both mislabels
 * per-day totals and, at a date-range's start boundary, drops those orders
 * from the range entirely (they fall before the UTC `gte` cutoff even
 * though GrubCenter's own reports count them on the first day).
 */
export const DUBAI_OFFSET_MINUTES = 4 * 60;

/**
 * Shifts a UTC instant by the fixed Dubai offset so that reading UTC-getters
 * (getUTCHours, getUTCDay, etc.) off the shifted instant yields Dubai local
 * calendar fields. Only valid for fixed-offset zones like Asia/Dubai.
 */
function asDubaiShifted(utc: Date): Date {
  return new Date(utc.getTime() + DUBAI_OFFSET_MINUTES * 60_000);
}

export function dubaiHour(utc: Date): number {
  return asDubaiShifted(utc).getUTCHours();
}

export function dubaiDayOfWeek(utc: Date): number {
  return asDubaiShifted(utc).getUTCDay();
}

export function dubaiDayName(utc: Date): string {
  return asDubaiShifted(utc).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** "YYYY-MM-DD" calendar date in Dubai local time. */
export function dubaiDateKey(utc: Date): string {
  return asDubaiShifted(utc).toISOString().slice(0, 10);
}

/**
 * Combines a Dubai-local calendar date ("YYYY-MM-DD") and time-of-day
 * ("HH:mm:ss.sss") into the true UTC instant they represent.
 */
export function dubaiCivilToUtc(dateStr: string, timeStr: string): Date {
  const localMs = Date.parse(`${dateStr}T${timeStr}Z`);
  return new Date(localMs - DUBAI_OFFSET_MINUTES * 60_000);
}

/**
 * The UTC instant of a Dubai-local calendar date's start (00:00:00.000) or
 * end (23:59:59.999) — use these as `gte`/`lte` bounds when filtering by a
 * date-only "dateFrom"/"dateTo" picker value.
 */
export function dubaiDateBoundaryToUtc(dateStr: string, end: boolean): Date {
  return dubaiCivilToUtc(dateStr, end ? "23:59:59.999" : "00:00:00.000");
}

/**
 * Re-sets an instant's Dubai-local hour (minutes/seconds zeroed) while
 * keeping its Dubai-local calendar day fixed, returning the resulting UTC
 * instant. Used when a separate "hour" column overrides a date-only
 * receivedAt's meaningless baked-in time.
 */
export function setDubaiHour(utc: Date, hour: number): Date {
  const dateKey = dubaiDateKey(utc);
  return dubaiCivilToUtc(dateKey, `${String(hour).padStart(2, "0")}:00:00.000`);
}
