import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFilters, buildStockoutWhere } from "@/lib/filters";
import type { StockoutEpisode } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

// Backs the "Most 86'd Items" table's drill-through (StockoutDrillModal) —
// the real per-episode history for one item, still respecting whatever
// global filters (date range/brand/location/channel) are already active,
// the same way the Orders-based drill-through does.
export async function GET(req: NextRequest) {
  try {
    const item = req.nextUrl.searchParams.get("item");
    if (!item) return NextResponse.json({ error: "Missing item" }, { status: 400 });

    const filters = parseFilters(req.nextUrl.searchParams);
    const where = { ...buildStockoutWhere(filters), itemName: item };

    const events = await prisma.stockoutEvent.findMany({
      where,
      include: { brand: true, location: true },
      orderBy: { markedUnavailableAt: "desc" },
      take: 200,
    });

    const rows: StockoutEpisode[] = events.map((e) => ({
      id: e.id,
      brand: e.brand?.name ?? "Unassigned",
      location: e.location?.name ?? "Unassigned",
      markedUnavailableAt: e.markedUnavailableAt.toISOString(),
      restoredAt: e.restoredAt ? e.restoredAt.toISOString() : null,
      durationMinutes: e.durationMinutes ? Number(e.durationMinutes) : null,
      source: e.source,
    }));

    return NextResponse.json({ item, rows });
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
