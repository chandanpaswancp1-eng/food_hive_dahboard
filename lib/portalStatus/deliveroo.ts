import type { PortalStatus } from "@/lib/types";

const CHANNEL = "Deliveroo";

/**
 * No Deliveroo partner API credentials exist yet (as of this integration) —
 * access has to be requested from Deliveroo's partner program first. Until
 * then this always reports "not connected" rather than guessing at an
 * endpoint. Once DELIVEROO_API_KEY/DELIVEROO_SITE_ID are issued, replace the
 * body below with the real store-status call.
 */
export async function fetchDeliverooStatus(): Promise<PortalStatus> {
  const apiKey = process.env.DELIVEROO_API_KEY;
  const siteId = process.env.DELIVEROO_SITE_ID;

  if (!apiKey || !siteId) {
    return {
      channel: CHANNEL,
      isOpen: null,
      message: "Not connected — set DELIVEROO_API_KEY/DELIVEROO_SITE_ID once Deliveroo grants partner API access",
    };
  }

  throw new Error(
    "DELIVEROO_API_KEY/DELIVEROO_SITE_ID are set but fetchDeliverooStatus() has no real implementation yet — " +
      "wire up the actual store-status endpoint once Deliveroo's API docs are in hand",
  );
}
