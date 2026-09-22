import { cssVar } from "@/lib/theme";

/**
 * Same red/amber/green read used by every gauge in the app — low is a real
 * warning sign (heavy discounting/commission, poor on-time rate, etc.), not
 * just a smaller number, so the color should say that at a glance. Used by
 * ChartPanel's Chart.js gauge chart type (e.g. Income's take-home margin,
 * Ratings' average rating, Delayed Orders' on-time compliance).
 */
export function gaugeColorFor(value: number): string {
  return value < 40
    ? cssVar("--danger-500", "#dc2626")
    : value < 70
      ? cssVar("--primary-500", "#f79009")
      : cssVar("--success-500", "#1a9c53");
}
