// Chart.js/canvas can't read CSS custom properties directly, so colors and
// the resolved font family are pulled from computed styles here instead.
export function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getChartPalette(): string[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((n) => cssVar(`--chart-${n}`, "#9b9797"));
}

export function getInkColor(): string {
  return cssVar("--color-text", "#201e1d");
}

export function getGridColor(): string {
  return cssVar("--color-border", "#d7d3d3");
}

export function getSurfaceColor(): string {
  return cssVar("--color-surface", "#ffffff");
}

export function getResolvedFontFamily(): string {
  // next/font generates a scoped local family name (e.g. __Archivo_xxxxx)
  // inside --font-archivo — resolve it so canvas text renders the real font.
  return cssVar("--font-archivo", "system-ui, sans-serif");
}
