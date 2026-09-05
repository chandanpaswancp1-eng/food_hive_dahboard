import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtMinutes, fmtNumber } from "@/lib/format";
import { num, sortDesc, loadDimensionMaps } from "./shared";

const STAGE_FIELDS = [
  "durAccToStarted",
  "durStartedToPrep",
  "durPrepToSTD",
  "durSTDToDispatched",
  "durReceivingToDispatched",
  "durReceivedToDelivered",
] as const;

const STAGE_LABELS: Record<(typeof STAGE_FIELDS)[number], string> = {
  durAccToStarted: "Acc → Started",
  durStartedToPrep: "Started → Prepared",
  durPrepToSTD: "Prepared → STD",
  durSTDToDispatched: "STD → Dispatched",
  durReceivingToDispatched: "Receiving → Dispatched",
  durReceivedToDelivered: "Received → Delivered",
};

const AVG_ALL_STAGES = Object.fromEntries(STAGE_FIELDS.map((f) => [f, true])) as Record<
  (typeof STAGE_FIELDS)[number],
  true
>;

/**
 * GrubCenter's "Location Performance Averages" export shares its first four
 * stages with Order's own fields, but its fifth stage is "Dispatched →
 * Delivered" (final mile only) — a different measurement than Order's
 * "Receiving → Dispatched" (cumulative from order receipt) — so it gets its
 * own field/label set rather than reusing STAGE_FIELDS.
 */
const LPA_STAGE_FIELDS = [
  "durAccToStarted",
  "durStartedToPrep",
  "durPrepToSTD",
  "durSTDToDispatched",
  "durDispatchedToDelivered",
  "durReceivedToDelivered",
] as const;

const LPA_STAGE_LABELS: Record<(typeof LPA_STAGE_FIELDS)[number], string> = {
  durAccToStarted: "Acc → Started",
  durStartedToPrep: "Started → Prepared",
  durPrepToSTD: "Prepared → STD",
  durSTDToDispatched: "STD → Dispatched",
  durDispatchedToDelivered: "Dispatched → Delivered",
  durReceivedToDelivered: "Received → Delivered",
};

