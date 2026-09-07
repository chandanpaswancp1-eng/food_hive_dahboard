import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma, OrderStatus } from "@prisma/client";
import { parseFilters, buildOrderWhere } from "@/lib/filters";
import type { DrillThroughRow, TabId } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

// Mirrors each tab builder's own status convention (lib/grubtech/kpis/*) so
// a drill-through opened from a tab's chart never disagrees with that tab's
// own KPI cards — e.g. Order Details' "18 orders" card vs. a same-day
// drill-through that used to show all 19 (including the cancelled one).
const TAB_STATUS_FILTER: Partial<Record<TabId, OrderStatus>> = {
  "order-details": "COMPLETED",
  "prep-time": "COMPLETED",
  delayed: "COMPLETED",
  cancellations: "CANCELLED",
};

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const tab = req.nextUrl.searchParams.get("tab") as TabId | null;
    const statusFilter = tab ? TAB_STATUS_FILTER[tab] : undefined;
    const where: Prisma.OrderWhereInput = statusFilter
      ? { ...buildOrderWhere(filters), status: statusFilter }
      : buildOrderWhere(filters);

    const orders = await prisma.order.findMany({
      where,
      include: { brand: true, location: true, channel: true, ratings: true },
      orderBy: { receivedAt: "desc" },
      take: 500,
    });

    const rows: DrillThroughRow[] = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      receivedAt: o.receivedAt.toISOString(),
      brand: o.brand.name,
      location: o.location.name,
      channel: o.channel.name,
      paymentMethod: o.paymentMethod,
      status: o.status,
      netSales: Number(o.netSales),
      actualPrepTime: o.actualPrepTime ? Number(o.actualPrepTime) : null,
      rating: o.ratings[0]?.value ?? null,
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
