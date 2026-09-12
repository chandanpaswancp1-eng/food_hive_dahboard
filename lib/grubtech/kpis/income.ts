import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload, DashboardFilters } from "@/lib/types";
import {
  fmtCurrency,
  fmtCurrencyCompact,
  fmtCurrencyExact,
  fmtNumber,
  fmtNumberCompact,
  fmtPercent,
  round2,
  safeDiv,
} from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";
import { dubaiDateKey } from "@/lib/grubtech/dubaiTime";

// Excluded from the per-portal commission KPI cards: Pickup/Take Away are
// direct, no-commission channels rather than real third-party portals, and
// "Grubtech Test" is GrubCenter's own sandbox channel.
const NON_PORTAL_CHANNELS = new Set(["Pickup", "Take Away", "Grubtech Test"]);

/** Inclusive day count between two "YYYY-MM-DD" calendar-date strings. */
function daysBetweenInclusive(fromKey: string, toKey: string): number {
  const fromMs = Date.parse(`${fromKey}T00:00:00Z`);
  const toMs = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000) + 1;
}

/**
 * GrubCenter's channel commission % is only known per channel, never per
 * order — so "what we actually took home" for any slice (a month, a brand)
 * has to be built by re-attributing that one channel-level rate across
 * whichever other dimension we're slicing by, via a join groupBy against
 * channelId rather than a single flat sum.
 */
function buildCommissionRateMap(
  channels: { id: string; commissionRate: Prisma.Decimal | null }[],
): Map<string, number> {
  return new Map(channels.map((c) => [c.id, Number(c.commissionRate ?? 0)]));
}

