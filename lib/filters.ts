import type { Prisma } from "@prisma/client";
import type { DashboardFilters } from "./types";
import { dubaiDateBoundaryToUtc } from "./grubtech/dubaiTime";

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
  const where: Prisma.OrderWhereInput = {};

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
