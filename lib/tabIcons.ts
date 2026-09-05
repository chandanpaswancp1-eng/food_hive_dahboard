import { ClipboardList, Clock, PackageX, Star, Timer, XCircle, type LucideIcon } from "lucide-react";
import type { TabId } from "./types";

export const TAB_ICONS: Record<TabId, LucideIcon> = {
  "order-details": ClipboardList,
  cancellations: XCircle,
  "prep-time": Timer,
  ratings: Star,
  delayed: Clock,
  stockouts: PackageX,
};
