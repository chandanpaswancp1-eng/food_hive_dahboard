import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function loadOrders(where: Prisma.OrderWhereInput) {
  return prisma.order.findMany({
    where,
    include: {
      brand: true,
      location: true,
      channel: true,
      cancellationReason: true,
      items: true,
      ratings: true,
    },
    orderBy: { receivedAt: "asc" },
  });
}

export type LoadedOrder = Awaited<ReturnType<typeof loadOrders>>[number];

export async function loadStockouts(where: Prisma.StockoutEventWhereInput) {
  return prisma.stockoutEvent.findMany({
    where,
    include: { brand: true, location: true, channel: true },
    orderBy: { markedUnavailableAt: "asc" },
  });
}

export type LoadedStockout = Awaited<ReturnType<typeof loadStockouts>>[number];

export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sortDesc<T>(rows: T[], key: (row: T) => number): T[] {
  return [...rows].sort((a, b) => key(b) - key(a));
}
