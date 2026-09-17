import type { PortalStatus, PortalStatusPayload } from "@/lib/types";
import { fetchDeliverooStatus } from "./deliveroo";
import { fetchCareemStatus } from "./careem";
import { fetchNoonStatus } from "./noon";

// Real portal APIs (once connected) aren't ours to hammer on every 5s
// dashboard poll (DASHBOARD_POLL_INTERVAL_MS in app/page.tsx) — cache briefly
// so bursts of polls within the window, from both /api/channels/status and
// /api/alerts, share one fetch.
const CACHE_MS = 30_000;

interface Cached {
  payload: PortalStatusPayload;
  expiresAt: number;
}

declare global {
  var __portalStatusCache: Cached | undefined;
}

const ADAPTERS: { channel: string; fetch: () => Promise<PortalStatus> }[] = [
  { channel: "Deliveroo", fetch: fetchDeliverooStatus },
  { channel: "Careem", fetch: fetchCareemStatus },
  { channel: "Noon", fetch: fetchNoonStatus },
];

export async function getPortalStatusPayload(): Promise<PortalStatusPayload> {
  const cached = globalThis.__portalStatusCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const results = await Promise.allSettled(ADAPTERS.map((a) => a.fetch()));
  const portals: PortalStatus[] = results.map((result, i) =>
    result.status === "fulfilled"
      ? result.value
      : {
          channel: ADAPTERS[i].channel,
          isOpen: null,
          message: result.reason instanceof Error ? result.reason.message : "Failed to fetch status",
        },
  );

  const payload: PortalStatusPayload = { portals, fetchedAt: new Date().toISOString() };
  globalThis.__portalStatusCache = { payload, expiresAt: Date.now() + CACHE_MS };
  return payload;
}
