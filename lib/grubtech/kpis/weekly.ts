import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ChartSpec, DashboardFilters, KpiValue, TabPayload, TableSpec } from "@/lib/types";
import { buildOrderWhere } from "@/lib/filters";
import { fmtCurrency, fmtCurrencyCompact, fmtCurrencyExact, fmtNumber, round2 } from "@/lib/format";
import { dubaiDateKey } from "@/lib/grubtech/dubaiTime";
import { buildWeeks, bucketIndexOf, resolveWeeklyRange, type WeekBucket } from "@/lib/grubtech/weeks";
import { loadDimensionMaps, num, sortDesc } from "./shared";

/** Most recent weeks that get their own KPI cards — charts and tables still show every week in range. */
const KPI_WEEKS = 6;

type Metric = "net" | "gross" | "orders";

export interface Totals {
  net: number[];
  gross: number[];
  orders: number[];
}

const emptyTotals = (weekCount: number): Totals => ({
  net: new Array(weekCount).fill(0),
  gross: new Array(weekCount).fill(0),
  orders: new Array(weekCount).fill(0),
});

/**
 * Change from the previous week to this one, compared per day rather than
 * as raw totals — identical to the plain total change when both weeks are
 * full, but stops a clipped first/last week (e.g. 3 days of the current
 * week so far) from reading as a sales crash against a full 7-day week.
 * null when there's no previous-week baseline to compare against.
 */
function perDayChangePct(cur: number, curWeek: WeekBucket, prev: number, prevWeek: WeekBucket): number | null {
  const prevPerDay = prev / prevWeek.days;
  if (prevPerDay === 0) return null;
  return ((cur / curWeek.days) / prevPerDay - 1) * 100;
}

