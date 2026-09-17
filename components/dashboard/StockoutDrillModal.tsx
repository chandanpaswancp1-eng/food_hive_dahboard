"use client";

import { useEffect, useState } from "react";
import type { DashboardFilters, StockoutEpisode } from "@/lib/types";
import { fmtDateTimeGst, fmtMinutes } from "@/lib/format";

interface Props {
  item: string;
  filters: DashboardFilters;
  onClose: () => void;
}

function toParams(item: string, filters: DashboardFilters): string {
  const params = new URLSearchParams();
  params.set("item", item);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  filters.brands?.forEach((v) => params.append("brand", v));
  filters.locations?.forEach((v) => params.append("location", v));
  filters.channels?.forEach((v) => params.append("channel", v));
  return params.toString();
}

/**
 * The "Most 86'd Items" table's real drill-through — there's no "filter
 * orders by item" dimension (see lib/drillthrough.ts's isDrillableTable), so
 * unlike DrillThroughModal this shows the item's own 86'd-episode history
 * (StockoutEvent rows) rather than sales/orders.
 */
export function StockoutDrillModal({ item, filters, onClose }: Props) {
  const [rows, setRows] = useState<StockoutEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const queryKey = toParams(item, filters);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stockouts/events?${queryKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRows(data.rows ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="badge">86&rsquo;d episode history</div>
            <h4>
              {item} — {rows.length} episode{rows.length === 1 ? "" : "s"}
            </h4>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Location</th>
                  <th>Unavailable Since</th>
                  <th>Restored</th>
                  <th className="num">Duration</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.brand}</td>
                    <td>{r.location}</td>
                    <td>{fmtDateTimeGst(r.markedUnavailableAt)}</td>
                    <td>
                      {r.restoredAt ? fmtDateTimeGst(r.restoredAt) : <span className="still-open-tag">Still 86&rsquo;d</span>}
                    </td>
                    <td className="num">{fmtMinutes(r.durationMinutes)}</td>
                    <td>{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
