import { NextResponse } from "next/server";
import { runGrubcenterSync } from "@/scraper/sync";

export const runtime = "nodejs";

export async function POST() {
  // Fire-and-forget: the client polls /api/sync/status for progress/result.
  runGrubcenterSync().catch((err) => {
    console.error("Grubcenter sync failed:", err);
  });
  return NextResponse.json({ status: "started" });
}
