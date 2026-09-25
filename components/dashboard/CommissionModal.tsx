"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { CommissionSettings } from "@/lib/types";

interface Props {
  settings: CommissionSettings;
  onClose: () => void;
  onSaved: () => void;
}

export function CommissionModal({ settings, onClose, onSaved }: Props) {
  const { channel } = settings;
  const [rate, setRate] = useState(String(settings.currentCommissionRate));
  const [deliveryChargeRate, setDeliveryChargeRate] = useState(String(settings.currentDeliveryChargeRate));
  const [perOrderFee, setPerOrderFee] = useState(String(settings.currentPerOrderFee));
  const [perOrderFeeMinOrder, setPerOrderFeeMinOrder] = useState(String(settings.currentPerOrderFeeMinOrder));
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
      setError("Enter a delivery / payment fee between 0 and 100");
      return;
    }
    const parsedFee = Number(perOrderFee);
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      setError("Enter a per-order fee of 0 or more");
      return;
    }
    const parsedMinOrder = Number(perOrderFeeMinOrder);
    if (!Number.isFinite(parsedMinOrder) || parsedMinOrder < 0) {
      setError("Enter a minimum order value of 0 or more");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          commissionRate: parsed,
          deliveryChargeRate: parsedDelivery,
          perOrderFee: parsedFee,
          perOrderFeeMinOrder: parsedMinOrder,
        }),
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

  const labelGap = { marginTop: "var(--space-3)" };
  const hint = { marginTop: "var(--space-2)", fontSize: "0.85em", color: "var(--color-text-muted)" };

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
          <label className="invoice-label" htmlFor="delivery-charge-rate-input" style={labelGap}>
            Delivery / payment fee (%)
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
          <div style={hint}>Both % rates are deducted from net sales as a combined commission.</div>
          <label className="invoice-label" htmlFor="per-order-fee-input" style={labelGap}>
            Per-order fee (AED)
          </label>
          <input
            id="per-order-fee-input"
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={perOrderFee}
            onChange={(e) => setPerOrderFee(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <label className="invoice-label" htmlFor="per-order-fee-min-input" style={labelGap}>
            …only on orders of at least (AED, after discounts)
          </label>
          <input
            id="per-order-fee-min-input"
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={perOrderFeeMinOrder}
            onChange={(e) => setPerOrderFeeMinOrder(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div style={hint}>A flat fee per completed order, e.g. Talabat Pro&apos;s AED 4 on orders of AED 30+. Use 0 for none.</div>
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
