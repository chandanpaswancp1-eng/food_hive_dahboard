"use client";

import { Inbox } from "lucide-react";
import { KpiStrip } from "./KpiStrip";
import { ChartPanel } from "./ChartPanel";
import { DataTable } from "./DataTable";
import { TabImportButton } from "./TabImportButton";
import { MonthPicker } from "./MonthPicker";
import type { DashboardFilters, FilterOptions, ReportTypeHint, TabId, TabPayload, TableSpec } from "@/lib/types";
import { filterFromTableRow, isDrillableTable } from "@/lib/drillthrough";

interface Props {
  payload: TabPayload | null;
  loading: boolean;
  activeTab: TabId;
  filters: DashboardFilters;
  options: FilterOptions | null;
  todayGst: string | null;
  onFiltersChange: (next: DashboardFilters) => void;
  importing: boolean;
  onImport: (file: File, hint?: ReportTypeHint) => void;
  onDrill: (filter: Partial<DashboardFilters>, tabOverride?: TabId) => void;
  onItemDrill: (item: string) => void;
  onEditCommission?: (channel: string, currentCommissionRate: number, currentDeliveryChargeRate: number) => void;
}

/**
 * A table drills through one of two ways: into filtered orders (when its
 * rows carry a brand/location/channel/cuisine dimension) or, for a table
 * marked with itemDrillKey (e.g. "Most 86'd Items"), into that item's own
 * StockoutDrillModal — there's no "filter orders by item" dimension to use
 * instead. Tables with neither aren't meaningfully clickable at all.
 */
function rowClickHandlerFor(
  spec: TableSpec,
  onDrill: (filter: Partial<DashboardFilters>) => void,
  onItemDrill: (item: string) => void,
): ((row: Record<string, string | number>) => void) | undefined {
  if (spec.itemDrillKey) {
    const key = spec.itemDrillKey;
    return (row) => onItemDrill(String(row[key]));
  }
  if (isDrillableTable(spec)) {
    return (row) => onDrill(filterFromTableRow(row));
  }
  return undefined;
}

export function DashboardTabView({
  payload,
  loading,
  activeTab,
  filters,
  options,
  todayGst,
  onFiltersChange,
  importing,
  onImport,
  onDrill,
  onItemDrill,
  onEditCommission,
}: Props) {
  return (
    <>
      <div className="tab-toolbar">
        {activeTab === "weekly" && (
          <MonthPicker filters={filters} months={options?.months ?? []} todayGst={todayGst} onChange={onFiltersChange} />
        )}
        <TabImportButton tab={activeTab} importing={importing} onImport={onImport} />
      </div>
      {loading || !payload ? (
        <div className="empty-state">
          <Inbox size={32} />
          Loading feed…
        </div>
      ) : (
        <>
          <KpiStrip kpis={payload.kpis} activeTab={activeTab} onDrill={onDrill} onEditCommission={onEditCommission} />
          <div className="chart-grid">
            {payload.charts.map((chart) => (
              <ChartPanel key={chart.id} spec={chart} onSlice={onDrill} />
            ))}
          </div>
          <DataTable spec={payload.table} onRowClick={rowClickHandlerFor(payload.table, onDrill, onItemDrill)} />
          {payload.extraTables?.map((spec) => (
            <DataTable key={spec.title} spec={spec} onRowClick={rowClickHandlerFor(spec, onDrill, onItemDrill)} />
          ))}
        </>
      )}
    </>
  );
}
