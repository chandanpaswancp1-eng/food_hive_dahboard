import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { DashboardFilters, TabPayload } from "@/lib/types";
import { buildOrderWhere } from "@/lib/filters";
import { dubaiDateKey } from "@/lib/grubtech/dubaiTime";
import { buildMonths, MAX_MONTHS, resolveMonthlyRange } from "@/lib/grubtech/months";
import { buildComparisonTab } from "./comparison";

export async function buildMonthlyTab(filters: DashboardFilters): Promise<TabPayload> {
  // Same completed-only convention as Order Details/Income
  // (lib/grubtech/kpis/sales.ts) so a month's figures reconcile with the
  // Order Details tab scoped to the same dates.
  const completed: Prisma.OrderWhereInput = { status: "COMPLETED" };

  // With no start picked the view begins on the 1st of the month that has
  // the first order (under the other filters), so months before trading
  // began aren't empty columns while the first month still runs in full
  // (e.g. Aug 1-31, not just the days actually trading). Skipped when a
  // start is picked — it wouldn't be used.
  const earliest = filters.dateFrom
    ? null
    : await prisma.order.aggregate({
        where: { ...buildOrderWhere({ ...filters, dateFrom: undefined, dateTo: undefined }), ...completed },
        _min: { receivedDateKey: true },
      });

  const range = resolveMonthlyRange(
    filters.dateFrom,
    filters.dateTo,
    dubaiDateKey(new Date()),
    earliest?._min.receivedDateKey,
  );
  const months = buildMonths(range.from, range.to);

  return buildComparisonTab({
    where: { ...buildOrderWhere({ ...filters, dateFrom: range.from, dateTo: range.to }), ...completed },
    buckets: months,
    noun: "Month",
    tab: "monthly",
    range,
    captionNote: range.clipped ? ` · showing the latest ${MAX_MONTHS} months` : "",
    // Months differ in length (and the first/last can be partial), so raw
    // totals aren't comparable on their own — show the per-day figure too.
    perDayTable: true,
  });
}
