import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtCurrency, fmtCurrencyCompact, fmtNumber, fmtNumberCompact, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";

export async function buildCancellationsTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const cancelledWhere: Prisma.OrderWhereInput = { ...where, status: "CANCELLED" };

  const [
    totals,
    totalOrders,
    dims,
    byChannelGroups,
    byBrandGroups,
    byLocationGroups,
    byReasonGroups,
    byDateGroups,
    postCancelledCount,
  ] = await Promise.all([
    prisma.order.aggregate({ where: cancelledWhere, _sum: { netSales: true }, _count: { _all: true } }),
    prisma.order.count({ where }),
    loadDimensionMaps(),
    prisma.order.groupBy({ by: ["channelId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["brandId"], where: cancelledWhere, _sum: { netSales: true } }),
    prisma.order.groupBy({ by: ["locationId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["cancellationReasonId"],
      where: cancelledWhere,
      _count: { _all: true },
      _sum: { netSales: true },
    }),
    prisma.order.groupBy({ by: ["receivedDateKey"], where: cancelledWhere, _count: { _all: true } }),
    prisma.order.count({ where: { ...cancelledWhere, isPostCancelled: true } }),
  ]);

  const cancelledAmount = num(totals._sum.netSales);
  const cancelledCount = totals._count._all;
  const cancelRate = safeDiv(cancelledCount, totalOrders) * 100;
  const cancelledAov = safeDiv(cancelledAmount, cancelledCount);
  const postCancelledPct = safeDiv(postCancelledCount, cancelledCount) * 100;

  const channelRows = sortDesc(
    byChannelGroups.map((g) => ({
      channel: dims.channels.get(g.channelId)?.name ?? "Unknown",
      count: g._count._all,
    })),
    (v) => v.count,
  );
  const worstChannel = channelRows[0]?.channel ?? "—";

  const brandRows = sortDesc(
    byBrandGroups.map((g) => ({
      brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
      amount: num(g._sum.netSales),
    })),
    (v) => v.amount,
  );

  const reasonRows = sortDesc(
    byReasonGroups.map((g) => ({
      reason: (g.cancellationReasonId && dims.reasons.get(g.cancellationReasonId)?.description) || "Unspecified",
      orders: g._count._all,
      amount: num(g._sum.netSales),
    })),
    (v) => v.orders,
  );

  const locationRows = sortDesc(
    byLocationGroups.map((g) => ({
      location: dims.locations.get(g.locationId)?.name ?? "Unknown",
      count: g._count._all,
    })),
    (v) => v.count,
  );

  const trendRows = byDateGroups
    .filter((g): g is typeof g & { receivedDateKey: string } => Boolean(g.receivedDateKey))
    .map((g) => ({ date: g.receivedDateKey, count: g._count._all }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    kpis: [
      { key: "cancelledAmount", label: "Cancelled Amount", value: fmtCurrencyCompact(cancelledAmount), accent: true },
      {
        key: "cancelledOrders",
        label: "Cancelled Orders",
        value: fmtNumberCompact(cancelledCount),
        subtitle: fmtPercent(cancelRate),
      },
      { key: "cancelledAov", label: "Cancelled AOV", value: fmtCurrencyCompact(cancelledAov) },
      {
        key: "postCancelled",
        label: "Post-Cancelled",
        value: fmtNumberCompact(postCancelledCount),
        subtitle: `${fmtPercent(postCancelledPct)} of cancellations`,
      },
      { key: "worstChannel", label: "Worst Channel", value: worstChannel },
    ],
    charts: [
      {
        id: "cancelled-by-channel",
        title: "Cancelled Orders by Channel",
        type: "hbar",
        dimension: "channel",
        labels: channelRows.map((c) => c.channel),
        datasets: [{ label: "Cancelled Orders", data: channelRows.map((c) => c.count) }],
      },
      {
        id: "cancelled-by-brand",
        title: "Cancelled Value by Brand",
        type: "bar",
        dimension: "brand",
        labels: brandRows.map((b) => b.brand),
        datasets: [{ label: "Cancelled Value", data: brandRows.map((b) => b.amount) }],
      },
      {
        id: "post-cancelled-split",
        title: "Post-Cancelled Split",
        type: "doughnut",
        labels: ["Post-Accepted", "Pre-Accepted"],
        datasets: [{ label: "Orders", data: [postCancelledCount, cancelledCount - postCancelledCount] }],
      },
      {
        id: "cancelled-by-location",
        title: "Cancelled Orders by Location",
        type: "hbar",
        dimension: "location",
        labels: locationRows.map((l) => l.location),
        datasets: [{ label: "Cancelled Orders", data: locationRows.map((l) => l.count) }],
      },
      {
        id: "cancelled-trend",
        title: "Cancelled Orders Trend",
        type: "line",
        dimension: "date",
        labels: trendRows.map((t) => t.date),
        datasets: [{ label: "Cancelled Orders", data: trendRows.map((t) => t.count), kind: "line" }],
      },
    ],
    table: {
      title: "Cancellation Reasons",
      columns: [
        { key: "reason", label: "Reason" },
        { key: "orders", label: "Orders", align: "right" },
        { key: "share", label: "Share", align: "right" },
        { key: "amount", label: "Lost Revenue", align: "right" },
      ],
      rows: reasonRows.map((r) => ({
        reason: r.reason,
        orders: fmtNumber(r.orders),
        share: fmtPercent(safeDiv(r.orders, cancelledCount) * 100),
        amount: fmtCurrency(r.amount),
      })),
    },
    scope: { orderCount: totalOrders },
  };
}
