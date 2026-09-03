import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { SyncStatusPayload } from "@/lib/types";

export async function GET() {
  const last = await prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } });

  let payload: SyncStatusPayload;
  if (!last) {
    payload = { mode: "none", lastSyncedAt: null, message: "No sync has run yet" };
  } else if (last.status === "RUNNING") {
    payload = { mode: "local", lastSyncedAt: last.startedAt.toISOString(), message: "Syncing…" };
  } else if (last.status === "ERROR") {
    payload = {
      mode: "error",
      lastSyncedAt: last.finishedAt?.toISOString() ?? null,
      message: last.errorMessage ?? "Grubcenter unreachable",
    };
  } else {
    payload = {
      mode: "live",
      lastSyncedAt: last.finishedAt?.toISOString() ?? null,
      message: `${last.recordsIngested} orders ingested`,
    };
  }

  return NextResponse.json(payload);
}
