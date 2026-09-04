import { prisma } from "@/lib/db";

const STAGE_COLUMNS = {
  durAccToStarted: "Accepted to Started",
  durStartedToPrep: "Started To Prepared",
  durPrepToSTD: "Prepared to Sent to Dispatch",
  durSTDToDispatched: "Sent To Dispatch to Dispatched",
  durDispatchedToDelivered: "Dispatched to Delivered",
  durReceivedToDelivered: "Received to Delivered",
} as const;

/** GrubCenter formats these as "H:MM:SS" (or blank when no data for that stage). */
function parseHms(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [h, m, s] = parts;
  return Math.round((h * 60 + m + s / 60) * 100) / 100;
}

export interface LocationPerformanceIngestResult {
  ingested: number;
  skipped: number;
  issues: string[];
}

export async function ingestLocationPerformanceAverages(
  rows: Record<string, string>[],
): Promise<LocationPerformanceIngestResult> {
  let ingested = 0;
  const issues: string[] = [];

  for (const row of rows) {
    const brandName = row["Brand"]?.trim();
    const locationName = row["Location"]?.trim();
    if (!brandName || !locationName) {
      issues.push(`Location performance row missing Brand/Location — skipped.`);
      continue;
    }

    try {
      const [brand, location] = await Promise.all([
        prisma.brand.upsert({ where: { name: brandName }, update: {}, create: { name: brandName } }),
        prisma.location.upsert({ where: { name: locationName }, update: {}, create: { name: locationName } }),
      ]);

      const durations = Object.fromEntries(
        Object.entries(STAGE_COLUMNS).map(([field, column]) => [field, parseHms(row[column])]),
      );

      await prisma.locationPerformanceAverage.upsert({
        where: { brandId_locationId: { brandId: brand.id, locationId: location.id } },
        update: durations,
        create: { brandId: brand.id, locationId: location.id, ...durations },
      });
      ingested += 1;
    } catch (error) {
      issues.push(error instanceof Error ? error.message.split("\n").pop()! : String(error));
    }
  }

  return { ingested, skipped: rows.length - ingested, issues };
}
