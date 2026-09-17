"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

interface Props {
  channel: string;
  currentRate: number;
  currentDeliveryChargeRate: number;
  onClose: () => void;
  onSaved: () => void;
}

export function CommissionModal({ channel, currentRate, currentDeliveryChargeRate, onClose, onSaved }: Props) {
  const [rate, setRate] = useState(String(currentRate));
  const [deliveryChargeRate, setDeliveryChargeRate] = useState(String(currentDeliveryChargeRate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("Enter a commission rate between 0 and 100");
      return;
    }
    const parsedDelivery = Number(deliveryChargeRate);
    if (!Number.isFinite(parsedDelivery) || parsedDelivery < 0 || parsedDelivery > 100) {
      setError("Enter a delivery charge rate between 0 and 100");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, commissionRate: parsed, deliveryChargeRate: parsedDelivery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to save commission rate");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Failed to save commission rate");
      setSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="badge">Commission</div>
            <h4>{channel}</h4>
          </div>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <label className="invoice-label" htmlFor="commission-rate-input">
            Commission rate (%)
          </label>
          <input
            id="commission-rate-input"
            className="input"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <label className="invoice-label" htmlFor="delivery-charge-rate-input" style={{ marginTop: "var(--space-3)" }}>
            Delivery charge rate (%)
          </label>
          <input
            id="delivery-charge-rate-input"
            className="input"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={deliveryChargeRate}
            onChange={(e) => setDeliveryChargeRate(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div style={{ marginTop: "var(--space-2)", fontSize: "0.85em", color: "var(--color-text-muted)" }}>
            Both are deducted from net sales as a combined commission.
          </div>
          {error && <div className="empty-state">{error}</div>}
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
