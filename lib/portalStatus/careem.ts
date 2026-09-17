import type { PortalStatus } from "@/lib/types";

const CHANNEL = "Careem";

/**
 * No Careem merchant API credentials exist yet — access has to be requested
 * from Careem's partner program first. Until then this always reports "not
 * connected" rather than guessing at an endpoint. Once CAREEM_API_KEY/
 * CAREEM_STORE_ID are issued, replace the body below with the real
 * store-status call.
 */
export async function fetchCareemStatus(): Promise<PortalStatus> {
  const apiKey = process.env.CAREEM_API_KEY;
  const storeId = process.env.CAREEM_STORE_ID;

  if (!apiKey || !storeId) {
    return {
      channel: CHANNEL,
      isOpen: null,
      message: "Not connected — set CAREEM_API_KEY/CAREEM_STORE_ID once Careem grants partner API access",
    };
  }

  throw new Error(
    "CAREEM_API_KEY/CAREEM_STORE_ID are set but fetchCareemStatus() has no real implementation yet — " +
      "wire up the actual store-status endpoint once Careem's API docs are in hand",
  );
}
