import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";
import type { JobStatusPayload } from "@/lib/types";

/**
 * Polls a specific background job (import or sync) by SyncLog id — kept
 * separate from /api/sync/status, which reports the *latest* sync for the
 * header's "Grubtech · live" pill and shouldn't be conflated with an
 * in-flight import the client is specifically waiting on.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const job = await prisma.syncLog.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const payload: JobStatusPayload = {
      status: job.status,
      recordsIngested: job.recordsIngested,
      errorMessage: job.errorMessage,
    };
    return NextResponse.json(payload);
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    throw error;
  }
}
