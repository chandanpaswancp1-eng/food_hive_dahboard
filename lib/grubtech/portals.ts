import { isTestFixtureName } from "./testFixture";

/**
 * Direct, no-commission channels — not third-party delivery portals. Every
 * other channel that shows up in the data is treated as a portal, so a new
 * aggregator (e.g. Talabat) gets its commission card (kpis/income.ts) and a
 * status-strip entry (lib/portalStatus) automatically, with nothing to add
 * here. Matched case-insensitively.
 */
const NON_PORTAL_CHANNELS = new Set(["pickup", "take away", "dine in"]);

/** Whether a Channel.name is a third-party delivery portal (never the GrubCenter sandbox channel). */
export function isPortal(channel: string): boolean {
  return !NON_PORTAL_CHANNELS.has(channel.trim().toLowerCase()) && !isTestFixtureName("channel", channel);
}
