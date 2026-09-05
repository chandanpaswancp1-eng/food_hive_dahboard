import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { parseWorkbook } from "@/lib/excel";
import { ingestRawOrders } from "@/lib/grubtech/ingest";
import { ingestLocationPerformanceAverages } from "@/lib/grubtech/ingestLocationPerformance";
import { dbErrorResponse, isDbConnectionError } from "@/lib/apiError";
import { invalidateDimensionCache } from "@/lib/grubtech/kpis/shared";
import { invalidateTabCache } from "@/lib/grubtech/kpis";
import { prisma } from "@/lib/db";
import type { ReportTypeHint } from "@/lib/types";

export const runtime = "nodejs";

type ReportType = "order-details" | "cancelled-orders" | "location-performance-averages" | "unknown";

function sniffReportType(filename: string, headers: string[]): ReportType {
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
 * Each tab's Import control now sends a hint for the file type it expects
 * (order-details/cancelled-orders) instead of relying purely on filename/
 * header sniffing. Still cross-checked against the sniffed type — if
 * someone uploads an order-details file to the Cancellations tab's button,
 * that's a real mismatch worth rejecting rather than silently mislabeling
 * every row's status.
 */
function resolveReportType(
  filename: string,
  headers: string[],
  hint?: ReportTypeHint,
): { type: ReportType; mismatch: boolean } {
  const sniffed = sniffReportType(filename, headers);
  if (!hint) return { type: sniffed, mismatch: false };
  if (sniffed !== "unknown" && sniffed !== hint) {
    return { type: sniffed, mismatch: true };
  }
  return { type: hint, mismatch: false };
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
 * /api/jobs/[id] instead, the same fire-and-forget pattern
 * lib/grubtech/liveApi/runLiveSync.ts uses for GrubCenter syncs.
 */
async function runImportInBackground(
  jobId: string,
  rows: Record<string, string>[],
  locationPerfRows: Record<string, string>[],
  preIssues: string[],
) {
  try {
    const [result, locationPerfResult] = await Promise.all([
      rows.length ? ingestRawOrders(rows) : Promise.resolve({ ingested: 0, issues: [] as string[] }),
      locationPerfRows.length
        ? ingestLocationPerformanceAverages(locationPerfRows)
        : Promise.resolve({ ingested: 0, issues: [] as string[] }),
    ]);
    invalidateDimensionCache();
    invalidateTabCache();
    const issues = [...preIssues, ...result.issues, ...locationPerfResult.issues];
    await prisma.syncLog.update({
      where: { id: jobId },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested: result.ingested + locationPerfResult.ingested,
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

const VALID_HINTS: ReportTypeHint[] = ["order-details", "cancelled-orders"];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const hintRaw = form.get("reportTypeHint");
  const hint = VALID_HINTS.includes(hintRaw as ReportTypeHint) ? (hintRaw as ReportTypeHint) : undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const isExcel = /\.xlsx?$/i.test(file.name);

  try {
    const rowsToIngest: Record<string, string>[] = [];
    const locationPerfRows: Record<string, string>[] = [];
    const detected: { sheetName: string; reportType: ReportType; headers: string[] }[] = [];
    const preIssues: string[] = [];

    let sheets: { sheetName: string; headers: string[]; rows: Record<string, string>[] }[];
    if (isExcel) {
      sheets = await parseWorkbook(Buffer.from(await file.arrayBuffer()), process.env.EXCEL_IMPORT_PASSWORD);
    } else {
      const rows = parseCsv(await file.text());
      sheets = [{ sheetName: file.name, headers: Object.keys(rows[0] ?? {}), rows }];
    }

    for (const sheet of sheets) {
      if (!sheet.rows.length) continue;
      const { type: reportType, mismatch } = resolveReportType(file.name, sheet.headers, hint);
      detected.push({ sheetName: sheet.sheetName, reportType, headers: sheet.headers });

      if (mismatch) {
        preIssues.push(
          `Sheet "${sheet.sheetName}": expected a ${hint} file for this tab, but this looks like a ${reportType} file — skipped ${sheet.rows.length} rows. Upload the matching file type for this tab.`,
        );
        continue;
      }

      if (reportType === "location-performance-averages") {
        locationPerfRows.push(...sheet.rows);
        continue;
      }

      const rows =
        reportType === "cancelled-orders"
          ? withDefaultStatus(sheet.rows, "Cancelled")
          : withDefaultStatus(sheet.rows, "Completed");
      rowsToIngest.push(...rows);
    }

    const job = await prisma.syncLog.create({ data: { status: "RUNNING", source: "import" } });
    runImportInBackground(job.id, rowsToIngest, locationPerfRows, preIssues).catch((err) => {
      console.error("Background import failed:", err);
    });

    return NextResponse.json({
      status: "started",
      jobId: job.id,
      rowCount: rowsToIngest.length + locationPerfRows.length,
      detected,
      issues: preIssues,
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
