"use client";

import { KpiStrip } from "./KpiStrip";
import { ChartPanel } from "./ChartPanel";
import { DataTable } from "./DataTable";
import type { DashboardFilters, TabPayload } from "@/lib/types";
import { filterFromTableRow } from "@/lib/drillthrough";

interface Props {
  payload: TabPayload | null;
  loading: boolean;
  onDrill: (filter: Partial<DashboardFilters>) => void;
}

export function DashboardTabView({ payload, loading, onDrill }: Props) {
  if (loading || !payload) {
    return <div className="empty-state">Loading feed…</div>;
  }

  return (
    <>
      <KpiStrip kpis={payload.kpis} />
      <div className="chart-grid">
        {payload.charts.map((chart) => (
          <ChartPanel key={chart.id} spec={chart} onSlice={onDrill} />
        ))}
      </div>
      <DataTable spec={payload.table} onRowClick={(row) => onDrill(filterFromTableRow(row))} />
    </>
  );
}
