"use client";

import { CheckCircle2, Circle, AlertCircle, Loader2, Download, RefreshCw } from "lucide-react";
import type { AlertsPayload, PortalStatusPayload, SyncStatusPayload, TabId } from "@/lib/types";
import { TAB_LABELS, TAB_SUBTITLES } from "@/lib/types";
import { fmtTimeGst } from "@/lib/format";
import { PortalStatusStrip } from "./PortalStatusStrip";
import { AlertCenter } from "./AlertCenter";

interface Props {
  sync: SyncStatusPayload | null;
  portalStatus: PortalStatusPayload | null;
  alerts: AlertsPayload | null;
  onExport: () => void;
  onManualSync: () => void;
  manualSyncing: boolean;
  importMessage?: string | null;
  activeTab: TabId;
}

export function Header({ sync, portalStatus, alerts, onExport, onManualSync, manualSyncing, importMessage, activeTab }: Props) {
  const mode = sync?.mode ?? "none";
  const source = sync?.source ?? null;
  const healthy = sync?.healthy ?? null;

  // A stale automated GrubCenter agent must stay visible here even when a
  // recent manual CSV import would otherwise make "mode" look perfectly
  // healthy — otherwise a broken agent can hide behind a one-off upload.
  let label: string;
  let iconClass: "live" | "stale" | "local" | "error" | "none";
  if (mode === "none") {
    label = "No data yet";
    iconClass = "none";
  } else if (mode === "local") {
    label = "Importing…";
    iconClass = "local";
  } else if (mode === "error") {
    label = source === "grubcenter-live" ? "Live sync failed" : "Last import failed";
    iconClass = "error";
  } else if (source === "grubcenter-live") {
    label = healthy ? "Live" : "Live sync stale";
    iconClass = healthy ? "live" : "stale";
  } else {
    label = healthy === false ? "Manual import · live sync stale" : "Manual import";
    iconClass = healthy === false ? "stale" : "live";
  }

  const Icon =
    iconClass === "live"
      ? CheckCircle2
      : iconClass === "local"
        ? Loader2
        : iconClass === "stale" || iconClass === "error"
          ? AlertCircle
          : Circle;

  return (
    <header className="app-header">
      <div className="header-title-block">
        <h2 className="header-title">{TAB_LABELS[activeTab]}</h2>
        <p className="header-subtitle">{TAB_SUBTITLES[activeTab]}</p>
      </div>
      <div className="header-actions">
        <AlertCenter status={alerts} />
        <PortalStatusStrip status={portalStatus} />
        <div className="sync-pill" title={sync?.message ?? undefined}>
          <Icon className={`sync-icon ${iconClass}`} size={14} />
          <span>{label}</span>
          {sync?.lastSyncedAt && <span>· {fmtTimeGst(sync.lastSyncedAt)}</span>}
        </div>
        <button
          className="btn btn-secondary btn-icon-only"
          onClick={onManualSync}
          disabled={manualSyncing}
          title="Sync now"
          aria-label="Sync now"
        >
          <RefreshCw size={14} className={manualSyncing ? "spin" : undefined} />
        </button>
        {importMessage && <span className="panel-caption">{importMessage}</span>}
        <button className="btn btn-secondary" onClick={onExport}>
          <Download size={14} />
          Export CSV
        </button>
      </div>
    </header>
  );
}
