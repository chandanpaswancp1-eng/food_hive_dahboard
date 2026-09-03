import type { TabPayload } from "@/lib/types";
import { fmtNumber, fmtPercent, safeDiv } from "@/lib/format";
import { sortDesc, type LoadedOrder } from "./shared";

export function buildRatingsTab(orders: LoadedOrder[]): TabPayload {
  const ratings = orders.flatMap((o) => o.ratings.map((r) => ({ ...r, brand: o.brand.name, location: o.location.name })));
  const total = ratings.length;
  const avgRating = safeDiv(ratings.reduce((sum, r) => sum + r.value, 0), total);
  const positive = ratings.filter((r) => r.value >= 4).length;
  const negative = ratings.filter((r) => r.value <= 2).length;
  const polarity = safeDiv(positive - negative, total) * 100;

  const distribution = [5, 4, 3, 2, 1].map((star) => ratings.filter((r) => r.value === star).length);

  const byLocation = new Map<string, { sum: number; count: number }>();
  for (const r of ratings) {
    const entry = byLocation.get(r.location) ?? { sum: 0, count: 0 };
    entry.sum += r.value;
    entry.count += 1;
    byLocation.set(r.location, entry);
  }
  const locationRows = sortDesc(
    [...byLocation.entries()].map(([location, v]) => ({ location, avg: safeDiv(v.sum, v.count), count: v.count })),
    (v) => v.avg,
  );

  const byBrand = new Map<string, { sum: number; count: number }>();
  for (const r of ratings) {
    const entry = byBrand.get(r.brand) ?? { sum: 0, count: 0 };
    entry.sum += r.value;
    entry.count += 1;
    byBrand.set(r.brand, entry);
  }
  const brandRows = sortDesc(
    [...byBrand.entries()].map(([brand, v]) => ({ brand, avg: safeDiv(v.sum, v.count), count: v.count })),
    (v) => v.avg,
  );

  return {
    kpis: [
      { key: "totalRatings", label: "Total Ratings", value: fmtNumber(total) },
      { key: "avgRating", label: "Average Rating", value: avgRating.toFixed(2) },
      { key: "positive", label: "Positive Ratings", value: fmtNumber(positive), subtitle: fmtPercent(safeDiv(positive, total) * 100) },
      { key: "negative", label: "Negative Ratings", value: fmtNumber(negative), subtitle: fmtPercent(safeDiv(negative, total) * 100), accent: true },
      { key: "polarity", label: "Polarity Rate", value: fmtPercent(polarity) },
    ],
    charts: [
      {
        id: "rating-distribution",
        title: "Rating Distribution",
        type: "doughnut",
        labels: ["5★", "4★", "3★", "2★", "1★"],
        datasets: [{ label: "Ratings", data: distribution }],
      },
      {
        id: "ratings-by-brand",
        title: "Average Rating by Brand",
        type: "hbar",
        labels: brandRows.map((b) => b.brand),
        datasets: [{ label: "Avg Rating", data: brandRows.map((b) => Number(b.avg.toFixed(2))) }],
      },
    ],
    table: {
      title: "Ratings by Location",
      columns: [
        { key: "location", label: "Location" },
        { key: "avg", label: "Avg Rating", align: "right" },
        { key: "count", label: "Reviews", align: "right" },
      ],
      rows: locationRows.map((r) => ({ location: r.location, avg: r.avg.toFixed(2), count: fmtNumber(r.count) })),
    },
    scope: { orderCount: orders.length },
  };
}
