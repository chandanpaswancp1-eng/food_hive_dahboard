import type { KpiValue } from "@/lib/types";

export function KpiStrip({ kpis }: { kpis: KpiValue[] }) {
  return (
    <div className="kpi-strip">
      {kpis.map((k) => (
        <div className="kpi-cell" key={k.key}>
          <div className="kpi-label">{k.label}</div>
          <div className={`kpi-value${k.accent ? " accent" : ""}`}>{k.value}</div>
          {k.subtitle && <div className="kpi-subtitle">{k.subtitle}</div>}
        </div>
      ))}
    </div>
  );
}
