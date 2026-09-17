"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, AlertCircle, AlertTriangle, X } from "lucide-react";
import type { AlertItem, AlertsPayload } from "@/lib/types";
import { fmtTimeGst } from "@/lib/format";

interface Props {
  status: AlertsPayload | null;
}

const TOAST_DISMISS_MS = 8_000;
const NOTIFY_PREF_KEY = "foodhive.browserAlertsEnabled";

function readNotifyPref(): boolean {
  try {
    return (
      localStorage.getItem(NOTIFY_PREF_KEY) === "1" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

/**
 * Global alert surface for two independent conditions — a portal/branch
 * closed, or an item marked 86'd — that need to be visible no matter which
 * of the 6 dashboard tabs is open. Mounted once in app/page.tsx, polled on
 * the same retryTick cadence as everything else there.
 */
export function AlertCenter({ status }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<AlertItem[]>([]);
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(() =>
    typeof window === "undefined" ? false : readNotifyPref(),
  );
  const seenIds = useRef<Set<string> | null>(null);
  const originalTitle = useRef<string | null>(null);
  const flashInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTitleFlash = useCallback(() => {
    if (flashInterval.current) {
      clearInterval(flashInterval.current);
      flashInterval.current = null;
      if (originalTitle.current) document.title = originalTitle.current;
    }
  }, []);

  const startTitleFlash = useCallback((count: number) => {
    if (flashInterval.current) return;
    originalTitle.current = document.title;
    let flipped = false;
    flashInterval.current = setInterval(() => {
      document.title = flipped ? originalTitle.current! : `(${count}) ${originalTitle.current}`;
      flipped = !flipped;
    }, 1_000);
  }, []);

  // Detect ids that are new since the last poll — the one id-diffing pattern
  // this app needed and didn't have yet. seenIds starts null so the very
  // first payload (whatever's already active on load) never floods toasts.
  useEffect(() => {
    if (!status) return;
    const currentIds = new Set(status.alerts.map((a) => a.id));

    if (seenIds.current !== null) {
      const fresh = status.alerts.filter((a) => !seenIds.current!.has(a.id));
      if (fresh.length > 0) {
        setToasts((prev) => [...fresh, ...prev]);
        fresh.forEach((alert) => {
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== alert.id));
          }, TOAST_DISMISS_MS);
        });
        if (notifyEnabled) {
          fresh.forEach((alert) => {
            try {
              new Notification(alert.title, { body: alert.detail });
            } catch {
              // Notification can throw in some embedded/insecure contexts — the in-app toast already covers it.
            }
          });
        }
        if (document.visibilityState !== "visible") startTitleFlash(fresh.length);
      }
    }
    seenIds.current = currentIds;
    setDismissed((prev) => {
      // Clear dismissals for alerts that resolved and went away, so if the
      // same id reappears later it toasts/lists again instead of staying
      // silently hidden forever.
      const next = new Set([...prev].filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [status, notifyEnabled, startTitleFlash]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") stopTitleFlash();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stopTitleFlash();
    };
  }, [stopTitleFlash]);

  async function enableBrowserAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setNotifyEnabled(enabled);
    try {
      localStorage.setItem(NOTIFY_PREF_KEY, enabled ? "1" : "0");
    } catch {
      // Best-effort only — a blocked/private-mode localStorage just means we re-ask next session.
    }
  }

  const active = (status?.alerts ?? []).filter((a) => !dismissed.has(a.id));
  const dangerCount = active.filter((a) => a.severity === "danger").length;
  const count = active.length;

  return (
    <>
      <div className="alert-bell">
        <button
          className="btn btn-secondary btn-icon-only"
          onClick={() => setPanelOpen((v) => !v)}
          title="Alerts"
          aria-label="Alerts"
        >
          <Bell size={14} />
        </button>
        {count > 0 && <span className={`alert-count-badge ${dangerCount === 0 ? "warning" : ""}`}>{count}</span>}
        {panelOpen && (
          <div className="alert-panel">
            {active.length === 0 ? (
              <div className="alert-panel-empty">No active alerts</div>
            ) : (
              active.map((alert) => (
                <div key={alert.id} className={`alert-panel-item ${alert.severity}`}>
                  <div className="alert-panel-item-body">
                    <div className="alert-panel-item-title">{alert.title}</div>
                    <div className="alert-panel-item-detail">{alert.detail}</div>
                    <div className="alert-panel-item-since">Since {fmtTimeGst(alert.since)}</div>
                  </div>
                  <button
                    className="alert-panel-dismiss"
                    onClick={() => setDismissed((prev) => new Set(prev).add(alert.id))}
                    title="Dismiss"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
            <div className="alert-panel-footer">
              {notifyEnabled ? (
                <span className="panel-caption">Browser alerts enabled</span>
              ) : (
                <button className="btn btn-secondary" onClick={enableBrowserAlerts}>
                  Enable browser alerts
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="alert-toast-stack">
        {toasts.map((toast) => {
          const Icon = toast.severity === "danger" ? AlertCircle : AlertTriangle;
          return (
            <div key={toast.id} className={`alert-toast ${toast.severity}`}>
              <Icon className={`sync-icon ${toast.severity === "danger" ? "error" : "stale"}`} size={16} />
              <div className="alert-panel-item-body">
                <div className="alert-panel-item-title">{toast.title}</div>
                <div className="alert-panel-item-detail">{toast.detail}</div>
              </div>
              <button
                className="alert-panel-dismiss"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                title="Dismiss"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
