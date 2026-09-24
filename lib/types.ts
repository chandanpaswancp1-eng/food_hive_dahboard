export const TAB_IDS = [
  "income",
  "order-details",
  "weekly",
  "monthly",
  "cancellations",
  "prep-time",
  "ratings",
  "delayed",
  "stockouts",
] as const;

export type TabId = (typeof TAB_IDS)[number];

export const TAB_LABELS: Record<TabId, string> = {
  income: "Income",
  "order-details": "Order Details",
  weekly: "Weekly Comparison",
  monthly: "Monthly Comparison",
  cancellations: "Cancellations",
  "prep-time": "Prep Time",
  ratings: "Ratings",
  delayed: "Delayed Orders",
  stockouts: "86 Items",
};

/** One-line description shown under the tab title in the header. */
export const TAB_SUBTITLES: Record<TabId, string> = {
  income: "Take-home income, commissions, and margins across channels.",
  "order-details": "Gross and net sales, discounts, and order-level detail.",
  weekly: "Week-over-week gross and net sales, plus hourly and weekday order patterns.",
  monthly: "Month-over-month gross and net sales, plus hourly and weekday order patterns.",
  cancellations: "Cancelled orders, refunded amounts, and cancellation trends.",
  "prep-time": "Kitchen prep and dispatch timing by brand and branch.",
  ratings: "Customer ratings and sentiment across brands and locations.",
  delayed: "Orders exceeding the delay threshold, by brand and branch.",
  stockouts: "86'd items and stockout frequency across the menu.",
};

/** File types the backend can confidently recognize — the two real GrubCenter exports seen so far. */
export type ReportTypeHint = "order-details" | "cancelled-orders";

/**
 * What each tab's own Import button expects. Tabs without a known,
 * distinct source file (their data comes from order-details/cancelled-orders
 * once those carry the right fields, or no source has been found yet) get
 * no hint — the button falls back to auto-detecting from the file itself.
 */
export const TAB_IMPORT_CONFIG: Record<TabId, { label: string; hint?: ReportTypeHint }> = {
  // Income is a pure rollup of Order Details + Cancelled Orders data already
  // in the DB — it has no distinct source file of its own to import.
  income: { label: "Import Data" },
  "order-details": { label: "Import Order Details", hint: "order-details" },
  // Like Income, a pure rollup of Order Details data already in the DB.
  weekly: { label: "Import Data" },
  monthly: { label: "Import Data" },
  cancellations: { label: "Import Cancelled Orders", hint: "cancelled-orders" },
  "prep-time": { label: "Import Data" },
  ratings: { label: "Import Data" },
  delayed: { label: "Import Data" },
  stockouts: { label: "Import Data" },
};

export interface DashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  brands?: string[];
  cuisines?: string[];
  locations?: string[];
  channels?: string[];
  paymentMethods?: string[];
}

export interface KpiValue {
  key: string;
  label: string;
  value: string;
  /** Full, non-abbreviated value shown on hover — falls back to `value` when the card was never compacted. */
  fullValue?: string;
  subtitle?: string;
  accent?: boolean;
  /** Consecutive cards sharing a group are laid out as one unit that never splits across rows (e.g. a week's Gross + Net pair). */
  group?: string;
  /**
   * Makes the card clickable, opening the drill-through modal. `drillTab`
   * overrides which tab's status convention /api/orders applies (e.g. a
   * "Cancelled Orders" card shown on Order Details, which is otherwise
   * completed-only, still needs to drill through as CANCELLED-only) —
   * defaults to whichever tab is currently active. `drillFilter` narrows
   * further (e.g. a specific channel for a per-portal card).
   */
  drillTab?: TabId;
  drillFilter?: Partial<DashboardFilters>;
  /** Marks this card as commission-rate-editable for `channel`, prefilled with both current rates — opens the Edit Commission modal instead of (not in addition to) the drill-through. */
  editCommission?: { channel: string; currentCommissionRate: number; currentDeliveryChargeRate: number };
  /** Structured period-over-period change, rendered as a small colored pill (▲/▼ + %). Positive/negative sign drives the arrow direction and color. */
  trend?: { pct: number; label?: string };
  /** Ascending-chronological values for a small embedded sparkline — set only on select headline metrics where the builder already has a per-day/per-period series on hand. */
  sparkline?: number[];
}

export type ChartType = "bar" | "hbar" | "line" | "doughnut" | "combo" | "gauge";

export interface ChartDataset {
  label: string;
  data: number[];
  kind?: "bar" | "line";
  yAxisId?: "y" | "y1";
  /** Renders as a dashed stroke with no area fill — a target/benchmark overlay distinct from the solid actual-value line it's compared against. */
  dashed?: boolean;
}

export type DrillDimension = "brand" | "location" | "channel" | "cuisine" | "date" | "payment";

