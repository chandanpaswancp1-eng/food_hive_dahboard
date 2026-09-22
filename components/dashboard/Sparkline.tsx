"use client";

import { useId } from "react";
import { cssVar } from "@/lib/theme";

interface Props {
  /** Ascending-chronological values. */
  values: number[];
}

const WIDTH = 120;
const HEIGHT = 32;
// Keeps the line off the very top/bottom edge so a min/max point isn't
// clipped by the stroke width.
const PAD = 3;

/**
 * A small embedded sparkline — pure SVG (no Chart.js instance for what's
 * geometrically a single polyline). Always brand amber: the card it sits on
 * already carries a separate trend pill for direction, so a second,
 * independently-colored signal here would double-encode or, worse,
 * contradict it (e.g. an amber-but-"down" line next to a red pill).
 */
export function Sparkline({ values }: Props) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (WIDTH - PAD * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = PAD + i * step;
    const y = PAD + (1 - (v - min) / range) * (HEIGHT - PAD * 2);
    return { x, y };
  });

  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${PAD},${HEIGHT} ${line} ${WIDTH - PAD},${HEIGHT}`;
  const color = cssVar("--chart-1", "#f79009");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="kpi-sparkline" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} stroke="none" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
