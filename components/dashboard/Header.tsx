"use client";

import type { SyncStatusPayload } from "@/lib/types";

interface Props {
  sync: SyncStatusPayload | null;
  onImport: (file: File) => void;
  onExport: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  importing: boolean;
  importMessage?: string | null;
}

export function Header({ sync, onImport, onExport, onRefresh, refreshing, importing, importMessage }: Props) {
  const dotClass =
    sync?.mode === "live" ? "live" : sync?.mode === "error" ? "error" : sync?.mode === "local" ? "local" : "";
  const label =
    sync?.mode === "live"
      ? "Grubtech · live"
      : sync?.mode === "error"
        ? "Grubcenter unreachable · local"
        : sync?.mode === "local"
          ? "Syncing…"
          : "Local feed";

  return (
    <header className="app-header">
      <div>
        <div className="wordmark">FOODHIVE</div>
        <div className="wordmark-sub">Operations Dashboard</div>
      </div>
      <div className="header-actions">
        <div className="sync-pill">
          <span className={`sync-dot ${dotClass}`} />
          <span>{label}</span>
          {sync?.lastSyncedAt && <span>· {new Date(sync.lastSyncedAt).toLocaleTimeString()}</span>}
        </div>
        {importMessage && <span className="panel-caption">{importMessage}</span>}
        <label className="btn btn-secondary">
          {importing ? "Importing…" : "Import CSV / Excel"}
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && !importing) onImport(file);
              e.target.value = "";
            }}
          />
        </label>
        <button className="btn btn-secondary" onClick={onExport}>
          Export CSV
        </button>
        <button className="btn btn-primary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Syncing…" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
