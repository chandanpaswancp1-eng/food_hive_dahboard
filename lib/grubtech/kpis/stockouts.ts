import type { TabPayload } from "@/lib/types";
import { fmtNumber, fmtPercent, safeDiv } from "@/lib/format";
import { dateKey, sortDesc, type LoadedStockout } from "./shared";

export function buildStockoutsTab(events: LoadedStockout[], orderCount: number): TabPayload {
  const total = events.length;
  const per1k = safeDiv(total, orderCount) * 1000;

  const byBrand = new Map<string, number>();
  const byLocation = new Map<string, number>();
  const byItem = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byDate = new Map<string, number>();

  for (const e of events) {
    const brand = e.brand?.name ?? "Unassigned";
    const location = e.location?.name ?? "Unassigned";
    byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
    byLocation.set(location, (byLocation.get(location) ?? 0) + 1);
    byItem.set(e.itemName, (byItem.get(e.itemName) ?? 0) + 1);
    bySource.set(e.source ?? "Unknown", (bySource.get(e.source ?? "Unknown") ?? 0) + 1);
    const key = dateKey(e.markedUnavailableAt);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  const brandRows = sortDesc([...byBrand.entries()], ([, v]) => v);
  const locationRows = sortDesc([...byLocation.entries()], ([, v]) => v);
  const itemRows = sortDesc([...byItem.entries()], ([, v]) => v).slice(0, 15);
  const dateRows = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  return {
    kpis: [
      { key: "totalStockouts", label: "86 Items", value: fmtNumber(total), accent: true },
      { key: "per1k", label: "Per 1K Orders", value: per1k.toFixed(1) },
      { key: "topBrand", label: "Brand with Most 86s", value: brandRows[0]?.[0] ?? "—" },
      { key: "topLocation", label: "Location with Most 86s", value: locationRows[0]?.[0] ?? "—" },
    ],
    charts: [
      {
        id: "stockouts-trend",
        title: "86 Items Trend",
        type: "line",
        labels: dateRows.map(([d]) => d),
        datasets: [{ label: "86 Events", data: dateRows.map(([, v]) => v), kind: "line" }],
      },
      {
        id: "stockouts-by-brand",
        title: "86 Items by Brand",
        type: "bar",
        labels: brandRows.map(([name]) => name),
        datasets: [{ label: "86 Events", data: brandRows.map(([, v]) => v) }],
      },
      {
        id: "stockouts-by-source",
        title: "Distribution by Source",
        type: "doughnut",
        labels: [...bySource.keys()],
        datasets: [{ label: "Events", data: [...bySource.values()] }],
      },
    ],
    table: {
      title: "Most 86'd Items",
      columns: [
        { key: "item", label: "Item" },
        { key: "count", label: "Count", align: "right" },
        { key: "share", label: "Share of 86s", align: "right" },
      ],
      rows: itemRows.map(([item, count]) => ({
        item,
        count: fmtNumber(count),
        share: fmtPercent(safeDiv(count, total) * 100),
      })),
    },
    scope: { orderCount },
  };
}
