"use client";

import { TAB_IDS, TAB_LABELS, type TabId } from "@/lib/types";

export function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tab-bar">
      {TAB_IDS.map((id) => (
        <button key={id} className={`tab-btn${id === active ? " active" : ""}`} onClick={() => onChange(id)}>
          {TAB_LABELS[id]}
        </button>
      ))}
    </nav>
  );
}
