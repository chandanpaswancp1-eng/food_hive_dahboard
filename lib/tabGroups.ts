import type { TabId } from "@/lib/types";

/** Sidebar section grouping — every TabId appears in exactly one group. */
export const TAB_GROUPS: { label: string; tabs: TabId[] }[] = [
  { label: "Sales", tabs: ["income", "order-details", "weekly", "monthly"] },
  { label: "Operations", tabs: ["prep-time", "delayed", "stockouts"] },
  { label: "Quality", tabs: ["ratings", "cancellations"] },
];
