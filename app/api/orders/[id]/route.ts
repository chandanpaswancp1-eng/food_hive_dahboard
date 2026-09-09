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

    // GrubCenter's currently wired live endpoints (order-details, cancelled-orders,
    // location-performance) carry only order-level totals — no per-SKU name/price
    // breakdown exists anywhere in their raw fields (confirmed by inspecting every
    // field returned across a live sample: no item/product/menu keys at all, same
    // gap as the still-open Ratings source). Rather than show a blank invoice, fall
    // back to a single line representing the order's own total — clearly flagged
    // via itemsEstimated so the UI doesn't present it as a real per-item breakdown.
    const items =
      order.items.length > 0
        ? order.items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            totalPrice: Number(it.totalPrice),
          }))
        : [
            {
              name: order.brand.name,
              quantity: 1,
              unitPrice: Number(order.receiptTotal),
              totalPrice: Number(order.receiptTotal),
            },
          ];

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
      items,
      itemsEstimated: order.items.length === 0,
    };

    return NextResponse.json(invoice);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
