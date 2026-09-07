import { NextResponse } from "next/server";
import { runLiveSync } from "@/lib/grubtech/liveApi/runLiveSync";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";

// Manually triggers the same incremental sync the 10-minute scheduler runs —
// reuses runLiveSync's own RUNNING lock, so a double-click (or a scheduled
// tick firing mid-request) safely no-ops instead of racing.
export async function POST() {
  try {
    const result = await runLiveSync();
    return NextResponse.json(result);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ recordsIngested: 0, issues: [message] }, { status: 500 });
  }
}
