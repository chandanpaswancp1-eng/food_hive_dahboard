import type { Prisma } from "@prisma/client";
import type { DashboardFilters, TabPayload } from "@/lib/types";
import { buildOrderWhere } from "@/lib/filters";
import { dubaiDateKey } from "@/lib/grubtech/dubaiTime";
import { buildWeeks, resolveWeeklyRange } from "@/lib/grubtech/weeks";
import { buildComparisonTab } from "./comparison";

export async function buildWeeklyTab(filters: DashboardFilters): Promise<TabPayload> {
  const range = resolveWeeklyRange(filters.dateFrom, filters.dateTo, dubaiDateKey(new Date()));
  const weeks = buildWeeks(range.from, range.to);

  // Same completed-only convention as Order Details/Income
  // (lib/grubtech/kpis/sales.ts) so a week's figures reconcile with the
  // Order Details tab scoped to the same dates.
  const where: Prisma.OrderWhereInput = {
    ...buildOrderWhere({ ...filters, dateFrom: range.from, dateTo: range.to }),
    status: "COMPLETED",
  };

  return buildComparisonTab({
    where,
    buckets: weeks,
    noun: "Week",
    tab: "weekly",
    range,
    captionNote: range.clipped ? ` · showing the latest ${weeks.length} weeks` : "",
  });
}
