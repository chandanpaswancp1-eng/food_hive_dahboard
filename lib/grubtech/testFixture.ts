/**
 * GrubCenter's live feed periodically re-emits a sandbox order under this
 * exact brand + channel pair, each time with a fresh order id. It's never a
 * real sale, so it's blocked at ingest (lib/grubtech/normalize.ts) and, for
 * rows that were ingested before that rule existed, hidden from every
 * dashboard query (lib/filters.ts) — deleting rows alone can't fix it, since
 * the feed just re-creates them.
 */
export const TEST_BRAND_NAME = "TEST BRAND";
export const TEST_CHANNEL_NAME = "GRUBTECH TEST";

const norm = (s: string) => s.trim().toUpperCase();

export function isTestFixtureName(kind: "brand" | "channel", name: string): boolean {
  return norm(name) === (kind === "brand" ? TEST_BRAND_NAME : TEST_CHANNEL_NAME);
}
