import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface DimensionMaps {
  brands: Map<string, { name: string; cuisine: string | null }>;
  locations: Map<string, { name: string }>;
  channels: Map<string, { name: string }>;
  reasons: Map<string, { description: string }>;
}

const DIMENSION_CACHE_TTL_MS = 60_000;
let dimensionCache: { data: DimensionMaps; expiresAt: number } | null = null;

/**
 * Small lookup tables (dozens to a couple hundred rows) that every tab needs
 * to label groupBy results, but that only change via import. Re-querying
 * them on every single dashboard request quadrupled our round-trip count
 * for no benefit — with real DB latency running 1-3s+ per query this session,
 * that's most of a tab's load time. Cached in-process for a minute;
 * invalidateDimensionCache() clears it immediately after an import.
 */
export async function loadDimensionMaps(): Promise<DimensionMaps> {
  if (dimensionCache && dimensionCache.expiresAt > Date.now()) {
    return dimensionCache.data;
  }

  const [brands, locations, channels, reasons] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, name: true, cuisine: true } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
    prisma.channel.findMany({ select: { id: true, name: true } }),
    prisma.cancellationReason.findMany({ select: { id: true, description: true } }),
  ]);
  const data: DimensionMaps = {
    brands: new Map(brands.map((b) => [b.id, { name: b.name, cuisine: b.cuisine }])),
    locations: new Map(locations.map((l) => [l.id, { name: l.name }])),
    channels: new Map(channels.map((c) => [c.id, { name: c.name }])),
    reasons: new Map(reasons.map((r) => [r.id, { description: r.description }])),
  };
  dimensionCache = { data, expiresAt: Date.now() + DIMENSION_CACHE_TTL_MS };
  return data;
}

export function invalidateDimensionCache() {
  dimensionCache = null;
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
