import { prisma } from "@/lib/db";
import { fetchLiveOrders } from "./fetchOrders";
import { ingestRawOrders } from "@/lib/grubtech/ingest";
import { invalidateDimensionCache } from "@/lib/grubtech/kpis/shared";
import { invalidateTabCache } from "@/lib/grubtech/kpis";

// Distinct from "import" (manual Excel uploads) and the legacy default
// "grubcenter" (the old, never-working Playwright scraper) — app/api/sync/status
// intentionally only surfaces "import" and this source, never the legacy one.
const SOURCE = "grubcenter-live";

// A 3x overlap over the 10-minute tick cadence: one missed/slow/errored tick
// doesn't permanently lose an order's window, since ingestion upserts by
// externalId and safely re-writes the same/updated row.
const LOOKBACK_MINUTES = 30;

// A RUNNING row older than this is assumed to be from a crashed process,
// not a genuinely in-flight sync — proceed rather than deadlock forever.
const STALE_RUNNING_MINUTES = 15;

export async function runLiveSync(): Promise<{ recordsIngested: number; issues: string[] }> {
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000);
  const runningLock = await prisma.syncLog.findFirst({
    where: { source: SOURCE, status: "RUNNING", startedAt: { gt: staleThreshold } },
  });
  if (runningLock) {
    return { recordsIngested: 0, issues: ["Skipped — a live sync is already running"] };
  }

  const job = await prisma.syncLog.create({ data: { source: SOURCE, status: "RUNNING" } });

  try {
    const to = new Date();
    const from = new Date(to.getTime() - LOOKBACK_MINUTES * 60_000);
    const rawOrders = await fetchLiveOrders(from, to);
    const result = await ingestRawOrders(rawOrders);

    invalidateDimensionCache();
    invalidateTabCache();

    await prisma.syncLog.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested: result.ingested,
        errorMessage: result.issues.length ? result.issues.slice(0, 20).join(" | ") : null,
      },
    });

    return { recordsIngested: result.ingested, issues: result.issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: job.id },
      data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
    });
    throw error;
  }
}
