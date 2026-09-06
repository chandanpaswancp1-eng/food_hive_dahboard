export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLiveSyncScheduler, startReconciliationScheduler } = await import("./lib/grubtech/liveApi/scheduler");
    startLiveSyncScheduler();
    startReconciliationScheduler();
  }
}
