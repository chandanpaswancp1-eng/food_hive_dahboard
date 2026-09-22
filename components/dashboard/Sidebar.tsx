"use client";

import Image from "next/image";
import { TAB_LABELS, type TabId } from "@/lib/types";
import { TAB_ICONS } from "@/lib/tabIcons";
import { TAB_GROUPS } from "@/lib/tabGroups";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <Image
          src="/logo-foodhive.png"
          alt="FoodHive"
          width={1107}
          height={504}
          className="sidebar-logo sidebar-logo-light"
          priority
        />
        <Image
          src="/logo-foodhive-dark.png"
          alt="FoodHive"
          width={1107}
          height={504}
          className="sidebar-logo sidebar-logo-dark"
          priority
        />
      </div>
      <nav className="sidebar-nav">
        {TAB_GROUPS.map((group) => (
          <div className="sidebar-nav-group" key={group.label}>
            <div className="sidebar-nav-group-label">{group.label}</div>
            {group.tabs.map((id) => {
              const Icon = TAB_ICONS[id];
              return (
                <button
                  key={id}
                  className={`sidebar-nav-item${id === active ? " active" : ""}`}
                  onClick={() => onChange(id)}
                >
                  <Icon size={18} />
                  <span>{TAB_LABELS[id]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  );
}
