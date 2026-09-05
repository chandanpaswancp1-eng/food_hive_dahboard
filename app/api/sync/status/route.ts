import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { SyncStatusPayload } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

// 2x the 10-minute sync cadence — matches the generosity already used by
// runLiveSync's own watermark-overlap logic. A single missed/slow tick
// shouldn't flip the indicator to "stale".
const LIVE_HEALTHY_MINUTES = 20;

export async function GET() {
  try {
    // Scoped to "import" and "grubcenter-live" — real data sources. Deliberately
    // excludes the legacy default source "grubcenter", written by the old,
    // never-functional Playwright scraper, so a stale/broken row from that
    // path can never again surface as a confusing "unreachable" state on top
    // of otherwise-healthy data.
    //
    // Queried separately from the live-source-specific row below because a
    // manual CSV import can be the most recent event overall while the
    // automated agent has silently stopped running — without checking the
    // live source on its own, that regression would be invisible.
    const [last, liveLast] = await Promise.all([
      prisma.syncLog.findFirst({
        where: { source: { in: ["import", "grubcenter-live"] } },
        orderBy: { startedAt: "desc" },
      }),
      prisma.syncLog.findFirst({
        where: { source: "grubcenter-live" },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    if (!last) {
      const payload: SyncStatusPayload = {
        mode: "none",
        source: null,
        lastSyncedAt: null,
        minutesSinceSync: null,
        healthy: null,
        message: "No data imported yet",
      };
      return NextResponse.json(payload);
    }

    const minutesSinceSync = liveLast?.finishedAt
      ? Math.round((Date.now() - liveLast.finishedAt.getTime()) / 60_000)
      : null;
    const liveHealthy =
      liveLast?.status === "SUCCESS" && minutesSinceSync !== null && minutesSinceSync <= LIVE_HEALTHY_MINUTES;

    const source: SyncStatusPayload["source"] = last.source === "grubcenter-live" ? "grubcenter-live" : "import";

    let payload: SyncStatusPayload;
    if (last.status === "RUNNING") {
      payload = {
        mode: "local",
        source,
        lastSyncedAt: last.startedAt.toISOString(),
        minutesSinceSync,
        healthy: source === "grubcenter-live" ? liveHealthy : true,
        message: "Importing…",
      };
    } else if (last.status === "ERROR") {
      payload = {
        mode: "error",
        source,
        lastSyncedAt: last.finishedAt?.toISOString() ?? null,
        minutesSinceSync,
        healthy: false,
        message: last.errorMessage ?? "Import failed",
      };
    } else {
      // Surface a stale live agent even when the most recent event overall
      // was a healthy manual import — otherwise a broken automated sync
      // could hide behind a one-off upload indefinitely.
      const staleSuffix =
        liveLast && !liveHealthy ? ` · live sync stale (last success ${minutesSinceSync}m ago)` : "";
      payload = {
        mode: "live",
        source,
        lastSyncedAt: last.finishedAt?.toISOString() ?? null,
        minutesSinceSync,
        healthy: source === "grubcenter-live" ? liveHealthy : true,
        message: `${last.recordsIngested} orders imported${staleSuffix}`,
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
