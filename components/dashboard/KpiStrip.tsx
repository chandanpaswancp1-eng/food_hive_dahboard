import { Pencil } from "lucide-react";
import type { DashboardFilters, KpiValue, TabId } from "@/lib/types";
import { Sparkline } from "./Sparkline";

interface Props {
  kpis: KpiValue[];
  activeTab: TabId;
  onDrill?: (filter: Partial<DashboardFilters>, tabOverride?: TabId) => void;
  onEditCommission?: (channel: string, currentCommissionRate: number, currentDeliveryChargeRate: number) => void;
}

export function KpiStrip({ kpis, onDrill, onEditCommission }: Props) {
  const renderCell = (k: KpiValue) => {
    const isDrillable = Boolean(onDrill && (k.drillTab || k.drillFilter));

    return (
      <div
        className={`kpi-cell${isDrillable ? " kpi-clickable" : ""}`}
        key={k.key}
        role={isDrillable ? "button" : undefined}
        tabIndex={isDrillable ? 0 : undefined}
        title={isDrillable ? `${k.fullValue ?? k.value} — click for order details` : (k.fullValue ?? k.value)}
        onClick={isDrillable ? () => onDrill!(k.drillFilter ?? {}, k.drillTab) : undefined}
        onKeyDown={
          isDrillable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDrill!(k.drillFilter ?? {}, k.drillTab);
                }
              }
            : undefined
        }
      >
        {k.editCommission && onEditCommission && (
          <button
            type="button"
            className="kpi-edit-btn"
            title="Edit commission %"
            onClick={(e) => {
              e.stopPropagation();
              onEditCommission(
                k.editCommission!.channel,
                k.editCommission!.currentCommissionRate,
                k.editCommission!.currentDeliveryChargeRate,
              );
            }}
          >
            <Pencil size={12} />
          </button>
        )}
        <div className="kpi-body">
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value-row">
            <div className={`kpi-value${k.accent ? " accent" : ""}`}>{k.value}</div>
            {k.trend && (
              <span className={`kpi-trend-pill${k.trend.pct < 0 ? " down" : ""}`}>
                {k.trend.pct >= 0 ? "▲" : "▼"} {Math.abs(k.trend.pct).toFixed(1)}%
              </span>
            )}
          </div>
          {/* Exact figure behind a compacted value (e.g. "AED 5.2K")
              shown outright — a hover-only tooltip is invisible on
              touch devices, where there's no hover at all. */}
          {k.fullValue && k.fullValue !== k.value && <div className="kpi-full-value">{k.fullValue}</div>}
          {k.subtitle && <div className="kpi-subtitle">{k.subtitle}</div>}
        </div>
        {k.sparkline && k.sparkline.length > 1 && <Sparkline values={k.sparkline} />}
      </div>
    );
  };

  // Consecutive cards with the same `group` are wrapped together so the grid
  // treats them as one unit and never splits them across two rows.
  const chunks: { group?: string; cells: KpiValue[] }[] = [];
  kpis.forEach((k) => {
    const last = chunks[chunks.length - 1];
    if (k.group && last?.group === k.group) last.cells.push(k);
    else chunks.push({ group: k.group, cells: [k] });
  });

  return (
    <div className="kpi-strip">
      {chunks.map((c) =>
        c.group ? (
          <div className="kpi-group" key={c.group}>
            {c.cells.map(renderCell)}
          </div>
        ) : (
          renderCell(c.cells[0])
        ),
      )}
    </div>
  );
}
