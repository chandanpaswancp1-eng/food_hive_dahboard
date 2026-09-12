"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

interface Props {
  channel: string;
  currentRate: number;
  onClose: () => void;
  onSaved: () => void;
}

export function CommissionModal({ channel, currentRate, onClose, onSaved }: Props) {
  const [rate, setRate] = useState(String(currentRate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("Enter a commission rate between 0 and 100");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, commissionRate: parsed }),
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
