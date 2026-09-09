import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { OrderInvoice } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        brand: true,
        location: true,
        channel: true,
        cancellationReason: true,
        ratings: true,
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const invoice: OrderInvoice = {
      id: order.id,
      orderNumber: order.orderNumber,
      receivedAt: order.receivedAt.toISOString(),
      brand: order.brand.name,
      location: order.location.name,
      channel: order.channel.name,
      paymentMethod: order.paymentMethod,
      status: order.status,
      isPostCancelled: order.isPostCancelled,
      cancellationReason: order.cancellationReason?.description ?? null,
      deliveryPartner: order.deliveryPartner,
      netSales: Number(order.netSales),
      receiptTotal: Number(order.receiptTotal),
      discountAmount: Number(order.discountAmount),
      discountPercent: Number(order.discountPercent),
      taxAmount: Number(order.taxAmount),
      grossSales: Number(order.receiptTotal) + Number(order.discountAmount),
      actualPrepTime: order.actualPrepTime ? Number(order.actualPrepTime) : null,
      delayMinutes: order.delayMinutes ? Number(order.delayMinutes) : null,
      rating: order.ratings[0]?.value ?? null,
      items: order.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
      })),
    };

    return NextResponse.json(invoice);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
