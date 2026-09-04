import { z } from "zod";

/**
 * Field-alias map, matched exactly (case/space-sensitive) against whatever
 * key names a row actually has. Two sources feed this:
 *  - GrubCenter's internal report APIs (not captured yet — run
 *    `npm run discover:grubcenter`, see scraper/discover.ts), guessed from
 *    the old Kaykroo prototype's Grubtech field-mapping (snake_case/camelCase).
 *  - Real GrubCenter Excel exports (order-details_*.xlsx, cancelled-orders_*.xlsx,
 *    uploaded via the dashboard's Import button) — headers confirmed from a
 *    same-system reference file (Kaykroo_Dashboard.xlsx / data.xlsx), e.g.
 *    "Unique Order ID", "Net Sales (AED)", "Post Cancelled".
 * If an import's issues list shows missing required fields, the real header
 * name didn't match anything here — add it and re-import, nothing else needs
 * to change.
 */
const ALIASES = {
  id: ["Unique Order ID", "Order ID", "id", "order_id", "orderId"],
  orderNumber: ["Order ID", "order_number", "orderNumber", "number"],
  brand: ["Brand", "brand_name", "brandName", "brand"],
  cuisine: ["Cuisine Cluster", "cuisine", "cuisine_cluster", "cuisineCluster"],
  location: ["Location", "location_name", "locationName", "location", "outlet"],
  vendorArea: ["vendor_area", "vendorArea", "area"],
  channel: ["Channel", "channel", "channel_name", "channelName"],
  paymentMethod: ["Payment Method", "payment_method", "paymentMethod"],
  receivedAt: [
    "Received At",
    "Received Date",
    "Date",
    "received_at",
    "receivedAt",
    "created_at",
    "createdAt",
  ],
  acceptedAt: ["accepted_at", "acceptedAt"],
  startedAt: ["started_at", "startedAt"],
  preparedAt: ["prepared_at", "preparedAt"],
  sentToDispatchAt: ["sent_to_dispatch_at", "sentToDispatchAt"],
  dispatchedAt: ["dispatched_at", "dispatchedAt"],
  deliveredAt: ["delivered_at", "deliveredAt"],
  netSales: ["Net Sales (AED)", "Net Sales", "Sales Amount", "net_sales", "netSales"],
  receiptTotal: [
    "Receipt Total (AED)",
    "Total(Receipt Total)",
    "Sales After Tax",
    "receipt_total",
    "receiptTotal",
    "total",
  ],
  discountAmount: ["Discount (AED)", "Discount", "discount_amount", "discountAmount"],
  status: ["Order Status", "order_status", "orderStatus", "status"],
  cancellationReason: [
    "Cancellation Reason",
    "Reason",
    "cancellation_reason",
    "cancellationReason",
    "reason",
  ],
  isPostCancelled: ["Post Cancelled", "is_post_cancelled", "isPostCancelled"],
  deliveryPartner: [
    "Delivery Partner",
    "Delivery Partner Name",
    "delivery_partner",
    "deliveryPartner",
  ],
  /**
   * Some exports split date and hour into separate columns — "Received Date"
   * is date-only (a constant, meaningless time-of-day baked in) and the real
   * intraday signal lives here. When present, this overrides the hour
   * normalizeRawOrder would otherwise read off receivedAt's timestamp.
   */
  hour: ["Order Hour", "order_hour", "hour"],
  estimatedPrepTime: ["estimated_prep_time", "estimatedPrepTime"],
  actualPrepTime: ["actual_prep_time", "actualPrepTime"],
  rating: ["rating", "rating_value", "ratingValue"],
  items: ["items", "line_items", "lineItems"],
} as const;

/**
 * `z.coerce.boolean()` would treat the string "No" as truthy (JS `Boolean("No")`
 * is `true`) — real exports use "Yes"/"No" text, so this parses that explicitly.
 */
const YesNoBoolean = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    return /^(yes|true|1)$/i.test(String(value).trim());
  });

function pick(raw: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function extract(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    out[canonical] = pick(raw, aliases);
  }
  return out;
}