export interface ChartSpec {
  id: string;
  title: string;
  caption?: string;
  type: ChartType;
  labels: string[];
  datasets: ChartDataset[];
  /** When set, each label is a value for this filter dimension — clicking a slice/bar drills through scoped to it. */
  dimension?: DrillDimension;
  /** Extra filter overrides merged into every drill-through from this chart — for a view whose own date range isn't in the page filters (e.g. the Weekly tab's default of "last 4 weeks"). */
  drillScope?: Partial<DashboardFilters>;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface TableSpec {
  title: string;
  columns: TableColumn[];
  rows: Record<string, string | number>[];
  /**
   * When set, this table's rows don't map to an Orders filter dimension
   * (brand/location/channel/cuisine) — clicking a row should instead open a
   * StockoutDrillModal for the item named in this column key, rather than
   * the Orders-based DrillThroughModal. See "Most 86'd Items"
   * (lib/grubtech/kpis/stockouts.ts): its rows are per-item, and there's no
   * "filter orders by item" dimension, so a real drill-through here means
   * showing that item's own 86'd-episode history, not orders/sales.
   */
  itemDrillKey?: string;
  /** A pinned totals row rendered below the body — never clickable, so it can't be mistaken for a real drillable dimension value. */
  footerRow?: Record<string, string | number>;
  /** Numeric body cells in these columns are shaded relative to the largest of them — a heatmap (e.g. orders by hour x weekday). */
  heatmap?: { columns: string[] };
}

export interface StockoutEpisode {
  id: string;
  brand: string;
  location: string;
  markedUnavailableAt: string;
  restoredAt: string | null;
  durationMinutes: number | null;
  source: string | null;
}

export interface TabPayload {
  kpis: KpiValue[];
  charts: ChartSpec[];
  table: TableSpec;
  /** Additional tables rendered below the primary one, for tabs with more than one natural breakdown. */
  extraTables?: TableSpec[];
  scope: {
    orderCount: number;
  };
}

export interface FilterOptions {
  brands: string[];
  cuisines: string[];
  locations: string[];
  channels: string[];
  paymentMethods: string[];
  /** Every "YYYY-MM" month that has at least one order, newest first — feeds the Weekly Comparison month picker. */
  months: string[];
}

export interface SyncStatusPayload {
  mode: "live" | "local" | "error" | "none";
  /** Which SyncLog source produced `mode`/`message` — lets the UI tell the automated GrubCenter agent apart from a manual CSV import. */
  source: "grubcenter-live" | "import" | null;
  lastSyncedAt: string | null;
  /** Minutes since the grubcenter-live agent's last successful run, regardless of `source` — null if it has never succeeded. */
  minutesSinceSync: number | null;
  /** Whether the grubcenter-live agent is current (within 2x its 10-minute cadence) — null when mode is "none". */
  healthy: boolean | null;
  message?: string;
}

export interface PortalStatus {
  /** Matches a Channel.name, e.g. "Deliveroo" */
  channel: string;
  /** null means not connected (no API credentials configured yet) or the last fetch failed — distinct from a real "closed" reading. */
  isOpen: boolean | null;
  message: string;
}

export interface PortalStatusPayload {
  portals: PortalStatus[];
  fetchedAt: string;
}

export interface AlertItem {
  /** Stable across polls so the client can diff "new since last poll" and track dismissals — "portal:<channel>" or "stockout:<StockoutEvent id>". */
  id: string;
  kind: "portal-closed" | "item-86d";
  severity: "danger" | "warning";
  title: string;
  detail: string;
  /** ISO timestamp the underlying condition started (portal payload's fetchedAt, or the stockout's markedUnavailableAt). */
  since: string;
}

export interface AlertsPayload {
  alerts: AlertItem[];
  fetchedAt: string;
}

export interface JobStatusPayload {
  status: "RUNNING" | "SUCCESS" | "ERROR";
  recordsIngested: number;
  errorMessage: string | null;
}

export interface DrillThroughRow {
  id: string;
  orderNumber: string;
  receivedAt: string;
  brand: string;
  location: string;
  channel: string;
  paymentMethod: string | null;
  status: string;
  netSales: number;
  actualPrepTime: number | null;
  rating: number | null;
}

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderInvoice {
  id: string;
  orderNumber: string;
  receivedAt: string;
  brand: string;
  location: string;
  channel: string;
  paymentMethod: string | null;
  status: string;
  isPostCancelled: boolean;
  cancellationReason: string | null;
  deliveryPartner: string | null;
  netSales: number;
  receiptTotal: number;
  discountAmount: number;
  discountPercent: number;
  taxAmount: number;
  grossSales: number;
  actualPrepTime: number | null;
  delayMinutes: number | null;
  rating: number | null;
  items: InvoiceLineItem[];
  /** True when `items` is a synthetic order-total fallback, not a real per-SKU breakdown. */
  itemsEstimated: boolean;
}
