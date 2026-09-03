import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFilters, buildOrderWhere } from "@/lib/filters";
import type { DrillThroughRow } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const where = buildOrderWhere(filters);

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
