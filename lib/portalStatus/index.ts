import type { PortalStatus, PortalStatusPayload } from "@/lib/types";
import { fetchDeliverooStatus } from "./deliveroo";
import { fetchCareemStatus } from "./careem";
import { fetchNoonStatus } from "./noon";
import { prisma } from "@/lib/db";
import { isPortal } from "@/lib/grubtech/portals";

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

  // Every portal in the data gets an entry, not just the ones with an
  // adapter above — a new aggregator (e.g. Talabat) shows as not connected
  // instead of being missing from the strip until someone adds code for it.
  // Best-effort: during a DB blip the strip still shows the adapter portals.
  const channels = await prisma.channel
    .findMany({ select: { name: true }, orderBy: { createdAt: "asc" } })
    .catch(() => [] as { name: string }[]);
  const withAdapter = new Set(ADAPTERS.map((a) => a.channel.toLowerCase()));
  const unconnected: PortalStatus[] = channels
    .filter((c) => isPortal(c.name) && !withAdapter.has(c.name.toLowerCase()))
    .map((c) => ({ channel: c.name, isOpen: null, message: "Not connected — no status integration for this portal yet" }));

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

  const payload: PortalStatusPayload = { portals: [...portals, ...unconnected], fetchedAt: new Date().toISOString() };
  globalThis.__portalStatusCache = { payload, expiresAt: Date.now() + CACHE_MS };
  return payload;
}
