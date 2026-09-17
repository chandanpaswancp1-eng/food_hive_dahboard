import type { DashboardFilters, DrillDimension, TableSpec } from "./types";

/** Maps a clicked chart label (for a dimension-tagged chart) to a filter override. */
export function dimensionFilter(dimension: DrillDimension, value: string): Partial<DashboardFilters> {
  switch (dimension) {
    case "brand":
      return { brands: [value] };
    case "location":
      return { locations: [value] };
    case "channel":
      return { channels: [value] };
    case "cuisine":
      return { cuisines: [value] };
    case "date":
      return { dateFrom: value, dateTo: value };
    case "payment":
      return { paymentMethods: [value] };
  }
}

const ROW_KEY_TO_FILTER: Partial<Record<string, keyof DashboardFilters>> = {
  brand: "brands",
  location: "locations",
  channel: "channels",
  cuisine: "cuisines",
};

/**
 * Table rows are plain aggregation results (e.g. { brand, cuisine, netSales, ... })
 * that already carry the real, unformatted dimension name as a key — no
 * per-table config needed, just check for the keys we know how to filter by.
 */
export function filterFromTableRow(row: Record<string, string | number>): Partial<DashboardFilters> {
  const override: Record<string, string[]> = {};
  for (const [rowKey, filterKey] of Object.entries(ROW_KEY_TO_FILTER)) {
    const value = row[rowKey];
    if (typeof value === "string" && value) {
      override[filterKey as string] = [value];
    }
  }
  return override;
}

/**
 * Whether a table's rows carry any dimension filterFromTableRow actually
 * knows how to turn into a filter (brand/location/channel/cuisine). Tables
 * keyed by something else — e.g. "Most 86'd Items" (item name), "Cancellation
 * Reasons" (reason), or a date/month/quarter breakdown — have no matching
 * DashboardFilters field, so drilling through them silently opened a modal
 * scoped to nothing but the *global* filters already in effect: it looked
 * like item-specific data but was actually just unfiltered sales. Used to
 * gate whether a table's rows should be clickable at all, rather than
 * offering a "drill through" that quietly does nothing useful.
 */
export function isDrillableTable(spec: TableSpec): boolean {
  return spec.columns.some((c) => c.key in ROW_KEY_TO_FILTER);
}
