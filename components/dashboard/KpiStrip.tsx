import type { CSSProperties } from "react";
import type { KpiValue, TabId } from "@/lib/types";
import { TAB_ICONS } from "@/lib/tabIcons";

// Rotates non-danger KPI cards through the brand's accent hues so the strip
// reads as colourful rather than one repeated tint.
const TONE_CYCLE: { border: string; bg: string; fg: string }[] = [
  { border: "var(--primary-500)", bg: "var(--primary-100)", fg: "var(--primary-700)" },
  { border: "var(--secondary-500)", bg: "var(--secondary-100)", fg: "var(--secondary-700)" },
  { border: "var(--tertiary-500)", bg: "var(--tertiary-100)", fg: "var(--tertiary-700)" },
  { border: "var(--success-500)", bg: "var(--success-100)", fg: "var(--success-700)" },
];

export function KpiStrip({ kpis, activeTab }: { kpis: KpiValue[]; activeTab: TabId }) {
  const Icon = TAB_ICONS[activeTab];

  return (
    <div className="kpi-strip">
      {kpis.map((k, i) => {
        const tone = k.accent
          ? { border: "var(--danger-500)", bg: "var(--danger-100)", fg: "var(--danger-700)" }
          : TONE_CYCLE[i % TONE_CYCLE.length];

        return (
          <div
            className="kpi-cell"
            key={k.key}
            style={
              {
                "--kpi-border": tone.border,
                "--kpi-badge-bg": tone.bg,
                "--kpi-badge-fg": tone.fg,
              } as CSSProperties
            }
          >
            <div className="kpi-icon-badge">
              <Icon size={18} />
            </div>
            <div className="kpi-body">
              <div className="kpi-label">{k.label}</div>
              <div className={`kpi-value${k.accent ? " accent" : ""}`} title={k.value}>
                {k.value}
              </div>
              {k.subtitle && <div className="kpi-subtitle">{k.subtitle}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
