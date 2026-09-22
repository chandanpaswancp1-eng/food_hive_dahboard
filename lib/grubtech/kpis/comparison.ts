import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ChartSpec, KpiValue, TabId, TabPayload, TableSpec } from "@/lib/types";
import { fmtCurrency, fmtCurrencyCompact, fmtCurrencyExact, fmtNumber, round2 } from "@/lib/format";
import { bucketIndexOf, type PeriodBucket } from "@/lib/grubtech/weeks";
import { loadDimensionMaps, num, sortDesc } from "./shared";

/**
 * Shared engine behind the Weekly and Monthly Comparison tabs: Gross and Net
 * Sales per period as KPI cards, by aggregator in charts and tables, with a
 * per-day change against the previous period. The two tabs differ only in how
 * their periods are cut (weeks.ts / months.ts) and in a few labels.
 */

/** Most recent periods that get their own KPI cards — charts and tables still show every period in range. */
const KPI_PERIODS = 6;

type Metric = "net" | "gross" | "orders";

interface Totals {
  net: number[];
  gross: number[];
  orders: number[];
}

const emptyTotals = (count: number): Totals => ({
  net: new Array(count).fill(0),
  gross: new Array(count).fill(0),
  orders: new Array(count).fill(0),
});

/**
 * Change from the previous period to this one, compared per day rather than
 * as raw totals — identical to the plain total change when both periods have
 * the same number of days, but stops a partial one (3 days of the week so
 * far, or a month that only started trading mid-way) from reading as a
 * sales crash against a full one. null when there's no baseline to compare.
 */
function perDayChangePct(cur: number, curP: PeriodBucket, prev: number, prevP: PeriodBucket): number | null {
  const prevPerDay = prev / prevP.days;
  if (prevPerDay === 0) return null;
  return ((cur / curP.days) / prevPerDay - 1) * 100;
}

/**
 * Plain percentage change, for a series that's already per-day (e.g. the
 * Net Sales per Day table below) — perDayChangePct must never be applied to
 * one of those, since it would divide by each period's day-count a second
 * time and produce a meaningless number.
 */
function plainChangePct(cur: number, prev: number): number | null {
  return prev === 0 ? null : (cur / prev - 1) * 100;
}

