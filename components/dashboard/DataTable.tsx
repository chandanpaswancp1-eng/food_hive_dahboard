"use client";

import { SearchX } from "lucide-react";
import type { TableSpec } from "@/lib/types";

interface Props {
  spec: TableSpec;
  onRowClick?: (row: Record<string, string | number>) => void;
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
              <tr key={i} onClick={() => onRowClick?.(row)}>
                {spec.columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "num" : undefined}>
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
