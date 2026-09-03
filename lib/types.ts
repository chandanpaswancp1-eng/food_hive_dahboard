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

export interface ChartSpec {
  id: string;
  title: string;
  caption?: string;
  type: ChartType;
  labels: string[];
  datasets: ChartDataset[];
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
