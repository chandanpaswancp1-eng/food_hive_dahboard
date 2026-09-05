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

// Extra safety margin subtracted from the last successful run's window when
// resuming from a watermark — covers clock skew and any last-moment orders
// GrubCenter hadn't finished writing yet when that run completed.
const WATERMARK_OVERLAP_MINUTES = 5;

// Caps how far back a resumed sync will reach after a long gap (server down,
// crashed, laptop asleep) so one catch-up tick can't try to page through
// months of history. Orders older than this that were never ingested stay
// missing — a real historical backfill should use the CSV import instead.
const MAX_BACKFILL_HOURS = 48;

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
    const rollingFrom = new Date(to.getTime() - LOOKBACK_MINUTES * 60_000);

    // Resume from where the last successful run left off (minus overlap)
    // rather than always using a fixed rolling lookback — otherwise any gap
    // in server uptime longer than LOOKBACK_MINUTES (a restart, a crash, the
    // dev server being stopped) permanently drops orders that arrived during
    // the gap, since no later tick's window would ever reach back far enough
    // to fetch them again.
    const lastSuccess = await prisma.syncLog.findFirst({
      where: { source: SOURCE, status: "SUCCESS", windowTo: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { windowTo: true },
    });
    const minFrom = new Date(to.getTime() - MAX_BACKFILL_HOURS * 60 * 60_000);
    const watermarkFrom = lastSuccess?.windowTo
      ? new Date(lastSuccess.windowTo.getTime() - WATERMARK_OVERLAP_MINUTES * 60_000)
      : null;
    const from =
      watermarkFrom && watermarkFrom < rollingFrom
        ? new Date(Math.max(watermarkFrom.getTime(), minFrom.getTime()))
        : rollingFrom;

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
        windowTo: to,
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
