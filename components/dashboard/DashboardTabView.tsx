"use client";

import { KpiStrip } from "./KpiStrip";
import { ChartPanel } from "./ChartPanel";
import { DataTable } from "./DataTable";
import type { TabPayload } from "@/lib/types";

interface Props {
  payload: TabPayload | null;
  loading: boolean;
  onRowClick: () => void;
}

export function DashboardTabView({ payload, loading, onRowClick }: Props) {
  if (loading || !payload) {
    return <div className="empty-state">Loading feed…</div>;
  }

  return (
    <>
      <KpiStrip kpis={payload.kpis} />
      <div className="chart-grid">
        {payload.charts.map((chart) => (
          <ChartPanel key={chart.id} spec={chart} />
        ))}
      </div>
      <DataTable spec={payload.table} onRowClick={onRowClick} />
    </>
  );
}
