import type { CSSProperties } from "react";
import { Pencil } from "lucide-react";
import type { DashboardFilters, KpiValue, TabId } from "@/lib/types";
import { TAB_ICONS } from "@/lib/tabIcons";

// Rotates non-danger KPI cards through the brand's accent hues so the strip
// reads as colourful rather than one repeated tint. Five distinct hues (not
// four) so a full 8-9 card tab (e.g. Order Details) doesn't repeat the same
// colour on an adjacent card two rows down — e.g. Gross Sales and Total
// Discount previously both landed on tone 0 (primary/gold).
const TONE_CYCLE: { border: string; bg: string; fg: string }[] = [
  { border: "var(--primary-500)", bg: "var(--primary-100)", fg: "var(--primary-700)" },
  { border: "var(--secondary-500)", bg: "var(--secondary-100)", fg: "var(--secondary-700)" },
  { border: "var(--tertiary-500)", bg: "var(--tertiary-100)", fg: "var(--tertiary-700)" },
  { border: "var(--success-500)", bg: "var(--success-100)", fg: "var(--success-700)" },
  { border: "var(--info-500)", bg: "var(--info-100)", fg: "var(--info-700)" },
];

interface Props {
  kpis: KpiValue[];
  activeTab: TabId;
  onDrill?: (filter: Partial<DashboardFilters>, tabOverride?: TabId) => void;
  onEditCommission?: (channel: string, currentRate: number) => void;
}

export function KpiStrip({ kpis, activeTab, onDrill, onEditCommission }: Props) {
  const Icon = TAB_ICONS[activeTab];

  return (
    <div className="kpi-strip">
      {kpis.map((k, i) => {
        const tone = k.accent
          ? { border: "var(--danger-500)", bg: "var(--danger-100)", fg: "var(--danger-700)" }
          : TONE_CYCLE[i % TONE_CYCLE.length];
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
            style={
              {
                "--kpi-border": tone.border,
                "--kpi-badge-bg": tone.bg,
                "--kpi-badge-fg": tone.fg,
              } as CSSProperties
            }
          >
            {k.editCommission && onEditCommission && (
              <button
                type="button"
                className="kpi-edit-btn"
                title="Edit commission %"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditCommission(k.editCommission!.channel, k.editCommission!.currentRate);
                }}
              >
                <Pencil size={12} />
              </button>
            )}
            <div className="kpi-icon-badge">
              <Icon size={18} />
            </div>
            <div className="kpi-body">
              <div className="kpi-label">{k.label}</div>
              <div className={`kpi-value${k.accent ? " accent" : ""}`}>{k.value}</div>
              {/* Exact figure behind a compacted value (e.g. "AED 5.2K")
                  shown outright — a hover-only tooltip is invisible on
                  touch devices, where there's no hover at all. */}
              {k.fullValue && k.fullValue !== k.value && <div className="kpi-full-value">{k.fullValue}</div>}
              {k.subtitle && <div className="kpi-subtitle">{k.subtitle}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
