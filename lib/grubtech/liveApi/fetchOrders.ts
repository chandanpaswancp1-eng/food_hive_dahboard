import { getGrubCenterToken } from "./cognitoAuth";

const API_BASE = "https://internal-api.grubtech.io/data-visualization/api/v1";
const PAGE_SIZE = 200;

async function fetchPaginated(path: string, from: Date, to: Date, token: string): Promise<unknown[]> {
  const partnerId = process.env.GRUBCENTER_PARTNER_ID;
  if (!partnerId) throw new Error("Missing GRUBCENTER_PARTNER_ID");

  const results: unknown[] = [];
  let offset = 0;

  for (;;) {
    const url = new URL(`${API_BASE}${path}/${partnerId}`);
    url.searchParams.set("timezone", "Asia/Dubai");
    url.searchParams.set("from", from.toISOString());
    url.searchParams.set("to", to.toISOString());
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GrubCenter API ${path} returned ${res.status}: ${body.slice(0, 300)}`);
    }

    const page = (await res.json()) as unknown[];
    results.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

/**
 * `orderId` (a long, globally-unique numeric string) is the real join key —
 * `externalId` is a short POS-assigned code (e.g. "00030001") that recurs
 * across different orders on different days/branches, so merging on it
 * would silently conflate unrelated orders.
 */
function orderKey(row: Record<string, unknown>): string | null {
  const key = row.orderId ?? row.externalId;
  return key !== undefined && key !== null ? String(key) : null;
}

/**
 * Pulls both live GrubCenter report endpoints for the window and merges them
 * per order into one record ready for normalizeRawOrder/ingestRawOrders.
 * The two endpoints cover disjoint field sets (timing vs financial) — a
 * record missing one side (e.g. financial data lands a beat after timing
 * data) still gets returned, and normalizeRawOrder's required-field
 * validation naturally skips/reports it until a later tick's overlap window
 * picks up the completed record.
 */
export async function fetchLiveOrders(from: Date, to: Date): Promise<Record<string, unknown>[]> {
  const token = await getGrubCenterToken();

  const [timingRows, financialRows] = await Promise.all([
    fetchPaginated("/operations-data/location-performance/report", from, to, token),
    fetchPaginated("/sales-data/order-details", from, to, token),
  ]);

  const merged = new Map<string, Record<string, unknown>>();

  for (const raw of [...timingRows, ...financialRows]) {
    const row = raw as Record<string, unknown>;
    const key = orderKey(row);
    if (!key) continue;
    merged.set(key, { ...(merged.get(key) ?? {}), ...row });
  }

  return [...merged.values()];
}
