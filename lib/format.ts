export function fmtCurrency(n: number): string {
  return `AED ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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

export function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Rounds floating-point sums (e.g. 2929.8399999999992) to 2 decimals before they hit JSON/charts. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
