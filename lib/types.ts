export const TAB_IDS = [
  "order-details",
  "cancellations",
  "prep-time",
  "ratings",
  "delayed",
  "stockouts",
] as const;

export type TabId = (typeof TAB_IDS)[number];

export const TAB_LABELS: Record<TabId, string> = {
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
  subtitle?: string;
  accent?: boolean;
}

export type ChartType = "bar" | "hbar" | "line" | "doughnut" | "combo";

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
  lastSyncedAt: string | null;
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
