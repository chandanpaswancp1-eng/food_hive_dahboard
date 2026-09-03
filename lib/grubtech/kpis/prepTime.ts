import type { TabPayload } from "@/lib/types";
import { fmtMinutes, fmtNumber } from "@/lib/format";
import { num, sortDesc, type LoadedOrder } from "./shared";

const STAGES = [
  ["durAccToStarted", "Acc → Started"],
  ["durStartedToPrep", "Started → Prepared"],
  ["durPrepToSTD", "Prepared → STD"],
  ["durSTDToDispatched", "STD → Dispatched"],
  ["durReceivingToDispatched", "Receiving → Dispatched"],
  ["durReceivedToDelivered", "Received → Delivered"],
] as const;

function avgOf(orders: LoadedOrder[], key: (typeof STAGES)[number][0]): number | null {
  const values = orders.map((o) => num(o[key])).filter((v) => v > 0);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildPrepTimeTab(orders: LoadedOrder[]): TabPayload {
  const completed = orders.filter((o) => o.status === "COMPLETED");

  const stageAverages = STAGES.map(([key, label]) => ({ key, label, avg: avgOf(completed, key) }));

  const byBrand = new Map<string, LoadedOrder[]>();
  for (const o of completed) {
    const arr = byBrand.get(o.brand.name) ?? [];
    arr.push(o);
    byBrand.set(o.brand.name, arr);
  }

  const brandCycle = [...byBrand.entries()].map(([brand, brandOrders]) => ({
    brand,
    orders: brandOrders.length,
    cycle: avgOf(brandOrders, "durReceivedToDelivered") ?? 0,
    stages: STAGES.map(([key, label]) => ({ label, avg: avgOf(brandOrders, key) })),
  }));

  const rankedByCycle = sortDesc(brandCycle, (b) => -b.cycle); // fastest first (lowest cycle)
  const fastest = rankedByCycle[0];
  const slowest = rankedByCycle[rankedByCycle.length - 1];

  const rankedByDispatch = sortDesc(brandCycle, (b) =>
    b.stages.find((s) => s.label === "Receiving → Dispatched")?.avg ?? 0,
  );

  return {
    kpis: [
      ...stageAverages.map((s) => ({ key: s.key, label: s.label, value: fmtMinutes(s.avg) })),
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
        id: "receiving-to-dispatched-by-brand",
        title: "Receiving → Dispatched by Brand (slowest first)",
        type: "hbar",
        labels: rankedByDispatch.map((b) => b.brand),
        datasets: [
          {
            label: "Minutes",
            data: rankedByDispatch.map((b) => b.stages.find((s) => s.label === "Receiving → Dispatched")?.avg ?? 0),
          },
        ],
      },
      {
        id: "cycle-time-by-brand",
        title: "Full Cycle Time by Brand",
        type: "bar",
        labels: brandCycle.map((b) => b.brand),
        datasets: [{ label: "Minutes", data: brandCycle.map((b) => b.cycle) }],
      },
    ],
    table: {
      title: "Brand-Level Prep Stage Breakdown",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "orders", label: "Orders", align: "right" },
        ...STAGES.map(([, label]) => ({ key: label, label, align: "right" as const })),
        { key: "cycle", label: "Received → Delivered", align: "right" as const },
      ],
      rows: brandCycle.map((b) => ({
        brand: b.brand,
        orders: fmtNumber(b.orders),
        ...Object.fromEntries(b.stages.map((s) => [s.label, fmtMinutes(s.avg)])),
        cycle: fmtMinutes(b.cycle),
      })),
    },
    scope: { orderCount: orders.length },
  };
}