function fmtChange(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

function fmtChangeArrow(pct: number | null): string {
  if (pct === null) return "";
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
}

export interface ComparisonOptions {
  /** Already scoped to the periods' overall range and to COMPLETED orders. */
  where: Prisma.OrderWhereInput;
  buckets: PeriodBucket[];
  noun: "Week" | "Month";
  /** The tab this feeds — also its drill-through status convention (see app/api/orders/route.ts). */
  tab: Extract<TabId, "weekly" | "monthly">;
  /** Overall date range, so a chart/table drill-through covers the periods shown and not all time. */
  range: { from: string; to: string };
  /** Appended to the by-aggregator chart captions, e.g. " · showing the latest 12 months". */
  captionNote?: string;
  /** Adds an aggregator x period table of Net Sales per day — worthwhile when periods differ in length (months). */
  perDayTable?: boolean;
}

export async function buildComparisonTab(o: ComparisonOptions): Promise<TabPayload> {
  const { buckets, noun, tab, range } = o;
  const nounLower = noun.toLowerCase();
  const idPrefix = tab; // "weekly" | "monthly"
  const keyPrefix = noun === "Week" ? "w" : "m";

  const [dims, byDateChannelGroups] = await Promise.all([
    loadDimensionMaps(),
    prisma.order.groupBy({
      by: ["receivedDateKey", "channelId"],
      where: o.where,
      _sum: { netSales: true, receiptTotal: true, discountAmount: true },
      _count: { _all: true },
    }),
  ]);

  const byChannel = new Map<string, Totals>();
  const overall = emptyTotals(buckets.length);
  for (const g of byDateChannelGroups) {
    if (!g.receivedDateKey) continue;
    const p = bucketIndexOf(g.receivedDateKey, buckets);
    if (p < 0) continue;

    const net = num(g._sum.netSales);
    // Pre-discount, tax-inclusive — the same Gross Sales definition as
    // Order Details (lib/grubtech/kpis/sales.ts), confirmed there against
    // GrubCenter's own Sales Summary widget.
    const gross = num(g._sum.receiptTotal) + num(g._sum.discountAmount);
    const orders = g._count._all;

    const channelTotals = byChannel.get(g.channelId) ?? emptyTotals(buckets.length);
    for (const t of [channelTotals, overall]) {
      t.net[p] += net;
      t.gross[p] += gross;
      t.orders[p] += orders;
    }
    byChannel.set(g.channelId, channelTotals);
  }

  const channelRows = sortDesc(
    [...byChannel.entries()].map(([channelId, totals]) => ({
      channel: dims.channels.get(channelId)?.name ?? "Unknown",
      totals,
    })),
    (c) => c.totals.net.reduce((a, b) => a + b, 0),
  );

  const totalOrders = overall.orders.reduce((a, b) => a + b, 0);
  const latest = buckets[buckets.length - 1];

  /** Per-day change vs the previous period; the first period has nothing to compare against. */
  const changeVsPrev = (series: number[], p: number): number | null =>
    p === 0 ? null : perDayChangePct(series[p], buckets[p], series[p - 1], buckets[p - 1]);

  // ---- KPI cards: a Gross then a Net card per period ----------------------
  const card = (metric: "net" | "gross", p: PeriodBucket): KpiValue => {
    const value = overall[metric][p.index];
    const changePct = changeVsPrev(overall[metric], p.index);
    const change = fmtChangeArrow(changePct);
    const subtitle = [
      p.rangeLabel + (p.days < p.fullDays ? ` · ${p.days}d` : ""),
      change && `${change} vs ${buckets[p.index - 1].shortLabel}`,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: `${metric}_${keyPrefix}${p.index + 1}`,
      label: `${p.label} ${metric === "net" ? "Net" : "Gross"} Sales`,
      value: fmtCurrencyCompact(value),
      fullValue: fmtCurrencyExact(value),
      subtitle,
      group: `${nounLower}_${p.index}`,
      // Same drill convention as the dashboard's other cards: the period's own
      // (clipped) dates, completed-only via this tab's status filter.
      drillTab: tab,
      drillFilter: { dateFrom: p.start, dateTo: p.end },
      trend: changePct !== null ? { pct: changePct, label: `vs ${buckets[p.index - 1].shortLabel}` } : undefined,
      // Sparkline on the latest period's Gross card only — a period-level (not
      // daily) series of the recent weeks/months already computed above.
      sparkline: metric === "gross" && p.index === latest.index ? overall.gross.slice(-KPI_PERIODS) : undefined,
    };
  };

  const bestPeriod = sortDesc(buckets, (p) => overall.net[p.index] / p.days)[0];
  const topChannelLatest = sortDesc(channelRows, (c) => c.totals.net[latest.index])[0];

  const kpis: KpiValue[] = [
    ...buckets.slice(-KPI_PERIODS).flatMap((p) => [card("gross", p), card("net", p)]),
    {
      key: `best${noun}`,
      label: `Best ${noun} (Net/Day)`,
      value: totalOrders > 0 && bestPeriod ? bestPeriod.label : "—",
      subtitle:
        totalOrders > 0 && bestPeriod
          ? `${fmtCurrency(overall.net[bestPeriod.index] / bestPeriod.days)}/day · ${bestPeriod.rangeLabel}`
          : undefined,
    },
    {
      key: "topAggregatorLatest",
      label: `Top Aggregator · ${latest.label}`,
      value: topChannelLatest && topChannelLatest.totals.net[latest.index] > 0 ? topChannelLatest.channel : "—",
      subtitle:
        topChannelLatest && topChannelLatest.totals.net[latest.index] > 0
          ? `${fmtCurrency(topChannelLatest.totals.net[latest.index])} net · ${latest.rangeLabel}`
          : undefined,
    },
  ];

  // ---- Charts ------------------------------------------------------------
  const drillScope = { dateFrom: range.from, dateTo: range.to };
  const captionNote = o.captionNote ?? "";
  // A partial period (the week/month still in progress, or one that started
  // trading part-way through) is flagged in chart labels so its smaller bar
  // isn't read as a sales drop.
  const chartLabel = (p: PeriodBucket) => (p.days < p.fullDays ? `${p.label} (${p.days}d)` : p.label);
  const periodDatasets = (metric: "net" | "gross") =>
    buckets.map((p) => ({
      label: `${chartLabel(p)} · ${p.rangeLabel}`,
      data: channelRows.map((c) => round2(c.totals[metric][p.index])),
    }));

  const charts: ChartSpec[] = [
    {
      id: `${idPrefix}-net-by-aggregator`,
      title: `Net Sales by Aggregator — ${noun} over ${noun}`,
      caption: `One bar per ${nounLower}${captionNote}`,
      type: "bar",
      dimension: "channel",
      drillScope,
      labels: channelRows.map((c) => c.channel),
      datasets: periodDatasets("net"),
    },
    {
      id: `${idPrefix}-gross-by-aggregator`,
      title: `Gross Sales by Aggregator — ${noun} over ${noun}`,
      caption: `One bar per ${nounLower}${captionNote}`,
      type: "bar",
      dimension: "channel",
      drillScope,
      labels: channelRows.map((c) => c.channel),
      datasets: periodDatasets("gross"),
    },
    {
      id: `${idPrefix}-net-vs-gross`,
      title: `${noun}ly Net vs Gross Sales`,
      caption: "Bars: net & gross sales · Line: orders",
      type: "combo",
      labels: buckets.map(chartLabel),
      datasets: [
        { label: "Net Sales", data: overall.net.map(round2), kind: "bar", yAxisId: "y" },
        { label: "Gross Sales", data: overall.gross.map(round2), kind: "bar", yAxisId: "y" },
        { label: "Orders", data: overall.orders, kind: "line", yAxisId: "y1" },
      ],
    },
    {
      id: `${idPrefix}-net-trend`,
      title: "Net Sales Trend by Aggregator",
      caption: "One line per aggregator",
      type: "line",
      labels: buckets.map(chartLabel),
      datasets: channelRows.map((c) => ({
        label: c.channel,
        data: c.totals.net.map(round2),
        kind: "line" as const,
      })),
    },
  ];

  // ---- Tables: aggregator x period matrices, with a pinned Total row -----
  // `changeFn` defaults to the raw-totals path (perDayChangePct, via
  // changeVsPrev) — the per-day table below passes plainChangePct instead,
  // since its `values` are already per-day and must not be divided by the
  // day-count a second time.
  const matrixTable = (
    title: string,
    series: (c: { totals: Totals } | null) => number[],
    fmt: (n: number) => string,
    changeFn: (values: number[], p: number) => number | null = changeVsPrev,
  ): TableSpec => {
    const columns: TableSpec["columns"] = [
      { key: "channel", label: "Aggregator" },
      ...buckets.map((p) => ({ key: `${keyPrefix}${p.index + 1}`, label: `${p.label} · ${p.rangeLabel}`, align: "right" as const })),
      ...(buckets.length > 1 ? [{ key: "change", label: "Latest vs Prev", align: "right" as const }] : []),
    ];
    const rowFor = (label: string, values: number[]) => ({
      channel: label,
      ...Object.fromEntries(buckets.map((p) => [`${keyPrefix}${p.index + 1}`, fmt(values[p.index])])),
      ...(buckets.length > 1 ? { change: fmtChange(changeFn(values, latest.index)) } : {}),
    });

    return {
      title,
      columns,
      // dateFrom/dateTo aren't columns — filterFromTableRow (lib/drillthrough.ts)
      // reads them so a row click drills into the periods shown, not all time.
      rows: channelRows.map((c) => ({ ...rowFor(c.channel, series(c)), dateFrom: range.from, dateTo: range.to })),
      footerRow: rowFor("Total", series(null)),
    };
  };

  const metricSeries = (metric: Metric) => (c: { totals: Totals } | null) => (c ? c.totals[metric] : overall[metric]);
  const perDay = (c: { totals: Totals } | null) => (c ? c.totals.net : overall.net).map((v, i) => v / buckets[i].days);
  const perDayChange = (values: number[], p: number): number | null => (p === 0 ? null : plainChangePct(values[p], values[p - 1]));

  return {
    kpis,
    charts,
    table: matrixTable(`Net Sales by Aggregator × ${noun}`, metricSeries("net"), fmtCurrency),
    extraTables: [
      matrixTable(`Gross Sales by Aggregator × ${noun}`, metricSeries("gross"), fmtCurrency),
      matrixTable(`Orders by Aggregator × ${noun}`, metricSeries("orders"), fmtNumber),
      ...(o.perDayTable ? [matrixTable(`Net Sales per Day by Aggregator × ${noun}`, perDay, fmtCurrency, perDayChange)] : []),
    ],
    scope: { orderCount: totalOrders },
  };
}
