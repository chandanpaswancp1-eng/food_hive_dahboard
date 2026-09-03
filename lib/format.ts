export function fmtCurrency(n: number): string {
  return `AED ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
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
