import { runLiveSync } from "./runLiveSync";

const TICK_INTERVAL_MINUTES = 10;

declare global {
  var __grubcenterSyncTimer: NodeJS.Timeout | undefined;
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
