import { prisma } from "@/lib/db";
import { ItemType, OrderStatus, Prisma } from "@prisma/client";
import { normalizeRawOrder, type NormalizedOrder } from "./normalize";

/**
 * Resolving Brand/Location/Channel/CancellationReason per row (4 upserts x
 * every row) is what actually broke a 24k-row real import — not bad data,
 * but the sheer number of sequential round-trips to a remote DB triggered
 * transient "can't reach database server" errors partway through. Real
 * imports repeat the same ~100-ish distinct dimension values thousands of
 * times, so caching them in memory for the duration of one import call
 * turns that into a handful of upserts instead of tens of thousands.
 */
class DimensionCache {
  private brand = new Map<string, string>();
  private location = new Map<string, string>();
  private channel = new Map<string, string>();
  private cancellationReason = new Map<string, string>();

  async preload() {
    const [brands, locations, channels, reasons] = await Promise.all([
      prisma.brand.findMany({ select: { id: true, name: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.channel.findMany({ select: { id: true, name: true } }),
      prisma.cancellationReason.findMany({ select: { id: true, code: true } }),
    ]);
    brands.forEach((b) => this.brand.set(b.name, b.id));
    locations.forEach((l) => this.location.set(l.name, l.id));
    channels.forEach((c) => this.channel.set(c.name, c.id));
    reasons.forEach((r) => r.code && this.cancellationReason.set(r.code, r.id));
  }

  async resolveBrand(name: string, cuisine?: string): Promise<string> {
    const cached = this.brand.get(name);
    if (cached) return cached;
    const row = await prisma.brand.upsert({
      where: { name },
      update: cuisine ? { cuisine } : {},
      create: { name, cuisine },
    });
    this.brand.set(name, row.id);
    return row.id;
  }

  async resolveLocation(name: string, vendorArea?: string): Promise<string> {
    const cached = this.location.get(name);
    if (cached) return cached;
    const row = await prisma.location.upsert({
      where: { name },
      update: vendorArea ? { vendorArea } : {},
      create: { name, vendorArea },
    });
    this.location.set(name, row.id);
    return row.id;
  }

  async resolveChannel(name: string): Promise<string> {
    const cached = this.channel.get(name);
    if (cached) return cached;
    const row = await prisma.channel.upsert({ where: { name }, update: {}, create: { name } });
    this.channel.set(name, row.id);
    return row.id;
  }

  async resolveCancellationReason(description?: string): Promise<string | null> {
    if (!description) return null;
    const cached = this.cancellationReason.get(description);
    if (cached) return cached;
    const row = await prisma.cancellationReason.upsert({
      where: { code: description },
      update: {},
      create: { code: description, description },
    });
    this.cancellationReason.set(description, row.id);
    return row.id;
  }
}

function toItemType(raw?: string): ItemType {
  return raw && raw.toLowerCase().includes("modifier") ? ItemType.MODIFIER : ItemType.MENU_ITEM;
}

function toOrderStatus(raw?: string): OrderStatus {
  return raw && raw.toLowerCase().includes("cancel") ? OrderStatus.CANCELLED : OrderStatus.COMPLETED;
}

const TRANSIENT_ERROR_HINTS = [
  "can't reach database server",
  "connection terminated",
  "econnreset",
  "etimedout",
  "timed out",
];

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return TRANSIENT_ERROR_HINTS.some((hint) => message.includes(hint));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

/** Runs `fn` over `items` with at most `concurrency` in flight at once. */
async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function persistOrder(order: NormalizedOrder, cache: DimensionCache) {
  const [brandId, locationId, channelId, cancellationReasonId] = await Promise.all([
    cache.resolveBrand(order.brand, order.cuisine),
    cache.resolveLocation(order.location, order.vendorArea),
    cache.resolveChannel(order.channel),
    cache.resolveCancellationReason(order.cancellationReason),
  ]);

  const receiptTotal = order.receiptTotal ?? order.netSales;
  const discountAmount = order.discountAmount ?? 0;
  // Column is Decimal(5,2) (max 999.99) — a tiny/near-zero receiptTotal next to a
  // real discountAmount can produce a nonsensical ratio (seen once in a real
  // 24k-row import); clamp rather than let one outlier row fail the whole batch.
  const rawDiscountPercent = receiptTotal > 0 ? (discountAmount / receiptTotal) * 100 : 0;
  const discountPercent = Math.round(Math.min(rawDiscountPercent, 999.99) * 100) / 100;

  const data: Prisma.OrderUncheckedCreateInput = {
    externalId: String(order.id),
    orderNumber: String(order.orderNumber ?? order.id),
    brandId,
    locationId,
    channelId,
    cancellationReasonId,
    receivedAt: new Date(order.receivedAt),
    receivedDateKey: order.receivedAt.slice(0, 10),
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

// Kept modest since DATABASE_URL now goes through Supabase's transaction-mode
// pgbouncer pooler (connection_limit=10) rather than a direct connection —
// pushing more concurrent DB ops than the pool can serve caused rows to be
// silently dropped on a real import (only 651/1450 landed) despite retries.
const INGEST_CONCURRENCY = 4;

export async function ingestRawOrders(rawOrders: unknown[]): Promise<IngestResult> {
  const cache = new DimensionCache();
  await cache.preload();

  let ingested = 0;
  const issues: string[] = [];

  const normalized: NormalizedOrder[] = [];
  for (const raw of rawOrders) {
    const result = normalizeRawOrder(raw);
    if (!result.ok) {
      issues.push(...result.issues);
      continue;
    }
    normalized.push(result.order);
  }

  await runWithConcurrency(normalized, INGEST_CONCURRENCY, async (order) => {
    try {
      await withRetry(() => persistOrder(order, cache));
      ingested += 1;
    } catch (error) {
      issues.push(error instanceof Error ? error.message.split("\n").pop()! : String(error));
    }
  });

  return { ingested, skipped: rawOrders.length - ingested, issues };
}
