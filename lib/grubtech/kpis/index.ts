import type { TabId, TabPayload, DashboardFilters } from "@/lib/types";
import { buildOrderWhere, buildStockoutWhere } from "@/lib/filters";
import { loadOrders, loadStockouts } from "./shared";
import { buildSalesTab } from "./sales";
import { buildCancellationsTab } from "./cancellations";
import { buildPrepTimeTab } from "./prepTime";
import { buildRatingsTab } from "./ratings";
import { buildDelayedTab } from "./delayed";
import { buildStockoutsTab } from "./stockouts";

export async function buildTabPayload(tab: TabId, filters: DashboardFilters): Promise<TabPayload> {
  if (tab === "stockouts") {
    const [events, orders] = await Promise.all([
      loadStockouts(buildStockoutWhere(filters)),
      loadOrders(buildOrderWhere(filters)),
    ]);
    return buildStockoutsTab(events, orders.length);
  }

  const orders = await loadOrders(buildOrderWhere(filters));

  switch (tab) {
    case "order-details":
      return buildSalesTab(orders);
    case "cancellations":
      return buildCancellationsTab(orders);
    case "prep-time":
      return buildPrepTimeTab(orders);
    case "ratings":
      return buildRatingsTab(orders);
    case "delayed":
      return buildDelayedTab(orders);
    default:
      throw new Error(`Unknown tab: ${tab satisfies never}`);
  }
}
