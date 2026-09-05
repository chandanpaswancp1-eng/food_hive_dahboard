import { NextResponse } from "next/server";
import { runLiveSync } from "@/lib/grubtech/liveApi/runLiveSync";

export const runtime = "nodejs";

export async function POST() {
  // Fire-and-forget: the client polls /api/sync/status for progress/result.
  // Mainly useful for manually triggering a sync outside the scheduler's
  // own 10-minute cadence (e.g. testing).
  runLiveSync().catch((err) => {
    console.error("Grubcenter live sync failed:", err);
  });
  return NextResponse.json({ status: "started" });
}
