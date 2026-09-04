import type { TabId, TabPayload, DashboardFilters } from "@/lib/types";
import { buildOrderWhere, buildStockoutWhere } from "@/lib/filters";
import { loadStockouts } from "./shared";
import { prisma } from "@/lib/db";
import { buildSalesTab } from "./sales";
import { buildCancellationsTab } from "./cancellations";
import { buildPrepTimeTab } from "./prepTime";
import { buildRatingsTab } from "./ratings";
import { buildDelayedTab } from "./delayed";
import { buildStockoutsTab } from "./stockouts";

export async function buildTabPayload(tab: TabId, filters: DashboardFilters): Promise<TabPayload> {
  if (tab === "stockouts") {
    const [events, orderCount] = await Promise.all([
      loadStockouts(buildStockoutWhere(filters)),
      prisma.order.count({ where: buildOrderWhere(filters) }),
    ]);
    return buildStockoutsTab(events, orderCount);
  }

  const where = buildOrderWhere(filters);

  switch (tab) {
    case "order-details":
      return buildSalesTab(where);
    case "cancellations":
      return buildCancellationsTab(where);
    case "prep-time":
      return buildPrepTimeTab(where);
    case "ratings":
      return buildRatingsTab(where);
    case "delayed":
      return buildDelayedTab(where);
    default:
      throw new Error(`Unknown tab: ${tab satisfies never}`);
  }
}
