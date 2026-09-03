import type { TabPayload } from "@/lib/types";
import { fmtMinutes, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, type LoadedOrder } from "./shared";

export function buildDelayedTab(orders: LoadedOrder[]): TabPayload {
  const completed = orders.filter((o) => o.status === "COMPLETED");
  const delayed = completed.filter((o) => o.isDelayed);
  const delayRate = safeDiv(delayed.length, completed.length) * 100;
  const avgPrep = safeDiv(
    completed.reduce((sum, o) => sum + num(o.actualPrepTime), 0),
    completed.length,
  );
  const onTimeCompliance = 100 - delayRate;

  const byBrandLocation = new Map<
    string,
    { brand: string; location: string; total: number; delayed: number; prepSum: number; delaySum: number }
  >();
  for (const o of completed) {
    const key = `${o.brand.name}__${o.location.name}`;
    const entry =
      byBrandLocation.get(key) ??
      { brand: o.brand.name, location: o.location.name, total: 0, delayed: 0, prepSum: 0, delaySum: 0 };
    entry.total += 1;
    if (o.isDelayed) entry.delayed += 1;
    entry.prepSum += num(o.actualPrepTime);
    entry.delaySum += num(o.delayMinutes);
    byBrandLocation.set(key, entry);
  }

  const rows = sortDesc([...byBrandLocation.values()], (v) => safeDiv(v.delayed, v.total)).slice(0, 15);

  const byBrand = new Map<string, { total: number; delayed: number }>();
  for (const o of completed) {
    const entry = byBrand.get(o.brand.name) ?? { total: 0, delayed: 0 };
    entry.total += 1;
    if (o.isDelayed) entry.delayed += 1;
    byBrand.set(o.brand.name, entry);
  }
  const brandRows = [...byBrand.entries()];
  const worstBrand = sortDesc(brandRows, ([, v]) => safeDiv(v.delayed, v.total))[0]?.[0] ?? "—";

  const statusFlag = (rate: number) => (rate > 20 ? "Critical" : rate > 12 ? "Warning" : rate > 6 ? "Watch" : "Healthy");

  return {
    kpis: [
      { key: "totalOrders", label: "Total Orders", value: fmtNumber(completed.length) },
      { key: "delayedOrders", label: "Delayed Orders (>10m)", value: fmtNumber(delayed.length), subtitle: fmtPercent(delayRate), accent: true },
      { key: "delayRate", label: "> 10 Minutes %", value: fmtPercent(delayRate) },
      { key: "avgPrep", label: "Avg Prep Time", value: fmtMinutes(avgPrep) },
      { key: "onTime", label: "On-Time Compliance", value: fmtPercent(onTimeCompliance) },
      { key: "worstBrand", label: "Worst Brand", value: worstBrand },
    ],
    charts: [
      {
        id: "completed-vs-delayed-by-brand",
        title: "Completed vs Delayed (>10min) by Brand",
        type: "bar",
        labels: brandRows.map(([brand]) => brand),
        datasets: [
          { label: "Completed", data: brandRows.map(([, v]) => v.total - v.delayed), kind: "bar" },
          { label: "Delayed", data: brandRows.map(([, v]) => v.delayed), kind: "bar" },
        ],
      },
    ],
    table: {
      title: "Brand & Branch Delay Severity",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "location", label: "Branch" },
        { key: "total", label: "Total Orders", align: "right" },
        { key: "delayed", label: "Delayed", align: "right" },
        { key: "delayRate", label: "Delay Rate", align: "right" },
        { key: "avgPrep", label: "Avg Prep Time", align: "right" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map((r) => {
        const rate = safeDiv(r.delayed, r.total) * 100;
        return {
          brand: r.brand,
          location: r.location,
          total: fmtNumber(r.total),
          delayed: fmtNumber(r.delayed),
          delayRate: fmtPercent(rate),
          avgPrep: fmtMinutes(safeDiv(r.prepSum, r.total)),
          status: statusFlag(rate),
        };
      }),
    },
    scope: { orderCount: orders.length },
  };
}
