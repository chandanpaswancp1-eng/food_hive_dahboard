import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { parseWorkbook } from "@/lib/excel";
import { ingestRawOrders } from "@/lib/grubtech/ingest";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";
import { invalidateDimensionCache } from "@/lib/grubtech/kpis/shared";
import { invalidateTabCache } from "@/lib/grubtech/kpis";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type ReportType = "order-details" | "cancelled-orders" | "location-performance-averages" | "unknown";

function detectReportType(filename: string, headers: string[]): ReportType {
  const name = filename.toLowerCase();
  if (name.startsWith("order-details")) return "order-details";
  if (name.startsWith("cancelled-orders")) return "cancelled-orders";
  if (name.startsWith("location-performance-averages")) return "location-performance-averages";

  const has = (h: string) => headers.includes(h);
  if (has("Post Cancelled") || has("Cancellation Time")) return "cancelled-orders";
  if (has("Unique Order ID") || has("Order ID")) return "order-details";
  return "unknown";
}

/**
 * These exports don't carry an explicit order-status column — the file
 * itself tells you the status (an order-details export is completed orders,
 * a cancelled-orders export is, by definition, cancelled). Inject a default
 * only when the row doesn't already say otherwise.
 */
function withDefaultStatus(rows: Record<string, string>[], status: "Completed" | "Cancelled") {
  return rows.map((row) => (row["Order Status"] ? row : { ...row, "Order Status": status }));
}

/**
 * Ingestion itself is the slow part (DB-latency-bound, can run minutes for a
 * large file) — running it inline blocked the HTTP request until it finished,
 * which is exactly what got killed by a platform proxy timeout on a real
 * 40MB import. Runs detached (not awaited by the caller); the client polls
 * /api/jobs/[id] instead, the same fire-and-forget + poll pattern
 * scraper/sync.ts already uses for GrubCenter syncs.
 */
async function runImportInBackground(jobId: string, rows: Record<string, string>[], preIssues: string[]) {
  try {
    const result = await ingestRawOrders(rows);
    invalidateDimensionCache();
    invalidateTabCache();
    const issues = [...preIssues, ...result.issues];
    await prisma.syncLog.update({
      where: { id: jobId },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested: result.ingested,
        errorMessage: issues.length ? issues.slice(0, 20).join(" | ") : null,
      },
    });
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: jobId },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message.split("\n").pop() : String(error),
      },
    });
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const isExcel = /\.xlsx?$/i.test(file.name);

  try {
    let rowsToIngest: Record<string, string>[];
    const detected: { sheetName: string; reportType: ReportType; headers: string[] }[] = [];
    const preIssues: string[] = [];

    if (!isExcel) {
      const text = await file.text();
      rowsToIngest = parseCsv(text);
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      const sheets = await parseWorkbook(buffer, process.env.EXCEL_IMPORT_PASSWORD);

      rowsToIngest = [];
      for (const sheet of sheets) {
        if (!sheet.rows.length) continue;
        const reportType = detectReportType(file.name, sheet.headers);
        detected.push({ sheetName: sheet.sheetName, reportType, headers: sheet.headers });

        if (reportType === "location-performance-averages") {
          preIssues.push(
            `Sheet "${sheet.sheetName}": location-performance-averages import isn't supported yet (unknown real shape) — skipped ${sheet.rows.length} rows.`,
          );
          continue;
        }

        const rows =
          reportType === "cancelled-orders"
            ? withDefaultStatus(sheet.rows, "Cancelled")
            : withDefaultStatus(sheet.rows, "Completed");
        rowsToIngest.push(...rows);
      }
    }

    const job = await prisma.syncLog.create({ data: { status: "RUNNING", source: "import" } });
    runImportInBackground(job.id, rowsToIngest, preIssues).catch((err) => {
      console.error("Background import failed:", err);
    });

    return NextResponse.json({
      status: "started",
      jobId: job.id,
      rowCount: rowsToIngest.length,
      detected,
    });
  } catch (error) {
    if (isDbConnectionError(error)) return dbErrorResponse(error);
    if (
      error instanceof Error &&
      (error.message.includes("password-protected") || error.message.includes("password is incorrect"))
    ) {
      // officecrypto-tool throws "The password is incorrect" for a wrong (not missing) password —
      // e.g. GrubCenter can issue a different password per export, not always EXCEL_IMPORT_PASSWORD's value.
      const message = error.message.includes("password is incorrect")
        ? `${file.name}'s password doesn't match EXCEL_IMPORT_PASSWORD. This file may use a different password than usual — check Railway/​.env.local and update it if needed.`
        : error.message;
      return NextResponse.json({ error: "encrypted_file", message }, { status: 422 });
    }
    throw error;
  }
}
