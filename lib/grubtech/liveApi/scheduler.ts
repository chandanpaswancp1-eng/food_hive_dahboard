import { runLiveSync } from "./runLiveSync";
import { runReconciliation } from "./runReconciliation";

const TICK_INTERVAL_MINUTES = 10;

// Slower than the live sync's 10-minute cadence — reconciliation walks a
// full 30-day window in ~3-day chunks against both GrubCenter endpoints
// each run, meaningfully heavier than the live sync's narrow lookback, and
// only exists to catch rare drift rather than pick up fresh orders quickly.
const RECONCILE_INTERVAL_MINUTES = 60;

declare global {
  var __grubcenterSyncTimer: NodeJS.Timeout | undefined;
  var __grubcenterReconcileTimer: NodeJS.Timeout | undefined;
}

/**
 * In-process timer inside the already-persistent `next start` Node server —
 * not a Railway cron job, not an external hosted cron. Appropriate given a
 * single always-on replica; no extra infra or public-endpoint trigger needed.
 * If ever scaled to >1 replica, each would run its own timer and race
 * harmlessly on runLiveSync's SyncLog mutex (upserts make double-ingestion
 * safe, just wasteful of Cognito auth calls) — not a concern today.
 */
export function startLiveSyncScheduler() {
  if (globalThis.__grubcenterSyncTimer) return; // survives Next dev hot-reload

  if (!process.env.GRUBCENTER_EMAIL || !process.env.GRUBCENTER_PASSWORD) {
    console.log("[grubcenter-live] GRUBCENTER_EMAIL/PASSWORD not set — live sync scheduler not started.");
    return;
  }

  const tick = () => {
    runLiveSync()
      .then((result) => {
        console.log(`[grubcenter-live] synced ${result.recordsIngested} orders`, result.issues.length ? result.issues : "");
      })
      .catch((err) => {
        console.error("[grubcenter-live] sync failed:", err instanceof Error ? err.message : err);
      });
  };

  console.log(`[grubcenter-live] starting scheduler — syncing every ${TICK_INTERVAL_MINUTES} minutes`);
  tick(); // don't wait up to 10 minutes for the first run after a fresh deploy
  globalThis.__grubcenterSyncTimer = setInterval(tick, TICK_INTERVAL_MINUTES * 60_000);
}

/**
 * Independent of startLiveSyncScheduler's timer — same in-process,
 * single-replica model, just a slower cadence for a heavier, self-healing
 * check (see runReconciliation.ts) rather than fast day-to-day ingestion.
 */
export function startReconciliationScheduler() {
  if (globalThis.__grubcenterReconcileTimer) return; // survives Next dev hot-reload

  if (!process.env.GRUBCENTER_EMAIL || !process.env.GRUBCENTER_PASSWORD) {
    console.log("[grubcenter-reconcile] GRUBCENTER_EMAIL/PASSWORD not set — reconciliation scheduler not started.");
    return;
  }

  const tick = () => {
    runReconciliation()
      .then((result) => {
        console.log(
          `[grubcenter-reconcile] ${result.drifted ? `drift fixed (${result.ingested} re-ingested)` : "in sync"} — DB ${result.dbCount} vs GrubCenter ${result.grubCenterCount}, ${result.stockoutEventsProcessed} stockout events processed`,
        );
      })
      .catch((err) => {
        console.error("[grubcenter-reconcile] check failed:", err instanceof Error ? err.message : err);
      });
  };

  console.log(`[grubcenter-reconcile] starting scheduler — checking every ${RECONCILE_INTERVAL_MINUTES} minutes`);
  tick();
  globalThis.__grubcenterReconcileTimer = setInterval(tick, RECONCILE_INTERVAL_MINUTES * 60_000);
}
