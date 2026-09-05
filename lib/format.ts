export function fmtCurrency(n: number): string {
  return `AED ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Full precision (to the cent) — used as the hover tooltip for compact KPI cards. */
export function fmtCurrencyExact(n: number): string {
  return `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Abbreviated form (1.2K, 3.4M) for the big headline KPI cards — the exact
 * comma-separated form (fmtCurrency/fmtNumber) is what tables should keep
 * using, but a 7-8 digit number in a fixed-width KPI cell just gets
 * ellipsis-truncated to "...". Leaves small numbers (<1000) untouched.
 */
export function fmtCurrencyCompact(n: number): string {
  return `AED ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
}

export function fmtNumberCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function fmtMinutes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}m`;
}

// This business (and GrubCenter's own reporting) runs on Gulf Standard Time
// (UTC+4, no DST) — clock times shown to a viewer must be pinned to it
// explicitly, otherwise `toLocaleString()`/`toLocaleTimeString()` render in
// whatever timezone the *viewer's* browser happens to be set to (often UTC
// on a server or a different machine), silently disagreeing with GrubCenter.
const GST_TIME_ZONE = "Asia/Dubai";

/** Date + time in GST, independent of the viewer's own browser timezone. */
export function fmtDateTimeGst(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: GST_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
  return `${formatted} GST`;
}

/** Time-only in GST, independent of the viewer's own browser timezone. */
export function fmtTimeGst(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: GST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${formatted} GST`;
}

export function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Rounds floating-point sums (e.g. 2929.8399999999992) to 2 decimals before they hit JSON/charts. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
