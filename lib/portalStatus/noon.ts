import type { PortalStatus } from "@/lib/types";

// Matches the "Noon" Channel row (the GrubCenter app tile is "Noon Food",
// but the Channel.name ingested into our DB is just "Noon" — see
// lib/grubtech/portals.ts for the same
// channel-name convention).
const CHANNEL = "Noon";

/**
 * No Noon Food partner API credentials exist yet — access has to be
 * requested from Noon's partner program first. Until then this always
 * reports "not connected" rather than guessing at an endpoint. Once
 * NOON_API_KEY/NOON_STORE_ID are issued, replace the body below with the
 * real store-status call.
 */
export async function fetchNoonStatus(): Promise<PortalStatus> {
  const apiKey = process.env.NOON_API_KEY;
  const storeId = process.env.NOON_STORE_ID;

  if (!apiKey || !storeId) {
    return {
      channel: CHANNEL,
      isOpen: null,
      message: "Not connected — set NOON_API_KEY/NOON_STORE_ID once Noon Food grants partner API access",
    };
  }

  throw new Error(
    "NOON_API_KEY/NOON_STORE_ID are set but fetchNoonStatus() has no real implementation yet — " +
      "wire up the actual store-status endpoint once Noon Food's API docs are in hand",
  );
}
