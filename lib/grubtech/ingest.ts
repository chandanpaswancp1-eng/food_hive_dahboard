import { prisma } from "@/lib/db";
import { ItemType, OrderStatus, Prisma } from "@prisma/client";
import { normalizeRawOrder, type NormalizedOrder } from "./normalize";

async function upsertBrand(name: string, cuisine?: string) {
  return prisma.brand.upsert({
    where: { name },
    update: cuisine ? { cuisine } : {},
    create: { name, cuisine },
  });
}

async function upsertLocation(name: string, vendorArea?: string) {
  return prisma.location.upsert({
    where: { name },
    update: vendorArea ? { vendorArea } : {},
    create: { name, vendorArea },
  });
}

async function upsertChannel(name: string) {
  return prisma.channel.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function upsertCancellationReason(description?: string) {
  if (!description) return null;
  return prisma.cancellationReason.upsert({
    where: { code: description },
    update: {},
    create: { code: description, description },
  });
}

function toItemType(raw?: string): ItemType {
  return raw && raw.toLowerCase().includes("modifier") ? ItemType.MODIFIER : ItemType.MENU_ITEM;
}

function toOrderStatus(raw?: string): OrderStatus {
  return raw && raw.toLowerCase().includes("cancel") ? OrderStatus.CANCELLED : OrderStatus.COMPLETED;
}

async function persistOrder(order: NormalizedOrder) {
  const [brand, location, channel, cancellationReason] = await Promise.all([
    upsertBrand(order.brand, order.cuisine),
    upsertLocation(order.location, order.vendorArea),
    upsertChannel(order.channel),
    upsertCancellationReason(order.cancellationReason),
  ]);

  const receiptTotal = order.receiptTotal ?? order.netSales;
  const discountAmount = order.discountAmount ?? 0;
  const discountPercent = receiptTotal > 0 ? Math.round((discountAmount / receiptTotal) * 10000) / 100 : 0;

  const data: Prisma.OrderUncheckedCreateInput = {
    externalId: String(order.id),
    orderNumber: String(order.orderNumber ?? order.id),
    brandId: brand.id,
    locationId: location.id,
    channelId: channel.id,
    cancellationReasonId: cancellationReason?.id,
    receivedAt: new Date(order.receivedAt),
    acceptedAt: order.acceptedAt ? new Date(order.acceptedAt) : null,
    startedAt: order.startedAt ? new Date(order.startedAt) : null,
    preparedAt: order.preparedAt ? new Date(order.preparedAt) : null,
    sentToDispatchAt: order.sentToDispatchAt ? new Date(order.sentToDispatchAt) : null,
    dispatchedAt: order.dispatchedAt ? new Date(order.dispatchedAt) : null,
    deliveredAt: order.deliveredAt ? new Date(order.deliveredAt) : null,
    durAccToStarted: order.durations.durAccToStarted,
    durStartedToPrep: order.durations.durStartedToPrep,
    durPrepToSTD: order.durations.durPrepToSTD,
    durSTDToDispatched: order.durations.durSTDToDispatched,
    durReceivingToDispatched: order.durations.durReceivingToDispatched,
    durReceivedToDelivered: order.durations.durReceivedToDelivered,
    netSales: order.netSales,
    receiptTotal,
    discountAmount,
    discountPercent,
    paymentMethod: order.paymentMethod,
    status: toOrderStatus(order.status),
    isPostCancelled: order.isPostCancelled ?? false,
    deliveryPartner: order.deliveryPartner,
    dayName: order.calendar.dayName,
    dayOfWeek: order.calendar.dayOfWeek,
    hour: order.calendar.hour,
    timeSlot: order.calendar.timeSlot,
    timeOfDay: order.calendar.timeOfDay,
    estimatedPrepTime: order.estimatedPrepTime,
    actualPrepTime: order.actualPrepTime,
    delayMinutes: order.delayMinutes,
    isDelayed: order.isDelayed,
  };

  const saved = await prisma.order.upsert({
    where: { externalId: data.externalId },
    create: data,
    update: data,
  });

  if (order.items?.length) {
    await prisma.orderItem.deleteMany({ where: { orderId: saved.id } });
    await prisma.orderItem.createMany({
      data: order.items.map((item) => ({
        orderId: saved.id,
        name: item.name ?? "Unnamed item",
        itemType: toItemType(item.itemType),
        itemSource: item.itemSource,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        totalPrice: item.totalPrice ?? item.unitPrice ?? 0,
      })),
    });
  }

  if (order.rating !== undefined) {
    await prisma.rating.deleteMany({ where: { orderId: saved.id } });
    await prisma.rating.create({
      data: {
        orderId: saved.id,
        value: Math.round(order.rating),
        ratedAt: order.deliveredAt ? new Date(order.deliveredAt) : new Date(order.receivedAt),
      },
    });
  }

  return saved;
}

export interface IngestResult {
  ingested: number;
  skipped: number;
  issues: string[];
}

export async function ingestRawOrders(rawOrders: unknown[]): Promise<IngestResult> {
  let ingested = 0;
  const issues: string[] = [];

  for (const raw of rawOrders) {
    const result = normalizeRawOrder(raw);
    if (!result.ok) {
      issues.push(...result.issues);
      continue;
    }
    try {
      await persistOrder(result.order);
      ingested += 1;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { ingested, skipped: rawOrders.length - ingested, issues };
}
