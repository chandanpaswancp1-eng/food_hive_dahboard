import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtMinutes, fmtNumber, fmtNumberCompact, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";

export async function buildDelayedTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const completedWhere: Prisma.OrderWhereInput = { ...where, status: "COMPLETED" };
  const delayedWhere: Prisma.OrderWhereInput = { ...completedWhere, isDelayed: true };

  const [
    totalByBrandLoc,
    delayedByBrandLoc,
    totalByBrand,
    delayedByBrand,
    totalByLocation,
    delayedByLocation,
    prepByBrand,
    overall,
    dims,
    scopeCount,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["brandId", "locationId"],
      where: completedWhere,
      _count: { _all: true },
      _avg: { actualPrepTime: true },
    }),
    prisma.order.groupBy({ by: ["brandId", "locationId"], where: delayedWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["brandId"], where: completedWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["brandId"], where: delayedWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["locationId"], where: completedWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["locationId"], where: delayedWhere, _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["brandId"],
      where: completedWhere,
      _avg: { estimatedPrepTime: true, actualPrepTime: true },
    }),
    prisma.order.aggregate({ where: completedWhere, _count: { _all: true }, _avg: { actualPrepTime: true } }),
    loadDimensionMaps(),
    prisma.order.count({ where }),
  ]);

  const delayedByBrandLocMap = new Map(delayedByBrandLoc.map((g) => [`${g.brandId}__${g.locationId}`, g._count._all]));
  const delayedByBrandMap = new Map(delayedByBrand.map((g) => [g.brandId, g._count._all]));

  const totalOrders = overall._count._all;
  const delayedOrders = totalByBrandLoc.reduce(
    (sum, g) => sum + (delayedByBrandLocMap.get(`${g.brandId}__${g.locationId}`) ?? 0),
    0,
  );
  const delayRate = safeDiv(delayedOrders, totalOrders) * 100;
  const avgPrep = num(overall._avg.actualPrepTime);
  const onTimeCompliance = 100 - delayRate;

  const statusFlag = (rate: number) => (rate > 20 ? "Critical" : rate > 12 ? "Warning" : rate > 6 ? "Watch" : "Healthy");

  const rows = sortDesc(
    totalByBrandLoc.map((g) => {
      const delayed = delayedByBrandLocMap.get(`${g.brandId}__${g.locationId}`) ?? 0;
      return {
        brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
        location: dims.locations.get(g.locationId)?.name ?? "Unknown",
        total: g._count._all,
        delayed,
        avgPrep: num(g._avg.actualPrepTime),
      };
    }),
    (v) => safeDiv(v.delayed, v.total),
  ).slice(0, 15);

  const brandRows = totalByBrand.map((g) => ({
    brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
    total: g._count._all,
    delayed: delayedByBrandMap.get(g.brandId) ?? 0,
  }));
  const worstBrand = sortDesc(brandRows, (b) => safeDiv(b.delayed, b.total))[0]?.brand ?? "—";

  const delayedByLocationMap = new Map(delayedByLocation.map((g) => [g.locationId, g._count._all]));
  const locationRows = totalByLocation.map((g) => ({
    location: dims.locations.get(g.locationId)?.name ?? "Unknown",
    total: g._count._all,
    delayed: delayedByLocationMap.get(g.locationId) ?? 0,
  }));

  const prepRows = prepByBrand.map((g) => ({
    brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
    estimated: num(g._avg.estimatedPrepTime),
    actual: num(g._avg.actualPrepTime),
  }));

  return {
    kpis: [
      { key: "totalOrders", label: "Total Orders", value: fmtNumberCompact(totalOrders), fullValue: fmtNumber(totalOrders) },
      {
        key: "delayedOrders",
        label: "Delayed Orders (>10m)",
        value: fmtNumberCompact(delayedOrders),
        fullValue: fmtNumber(delayedOrders),
        subtitle: fmtPercent(delayRate),
        accent: true,
      },
      { key: "delayRate", label: "> 10 Minutes %", value: fmtPercent(delayRate) },
      { key: "avgPrep", label: "Avg Prep Time", value: fmtMinutes(avgPrep) },
      { key: "onTime", label: "On-Time Compliance", value: fmtPercent(onTimeCompliance) },
      { key: "worstBrand", label: "Worst Brand", value: worstBrand },
    ],
    charts: [
      {
        id: "completed-vs-delayed-by-brand",
        title: "Completed vs Delayed (>10min) by Brand",
        type: "bar",
        dimension: "brand",
        labels: brandRows.map((b) => b.brand),
        datasets: [
          { label: "Completed", data: brandRows.map((b) => b.total - b.delayed), kind: "bar" },
          { label: "Delayed", data: brandRows.map((b) => b.delayed), kind: "bar" },
        ],
      },
      {
        id: "completed-vs-delayed-by-location",
        title: "Completed vs Delayed (>10min) by Branch",
        type: "bar",
        dimension: "location",
        labels: locationRows.map((l) => l.location),
        datasets: [
          { label: "Completed", data: locationRows.map((l) => l.total - l.delayed), kind: "bar" },
          { label: "Delayed", data: locationRows.map((l) => l.delayed), kind: "bar" },
        ],
      },
      {
        id: "prep-time-vs-estimated",
        title: "Vendor Preparation Time vs Estimated",
        type: "bar",
        dimension: "brand",
        labels: prepRows.map((p) => p.brand),
        datasets: [
          { label: "Estimated", data: prepRows.map((p) => p.estimated), kind: "bar" },
          { label: "Actual", data: prepRows.map((p) => p.actual), kind: "bar" },
        ],
      },
    ],
    table: {
      title: "Brand & Branch Delay Severity",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "location", label: "Branch" },
        { key: "total", label: "Total Orders", align: "right" },
        { key: "delayed", label: "Delayed", align: "right" },
        { key: "delayRate", label: "Delay Rate", align: "right" },
        { key: "avgPrep", label: "Avg Prep Time", align: "right" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map((r) => {
        const rate = safeDiv(r.delayed, r.total) * 100;
        return {
          brand: r.brand,
          location: r.location,
          total: fmtNumber(r.total),
          delayed: fmtNumber(r.delayed),
          delayRate: fmtPercent(rate),
          avgPrep: fmtMinutes(r.avgPrep),
          status: statusFlag(rate),
        };
      }),
    },
    scope: { orderCount: scopeCount },
  };
}
