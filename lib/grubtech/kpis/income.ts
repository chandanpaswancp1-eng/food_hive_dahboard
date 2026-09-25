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
import { isTestFixtureName } from "@/lib/grubtech/testFixture";
import { dubaiDateKey, daysInDubaiMonth } from "@/lib/grubtech/dubaiTime";

// Excluded from the per-portal commission KPI cards: Pickup/Take Away/Dine in
// are direct, no-commission channels rather than real third-party portals,
// and "Grubtech Test" is GrubCenter's own sandbox channel. Matched
// case-insensitively. Any other channel that appears in the data gets its
// own card automatically.
const NON_PORTAL_CHANNELS = new Set(["pickup", "take away", "dine in", "grubtech test"]);
const isPortal = (channel: string) => !NON_PORTAL_CHANNELS.has(channel.toLowerCase());

/** Inclusive day count between two "YYYY-MM-DD" calendar-date strings. */
function daysBetweenInclusive(fromKey: string, toKey: string): number {
  const fromMs = Date.parse(`${fromKey}T00:00:00Z`);
  const toMs = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000) + 1;
}

/**
 * GrubCenter's channel commission % and delivery-charge % are only known per
 * channel, never per order — so "what we actually took home" for any slice
 * (a month, a brand) has to be built by re-attributing those channel-level
 * rates across whichever other dimension we're slicing by, via a join
 * groupBy against channelId rather than a single flat sum. The two rates are
 * combined into one deduction here — real portals deduct both a commission
 * cut and a separate delivery/logistics fee, and the dashboard reports them
 * as a single "commission" figure everywhere except the per-portal card
 * subtitle, which still breaks the two back out for transparency.
 */
