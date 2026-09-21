import type { Prisma } from "@prisma/client";
import type { DashboardFilters } from "./types";
import { dubaiDateBoundaryToUtc } from "./grubtech/dubaiTime";
import { TEST_BRAND_NAME, TEST_CHANNEL_NAME } from "./grubtech/testFixture";

export function parseFilters(searchParams: URLSearchParams): DashboardFilters {
  const multi = (key: string) => {
    const v = searchParams.getAll(key).flatMap((s) => s.split(",")).filter(Boolean);
    return v.length ? v : undefined;
  };

  return {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    brands: multi("brand"),
    cuisines: multi("cuisine"),
    locations: multi("location"),
    channels: multi("channel"),
    paymentMethods: multi("payment"),
  };
}

export function buildOrderWhere(filters: DashboardFilters): Prisma.OrderWhereInput {
  // Never count GrubCenter's sandbox fixture as a real order — ingest now
  // blocks it (lib/grubtech/normalize.ts), but rows ingested before that rule
  // are still in the DB and would otherwise inflate every tab, drill-through
  // and export that shares this filter.
  const where: Prisma.OrderWhereInput = {
    NOT: [
      { brand: { name: { equals: TEST_BRAND_NAME, mode: "insensitive" } } },
      { channel: { name: { equals: TEST_CHANNEL_NAME, mode: "insensitive" } } },
    ],
  };

  if (filters.dateFrom || filters.dateTo) {
    where.receivedAt = {
      ...(filters.dateFrom ? { gte: dubaiDateBoundaryToUtc(filters.dateFrom, false) } : {}),
      ...(filters.dateTo ? { lte: dubaiDateBoundaryToUtc(filters.dateTo, true) } : {}),
    };
  }

  if (filters.brands?.length) {
    where.brand = { name: { in: filters.brands } };
  }

  if (filters.cuisines?.length) {
    where.brand = { ...(where.brand as object), cuisine: { in: filters.cuisines } };
  }

  if (filters.locations?.length) {
    where.location = { name: { in: filters.locations } };
  }

  if (filters.channels?.length) {
    where.channel = { name: { in: filters.channels } };
  }

  if (filters.paymentMethods?.length) {
    where.paymentMethod = { in: filters.paymentMethods };
  }

  return where;
}

export function buildStockoutWhere(filters: DashboardFilters): Prisma.StockoutEventWhereInput {
  const where: Prisma.StockoutEventWhereInput = {};

  if (filters.dateFrom || filters.dateTo) {
    where.markedUnavailableAt = {
      ...(filters.dateFrom ? { gte: dubaiDateBoundaryToUtc(filters.dateFrom, false) } : {}),
      ...(filters.dateTo ? { lte: dubaiDateBoundaryToUtc(filters.dateTo, true) } : {}),
    };
  }

  if (filters.brands?.length) {
    where.brand = { name: { in: filters.brands } };
  }

  if (filters.locations?.length) {
    where.location = { name: { in: filters.locations } };
  }

  if (filters.channels?.length) {
    where.channel = { name: { in: filters.channels } };
  }

  return where;
}
