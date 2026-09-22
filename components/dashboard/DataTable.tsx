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

export function DataTable({ spec, onRowClick }: Props) {
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
                  <td key={c.key} className={c.align === "right" ? "num" : undefined}>
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
