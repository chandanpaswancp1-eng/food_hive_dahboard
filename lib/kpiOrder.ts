const PREFIX = "foodhive.kpiOrder.";

/**
 * Per-tab custom KPI card order, saved locally in the browser via
 * KpiStrip's "Customize" drag-to-reorder mode. This app has no multi-user/
 * auth system, so there's nothing to sync across devices — localStorage is
 * the whole persistence layer, deliberately.
 */
export function loadKpiOrder(tabId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + tabId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function saveKpiOrder(tabId: string, order: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + tabId, JSON.stringify(order));
  } catch {
    // Private browsing / storage quota — reordering just won't persist this session.
  }
}

export function clearKpiOrder(tabId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + tabId);
  } catch {
    // ignore
  }
}
