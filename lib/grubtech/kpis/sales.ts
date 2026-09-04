import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtCurrency, fmtCurrencyCompact, fmtNumber, fmtNumberCompact, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function buildSalesTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const completedWhere: Prisma.OrderWhereInput = { ...where, status: "COMPLETED" };

  const [
    totals,
    dims,
    byBrandGroups,
    byChannelGroups,
    byDateGroups,
    byHourGroups,
    byTimeSlotGroups,
    byLocationGroups,
    byDayGroups,
    scopeCount,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: completedWhere,
      _sum: { netSales: true, receiptTotal: true, discountAmount: true },
      _count: { _all: true },
    }),
    loadDimensionMaps(),
    prisma.order.groupBy({
      by: ["brandId"],
      where: completedWhere,
      _sum: { netSales: true, discountAmount: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["channelId"],
      where: completedWhere,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["receivedDateKey"],
      where: completedWhere,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["hour"],
      where: completedWhere,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["timeSlot"],
      where: completedWhere,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["locationId"],
      where: completedWhere,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["dayName"],
      where: completedWhere,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.count({ where }),
  ]);

  const netSales = num(totals._sum.netSales);
  const receiptTotal = num(totals._sum.receiptTotal);
  const totalDiscount = num(totals._sum.discountAmount);
  const totalOrders = totals._count._all;
  const aov = safeDiv(netSales, totalOrders);

  const days = byDateGroups.length || 1;
  const avgRunRate = netSales / days;
  const projectedRR = avgRunRate * 365;

  const brandRows = sortDesc(
    byBrandGroups.map((g) => ({
      brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
      cuisine: dims.brands.get(g.brandId)?.cuisine ?? "—",
      netSales: num(g._sum.netSales),
      orders: g._count._all,
      discount: num(g._sum.discountAmount),
    })),
    (v) => v.netSales,
  );
  const topBrand = brandRows[0]?.brand ?? "—";

  // Cuisine only exists on Brand, not as a column on Order — re-roll the
  // already-fetched (small) brand groups instead of a separate DB query.
  const byCuisine = new Map<string, number>();
  for (const b of brandRows) {
    byCuisine.set(b.cuisine, (byCuisine.get(b.cuisine) ?? 0) + b.netSales);
  }
  const cuisineRows = sortDesc([...byCuisine.entries()], ([, v]) => v);

  const channelRows = sortDesc(
    byChannelGroups.map((g) => ({
      channel: dims.channels.get(g.channelId)?.name ?? "Unknown",
      netSales: num(g._sum.netSales),
      orders: g._count._all,
    })),
    (v) => v.netSales,
  );

  const dateRows = byDateGroups
    .filter((g): g is typeof g & { receivedDateKey: string } => Boolean(g.receivedDateKey))
    .map((g) => ({ date: g.receivedDateKey, netSales: num(g._sum.netSales), orders: g._count._all }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const hourRows = Array.from({ length: 24 }, (_, hour) => {
    const g = byHourGroups.find((row) => row.hour === hour);
    return { hour, netSales: g ? num(g._sum.netSales) : 0, orders: g?._count._all ?? 0 };
  });

  const timeSlotRows = sortDesc(
    byTimeSlotGroups
      .filter((g): g is typeof g & { timeSlot: string } => Boolean(g.timeSlot))
      .map((g) => ({ slot: g.timeSlot, netSales: num(g._sum.netSales) })),
    (v) => v.netSales,
  );

  const topLocationRows = sortDesc(
    byLocationGroups.map((g) => ({
      location: dims.locations.get(g.locationId)?.name ?? "Unknown",
      netSales: num(g._sum.netSales),
    })),
    (v) => v.netSales,
  ).slice(0, 10);

  const dayRows = byDayGroups
    .filter((g): g is typeof g & { dayName: string } => Boolean(g.dayName))
    .map((g) => ({ day: g.dayName, netSales: num(g._sum.netSales) }))
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));

  return {
    kpis: [
      { key: "netSales", label: "Net Sales", value: fmtCurrencyCompact(netSales) },
      { key: "totalOrders", label: "Total Orders", value: fmtNumberCompact(totalOrders) },
      { key: "receiptTotal", label: "Receipt Total", value: fmtCurrencyCompact(receiptTotal) },
      { key: "totalDiscount", label: "Total Discount", value: fmtCurrencyCompact(totalDiscount) },
      { key: "aov", label: "Avg Order Value", value: fmtCurrencyCompact(aov) },
      { key: "runRate", label: "Avg Run Rate", value: `${fmtCurrencyCompact(avgRunRate)}/day` },
      { key: "projectedRR", label: "Projected RR", value: `${fmtCurrencyCompact(projectedRR)}/yr` },
      { key: "topBrand", label: "Top Brand", value: topBrand },
    ],
    charts: [
      {
        id: "sales-by-date",
        title: "Net Sales & Total Orders by Date",
        caption: "Bars: net sales · Line: orders",
        type: "combo",
        dimension: "date",
        labels: dateRows.map((d) => d.date),
        datasets: [
          { label: "Net Sales", data: dateRows.map((d) => d.netSales), kind: "bar", yAxisId: "y" },
          { label: "Orders", data: dateRows.map((d) => d.orders), kind: "line", yAxisId: "y1" },
        ],
      },
      {
        id: "sales-by-channel",
        title: "Net Sales by Channel",
        type: "hbar",
        dimension: "channel",
        labels: channelRows.map((c) => c.channel),
        datasets: [{ label: "Net Sales", data: channelRows.map((c) => c.netSales) }],
      },
      {
        id: "sales-by-cuisine",
        title: "Net Sales by Cuisine Cluster",
        type: "bar",
        dimension: "cuisine",
        labels: cuisineRows.map(([cuisine]) => cuisine),
        datasets: [{ label: "Net Sales", data: cuisineRows.map(([, v]) => v) }],
      },
      {
        id: "sales-by-hour",
        title: "Net Sales | Orders by Hour",
        caption: "Bars: net sales · Line: orders",
        type: "combo",
        labels: hourRows.map((h) => `${h.hour}:00`),
        datasets: [
          { label: "Net Sales", data: hourRows.map((h) => h.netSales), kind: "bar", yAxisId: "y" },
          { label: "Orders", data: hourRows.map((h) => h.orders), kind: "line", yAxisId: "y1" },
        ],
      },
      {
        id: "sales-by-time-slot",
        title: "Net Sales by Time Slot",
        type: "bar",
        labels: timeSlotRows.map((t) => t.slot),
        datasets: [{ label: "Net Sales", data: timeSlotRows.map((t) => t.netSales) }],
      },
      {
        id: "top-locations",
        title: "Top Locations by Net Sales",
        type: "hbar",
        dimension: "location",
        labels: topLocationRows.map((l) => l.location),
        datasets: [{ label: "Net Sales", data: topLocationRows.map((l) => l.netSales) }],
      },
      {
        id: "sales-by-day-of-week",
        title: "Net Sales by Day of Week",
        type: "bar",
        labels: dayRows.map((d) => d.day),
        datasets: [{ label: "Net Sales", data: dayRows.map((d) => d.netSales) }],
      },
      {
        id: "sales-by-brand",
        title: "Net Sales by Brand",
        type: "bar",
        dimension: "brand",
        labels: brandRows.map((b) => b.brand),
        datasets: [{ label: "Net Sales", data: brandRows.map((b) => b.netSales) }],
      },
    ],
    table: {
      title: "Brand | Cuisine Performance",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "cuisine", label: "Cuisine" },
        { key: "netSales", label: "Net Sales", align: "right" },
        { key: "orders", label: "Orders", align: "right" },
        { key: "aov", label: "AOV", align: "right" },
        { key: "discount", label: "Discount", align: "right" },
        { key: "discountPct", label: "Disc %", align: "right" },
      ],
      rows: brandRows.map((b) => ({
        brand: b.brand,
        cuisine: b.cuisine,
        netSales: fmtCurrency(b.netSales),
        orders: fmtNumber(b.orders),
        aov: fmtCurrency(safeDiv(b.netSales, b.orders)),
        discount: fmtCurrency(b.discount),
        discountPct: fmtPercent(safeDiv(b.discount, b.netSales) * 100),
      })),
    },
    scope: { orderCount: scopeCount },
  };
}