export async function buildIncomeTab(baseWhere: Prisma.OrderWhereInput, filters: DashboardFilters): Promise<TabPayload> {
  // Same completed-only convention as the Order Details tab (lib/grubtech/kpis/sales.ts)
  // — income is realized revenue, cancelled orders never paid out.
  const where: Prisma.OrderWhereInput = { ...baseWhere, status: "COMPLETED" };

  const [
    totals,
    dims,
    channels,
    byBrandGroups,
    byBrandChannelGroups,
    byChannelGroups,
    byDateGroups,
    byDateChannelGroups,
    byPaymentGroups,
  ] = await Promise.all([
    prisma.order.aggregate({
      where,
      _sum: { netSales: true, receiptTotal: true, discountAmount: true },
      _count: { _all: true },
      _min: { receivedAt: true },
      _max: { receivedAt: true },
    }),
    loadDimensionMaps(),
    prisma.channel.findMany({ select: { id: true, commissionRate: true } }),
    prisma.order.groupBy({
      by: ["brandId"],
      where,
      _sum: { netSales: true, discountAmount: true, receiptTotal: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["brandId", "channelId"],
      where,
      _sum: { netSales: true },
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
      _sum: { netSales: true, discountAmount: true, receiptTotal: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["receivedDateKey", "channelId"],
      where,
      _sum: { netSales: true },
    }),
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where,
      _sum: { netSales: true },
      _count: { _all: true },
    }),
  ]);

  const rateByChannel = buildCommissionRateMap(channels);

  const netSales = num(totals._sum.netSales);
  const receiptTotal = num(totals._sum.receiptTotal);
  const totalDiscount = num(totals._sum.discountAmount);
  // Pre-discount, tax-inclusive billing — same formula as the Order Details
  // tab, confirmed against GrubCenter's own Sales Summary widget to the cent.
  const grossRevenue = receiptTotal + totalDiscount;
  const totalOrders = totals._count._all;

  const channelCommissions = byChannelGroups.map((g) => {
    const chNetSales = num(g._sum.netSales);
    const rate = rateByChannel.get(g.channelId) ?? 0;
    return { channelId: g.channelId, netSales: chNetSales, orders: g._count._all, rate, commission: round2(chNetSales * (rate / 100)) };
  });
  const totalCommission = round2(channelCommissions.reduce((sum, c) => sum + c.commission, 0));
  const takeHomeIncome = round2(netSales - totalCommission);
  const takeHomeMarginPct = safeDiv(takeHomeIncome, grossRevenue) * 100;

  const explicitRangeDays =
    filters.dateFrom && filters.dateTo ? daysBetweenInclusive(filters.dateFrom, filters.dateTo) : null;
  const minReceivedAt = totals._min.receivedAt;
  const maxReceivedAt = totals._max.receivedAt;
  const actualSpanDays =
    minReceivedAt && maxReceivedAt ? daysBetweenInclusive(dubaiDateKey(minReceivedAt), dubaiDateKey(maxReceivedAt)) : 0;
  const calendarDays = explicitRangeDays ?? actualSpanDays;
  const avgDailyIncome = takeHomeIncome / Math.max(calendarDays, 1);
  const projectedMonthlyIncome = avgDailyIncome * 30;

  // ---- channel breakdown ----
  const channelRows = sortDesc(
    channelCommissions.map((c) => ({
      channel: dims.channels.get(c.channelId)?.name ?? "Unknown",
      netSales: c.netSales,
      orders: c.orders,
      rate: c.rate,
      commission: c.commission,
      takeHome: round2(c.netSales - c.commission),
    })),
    (v) => v.takeHome,
  );

  // ---- brand breakdown (commission re-attributed via brand x channel) ----
  const brandCommission = new Map<string, number>();
  for (const g of byBrandChannelGroups) {
    const rate = rateByChannel.get(g.channelId) ?? 0;
    const prev = brandCommission.get(g.brandId) ?? 0;
    brandCommission.set(g.brandId, prev + num(g._sum.netSales) * (rate / 100));
  }
  const brandRows = sortDesc(
    byBrandGroups.map((g) => {
      const bNetSales = num(g._sum.netSales);
      const bDiscount = num(g._sum.discountAmount);
      const bReceiptTotal = num(g._sum.receiptTotal);
      const bCommission = round2(brandCommission.get(g.brandId) ?? 0);
      const bTakeHome = round2(bNetSales - bCommission);
      return {
        brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
        cuisine: dims.brands.get(g.brandId)?.cuisine ?? "—",
        netSales: bNetSales,
        grossRevenue: bReceiptTotal + bDiscount,
        orders: g._count._all,
        commission: bCommission,
        takeHome: bTakeHome,
        marginPct: safeDiv(bTakeHome, bReceiptTotal + bDiscount) * 100,
      };
    }),
    (v) => v.takeHome,
  );
  const topBrandByIncome = brandRows[0]?.brand ?? "—";

  // ---- monthly rollup (commission re-attributed via date x channel) ----
  const monthCommission = new Map<string, number>();
  for (const g of byDateChannelGroups) {
    if (!g.receivedDateKey) continue;
    const month = g.receivedDateKey.slice(0, 7); // "YYYY-MM"
    const rate = rateByChannel.get(g.channelId) ?? 0;
    const prev = monthCommission.get(month) ?? 0;
    monthCommission.set(month, prev + num(g._sum.netSales) * (rate / 100));
  }

  interface MonthAgg {
    netSales: number;
    discount: number;
    receiptTotal: number;
    orders: number;
  }
  const monthAgg = new Map<string, MonthAgg>();
  for (const g of byDateGroups) {
    if (!g.receivedDateKey) continue;
    const month = g.receivedDateKey.slice(0, 7);
    const entry = monthAgg.get(month) ?? { netSales: 0, discount: 0, receiptTotal: 0, orders: 0 };
    entry.netSales += num(g._sum.netSales);
    entry.discount += num(g._sum.discountAmount);
    entry.receiptTotal += num(g._sum.receiptTotal);
    entry.orders += g._count._all;
    monthAgg.set(month, entry);
  }

  const monthRows = [...monthAgg.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => {
      const commission = round2(monthCommission.get(month) ?? 0);
      const takeHome = round2(v.netSales - commission);
      const gross = v.receiptTotal + v.discount;
      return {
        month,
        grossRevenue: gross,
        discount: v.discount,
        netSales: v.netSales,
        commission,
        takeHome,
        marginPct: safeDiv(takeHome, gross) * 100,
        orders: v.orders,
      };
    });

  const momGrowthPct =
    monthRows.length >= 2
      ? safeDiv(
          monthRows[monthRows.length - 1].takeHome - monthRows[monthRows.length - 2].takeHome,
          monthRows[monthRows.length - 2].takeHome,
        ) * 100
      : null;

  // ---- payment method breakdown ----
  const paymentRows = sortDesc(
    byPaymentGroups
      .filter((g): g is typeof g & { paymentMethod: string } => Boolean(g.paymentMethod))
      .map((g) => ({ method: g.paymentMethod, netSales: num(g._sum.netSales), orders: g._count._all })),
    (v) => v.netSales,
  );

  return {
    kpis: [
      // Group 1 — the headline: what actually landed in the bank.
      {
        key: "takeHomeIncome",
        label: "Take-Home Income",
        value: fmtCurrencyCompact(takeHomeIncome),
        fullValue: fmtCurrencyExact(takeHomeIncome),
        subtitle: "Net sales minus platform commission",
      },
      { key: "grossRevenue", label: "Gross Revenue", value: fmtCurrencyCompact(grossRevenue), fullValue: fmtCurrencyExact(grossRevenue) },
      { key: "netSales", label: "Net Sales", value: fmtCurrencyCompact(netSales), fullValue: fmtCurrencyExact(netSales) },

      // Group 2 — the two deductions between gross and take-home.
      { key: "totalDiscount", label: "Discounts Given", value: fmtCurrencyCompact(totalDiscount), fullValue: fmtCurrencyExact(totalDiscount), accent: true },
      { key: "totalCommission", label: "Platform Commission", value: fmtCurrencyCompact(totalCommission), fullValue: fmtCurrencyExact(totalCommission), accent: true },
      { key: "marginPct", label: "Take-Home Margin", value: fmtPercent(takeHomeMarginPct) },

      // Group 3 — pace.
      { key: "avgDailyIncome", label: "Avg Daily Income", value: `${fmtCurrencyCompact(avgDailyIncome)}/day`, fullValue: `${fmtCurrencyExact(avgDailyIncome)}/day` },
      ...(calendarDays > 1
        ? [
            {
              key: "projectedMonthlyIncome",
              label: "Projected Monthly Income",
              value: `${fmtCurrencyCompact(projectedMonthlyIncome)}/mo`,
              fullValue: `${fmtCurrencyExact(projectedMonthlyIncome)}/mo`,
            },
          ]
        : []),
      ...(momGrowthPct !== null
        ? [
            {
              key: "momGrowth",
              label: "Income Growth (MoM)",
              value: `${momGrowthPct >= 0 ? "+" : ""}${fmtPercent(momGrowthPct)}`,
              accent: momGrowthPct < 0,
            },
          ]
        : []),

      // Group 4 — scope.
      { key: "totalOrders", label: "Total Orders", value: fmtNumberCompact(totalOrders), fullValue: fmtNumber(totalOrders) },
      { key: "topBrand", label: "Top Brand by Income", value: topBrandByIncome },

      // Group 5 — one card per portal/channel: the aggregate Platform
      // Commission above blends every channel together, which hides which
      // specific aggregator (Careem, Deliveroo, Noon, ...) is actually
      // taking the bigger cut. Dynamic since the channel set varies.
      // Pickup/Take Away are direct, no-commission channels rather than real
      // third-party portals, and "Grubtech Test" is GrubCenter's own sandbox
      // channel — none of the three belong in a per-portal commission
      // breakdown.
      ...channelRows.filter((c) => !NON_PORTAL_CHANNELS.has(c.channel)).map((c) => ({
        key: `portalCommission_${c.channel}`,
        label: `${c.channel} Commission`,
        value: fmtCurrencyCompact(c.commission),
        fullValue: fmtCurrencyExact(c.commission),
        subtitle: `${fmtPercent(c.rate)} of ${fmtCurrencyCompact(c.netSales)} net sales`,
        accent: true,
        drillFilter: { channels: [c.channel] },
        editCommission: { channel: c.channel, currentRate: c.rate },
      })),
    ],
    charts: [
      {
        id: "income-margin-gauge",
        title: "Take-Home Margin",
        caption: `${fmtCurrencyCompact(takeHomeIncome)} take-home of ${fmtCurrencyCompact(grossRevenue)} gross revenue`,
        type: "gauge",
        labels: ["Margin"],
        datasets: [{ label: "Take-Home Margin", data: [round2(Math.max(0, Math.min(100, takeHomeMarginPct)))] }],
      },
      {
        id: "income-by-month",
        title: "Income by Month",
        caption: "Gross revenue vs. what actually lands after discounts & commission",
        type: "bar",
        labels: monthRows.map((m) => m.month),
        datasets: [
          { label: "Gross Revenue", data: monthRows.map((m) => m.grossRevenue) },
          { label: "Take-Home Income", data: monthRows.map((m) => m.takeHome) },
        ],
      },
      {
        id: "income-by-brand",
        title: "Take-Home Income by Brand",
        type: "bar",
        dimension: "brand",
        labels: brandRows.map((b) => b.brand),
        datasets: [{ label: "Take-Home Income", data: brandRows.map((b) => b.takeHome) }],
      },
      {
        id: "income-by-channel",
        title: "Net Sales vs. Take-Home by Channel",
        caption: "The gap is platform commission",
        type: "bar",
        dimension: "channel",
        labels: channelRows.map((c) => c.channel),
        datasets: [
          { label: "Net Sales", data: channelRows.map((c) => c.netSales) },
          { label: "Take-Home Income", data: channelRows.map((c) => c.takeHome) },
        ],
      },
      {
        id: "income-by-payment-method",
        title: "Net Sales by Payment Method",
        type: "doughnut",
        labels: paymentRows.map((p) => p.method),
        datasets: [{ label: "Net Sales", data: paymentRows.map((p) => p.netSales) }],
      },
      {
        id: "discounts-over-time",
        title: "Discounts Given Over Time",
        caption: "Watch this against Income by Month — rising discounts eat straight into take-home",
        type: "line",
        labels: monthRows.map((m) => m.month),
        datasets: [{ label: "Discounts", data: monthRows.map((m) => m.discount) }],
      },
    ],
    table: {
      title: "Monthly Income Report",
      columns: [
        { key: "month", label: "Month" },
        { key: "grossRevenue", label: "Gross Revenue", align: "right" },
        { key: "discount", label: "Discounts", align: "right" },
        { key: "netSales", label: "Net Sales", align: "right" },
        { key: "commission", label: "Commission", align: "right" },
        { key: "takeHome", label: "Take-Home Income", align: "right" },
        { key: "marginPct", label: "Margin", align: "right" },
        { key: "orders", label: "Orders", align: "right" },
      ],
      // Newest month first — the most useful read for "how am I doing lately".
      rows: [...monthRows].reverse().map((m) => ({
        month: m.month,
        grossRevenue: fmtCurrency(m.grossRevenue),
        discount: fmtCurrency(m.discount),
        netSales: fmtCurrency(m.netSales),
        commission: fmtCurrency(m.commission),
        takeHome: fmtCurrency(m.takeHome),
        marginPct: fmtPercent(m.marginPct),
        orders: fmtNumber(m.orders),
      })),
    },
    extraTables: [
      {
        title: "Income by Brand",
        columns: [
          { key: "brand", label: "Brand" },
          { key: "cuisine", label: "Cuisine" },
          { key: "netSales", label: "Net Sales", align: "right" },
          { key: "commission", label: "Commission", align: "right" },
          { key: "takeHome", label: "Take-Home Income", align: "right" },
          { key: "marginPct", label: "Margin", align: "right" },
          { key: "orders", label: "Orders", align: "right" },
        ],
        rows: brandRows.map((b) => ({
          brand: b.brand,
          cuisine: b.cuisine,
          netSales: fmtCurrency(b.netSales),
          commission: fmtCurrency(b.commission),
          takeHome: fmtCurrency(b.takeHome),
          marginPct: fmtPercent(b.marginPct),
          orders: fmtNumber(b.orders),
        })),
      },
      {
        title: "Income by Channel",
        columns: [
          { key: "channel", label: "Channel" },
          { key: "rate", label: "Commission Rate", align: "right" },
          { key: "netSales", label: "Net Sales", align: "right" },
          { key: "commission", label: "Commission", align: "right" },
          { key: "takeHome", label: "Take-Home Income", align: "right" },
          { key: "orders", label: "Orders", align: "right" },
        ],
        rows: channelRows.map((c) => ({
          channel: c.channel,
          rate: fmtPercent(c.rate),
          netSales: fmtCurrency(c.netSales),
          commission: fmtCurrency(c.commission),
          takeHome: fmtCurrency(c.takeHome),
          orders: fmtNumber(c.orders),
        })),
      },
    ],
    scope: { orderCount: totalOrders },
  };
}
