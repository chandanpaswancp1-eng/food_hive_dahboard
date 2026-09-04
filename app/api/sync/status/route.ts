import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { SyncStatusPayload } from "@/lib/types";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

export async function GET() {
  try {
    // Scoped to source:"import" specifically — a GrubCenter live-sync attempt
    // (source defaults to "grubcenter", written by the not-yet-functional
    // scraper/sync.ts) shouldn't show as a broken "unreachable" state on top
    // of otherwise-healthy imported data. This pill reflects your imports.
    const last = await prisma.syncLog.findFirst({
      where: { source: "import" },
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
