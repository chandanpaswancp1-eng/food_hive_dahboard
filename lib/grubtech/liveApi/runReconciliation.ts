import { prisma } from "@/lib/db";
import { fetchLiveOrdersChunked, fetchItemAvailabilityLogChunked } from "./fetchOrders";
import { ingestRawOrders } from "@/lib/grubtech/ingest";
import { ingestItemAvailabilityEvents } from "@/lib/grubtech/ingestStockouts";
import { normalizeRawOrder } from "@/lib/grubtech/normalize";
import { invalidateDimensionCache } from "@/lib/grubtech/kpis/shared";
import { invalidateTabCache } from "@/lib/grubtech/kpis";

// Distinct from "grubcenter-live" and "import" — the Header's live-sync
// health indicator (app/api/sync/status/route.ts) queries "grubcenter-live"
// specifically for staleness, and must never see reconciliation runs, which
// are much slower and would make an otherwise-healthy live agent look stale.
// The quick-reconcile scheduler passes its own distinct source for the same
// reason — it must stay just as invisible to that check.
const DEFAULT_SOURCE = "grubcenter-reconcile";

// Wide enough to catch drift from a rare missed/incomplete sync window
// without re-fetching this app's entire history every run. The faster
// "quick reconcile" scheduler (scheduler.ts) overrides this to a much
// narrower window so it can run every 15 minutes instead of every hour —
// see runReconciliation's `windowDays` option.
const DEFAULT_RECONCILE_WINDOW_DAYS = 30;

// Counts within a cent of each other are treated as matching — Decimal/
// float rounding, not real drift.
const NET_SALES_EPSILON = 0.01;

// A RUNNING row older than this is assumed to be from a crashed process,
// not a genuinely in-flight check — proceed rather than deadlock forever.
// Reconciliation walks a much wider window than the live sync, so it's
// given more time before being considered stale.
const STALE_RUNNING_MINUTES = 45;

export interface ReconciliationResult {
  drifted: boolean;
  ingested: number;
  grubCenterCount: number;
  dbCount: number;
  stockoutEventsProcessed: number;
}

export interface ReconciliationOptions {
  /** Overrides DEFAULT_RECONCILE_WINDOW_DAYS — the quick-reconcile scheduler passes 2. */
  windowDays?: number;
  /** Overrides DEFAULT_SOURCE — the quick-reconcile scheduler passes its own distinct source. */
  source?: string;
}

export async function runReconciliation(options: ReconciliationOptions = {}): Promise<ReconciliationResult> {
  const source = options.source ?? DEFAULT_SOURCE;
  const windowDays = options.windowDays ?? DEFAULT_RECONCILE_WINDOW_DAYS;

  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000);
  const runningLock = await prisma.syncLog.findFirst({
    where: { source, status: "RUNNING", startedAt: { gt: staleThreshold } },
  });
  if (runningLock) {
    return { drifted: false, ingested: 0, grubCenterCount: 0, dbCount: 0, stockoutEventsProcessed: 0 };
  }

  const job = await prisma.syncLog.create({ data: { source, status: "RUNNING" } });

  try {
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * 24 * 60 * 60_000);

    const [rawOrders, rawStockoutEvents] = await Promise.all([
      fetchLiveOrdersChunked(from, to),
      fetchItemAvailabilityLogChunked(from, to),
    ]);

    // Unlike orders, this needs no drift check first — the pairing logic in
    // ingestItemAvailabilityEvents is naturally idempotent (an already-closed
    // "Available" event just no-ops), so it's cheap enough to always run.
    // Isolated in its own try/catch: a failure here (e.g. a transient DB
    // blip during brand/location resolution — this exact scenario crashed a
    // real reconciliation run and skipped the order-drift check below for
    // almost an hour) must never abort the order-side check that follows,
    // since that's the more important safety net of the two.
    let stockoutResult: { ingested: number; issues: string[] } = { ingested: 0, issues: [] };
    try {
      stockoutResult = await ingestItemAvailabilityEvents(rawStockoutEvents);
    } catch (error) {
      stockoutResult = { ingested: 0, issues: [error instanceof Error ? error.message : String(error)] };
    }

    let grubCenterCount = 0;
    let grubCenterNetSales = 0;
    for (const raw of rawOrders) {
      const result = normalizeRawOrder(raw);
      if (result.ok) {
        grubCenterCount += 1;
        grubCenterNetSales += result.order.netSales;
      }
    }

    const dbAgg = await prisma.order.aggregate({
      where: { receivedAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { netSales: true },
    });
    const dbCount = dbAgg._count._all;
    const dbNetSales = Number(dbAgg._sum.netSales ?? 0);

    const drifted =
      dbCount !== grubCenterCount || Math.abs(dbNetSales - grubCenterNetSales) > NET_SALES_EPSILON;

    let ingested = 0;
    if (drifted) {
      const result = await ingestRawOrders(rawOrders);
      ingested = result.ingested;
    }
    // Cheap in-memory clears — always run so a new brand/location from
    // either source, or a stockout-only change, isn't left stale.
    invalidateDimensionCache();
    invalidateTabCache();

    const orderSummary = drifted
      ? `drift detected over last ${windowDays}d — DB had ${dbCount} orders/AED ${dbNetSales.toFixed(2)}, GrubCenter had ${grubCenterCount}/AED ${grubCenterNetSales.toFixed(2)} (${rawOrders.length} raw rows fetched) — re-ingested ${ingested}`
      : `in sync — ${dbCount} orders, AED ${dbNetSales.toFixed(2)}, no drift over last ${windowDays}d (${rawOrders.length} raw rows fetched)`;
    const message = `${orderSummary} | stockout events processed: ${stockoutResult.ingested}${stockoutResult.issues.length ? ` (${stockoutResult.issues.length} issues)` : ""}`;

    await prisma.syncLog.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested: ingested + stockoutResult.ingested,
        windowTo: to,
        errorMessage: message,
      },
    });

    return { drifted, ingested, grubCenterCount, dbCount, stockoutEventsProcessed: stockoutResult.ingested };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: job.id },
      data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
    });
    throw error;
  }
}
