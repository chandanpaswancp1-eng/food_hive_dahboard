"use client";

import { SearchX } from "lucide-react";
import type { TableSpec } from "@/lib/types";
import { statusToneFor } from "@/lib/statusBadge";

interface Props {
  spec: TableSpec;
  onRowClick?: (row: Record<string, string | number>) => void;
}

function renderCell(key: string, value: string | number) {
  if (key.toLowerCase() === "status" && typeof value === "string") {
    return <span className={`status-badge status-${statusToneFor(value)}`}>{value}</span>;
  }
  return value;
}

/** Shading for a heatmap cell — a tint of the theme's primary color, up to 60% at the table's max. */
function heatStyle(value: string | number, max: number): React.CSSProperties | undefined {
  if (typeof value !== "number" || max <= 0 || value <= 0) return undefined;
  return { background: `color-mix(in srgb, var(--color-primary) ${Math.round((value / max) * 60)}%, transparent)` };
}

export function DataTable({ spec, onRowClick }: Props) {
  const heatColumns = new Set(spec.heatmap?.columns);
  let heatMax = 0;
  for (const row of spec.rows) {
    for (const key of heatColumns) {
      const v = row[key];
      if (typeof v === "number" && v > heatMax) heatMax = v;
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{spec.title}</div>
        {onRowClick && <span className="panel-caption">Click a row to drill through</span>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {spec.columns.map((c) => (
                <th key={c.key} className={c.align === "right" ? "num" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row, i) => (
              <tr key={i} className={onRowClick ? "clickable" : undefined} onClick={() => onRowClick?.(row)}>
                {spec.columns.map((c) => (
                  <td
                    key={c.key}
                    className={c.align === "right" ? "num" : undefined}
                    style={heatColumns.has(c.key) ? heatStyle(row[c.key], heatMax) : undefined}
                  >
                    {renderCell(c.key, row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {spec.footerRow && spec.rows.length > 0 && (
            <tfoot>
              <tr>
                {spec.columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "num" : undefined}>
                    {spec.footerRow![c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!spec.rows.length && (
        <div className="empty-state">
          <SearchX size={28} />
          No data for the selected filters.
        </div>
      )}
    </div>
  );
}
