import type { AlertItem } from "@/lib/types";
import { getPortalStatusPayload } from "@/lib/portalStatus";
import { loadStockouts } from "./kpis/shared";

/**
 * Two independent sources feeding one alert list:
 *  - portal-closed: real data only once a lib/portalStatus/* adapter has
 *    credentials — until then getPortalStatusPayload() never returns
 *    isOpen === false, so this side naturally contributes nothing yet.
 *  - item-86d: StockoutEvent rows with restoredAt still null are items
 *    currently unavailable — loadStockouts already supports this filter,
 *    nothing new needed at the data layer.
 */
export async function getActiveAlerts(): Promise<AlertItem[]> {
  const [portalStatus, openStockouts] = await Promise.all([
    getPortalStatusPayload(),
    loadStockouts({ restoredAt: null }),
  ]);

  const portalAlerts: AlertItem[] = portalStatus.portals
    .filter((p) => p.isOpen === false)
    .map((p) => ({
      id: `portal:${p.channel}`,
      kind: "portal-closed",
      severity: "danger",
      title: `${p.channel} is closed`,
      detail: p.message,
      since: portalStatus.fetchedAt,
    }));

  const stockoutAlerts: AlertItem[] = openStockouts.map((e) => ({
    id: `stockout:${e.id}`,
    kind: "item-86d",
    severity: "warning",
    title: `${e.itemName} marked 86'd`,
    detail: `${e.brand?.name ?? "Unassigned brand"} · ${e.location?.name ?? "Unassigned location"}`,
    since: e.markedUnavailableAt.toISOString(),
  }));

  return [...portalAlerts, ...stockoutAlerts].sort((a, b) => (a.since < b.since ? 1 : -1));
}