function fmtChange(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

function fmtChangeArrow(pct: number | null): string {
  if (pct === null) return "";
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
}

/** Per-day change vs the previous week; Week 1 has no previous week to compare against. */
function weekChangePct(weeks: WeekBucket[], series: number[], w: number): number | null {
  return w === 0 ? null : perDayChangePct(series[w], weeks[w], series[w - 1], weeks[w - 1]);
}

/** A Gross Sales card then a Net Sales card for each week (the latest KPI_WEEKS of them), so each week's pair sits together. */
export function weekKpiCards(weeks: WeekBucket[], overall: Totals): KpiValue[] {
  const card = (metric: "net" | "gross", w: WeekBucket): KpiValue => {
    const value = overall[metric][w.index];
    const change = fmtChangeArrow(weekChangePct(weeks, overall[metric], w.index));
    const subtitle = [
      w.rangeLabel + (w.days < 7 ? ` · ${w.days}d` : ""),
      change && `${change} vs ${weeks[w.index - 1].shortLabel}`,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: `${metric}_w${w.index + 1}`,
      label: `${w.label} ${metric === "net" ? "Net" : "Gross"} Sales`,
      value: fmtCurrencyCompact(value),
      fullValue: fmtCurrencyExact(value),
      subtitle,
      group: `week_${w.index}`,
      // Same drill convention as the dashboard's other cards: the week's own
      // (clipped) dates, completed-only via the weekly tab's status filter.
      drillTab: "weekly",
      drillFilter: { dateFrom: w.start, dateTo: w.end },
    };
  };

  const kpiWeeks = weeks.slice(-KPI_WEEKS);
  return kpiWeeks.flatMap((w) => [card("gross", w), card("net", w)]);
}

export async function buildWeeklyTab(filters: DashboardFilters): Promise<TabPayload> {
  const range = resolveWeeklyRange(filters.dateFrom, filters.dateTo, dubaiDateKey(new Date()));
  const weeks = buildWeeks(range.from, range.to);

  // Same completed-only convention as Order Details/Income
  // (lib/grubtech/kpis/sales.ts) so a week's figures reconcile with the
  // Order Details tab scoped to the same dates.
  const where: Prisma.OrderWhereInput = {
    ...buildOrderWhere({ ...filters, dateFrom: range.from, dateTo: range.to }),
    status: "COMPLETED",
  };

  const [dims, byDateChannelGroups] = await Promise.all([
    loadDimensionMaps(),
    prisma.order.groupBy({
      by: ["receivedDateKey", "channelId"],
      where,
      _sum: { netSales: true, receiptTotal: true, discountAmount: true },
      _count: { _all: true },
    }),
  ]);

  const byChannel = new Map<string, Totals>();
  const overall = emptyTotals(weeks.length);
  for (const g of byDateChannelGroups) {
    if (!g.receivedDateKey) continue;
    const w = bucketIndexOf(g.receivedDateKey, weeks);
    if (w < 0) continue;

    const net = num(g._sum.netSales);
    // Pre-discount, tax-inclusive — the same Gross Sales definition as
    // Order Details (lib/grubtech/kpis/sales.ts), confirmed there against
    // GrubCenter's own Sales Summary widget.
    const gross = num(g._sum.receiptTotal) + num(g._sum.discountAmount);
    const orders = g._count._all;

    const channelTotals = byChannel.get(g.channelId) ?? emptyTotals(weeks.length);
    for (const t of [channelTotals, overall]) {
      t.net[w] += net;
      t.gross[w] += gross;
      t.orders[w] += orders;
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
  const changeVsPrev = (series: number[], w: number) => weekChangePct(weeks, series, w);

  const bestWeek = sortDesc(weeks, (w) => overall.net[w.index] / w.days)[0];
  const latest = weeks[weeks.length - 1];
  const topChannelLatest = sortDesc(channelRows, (c) => c.totals.net[latest.index])[0];

  const kpis: KpiValue[] = [
    ...weekKpiCards(weeks, overall),
    {
      key: "bestWeek",
      label: "Best Week (Net/Day)",
      value: totalOrders > 0 && bestWeek ? bestWeek.label : "—",
      subtitle:
        totalOrders > 0 && bestWeek
          ? `${fmtCurrency(overall.net[bestWeek.index] / bestWeek.days)}/day · ${bestWeek.rangeLabel}`
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
  const captionNote = range.clipped ? ` · showing the latest ${weeks.length} weeks` : "";
  // A week shorter than 7 days (the month's leftover days, or the week still
  // in progress) is flagged in chart labels so its smaller bar isn't read as
  // a sales drop.
  const chartLabel = (w: WeekBucket) => (w.days < 7 ? `${w.label} (${w.days}d)` : w.label);
  const weekDatasets = (metric: "net" | "gross") =>
    weeks.map((w) => ({
      label: `${chartLabel(w)} · ${w.rangeLabel}`,
      data: channelRows.map((c) => round2(c.totals[metric][w.index])),
    }));

  const charts: ChartSpec[] = [
    {
      id: "weekly-net-by-aggregator",
      title: "Net Sales by Aggregator — Week over Week",
      caption: `One bar per week${captionNote}`,
      type: "bar",
      dimension: "channel",
      drillScope,
      labels: channelRows.map((c) => c.channel),
      datasets: weekDatasets("net"),
    },
    {
      id: "weekly-gross-by-aggregator",
      title: "Gross Sales by Aggregator — Week over Week",
      caption: `One bar per week${captionNote}`,
      type: "bar",
      dimension: "channel",
      drillScope,
      labels: channelRows.map((c) => c.channel),
      datasets: weekDatasets("gross"),
    },
    {
      id: "weekly-net-vs-gross",
      title: "Weekly Net vs Gross Sales",
      caption: "Bars: net & gross sales · Line: orders",
      type: "combo",
      labels: weeks.map(chartLabel),
      datasets: [
        { label: "Net Sales", data: overall.net.map(round2), kind: "bar", yAxisId: "y" },
        { label: "Gross Sales", data: overall.gross.map(round2), kind: "bar", yAxisId: "y" },
        { label: "Orders", data: overall.orders, kind: "line", yAxisId: "y1" },
      ],
    },
    {
      id: "weekly-net-trend",
      title: "Net Sales Trend by Aggregator",
      caption: "One line per aggregator",
      type: "line",
      labels: weeks.map(chartLabel),
      datasets: channelRows.map((c) => ({
        label: c.channel,
        data: c.totals.net.map(round2),
        kind: "line" as const,
      })),
    },
  ];

  // ---- Tables: aggregator x week matrices, with a pinned Total row -------
  const matrixTable = (title: string, metric: Metric, fmt: (n: number) => string): TableSpec => {
    const columns: TableSpec["columns"] = [
      { key: "channel", label: "Aggregator" },
      ...weeks.map((w) => ({ key: `w${w.index + 1}`, label: `${w.label} · ${w.rangeLabel}`, align: "right" as const })),
      ...(weeks.length > 1 ? [{ key: "change", label: "Latest vs Prev", align: "right" as const }] : []),
    ];
    const rowFor = (label: string, series: number[]) => ({
      channel: label,
      ...Object.fromEntries(weeks.map((w) => [`w${w.index + 1}`, fmt(series[w.index])])),
      ...(weeks.length > 1 ? { change: fmtChange(changeVsPrev(series, latest.index)) } : {}),
    });

    return {
      title,
      columns,
      // dateFrom/dateTo aren't columns — filterFromTableRow (lib/drillthrough.ts)
      // reads them so a row click drills into the weeks shown, not all time.
      rows: channelRows.map((c) => ({ ...rowFor(c.channel, c.totals[metric]), dateFrom: range.from, dateTo: range.to })),
      footerRow: rowFor("Total", overall[metric]),
    };
  };

  return {
    kpis,
    charts,
    table: matrixTable("Net Sales by Aggregator × Week", "net", fmtCurrency),
    extraTables: [
      matrixTable("Gross Sales by Aggregator × Week", "gross", fmtCurrency),
      matrixTable("Orders by Aggregator × Week", "orders", fmtNumber),
    ],
    scope: { orderCount: totalOrders },
  };
}
