import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { TabPayload } from "@/lib/types";
import { fmtNumber, fmtNumberCompact, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc } from "./shared";

export async function buildRatingsTab(where: Prisma.OrderWhereInput): Promise<TabPayload> {
  const ratingWhere: Prisma.RatingWhereInput = { order: where };

  const [totalAgg, distribution, ratingRows, scopeCount] = await Promise.all([
    prisma.rating.aggregate({ where: ratingWhere, _count: { _all: true }, _avg: { value: true } }),
    prisma.rating.groupBy({ by: ["value"], where: ratingWhere, _count: { _all: true } }),
    // Ratings are a small subset of orders (only rated ones) — a narrow
    // select (not the full order) keeps this cheap even as volume grows.
    prisma.rating.findMany({
      where: ratingWhere,
      select: {
        value: true,
        order: {
          select: {
            brand: { select: { name: true, cuisine: true } },
            location: { select: { name: true } },
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const total = totalAgg._count._all;
  const avgRating = num(totalAgg._avg.value);
  const positive = distribution.filter((d) => d.value >= 4).reduce((sum, d) => sum + d._count._all, 0);
  const negative = distribution.filter((d) => d.value <= 2).reduce((sum, d) => sum + d._count._all, 0);
  const polarity = safeDiv(positive - negative, total) * 100;

  const distMap = new Map(distribution.map((d) => [d.value, d._count._all]));
  const distArr = [5, 4, 3, 2, 1].map((v) => distMap.get(v) ?? 0);

  const byLocation = new Map<string, { sum: number; count: number }>();
  const byBrand = new Map<string, { sum: number; count: number }>();
  const byCuisine = new Map<string, { sum: number; count: number }>();
  for (const r of ratingRows) {
    const loc = r.order.location.name;
    const brand = r.order.brand.name;
    const cuisine = r.order.brand.cuisine ?? "—";
    const locEntry = byLocation.get(loc) ?? { sum: 0, count: 0 };
    locEntry.sum += r.value;
    locEntry.count += 1;
    byLocation.set(loc, locEntry);
    const brandEntry = byBrand.get(brand) ?? { sum: 0, count: 0 };
    brandEntry.sum += r.value;
    brandEntry.count += 1;
    byBrand.set(brand, brandEntry);
    const cuisineEntry = byCuisine.get(cuisine) ?? { sum: 0, count: 0 };
    cuisineEntry.sum += r.value;
    cuisineEntry.count += 1;
    byCuisine.set(cuisine, cuisineEntry);
  }

  const locationRows = sortDesc(
    [...byLocation.entries()].map(([location, v]) => ({ location, avg: safeDiv(v.sum, v.count), count: v.count })),
    (v) => v.avg,
  );
  const brandRows = sortDesc(
    [...byBrand.entries()].map(([brand, v]) => ({ brand, avg: safeDiv(v.sum, v.count), count: v.count })),
    (v) => v.avg,
  );
  const cuisineRows = sortDesc(
    [...byCuisine.entries()].map(([cuisine, v]) => ({ cuisine, avg: safeDiv(v.sum, v.count) })),
    (v) => v.avg,
  );
  const bestBrands = brandRows.slice(0, 5);
  const worstBrands = [...brandRows].reverse().slice(0, 5);

  return {
    kpis: [
      { key: "totalRatings", label: "Total Ratings", value: fmtNumberCompact(total) },
      { key: "avgRating", label: "Average Rating", value: avgRating.toFixed(2) },
      { key: "positive", label: "Positive Ratings", value: fmtNumberCompact(positive), subtitle: fmtPercent(safeDiv(positive, total) * 100) },
      { key: "negative", label: "Negative Ratings", value: fmtNumberCompact(negative), subtitle: fmtPercent(safeDiv(negative, total) * 100), accent: true },
      { key: "polarity", label: "Polarity Rate", value: fmtPercent(polarity) },
    ],
    charts: [
      {
        id: "rating-distribution",
        title: "Rating Distribution",
        type: "doughnut",
        labels: ["5★", "4★", "3★", "2★", "1★"],
        datasets: [{ label: "Ratings", data: distArr }],
      },
      {
        id: "ratings-by-cuisine",
        title: "Average Rating by Cuisine Cluster",
        type: "bar",
        dimension: "cuisine",
        labels: cuisineRows.map((c) => c.cuisine),
        datasets: [{ label: "Avg Rating", data: cuisineRows.map((c) => Number(c.avg.toFixed(2))) }],
      },
      {
        id: "ratings-by-location",
        title: "Ratings by Location",
        type: "hbar",
        dimension: "location",
        labels: locationRows.map((l) => l.location),
        datasets: [{ label: "Avg Rating", data: locationRows.map((l) => Number(l.avg.toFixed(2))) }],
      },
      {
        id: "best-brands-by-rating",
        title: "Best Brands by Rating",
        type: "hbar",
        dimension: "brand",
        labels: bestBrands.map((b) => b.brand),
        datasets: [{ label: "Avg Rating", data: bestBrands.map((b) => Number(b.avg.toFixed(2))) }],
      },
      {
        id: "worst-brands-by-rating",
        title: "Worst Brands by Rating",
        type: "hbar",
        dimension: "brand",
        labels: worstBrands.map((b) => b.brand),
        datasets: [{ label: "Avg Rating", data: worstBrands.map((b) => Number(b.avg.toFixed(2))) }],
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
    scope: { orderCount: scopeCount },
  };
}
