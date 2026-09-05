"use client";

import { useEffect, useState } from "react";
import type { DashboardFilters, DrillThroughRow } from "@/lib/types";
import { fmtDateTimeGst } from "@/lib/format";

interface Props {
  filters: DashboardFilters;
  scope: Partial<DashboardFilters>;
  onClose: () => void;
}

function toParams(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  filters.brands?.forEach((v) => params.append("brand", v));
  filters.cuisines?.forEach((v) => params.append("cuisine", v));
  filters.locations?.forEach((v) => params.append("location", v));
  filters.channels?.forEach((v) => params.append("channel", v));
  filters.paymentMethods?.forEach((v) => params.append("payment", v));
  return params.toString();
}

/** A short human-readable label for whatever the scope override narrows to, e.g. "Manoushe Street". */
function describeScope(scope: Partial<DashboardFilters>): string | null {
  const parts = [
    ...(scope.brands ?? []),
    ...(scope.cuisines ?? []),
    ...(scope.locations ?? []),
    ...(scope.channels ?? []),
  ];
  if (scope.dateFrom && scope.dateFrom === scope.dateTo) parts.push(scope.dateFrom);
  return parts.length ? parts.join(" · ") : null;
}

export function DrillThroughModal({ filters, scope, onClose }: Props) {
  const [rows, setRows] = useState<DrillThroughRow[]>([]);
  const [loading, setLoading] = useState(true);
  const effectiveFilters: DashboardFilters = { ...filters, ...scope };
  const scopeLabel = describeScope(scope);
  // effectiveFilters is a fresh object every render — key the effect off its
  // serialized query instead, so it only re-fetches when the query actually changes.
  const queryKey = toParams(effectiveFilters);

  useEffect(() => {
    // No setLoading(true) here: the modal always mounts fresh per open (page.tsx
    // conditionally renders it), so the initial `useState(true)` already covers it.
    let cancelled = false;
    fetch(`/api/orders?${queryKey}`)
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
            <div className="badge">Drill-through</div>
            <h4>
              {scopeLabel ? `${scopeLabel} — ` : ""}
              {rows.length} orders
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
                  <th>Order</th>
                  <th>Date</th>
                  <th>Brand</th>
                  <th>Location</th>
                  <th>Channel</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="num">Net</th>
                  <th className="num">Prep</th>
                  <th className="num">Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.orderNumber}</td>
                    <td>{fmtDateTimeGst(r.receivedAt)}</td>
                    <td>{r.brand}</td>
                    <td>{r.location}</td>
                    <td>{r.channel}</td>
                    <td>{r.paymentMethod ?? "—"}</td>
                    <td>{r.status}</td>
                    <td className="num">{r.netSales.toFixed(0)}</td>
                    <td className="num">{r.actualPrepTime?.toFixed(1) ?? "—"}</td>
                    <td className="num">{r.rating ?? "—"}</td>
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
