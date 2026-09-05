import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtCurrency, fmtCurrencyCompact, fmtCurrencyExact, fmtNumber, fmtNumberCompact, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function buildSalesTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  // GrubCenter's own Net Sales/Total Orders figures count every order in the
  // period regardless of status — cancelled orders still carry a netSales
  // value there. Matching that (rather than filtering to COMPLETED) is what
  // keeps this tab's totals equal to GrubCenter's report and to the "orders
  // in scope" count shown in the filter bar. Cancellation-specific breakdowns
  // (reasons, lost revenue, trend) live on the dedicated Cancellations tab.
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
  ] = await Promise.all([
    prisma.order.aggregate({
      where,
      _sum: { netSales: true, receiptTotal: true, discountAmount: true },
      _count: { _all: true },
    }),
    loadDimensionMaps(),
    prisma.order.groupBy({
      by: ["brandId"],
      where,
      _sum: { netSales: true, discountAmount: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["channelId"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["receivedDateKey"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["hour"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["timeSlot"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["locationId"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["dayName"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
  ]);

  const netSales = num(totals._sum.netSales);
  const receiptTotal = num(totals._sum.receiptTotal);
  const totalDiscount = num(totals._sum.discountAmount);
  // Sales before discounts were applied — GrubCenter doesn't export this
  // directly, so it's derived from the two figures it does export.
  const grossSales = netSales + totalDiscount;
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
  const byCuisine = new Map<string, { netSales: number; orders: number; discount: number }>();
  for (const b of brandRows) {
    const entry = byCuisine.get(b.cuisine) ?? { netSales: 0, orders: 0, discount: 0 };
    entry.netSales += b.netSales;
    entry.orders += b.orders;
    entry.discount += b.discount;
    byCuisine.set(b.cuisine, entry);
  }
  const cuisineRows = sortDesc(
    [...byCuisine.entries()].map(([cuisine, v]) => ({ cuisine, ...v })),
    (v) => v.netSales,
  );

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

  // No quarter field on Order — day-level sums are already fetched for the
  // daily chart/report, so roll those up rather than a separate DB query.
  const byQuarter = new Map<string, { netSales: number; orders: number }>();
  for (const d of dateRows) {
    const [year, month] = d.date.split("-").map(Number);
    const key = `${year} Q${Math.ceil(month / 3)}`;
    const entry = byQuarter.get(key) ?? { netSales: 0, orders: 0 };
    entry.netSales += d.netSales;
    entry.orders += d.orders;
    byQuarter.set(key, entry);
  }
  const quarterRows = [...byQuarter.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([quarter, v]) => ({ quarter, ...v }));

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
      { key: "grossSales", label: "Gross Sales", value: fmtCurrencyCompact(grossSales), fullValue: fmtCurrencyExact(grossSales) },
      { key: "netSales", label: "Net Sales", value: fmtCurrencyCompact(netSales), fullValue: fmtCurrencyExact(netSales) },
      { key: "totalOrders", label: "Total Orders", value: fmtNumberCompact(totalOrders), fullValue: fmtNumber(totalOrders) },
      { key: "receiptTotal", label: "Receipt Total", value: fmtCurrencyCompact(receiptTotal), fullValue: fmtCurrencyExact(receiptTotal) },
      { key: "totalDiscount", label: "Total Discount", value: fmtCurrencyCompact(totalDiscount), fullValue: fmtCurrencyExact(totalDiscount) },
      { key: "aov", label: "Avg Order Value", value: fmtCurrencyCompact(aov), fullValue: fmtCurrencyExact(aov) },
      { key: "runRate", label: "Avg Run Rate", value: `${fmtCurrencyCompact(avgRunRate)}/day`, fullValue: `${fmtCurrencyExact(avgRunRate)}/day` },
      { key: "projectedRR", label: "Projected RR", value: `${fmtCurrencyCompact(projectedRR)}/yr`, fullValue: `${fmtCurrencyExact(projectedRR)}/yr` },
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
        labels: cuisineRows.map((c) => c.cuisine),
        datasets: [{ label: "Net Sales", data: cuisineRows.map((c) => c.netSales) }],
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
        // Discount rate off the original (pre-discount) price — netSales is
        // already post-discount, so the base is netSales + discount, not netSales.
        discountPct: fmtPercent(safeDiv(b.discount, b.netSales + b.discount) * 100),
      })),
    },
    extraTables: [
      {
        title: "Cuisine-Wise Report",
        columns: [
          { key: "cuisine", label: "Cuisine" },
          { key: "netSales", label: "Net Sales", align: "right" },
          { key: "orders", label: "Orders", align: "right" },
          { key: "aov", label: "AOV", align: "right" },
          { key: "discount", label: "Discount", align: "right" },
          { key: "share", label: "Share of Sales", align: "right" },
        ],
        rows: cuisineRows.map((c) => ({
          cuisine: c.cuisine,
          netSales: fmtCurrency(c.netSales),
          orders: fmtNumber(c.orders),
          aov: fmtCurrency(safeDiv(c.netSales, c.orders)),
          discount: fmtCurrency(c.discount),
          share: fmtPercent(safeDiv(c.netSales, netSales) * 100),
        })),
      },
      {
        title: "Daily Report",
        columns: [
          { key: "date", label: "Date" },
          { key: "netSales", label: "Net Sales", align: "right" },
          { key: "orders", label: "Orders", align: "right" },
          { key: "aov", label: "AOV", align: "right" },
        ],
        rows: [...dateRows].reverse().map((d) => ({
          date: d.date,
          netSales: fmtCurrency(d.netSales),
          orders: fmtNumber(d.orders),
          aov: fmtCurrency(safeDiv(d.netSales, d.orders)),
        })),
      },
      {
        title: "Quarterly Report",
        columns: [
          { key: "quarter", label: "Quarter" },
          { key: "netSales", label: "Net Sales", align: "right" },
          { key: "orders", label: "Orders", align: "right" },
          { key: "aov", label: "AOV", align: "right" },
        ],
        rows: [...quarterRows].reverse().map((q) => ({
          quarter: q.quarter,
          netSales: fmtCurrency(q.netSales),
          orders: fmtNumber(q.orders),
          aov: fmtCurrency(safeDiv(q.netSales, q.orders)),
        })),
      },
    ],
    scope: { orderCount: totalOrders },
  };
}
