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

const TAB_CACHE_TTL_MS = 20_000;
const tabCache = new Map<string, { data: TabPayload; expiresAt: number }>();

async function computeTabPayload(tab: TabId, filters: DashboardFilters): Promise<TabPayload> {
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

/**
 * Real per-query DB latency this session has run 1-3s+ (a network condition,
 * not something the aggregation queries themselves can fix) — switching tabs
 * back and forth, or the dashboard's 15s self-heal retry tick, re-ran every
 * query each time even though nothing had changed. A short cache keyed by
 * the exact tab+filters combination makes repeat views instant; data only
 * actually changes via a manual import, which clears this immediately.
 */
export async function buildTabPayload(tab: TabId, filters: DashboardFilters): Promise<TabPayload> {
  const cacheKey = `${tab}|${JSON.stringify(filters)}`;
  const cached = tabCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await computeTabPayload(tab, filters);
  tabCache.set(cacheKey, { data, expiresAt: Date.now() + TAB_CACHE_TTL_MS });
  return data;
}

export function invalidateTabCache() {
  tabCache.clear();
}
