"use client";

import { CheckCircle2, AlertCircle, Circle } from "lucide-react";
import type { PortalStatusPayload } from "@/lib/types";

interface Props {
  status: PortalStatusPayload | null;
}

// Reuses the .sync-pill/.sync-icon visual language already established for
// the header's data-sync pill (Header.tsx, app/globals.css) so a per-portal
// open/closed badge looks like part of the same status-indicator family
// rather than a one-off.
export function PortalStatusStrip({ status }: Props) {
  if (!status || status.portals.length === 0) return null;

  return (
    <>
      {status.portals.map((portal) => {
        const iconClass = portal.isOpen === true ? "live" : portal.isOpen === false ? "error" : "none";
        const Icon = portal.isOpen === true ? CheckCircle2 : portal.isOpen === false ? AlertCircle : Circle;
        const label = portal.isOpen === true ? "Open" : portal.isOpen === false ? "Closed" : "Not connected";

        return (
          <div key={portal.channel} className="sync-pill" title={portal.message}>
            <Icon className={`sync-icon ${iconClass}`} size={14} />
            <span>
              {portal.channel} · {label}
            </span>
          </div>
        );
      })}
    </>
  );
}
