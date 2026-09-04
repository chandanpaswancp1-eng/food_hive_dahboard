"use client";

import type { SyncStatusPayload } from "@/lib/types";

interface Props {
  sync: SyncStatusPayload | null;
  onExport: () => void;
  importMessage?: string | null;
}

export function Header({ sync, onExport, importMessage }: Props) {
  const dotClass =
    sync?.mode === "live" ? "live" : sync?.mode === "error" ? "error" : sync?.mode === "local" ? "local" : "";
  const label =
    sync?.mode === "live"
      ? "Data imported"
      : sync?.mode === "error"
        ? "Last import failed"
        : sync?.mode === "local"
          ? "Importing…"
          : "No data yet";

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
        <button className="btn btn-secondary" onClick={onExport}>
          Export CSV
        </button>
      </div>
    </header>
  );
}
