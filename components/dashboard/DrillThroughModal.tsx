"use client";

import { useEffect, useState } from "react";
import type { DashboardFilters, DrillThroughRow } from "@/lib/types";

interface Props {
  filters: DashboardFilters;
  onClose: () => void;
}

function toParams(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  filters.brands?.forEach((v) => params.append("brand", v));
  filters.locations?.forEach((v) => params.append("location", v));
  filters.channels?.forEach((v) => params.append("channel", v));
  filters.paymentMethods?.forEach((v) => params.append("payment", v));
  return params.toString();
}

export function DrillThroughModal({ filters, onClose }: Props) {
  const [rows, setRows] = useState<DrillThroughRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orders?${toParams(filters)}`)
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
  }, [filters]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="badge">Drill-through</div>
            <h4>{rows.length} orders in current scope</h4>
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
                    <td>{new Date(r.receivedAt).toLocaleString()}</td>
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
