/**
 * Full, non-destructive re-ingest of every order and stockout event from
 * GrubCenter across the full history currently in the DB. No rows are ever
 * deleted — `ingestRawOrders`/`ingestItemAvailabilityEvents` are pure
 * upserts, so this only refreshes existing rows (and adds any genuinely new
 * ones) with the latest normalization logic and field mappings — including
 * backfilling the `taxAmount` column on historical orders, which was only
 * wired into ingestion going forward.
 *
 * Usage:
 *   npm run resync:full             # dry run — fetches + normalizes, reports counts only
 *   npm run resync:full -- --apply  # actually upserts into the DB
 */
import { PrismaClient } from "@prisma/client";
import { fetchLiveOrdersChunked, fetchItemAvailabilityLogChunked } from "../lib/grubtech/liveApi/fetchOrders";
import { ingestRawOrders } from "../lib/grubtech/ingest";
import { ingestItemAvailabilityEvents } from "../lib/grubtech/ingestStockouts";
import { normalizeRawOrder } from "../lib/grubtech/normalize";
import { dubaiDateBoundaryToUtc } from "../lib/grubtech/dubaiTime";
import { invalidateDimensionCache } from "../lib/grubtech/kpis/shared";
import { invalidateTabCache } from "../lib/grubtech/kpis";

const prisma = new PrismaClient();

const SOURCE = "grubcenter-full-resync";
const EARLIEST_DATE = "2026-07-30";
const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "Running in APPLY mode — rows will be upserted.\n" : "Running in DRY-RUN mode — no writes will happen. Pass --apply to write.\n");

  const from = dubaiDateBoundaryToUtc(EARLIEST_DATE, false);
  const to = new Date();
  console.log(`Window: ${from.toISOString()} -> ${to.toISOString()}\n`);

  console.log("Fetching orders and stockout events from GrubCenter...");
  const [rawOrders, rawStockoutEvents] = await Promise.all([
    fetchLiveOrdersChunked(from, to),
    fetchItemAvailabilityLogChunked(from, to),
  ]);
  console.log(`Fetched ${rawOrders.length} raw order rows, ${rawStockoutEvents.length} raw stockout events.\n`);

  let normalizedOk = 0;
  const rejectionSample: string[] = [];
  for (const raw of rawOrders) {
    const result = normalizeRawOrder(raw);
    if (result.ok) {
      normalizedOk++;
    } else if (rejectionSample.length < 10) {
      rejectionSample.push(result.issues.join("; "));
    }
  }
  console.log(`Normalize check: ${normalizedOk} ok / ${rawOrders.length - normalizedOk} rejected.`);
  if (rejectionSample.length) {
    console.log("Sample rejections:");
    console.log(rejectionSample.map((r) => `  - ${r}`).join("\n"));
  }

  if (!apply) {
    console.log("\nDry run only — re-run with --apply to upsert these rows.");
    return;
  }

  const job = await prisma.syncLog.create({ data: { source: SOURCE, status: "RUNNING" } });
  try {
    console.log("\nUpserting orders...");
    const orderResult = await ingestRawOrders(rawOrders);
    console.log(`Orders: ingested ${orderResult.ingested}, skipped ${orderResult.skipped}, issues ${orderResult.issues.length}`);

    console.log("Upserting stockout events...");
    const stockoutResult = await ingestItemAvailabilityEvents(rawStockoutEvents);
    console.log(`Stockouts: ingested ${stockoutResult.ingested}, issues ${stockoutResult.issues.length}`);

    invalidateDimensionCache();
    invalidateTabCache();

    const taxSum = await prisma.order.aggregate({ _sum: { taxAmount: true } });
    console.log(`\nSum of taxAmount across all orders (post-refresh): AED ${Number(taxSum._sum.taxAmount ?? 0).toFixed(2)}`);

    await prisma.syncLog.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested: orderResult.ingested + stockoutResult.ingested,
        windowTo: to,
        errorMessage: [...orderResult.issues, ...stockoutResult.issues].slice(0, 20).join(" | ") || null,
      },
    });
    console.log("\nDone.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({ where: { id: job.id }, data: { status: "ERROR", finishedAt: new Date(), errorMessage: message } });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
