import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFilters, buildOrderWhere } from "@/lib/filters";
import { toCsv } from "@/lib/csv";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);

    const orders = await prisma.order.findMany({
      where: buildOrderWhere(filters),
      include: { brand: true, location: true, channel: true, ratings: true },
      orderBy: { receivedAt: "desc" },
    });

    const rows = orders.map((o) => ({
      OrderID: o.orderNumber,
      ReceivedAt: o.receivedAt.toISOString(),
      Brand: o.brand.name,
      Cuisine: o.brand.cuisine ?? "",
      Location: o.location.name,
      Channel: o.channel.name,
      PaymentMethod: o.paymentMethod ?? "",
      Status: o.status,
      NetSales: Number(o.netSales),
      ReceiptTotal: Number(o.receiptTotal),
      DiscountAmount: Number(o.discountAmount),
      DurationPrepMins: o.actualPrepTime ? Number(o.actualPrepTime) : "",
      Rating: o.ratings[0]?.value ?? "",
      IsDelayed: o.isDelayed,
    }));

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="foodhive-export-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
