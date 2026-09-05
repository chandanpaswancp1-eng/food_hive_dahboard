"use client";

import { Inbox } from "lucide-react";
import { KpiStrip } from "./KpiStrip";
import { ChartPanel } from "./ChartPanel";
import { DataTable } from "./DataTable";
import { TabImportButton } from "./TabImportButton";
import type { DashboardFilters, ReportTypeHint, TabId, TabPayload } from "@/lib/types";
import { filterFromTableRow } from "@/lib/drillthrough";

interface Props {
  payload: TabPayload | null;
  loading: boolean;
  activeTab: TabId;
  importing: boolean;
  onImport: (file: File, hint?: ReportTypeHint) => void;
  onDrill: (filter: Partial<DashboardFilters>) => void;
}

export function DashboardTabView({ payload, loading, activeTab, importing, onImport, onDrill }: Props) {
  return (
    <>
      <div className="tab-toolbar">
        <TabImportButton tab={activeTab} importing={importing} onImport={onImport} />
      </div>
      {loading || !payload ? (
        <div className="empty-state">
          <Inbox size={32} />
          Loading feed…
        </div>
      ) : (
        <>
          <KpiStrip kpis={payload.kpis} activeTab={activeTab} />
          <div className="chart-grid">
            {payload.charts.map((chart) => (
              <ChartPanel key={chart.id} spec={chart} onSlice={onDrill} />
            ))}
          </div>
          <DataTable spec={payload.table} onRowClick={(row) => onDrill(filterFromTableRow(row))} />
          {payload.extraTables?.map((spec) => (
            <DataTable key={spec.title} spec={spec} onRowClick={(row) => onDrill(filterFromTableRow(row))} />
          ))}
        </>
      )}
    </>
  );
}
