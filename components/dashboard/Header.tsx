"use client";

import { CheckCircle2, Circle, AlertCircle, Loader2, Download } from "lucide-react";
import type { SyncStatusPayload, TabId } from "@/lib/types";
import { TAB_LABELS } from "@/lib/types";
import { fmtTimeGst } from "@/lib/format";

interface Props {
  sync: SyncStatusPayload | null;
  onExport: () => void;
  importMessage?: string | null;
  activeTab: TabId;
}

export function Header({ sync, onExport, importMessage, activeTab }: Props) {
  const mode = sync?.mode ?? "none";
  const label =
    mode === "live"
      ? "Data imported"
      : mode === "error"
        ? "Last import failed"
        : mode === "local"
          ? "Importing…"
          : "No data yet";

  const Icon = mode === "live" ? CheckCircle2 : mode === "error" ? AlertCircle : mode === "local" ? Loader2 : Circle;

  return (
    <header className="app-header">
      <h2 className="header-title">{TAB_LABELS[activeTab]}</h2>
      <div className="header-actions">
        <div className="sync-pill">
          <Icon className={`sync-icon ${mode}`} size={14} />
          <span>{label}</span>
          {sync?.lastSyncedAt && <span>· {fmtTimeGst(sync.lastSyncedAt)}</span>}
        </div>
        {importMessage && <span className="panel-caption">{importMessage}</span>}
        <button className="btn btn-secondary" onClick={onExport}>
          <Download size={14} />
          Export CSV
        </button>
      </div>
    </header>
  );
}
