export const TAB_IDS = [
  "income",
  "order-details",
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
  cancellations: "Cancellations",
  "prep-time": "Prep Time",
  ratings: "Ratings",
  delayed: "Delayed Orders",
  stockouts: "86 Items",
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
  /** Marks this card as commission-rate-editable for `channel`, prefilled with `currentRate` — opens the Edit Commission modal instead of (not in addition to) the drill-through. */
  editCommission?: { channel: string; currentRate: number };
}

export type ChartType = "bar" | "hbar" | "line" | "doughnut" | "combo" | "gauge";

export interface ChartDataset {
  label: string;
  data: number[];
  kind?: "bar" | "line";
  yAxisId?: "y" | "y1";
}

export type DrillDimension = "brand" | "location" | "channel" | "cuisine" | "date";

export interface ChartSpec {
  id: string;
  title: string;
  caption?: string;
  type: ChartType;
  labels: string[];
  datasets: ChartDataset[];
  /** When set, each label is a value for this filter dimension — clicking a slice/bar drills through scoped to it. */
  dimension?: DrillDimension;
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
