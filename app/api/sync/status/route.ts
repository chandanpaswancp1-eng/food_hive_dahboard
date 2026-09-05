import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { SyncStatusPayload } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET() {
  try {
    // Scoped to "import" and "grubcenter-live" — real data sources. Deliberately
    // excludes the legacy default source "grubcenter", written by the old,
    // never-functional Playwright scraper, so a stale/broken row from that
    // path can never again surface as a confusing "unreachable" state on top
    // of otherwise-healthy data.
    const last = await prisma.syncLog.findFirst({
      where: { source: { in: ["import", "grubcenter-live"] } },
      orderBy: { startedAt: "desc" },
    });

    let payload: SyncStatusPayload;
    if (!last) {
      payload = { mode: "none", lastSyncedAt: null, message: "No data imported yet" };
    } else if (last.status === "RUNNING") {
      payload = { mode: "local", lastSyncedAt: last.startedAt.toISOString(), message: "Importing…" };
    } else if (last.status === "ERROR") {
      payload = {
        mode: "error",
        lastSyncedAt: last.finishedAt?.toISOString() ?? null,
        message: last.errorMessage ?? "Import failed",
      };
    } else {
      payload = {
        mode: "live",
        lastSyncedAt: last.finishedAt?.toISOString() ?? null,
        message: `${last.recordsIngested} orders imported`,
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