const NormalizedOrderInput = z.object({
  id: z.union([z.string(), z.number()]),
  orderNumber: z.union([z.string(), z.number()]).optional(),
  brand: z.string().min(1),
  cuisine: z.string().optional(),
  location: z.string().min(1),
  vendorArea: z.string().optional(),
  channel: z.string().min(1),
  paymentMethod: z.string().optional(),
  receivedAt: z.string().min(1),
  hour: z.coerce.number().min(0).max(23).optional(),
  acceptedAt: z.string().optional(),
  startedAt: z.string().optional(),
  preparedAt: z.string().optional(),
  sentToDispatchAt: z.string().optional(),
  dispatchedAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  netSales: z.coerce.number(),
  receiptTotal: z.coerce.number().optional(),
  discountAmount: z.coerce.number().optional(),
  status: z.string().optional(),
  cancellationReason: z.string().optional(),
  isPostCancelled: YesNoBoolean,
  deliveryPartner: z.string().optional(),
  estimatedPrepTime: z.coerce.number().optional(),
  actualPrepTime: z.coerce.number().optional(),
  rating: z.coerce.number().optional(),
  items: z
    .array(
      z.object({
        name: z.string().optional(),
        itemType: z.string().optional(),
        itemSource: z.string().optional(),
        quantity: z.coerce.number().optional(),
        unitPrice: z.coerce.number().optional(),
        totalPrice: z.coerce.number().optional(),
      }),
    )
    .optional(),
});

export type NormalizedOrder = z.infer<typeof NormalizedOrderInput> & {
  durations: Record<
    | "durAccToStarted"
    | "durStartedToPrep"
    | "durPrepToSTD"
    | "durSTDToDispatched"
    | "durReceivingToDispatched"
    | "durReceivedToDelivered",
    number | null
  >;
  calendar: {
    dayName: string;
    dayOfWeek: number;
    hour: number;
    timeSlot: string;
    timeOfDay: string;
  };
  isDelayed: boolean;
  delayMinutes: number | null;
};

export type NormalizeResult =
  | { ok: true; order: NormalizedOrder }
  | { ok: false; issues: string[]; raw: unknown };

function minutesBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round(((end - start) / 60000) * 100) / 100;
}

const TIME_SLOTS: [number, number, string][] = [
  [6, 11, "Breakfast"],
  [11, 15, "Lunch"],
  [15, 18, "Afternoon Snack"],
  [18, 22, "Dinner"],
  [22, 24, "Late Night"],
  [0, 6, "Overnight"],
];

function timeSlotFor(hour: number): string {
  return TIME_SLOTS.find(([start, end]) => hour >= start && hour < end)?.[2] ?? "Overnight";
}

function timeOfDayFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}

/**
 * Normalizes one raw GrubCenter order-like payload into our schema shape.
 * Unlike the old prototype's mapper, missing required fields are reported
 * as issues instead of silently defaulted — callers should log/skip these
 * rather than writing fabricated data.
 */
export function normalizeRawOrder(raw: unknown): NormalizeResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, issues: ["payload is not an object"], raw };
  }

  const extracted = extract(raw as Record<string, unknown>);
  const parsed = NormalizedOrderInput.safeParse(extracted);

  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      raw,
    };
  }

  const data = parsed.data;
  const receivedDate = new Date(data.receivedAt);
  if (data.hour !== undefined) {
    // Date-only column + a separate real hour column — the timestamp's own
    // time-of-day is a meaningless constant, so splice in the real hour.
    receivedDate.setUTCHours(data.hour, 0, 0, 0);
  }
  const hour = receivedDate.getUTCHours();
  const receivedAtIso = receivedDate.toISOString();

  const durAccToStarted = minutesBetween(data.acceptedAt, data.startedAt);
  const durStartedToPrep = minutesBetween(data.startedAt, data.preparedAt);
  const durPrepToSTD = minutesBetween(data.preparedAt, data.sentToDispatchAt);
  const durSTDToDispatched = minutesBetween(data.sentToDispatchAt, data.dispatchedAt);
  const durReceivingToDispatched = minutesBetween(receivedAtIso, data.dispatchedAt);
  const durReceivedToDelivered = minutesBetween(receivedAtIso, data.deliveredAt);

  const delayMinutes =
    data.actualPrepTime !== undefined && data.estimatedPrepTime !== undefined
      ? Math.round((data.actualPrepTime - data.estimatedPrepTime) * 100) / 100
      : null;

  return {
    ok: true,
    order: {
      ...data,
      receivedAt: receivedAtIso,
      durations: {
        durAccToStarted,
        durStartedToPrep,
        durPrepToSTD,
        durSTDToDispatched,
        durReceivingToDispatched,
        durReceivedToDelivered,
      },
      calendar: {
        dayName: receivedDate.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
        dayOfWeek: receivedDate.getUTCDay(),
        hour,
        timeSlot: timeSlotFor(hour),
        timeOfDay: timeOfDayFor(hour),
      },
      isDelayed: delayMinutes !== null ? delayMinutes > 10 : false,
      delayMinutes,
    },
  };
}
