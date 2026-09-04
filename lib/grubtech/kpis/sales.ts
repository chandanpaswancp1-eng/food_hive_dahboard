import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtCurrency, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";

export async function buildSalesTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const completedWhere: Prisma.OrderWhereInput = { ...where, status: "COMPLETED" };

  const [totals, dims, byBrandGroups, byChannelGroups, byDateGroups, scopeCount] = await Promise.all([
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

  return {
    kpis: [
      { key: "netSales", label: "Net Sales", value: fmtCurrency(netSales) },
      { key: "totalOrders", label: "Total Orders", value: fmtNumber(totalOrders) },
      { key: "receiptTotal", label: "Receipt Total", value: fmtCurrency(receiptTotal) },
      { key: "totalDiscount", label: "Total Discount", value: fmtCurrency(totalDiscount) },
      { key: "aov", label: "Avg Order Value", value: fmtCurrency(aov) },
      { key: "runRate", label: "Avg Run Rate", value: `${fmtCurrency(avgRunRate)}/day` },
      { key: "projectedRR", label: "Projected RR", value: `${fmtCurrency(projectedRR)}/yr` },
      { key: "topBrand", label: "Top Brand", value: topBrand },
    ],
    charts: [
      {
        id: "sales-by-date",
        title: "Net Sales & Total Orders by Date",
        caption: "Bars: net sales · Line: orders",
        type: "combo",
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
        labels: channelRows.map((c) => c.channel),
        datasets: [{ label: "Net Sales", data: channelRows.map((c) => c.netSales) }],
      },
      {
        id: "sales-by-brand",
        title: "Net Sales by Brand",
        type: "bar",
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
