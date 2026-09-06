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
 * The cancelled-orders report uses the opposite id convention from the other
 * two endpoints: its own `orderId` is the short POS code and `uniqueOrderId`
 * is the long globally-unique id. Remapped here so the merged row's `orderId`
 * means the same thing everywhere (the long id — see orderKey above), and so
 * its other fields land under names normalizeRawOrder's ALIASES already
 * recognize (e.g. "Sales Amount"/"Sales After Tax", the exact labels
 * GrubCenter's own Cancelled Orders report uses for these two figures) —
 * no changes needed in normalize.ts itself.
 */
function normalizeCancelledRow(raw: unknown): Record<string, unknown> {
  const row = raw as Record<string, unknown>;
  return {
    ...row,
    orderId: row.uniqueOrderId,
    orderNumber: row.orderId,
    receivedAt: row.date,
    "Sales Amount": row.grossAmount,
    "Sales After Tax": row.netAmount,
    "Order Status": "Cancelled",
    "Post Cancelled": row.postCancelled,
    deliveryPartner: row.cancellationSource,
  };
}

/**
 * Pulls all three live GrubCenter report endpoints for the window and merges
 * them per order into one record ready for normalizeRawOrder/ingestRawOrders.
 * The financial/timing endpoints cover disjoint field sets for
 * active/completed orders — a record missing one side (e.g. financial data
 * lands a beat after timing data) still gets returned, and
 * normalizeRawOrder's required-field validation naturally skips/reports it
 * until a later tick's overlap window picks up the completed record. The
 * cancelled-orders endpoint is normally self-sufficient (a cancelled order
 * doesn't need the other two to satisfy NormalizedOrderInput's required
 * fields) but still merges into the same map in case the same order id
 * appears in more than one source.
 */
export async function fetchLiveOrders(from: Date, to: Date): Promise<Record<string, unknown>[]> {
  const token = await getGrubCenterToken();

  const [timingRows, financialRows, cancelledRows] = await Promise.all([
    fetchPaginated("/operations-data/location-performance/report", from, to, token),
    fetchPaginated("/sales-data/order-details", from, to, token),
    fetchPaginated("/sales-data/cancelled-orders/report", from, to, token),
  ]);

  const merged = new Map<string, Record<string, unknown>>();

  for (const raw of [...timingRows, ...financialRows, ...cancelledRows.map(normalizeCancelledRow)]) {
    const row = raw as Record<string, unknown>;
    const key = orderKey(row);
    if (!key) continue;
    merged.set(key, { ...(merged.get(key) ?? {}), ...row });
  }

  return [...merged.values()];
}

// A single fetchLiveOrders call spanning many weeks has been observed to
// silently return incomplete/mismatched data — verified by comparing a
// wide single-range fetch against several 3-day chunked fetches of the same
// period, where the chunked version recovered the full, correct order set
// every time and the wide call did not. The live sync's own ~30-minute
// window is far too narrow to ever hit this, but the reconciliation job
// (runReconciliation.ts) needs a reliable 30-day lookback, hence this.
const RECONCILE_CHUNK_DAYS = 3;

/**
 * Fetches a wide date range reliably by paging through it in small windows
 * and merging the results by order key — see the note above for why a
 * single wide-range fetchLiveOrders call isn't trustworthy at this size.
 */
export async function fetchLiveOrdersChunked(
  from: Date,
  to: Date,
  chunkDays: number = RECONCILE_CHUNK_DAYS,
): Promise<Record<string, unknown>[]> {
  const chunkMs = chunkDays * 24 * 60 * 60_000;
  const merged = new Map<string, Record<string, unknown>>();

  let cursor = from.getTime();
  while (cursor < to.getTime()) {
    const chunkFrom = new Date(cursor);
    const chunkTo = new Date(Math.min(cursor + chunkMs, to.getTime()));
    const rows = await fetchLiveOrders(chunkFrom, chunkTo);
    for (const row of rows) {
      const key = orderKey(row);
      if (!key) continue;
      merged.set(key, { ...(merged.get(key) ?? {}), ...row });
    }
    cursor += chunkMs;
  }

  return [...merged.values()];
}
