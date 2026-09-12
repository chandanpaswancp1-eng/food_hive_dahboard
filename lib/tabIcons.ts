import { ClipboardList, Clock, PackageX, Star, Timer, Wallet, XCircle, type LucideIcon } from "lucide-react";
import type { TabId } from "./types";

export const TAB_ICONS: Record<TabId, LucideIcon> = {
  income: Wallet,
  "order-details": ClipboardList,
  cancellations: XCircle,
  "prep-time": Timer,
  ratings: Star,
  delayed: Clock,
  stockouts: PackageX,
};