export async function buildPrepTimeTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const completedWhere: Prisma.OrderWhereInput = { ...where, status: "COMPLETED" };

  const [overall, dims, byBrandGroups, locationPerfRows, scopeCount] = await Promise.all([
    prisma.order.aggregate({ where: completedWhere, _avg: AVG_ALL_STAGES }),
    loadDimensionMaps(),
    prisma.order.groupBy({
      by: ["brandId"],
      where: completedWhere,
      _avg: AVG_ALL_STAGES,
      _count: { _all: true },
    }),
    // Order-details exports carry no milestone timestamps beyond Received At,
    // so per-order stage durations aren't available from Order rows yet —
    // GrubCenter's own "Location Performance Averages" export is currently
    // the only source for this. It's a brand+location snapshot with no date
    // axis, so (unlike the rest of this tab) it isn't scoped by the
    // dashboard's date/dimension filters.
    prisma.locationPerformanceAverage.findMany({ include: { brand: true, location: true } }),
    prisma.order.count({ where }),
  ]);

  const brandRows = byBrandGroups.map((g) => ({
    brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
    orders: g._count._all,
    cycle: g._avg.durReceivedToDelivered !== null ? num(g._avg.durReceivedToDelivered) : null,
    stages: STAGE_FIELDS.map((field) => ({ label: STAGE_LABELS[field], avg: g._avg[field] !== null ? num(g._avg[field]) : null })),
  }));

  const brandLocationRows = locationPerfRows.map((r) => ({
    brand: r.brand.name,
    location: r.location.name,
    cycle: r.durReceivedToDelivered !== null ? num(r.durReceivedToDelivered) : null,
    stages: LPA_STAGE_FIELDS.map((field) => ({
      label: LPA_STAGE_LABELS[field],
      avg: r[field] !== null ? num(r[field]) : null,
    })),
  }));

  // Order-derived stage data isn't populated by any export seen so far — fall
  // back to averaging the Location Performance Averages snapshot so the
  // headline KPIs aren't just a wall of "—".
  const orderDataAvailable = STAGE_FIELDS.some((f) => overall._avg[f] !== null);
  const lpaAvg = (field: (typeof LPA_STAGE_FIELDS)[number]) => {
    const values = locationPerfRows.map((r) => r[field]).filter((v): v is NonNullable<typeof v> => v !== null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + num(v), 0) / values.length;
  };

  const rankedByCycle = sortDesc(
    brandRows.filter((b): b is typeof b & { cycle: number } => (b.cycle ?? 0) > 0),
    (b) => -b.cycle,
  );
  const fastest = rankedByCycle[0];
  const slowest = rankedByCycle[rankedByCycle.length - 1];

  const dispatchValue = (b: (typeof brandRows)[number]) =>
    b.stages.find((s) => s.label === STAGE_LABELS.durReceivingToDispatched)?.avg;

  const withDispatchAvg = brandRows.filter((b) => (dispatchValue(b) ?? 0) > 0);
  const rankedByDispatchDesc = sortDesc(withDispatchAvg, (b) => dispatchValue(b) ?? 0);
  const worstDispatch = rankedByDispatchDesc.slice(0, 4);
  const bestDispatch = [...rankedByDispatchDesc].reverse().slice(0, 4);

  return {
    kpis: orderDataAvailable
      ? [
          ...STAGE_FIELDS.map((field) => ({
            key: field,
            label: STAGE_LABELS[field],
            value: fmtMinutes(overall._avg[field] !== null ? num(overall._avg[field]) : null),
          })),
          ...(fastest
            ? [{ key: "fastestOutlet", label: "Fastest Brand", value: fastest.brand, subtitle: fmtMinutes(fastest.cycle) }]
            : []),
          ...(slowest && slowest !== fastest
            ? [
                {
                  key: "slowestOutlet",
                  label: "Underperforming",
                  value: slowest.brand,
                  subtitle: fmtMinutes(slowest.cycle),
                  accent: true,
                },
              ]
            : []),
        ]
      : LPA_STAGE_FIELDS.map((field) => ({
          key: field,
          label: LPA_STAGE_LABELS[field],
          value: fmtMinutes(lpaAvg(field)),
        })),
    charts: [
      {
        id: "best-receiving-to-dispatched",
        title: "Best Receiving → Dispatched",
        type: "hbar",
        dimension: "brand",
        labels: bestDispatch.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: bestDispatch.map((b) => dispatchValue(b) ?? 0) }],
      },
      {
        id: "worst-receiving-to-dispatched",
        title: "Worst Receiving → Dispatched",
        type: "hbar",
        dimension: "brand",
        labels: worstDispatch.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: worstDispatch.map((b) => dispatchValue(b) ?? 0) }],
      },
      {
        id: "cycle-time-by-brand",
        title: "Full Cycle Time by Brand",
        type: "bar",
        dimension: "brand",
        labels: brandRows.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: brandRows.map((b) => b.cycle ?? 0) }],
      },
    ],
    table: {
      title: "Brand-Level Prep Stage Breakdown",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "orders", label: "Orders", align: "right" },
        ...STAGE_FIELDS.map((field) => ({ key: STAGE_LABELS[field], label: STAGE_LABELS[field], align: "right" as const })),
      ],
      rows: brandRows.map((b) => ({
        brand: b.brand,
        orders: fmtNumber(b.orders),
        ...Object.fromEntries(b.stages.map((s) => [s.label, fmtMinutes(s.avg)])),
      })),
    },
    extraTables: [
      {
        title: "Location Performance Averages",
        columns: [
          { key: "brand", label: "Brand" },
          { key: "location", label: "Location" },
          ...LPA_STAGE_FIELDS.map((field) => ({ key: LPA_STAGE_LABELS[field], label: LPA_STAGE_LABELS[field], align: "right" as const })),
        ],
        rows: sortDesc(brandLocationRows, (r) => r.cycle ?? 0).map((r) => ({
          brand: r.brand,
          location: r.location,
          ...Object.fromEntries(r.stages.map((s) => [s.label, fmtMinutes(s.avg)])),
        })),
      },
    ],
    scope: { orderCount: scopeCount },
  };
}