function buildCombinedRateMap(
  channels: { id: string; commissionRate: Prisma.Decimal | null; deliveryChargeRate: Prisma.Decimal | null }[],
): Map<string, number> {
  return new Map(channels.map((c) => [c.id, Number(c.commissionRate ?? 0) + Number(c.deliveryChargeRate ?? 0)]));
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
    prisma.channel.findMany({ select: { id: true, commissionRate: true, deliveryChargeRate: true } }),
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
      _sum: { netSales: true, receiptTotal: true },
      _count: { _all: true },
    }),
  ]);

  const rateByChannel = buildCombinedRateMap(channels);
  // Per-component lookups, kept alongside the combined map above only for
  // the per-portal KPI card's breakdown subtitle — every other consumer
  // (brand/month re-attribution, totals, tables) uses the combined rate.
  const commissionRateByChannel = new Map(channels.map((c) => [c.id, Number(c.commissionRate ?? 0)]));
  // A portal that first shows up via sync has no rate yet — counted as 0%
  // until someone sets one, which silently overstates take-home income.
  // Tracked so the cards can say so instead (an explicit 0 is a real rate).
  const rateUnsetChannels = new Set(channels.filter((c) => c.commissionRate === null).map((c) => c.id));
  const deliveryChargeRateByChannel = new Map(channels.map((c) => [c.id, Number(c.deliveryChargeRate ?? 0)]));

  const netSales = num(totals._sum.netSales);
  const receiptTotal = num(totals._sum.receiptTotal);
  const totalDiscount = num(totals._sum.discountAmount);
  // Pre-discount, tax-inclusive billing — same formula as the Order Details
  // tab, confirmed against GrubCenter's own Sales Summary widget to the cent.
  const grossRevenue = receiptTotal + totalDiscount;
  const totalOrders = totals._count._all;

  const channelCommissions = byChannelGroups.map((g) => {
    const chNetSales = num(g._sum.netSales);
    const commissionRate = commissionRateByChannel.get(g.channelId) ?? 0;
    const deliveryChargeRate = deliveryChargeRateByChannel.get(g.channelId) ?? 0;
    const rate = commissionRate + deliveryChargeRate;
    return {
      channelId: g.channelId,
      netSales: chNetSales,
      orders: g._count._all,
      rate,
      commissionRate,
      deliveryChargeRate,
      rateUnset: rateUnsetChannels.has(g.channelId),
      commission: round2(chNetSales * (rate / 100)),
    };
  });
  const totalCommission = round2(channelCommissions.reduce((sum, c) => sum + c.commission, 0));
  const takeHomeIncome = round2(netSales - totalCommission);
  const takeHomeMarginPct = safeDiv(takeHomeIncome, grossRevenue) * 100;

  // A "Received To" date in the future (the picker has no max) would count
  // calendar days that haven't happened yet — days that structurally can't
  // have orders — diluting avgDailyIncome/projectedMonthlyIncome below.
  // Clamp to today so only actually-elapsed days count.
  const todayKey = dubaiDateKey(new Date());
  const effectiveDateTo = filters.dateTo && filters.dateTo > todayKey ? todayKey : filters.dateTo;
  const explicitRangeDays =
    filters.dateFrom && filters.dateTo ? daysBetweenInclusive(filters.dateFrom, effectiveDateTo!) : null;
  const minReceivedAt = totals._min.receivedAt;
  const maxReceivedAt = totals._max.receivedAt;
  const actualSpanDays =
    minReceivedAt && maxReceivedAt ? daysBetweenInclusive(dubaiDateKey(minReceivedAt), dubaiDateKey(maxReceivedAt)) : 0;
  const calendarDays = explicitRangeDays ?? actualSpanDays;
  const avgDailyIncome = takeHomeIncome / Math.max(calendarDays, 1);

  // ---- channel breakdown ----
  const channelRows = sortDesc(
    channelCommissions.map((c) => ({
      channel: dims.channels.get(c.channelId)?.name ?? "Unknown",
      netSales: c.netSales,
      orders: c.orders,
      rate: c.rate,
      commissionRate: c.commissionRate,
      deliveryChargeRate: c.deliveryChargeRate,
      rateUnset: c.rateUnset,
      commission: c.commission,
      takeHome: round2(c.netSales - c.commission),
    })),
    (v) => v.takeHome,
  );
  const portalRows = channelRows.filter((c) => isPortal(c.channel));
  // Portals with no rate that have no completed sales in scope (e.g. a new
  // portal whose first order was cancelled) still get a card, so the rate
  // can be set before it starts counting — unless a channel filter excludes them.
  const shownChannelIds = new Set(channelCommissions.map((c) => c.channelId));
  const pendingPortals = [...rateUnsetChannels]
    .filter((id) => !shownChannelIds.has(id))
    .map((id) => dims.channels.get(id)?.name)
    .filter((name): name is string => Boolean(name) && isPortal(name!) && !isTestFixtureName("channel", name!))
    .filter((name) => !filters.channels?.length || filters.channels.includes(name));
  const unsetPortals = portalRows.filter((c) => c.rateUnset).map((c) => c.channel);
  const unsetNote = unsetPortals.length ? `Excludes ${unsetPortals.join(", ")} — commission rate not set` : undefined;

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

  // ---- daily take-home series, for the headline KPI card's sparkline ----
  // Same re-attribution pattern as monthCommission/monthAgg above, just keyed
  // on the raw receivedDateKey instead of month-sliced — no new queries.
  const dayCommission = new Map<string, number>();
  for (const g of byDateChannelGroups) {
    if (!g.receivedDateKey) continue;
    const rate = rateByChannel.get(g.channelId) ?? 0;
    const prev = dayCommission.get(g.receivedDateKey) ?? 0;
    dayCommission.set(g.receivedDateKey, prev + num(g._sum.netSales) * (rate / 100));
  }
  const dayNetSales = new Map<string, number>();
  for (const g of byDateGroups) {
    if (!g.receivedDateKey) continue;
    dayNetSales.set(g.receivedDateKey, (dayNetSales.get(g.receivedDateKey) ?? 0) + num(g._sum.netSales));
  }
  const takeHomeSparkline = [...dayNetSales.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, netSales]) => round2(netSales - round2(dayCommission.get(date) ?? 0)))
    .slice(-30);

  // Days of `month` ("YYYY-MM") actually covered by this scope — the full
  // calendar month, clipped to filters.dateFrom at the start and to
  // effectiveDateTo (already today-clamped) at the end. Needed so MoM growth
  // below compares take-home *per day* rather than raw totals: without it, a
  // partial in-progress month (e.g. 22 days of September) reads as a huge
  // "crash" or "spike" against a prior full month it hasn't had time to catch up to.
  const daysElapsedInMonth = (month: string): number => {
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInDubaiMonth(monthStart)).padStart(2, "0")}`;
    const start = filters.dateFrom && filters.dateFrom > monthStart ? filters.dateFrom : monthStart;
    const rangeEnd = effectiveDateTo ?? todayKey;
    const end = rangeEnd < monthEnd ? rangeEnd : monthEnd;
    return start > end ? 0 : daysBetweenInclusive(start, end);
  };

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
        days: daysElapsedInMonth(month),
      };
    });

  // Projects the CURRENT month's own pace to a full month — not the
  // avgDailyIncome above, which (left unscoped, the default) blends in
  // every earlier month too. That previously understated a fast-trending
  // month: e.g. a slow August dragged down September's projection even
  // though September's own daily rate was running far higher.
  const currentMonthRow = monthRows[monthRows.length - 1];
  const projectedMonthlyIncome =
    currentMonthRow && currentMonthRow.days > 0
      ? (currentMonthRow.takeHome / currentMonthRow.days) * daysInDubaiMonth(`${currentMonthRow.month}-01`)
      : 0;

  const momGrowthPct = (() => {
    if (monthRows.length < 2) return null;
    const last = monthRows[monthRows.length - 1];
    const prev = monthRows[monthRows.length - 2];
    if (last.days === 0 || prev.days === 0) return null;
    const prevPerDay = prev.takeHome / prev.days;
    return prevPerDay === 0 ? null : ((last.takeHome / last.days) / prevPerDay - 1) * 100;
  })();

  // ---- payment method breakdown ----
  const paymentRows = sortDesc(
    byPaymentGroups
      .filter((g): g is typeof g & { paymentMethod: string } => Boolean(g.paymentMethod))
      .map((g) => ({
        method: g.paymentMethod,
        netSales: num(g._sum.netSales),
        receiptTotal: num(g._sum.receiptTotal),
        orders: g._count._all,
      })),
    (v) => v.netSales,
  );
  // "Amount received" means the real, VAT-inclusive money that changed
  // hands (receiptTotal) — not netSales, which has VAT stripped out for
  // accounting. Confirmed against the DB: netSales understates CASH/CARD
  // received by exactly the VAT portion of those orders.
  const cashAmount = paymentRows.find((p) => p.method === "CASH")?.receiptTotal ?? 0;
  const cardAmount = paymentRows.find((p) => p.method === "CARD")?.receiptTotal ?? 0;

  return {
    kpis: [
      // Group 1 — the headline: what actually landed in the bank.
      {
        key: "takeHomeIncome",
        label: "Take-Home Income",
        value: fmtCurrencyCompact(takeHomeIncome),
        fullValue: fmtCurrencyExact(takeHomeIncome),
        subtitle: unsetNote ?? "Net sales minus platform commission & delivery charge",
        sparkline: takeHomeSparkline,
      },
      { key: "grossRevenue", label: "Gross Revenue", value: fmtCurrencyCompact(grossRevenue), fullValue: fmtCurrencyExact(grossRevenue) },
      { key: "netSales", label: "Net Sales", value: fmtCurrencyCompact(netSales), fullValue: fmtCurrencyExact(netSales) },

      // Group 2 — the two deductions between gross and take-home.
      { key: "totalDiscount", label: "Discounts Given", value: fmtCurrencyCompact(totalDiscount), fullValue: fmtCurrencyExact(totalDiscount), accent: true },
      {
        key: "totalCommission",
        label: "Platform Commission",
        value: fmtCurrencyCompact(totalCommission),
        fullValue: fmtCurrencyExact(totalCommission),
        subtitle: unsetNote,
        accent: true,
      },
      { key: "marginPct", label: "Take-Home Margin", value: fmtPercent(takeHomeMarginPct) },

      // Group 3 — pace.
      { key: "avgDailyIncome", label: "Avg Daily Income", value: `${fmtCurrencyCompact(avgDailyIncome)}/day`, fullValue: `${fmtCurrencyExact(avgDailyIncome)}/day` },
      ...(currentMonthRow && currentMonthRow.days > 0
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
              subtitle: "Per day, vs last month",
              accent: momGrowthPct < 0,
              trend: { pct: momGrowthPct, label: "vs last month" },
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
      ...portalRows.map((c) => ({
        key: `portalCommission_${c.channel}`,
        label: `${c.channel} Commission`,
        value: c.rateUnset ? "Rate not set" : fmtCurrencyCompact(c.commission),
        fullValue: c.rateUnset ? undefined : fmtCurrencyExact(c.commission),
        subtitle: c.rateUnset
          ? `New portal · ${fmtCurrencyCompact(c.netSales)} net sales · click ✎ to set its commission`
          : `${fmtPercent(c.commissionRate)} commission + ${fmtPercent(c.deliveryChargeRate)} delivery of ${fmtCurrencyCompact(c.netSales)} net sales`,
        accent: true,
        drillFilter: { channels: [c.channel] },
        editCommission: {
          channel: c.channel,
          currentCommissionRate: c.commissionRate,
          currentDeliveryChargeRate: c.deliveryChargeRate,
        },
      })),
      ...pendingPortals.map((channel) => ({
        key: `portalCommission_${channel}`,
        label: `${channel} Commission`,
        value: "Rate not set",
        subtitle: "New portal · no completed orders yet · click ✎ to set its commission",
        accent: true,
        editCommission: { channel, currentCommissionRate: 0, currentDeliveryChargeRate: 0 },
      })),

      // Group 6 — cash vs. card actually handed over at the point of sale,
      // as distinct from PREPAID (settled on the delivery platform, never
      // touches this business's till) and FOC (free, nothing collected).
      {
        key: "cashAmount",
        label: "Cash Amount",
        value: fmtCurrencyCompact(cashAmount),
        fullValue: fmtCurrencyExact(cashAmount),
        drillFilter: { paymentMethods: ["CASH"] },
      },
      {
        key: "cardAmount",
        label: "Card Amount Received",
        value: fmtCurrencyCompact(cardAmount),
        fullValue: fmtCurrencyExact(cardAmount),
        drillFilter: { paymentMethods: ["CARD"] },
      },
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
        dimension: "payment",
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
          { key: "rate", label: "Commission + Delivery Rate", align: "right" },
          { key: "netSales", label: "Net Sales", align: "right" },
          { key: "commission", label: "Commission", align: "right" },
          { key: "takeHome", label: "Take-Home Income", align: "right" },
          { key: "orders", label: "Orders", align: "right" },
        ],
        rows: channelRows.map((c) => ({
          channel: c.channel,
          rate: `${fmtPercent(c.commissionRate)} + ${fmtPercent(c.deliveryChargeRate)}`,
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
