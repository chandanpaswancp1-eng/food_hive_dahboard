import { prisma } from "@/lib/db";
import { fetchLiveOrdersChunked } from "./fetchOrders";
import { ingestRawOrders } from "@/lib/grubtech/ingest";
import { normalizeRawOrder } from "@/lib/grubtech/normalize";
import { invalidateDimensionCache } from "@/lib/grubtech/kpis/shared";
import { invalidateTabCache } from "@/lib/grubtech/kpis";

// Distinct from "grubcenter-live" and "import" — the Header's live-sync
// health indicator (app/api/sync/status/route.ts) queries "grubcenter-live"
// specifically for staleness, and must never see reconciliation runs, which
// are much slower and would make an otherwise-healthy live agent look stale.
const SOURCE = "grubcenter-reconcile";

// Wide enough to catch drift from a rare missed/incomplete sync window
// without re-fetching this app's entire history every run.
const RECONCILE_WINDOW_DAYS = 30;

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
}

export async function runReconciliation(): Promise<ReconciliationResult> {
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000);
  const runningLock = await prisma.syncLog.findFirst({
    where: { source: SOURCE, status: "RUNNING", startedAt: { gt: staleThreshold } },
  });
  if (runningLock) {
    return { drifted: false, ingested: 0, grubCenterCount: 0, dbCount: 0 };
  }

  const job = await prisma.syncLog.create({ data: { source: SOURCE, status: "RUNNING" } });

  try {
    const to = new Date();
    const from = new Date(to.getTime() - RECONCILE_WINDOW_DAYS * 24 * 60 * 60_000);

    const rawOrders = await fetchLiveOrdersChunked(from, to);

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
      invalidateDimensionCache();
      invalidateTabCache();
    }

    const message = drifted
      ? `drift detected over last ${RECONCILE_WINDOW_DAYS}d — DB had ${dbCount} orders/AED ${dbNetSales.toFixed(2)}, GrubCenter had ${grubCenterCount}/AED ${grubCenterNetSales.toFixed(2)} — re-ingested ${ingested}`
      : `in sync — ${dbCount} orders, AED ${dbNetSales.toFixed(2)}, no drift over last ${RECONCILE_WINDOW_DAYS}d`;

    await prisma.syncLog.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsIngested: ingested,
        windowTo: to,
        errorMessage: message,
      },
    });

    return { drifted, ingested, grubCenterCount, dbCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: job.id },
      data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
    });
    throw error;
  }
}
