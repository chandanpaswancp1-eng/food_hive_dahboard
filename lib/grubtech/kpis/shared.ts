import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface DimensionMaps {
  brands: Map<string, { name: string; cuisine: string | null }>;
  locations: Map<string, { name: string }>;
  channels: Map<string, { name: string }>;
  reasons: Map<string, { description: string }>;
}

/**
 * Small lookup tables (dozens to a couple hundred rows), loaded once per
 * request so groupBy results (keyed by id) can be labeled without joining
 * the full Order table.
 */
export async function loadDimensionMaps(): Promise<DimensionMaps> {
  const [brands, locations, channels, reasons] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, name: true, cuisine: true } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
    prisma.channel.findMany({ select: { id: true, name: true } }),
    prisma.cancellationReason.findMany({ select: { id: true, description: true } }),
  ]);
  return {
    brands: new Map(brands.map((b) => [b.id, { name: b.name, cuisine: b.cuisine }])),
    locations: new Map(locations.map((l) => [l.id, { name: l.name }])),
    channels: new Map(channels.map((c) => [c.id, { name: c.name }])),
    reasons: new Map(reasons.map((r) => [r.id, { description: r.description }])),
  };
}

export async function loadStockouts(where: Prisma.StockoutEventWhereInput) {
  return prisma.stockoutEvent.findMany({
    where,
    include: { brand: true, location: true, channel: true },
    orderBy: { markedUnavailableAt: "asc" },
  });
}

export type LoadedStockout = Awaited<ReturnType<typeof loadStockouts>>[number];

/**
 * Converts a Prisma Decimal/aggregate result to a plain JS number, rounded
 * to 2dp — SUM()/AVG() over Decimal columns routinely produce values like
 * 2929.8399999999992 that need cleaning up before they reach charts or JSON.
 */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * 100) / 100;
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sortDesc<T>(rows: T[], key: (row: T) => number): T[] {
  return [...rows].sort((a, b) => key(b) - key(a));
}
