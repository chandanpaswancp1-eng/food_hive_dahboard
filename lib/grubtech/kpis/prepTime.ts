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

export async function buildPrepTimeTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const completedWhere: Prisma.OrderWhereInput = { ...where, status: "COMPLETED" };

  const [overall, dims, byBrandGroups, scopeCount] = await Promise.all([
    prisma.order.aggregate({ where: completedWhere, _avg: AVG_ALL_STAGES }),
    loadDimensionMaps(),
    prisma.order.groupBy({
      by: ["brandId"],
      where: completedWhere,
      _avg: AVG_ALL_STAGES,
      _count: { _all: true },
    }),
    prisma.order.count({ where }),
  ]);

  const brandRows = byBrandGroups.map((g) => ({
    brand: dims.brands.get(g.brandId)?.name ?? "Unknown",
    orders: g._count._all,
    cycle: num(g._avg.durReceivedToDelivered),
    stages: STAGE_FIELDS.map((field) => ({ label: STAGE_LABELS[field], avg: g._avg[field] !== null ? num(g._avg[field]) : null })),
  }));

  const rankedByCycle = sortDesc(
    brandRows.filter((b) => b.cycle > 0),
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
    kpis: [
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
    ],
    charts: [
      {
        id: "best-receiving-to-dispatched",
        title: "Best Receiving → Dispatched",
        type: "hbar",
        labels: bestDispatch.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: bestDispatch.map((b) => dispatchValue(b) ?? 0) }],
      },
      {
        id: "worst-receiving-to-dispatched",
        title: "Worst Receiving → Dispatched",
        type: "hbar",
        labels: worstDispatch.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: worstDispatch.map((b) => dispatchValue(b) ?? 0) }],
      },
      {
        id: "cycle-time-by-brand",
        title: "Full Cycle Time by Brand",
        type: "bar",
        labels: brandRows.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: brandRows.map((b) => b.cycle) }],
      },
    ],
    table: {
      title: "Brand-Level Prep Stage Breakdown",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "orders", label: "Orders", align: "right" },
        ...STAGE_FIELDS.map((field) => ({ key: STAGE_LABELS[field], label: STAGE_LABELS[field], align: "right" as const })),
        { key: "cycle", label: "Received → Delivered", align: "right" as const },
      ],
      rows: brandRows.map((b) => ({
        brand: b.brand,
        orders: fmtNumber(b.orders),
        ...Object.fromEntries(b.stages.map((s) => [s.label, fmtMinutes(s.avg)])),
        cycle: fmtMinutes(b.cycle),
      })),
    },
    scope: { orderCount: scopeCount },
  };
}
