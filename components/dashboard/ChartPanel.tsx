"use client";

import "@/lib/chartSetup";
import { Bar, Line, Doughnut, Chart } from "react-chartjs-2";
import type { ChartSpec, DashboardFilters } from "@/lib/types";
import { dimensionFilter } from "@/lib/drillthrough";
import { getChartPalette, getGridColor, getInkColor, getSurfaceColor } from "@/lib/theme";
import { gaugeColorFor } from "@/lib/gauge";

// Sums/averages computed via floating-point arithmetic (e.g. 2929.8399999999992)
// need rounding before display — Chart.js shows raw values otherwise.
function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(value);
}

/** "#rrggbb" -> "rgba(r, g, b, alpha)". Canvas gradients need a real color function — CSS color-mix() isn't parsed by Canvas2D. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptableColor = string | ((context: any) => string | CanvasGradient);

/** A top-to-bottom fade from the line's color to transparent, filling the area under it — Chart.js needs a scriptable callback since a gradient requires the canvas context, unlike a static color string. */
function areaGradient(color: string): ScriptableColor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (context: any) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return hexToRgba(color, 0.2);
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, hexToRgba(color, 0.28));
    gradient.addColorStop(1, hexToRgba(color, 0));
    return gradient;
  };
}

function baseOptions(hasSecondAxis: boolean, indexAxis: "x" | "y" = "x", onIndexClick?: (index: number) => void) {
  const valueTicks = { callback: (value: unknown) => formatNumber(Number(value)) };
  const ink = getInkColor();
  const grid = getGridColor();
  const surface = getSurfaceColor();

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    onClick: onIndexClick
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_event: any, elements: { index: number }[]) => {
          if (elements.length > 0) onIndexClick(elements[0].index);
        }
      : undefined,
    onHover: onIndexClick
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event: any, elements: unknown[]) => {
          if (event.native?.target) {
            event.native.target.style.cursor = elements.length ? "pointer" : "default";
          }
        }
      : undefined,
    plugins: {
      legend: { display: true, position: "bottom" as const, labels: { color: ink, usePointStyle: true } },
      tooltip: {
        backgroundColor: ink,
        titleColor: surface,
        bodyColor: surface,
        cornerRadius: 8,
        padding: 10,
        titleFont: { weight: 800 as const },
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => {
            const raw = indexAxis === "y" ? ctx.parsed.x : ctx.parsed.y;
            return `${ctx.dataset.label ?? ""}: ${formatNumber(raw)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: grid },
        border: { color: grid },
        ticks: { color: ink },
        ...(indexAxis === "y" ? { ticks: { ...valueTicks, color: ink } } : {}),
      },
      y: {
        grid: { color: grid },
        border: { color: grid },
        ticks: { color: ink },
        position: "left" as const,
        ...(indexAxis === "x" ? { ticks: { ...valueTicks, color: ink } } : {}),
      },
      ...(hasSecondAxis
        ? { y1: { position: "right" as const, grid: { display: false }, border: { color: grid }, ticks: { ...valueTicks, color: ink } } }
        : {}),
    },
  };
}

interface Props {
  spec: ChartSpec;
  onSlice?: (filter: Partial<DashboardFilters>) => void;
}

export function ChartPanel({ spec, onSlice }: Props) {
  const palette = getChartPalette();
  const ink = getInkColor();
  const surface = getSurfaceColor();

  const data = {
    labels: spec.labels,
    // A dataset is line-styled either because its own `kind` says so (mixed
    // bar+line "combo" charts) or because the whole chart is `type: "line"` —
    // a plain line spec's datasets don't always bother setting `kind` per
    // dataset (no bar/line mix to disambiguate), so spec.type alone must be
    // enough to style them as a line, not just the per-dataset flag.
    datasets: spec.datasets.map((ds, i) => {
      const isLine = spec.type === "line" || ds.kind === "line";
      // Gradient area fill only for single/dual-series line charts (the
      // reference's look) — several overlapping filled areas on a
      // multi-series trend chart (e.g. one line per aggregator) would just
      // read as visual mud, so those keep a plain stroked line.
      const isFilled = isLine && spec.datasets.length <= 2;
      const color = palette[i % palette.length];
      const lastIndex = ds.data.length - 1;
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: isFilled ? areaGradient(color) : color,
        borderColor: isLine ? color : "transparent",
        borderRadius: isLine ? 0 : 6,
        borderWidth: isLine ? 2 : 0,
        // The latest point on a single/dual-series trend gets a bigger,
        // ringed marker so the chart reads "and here's where we are now" at
        // a glance — every other point stays a small plain dot.
        pointRadius: isFilled
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (context: any) => (context.dataIndex === lastIndex ? 5 : 2)
          : isLine
            ? 2
            : 0,
        pointBorderColor: isFilled ? surface : color,
        pointBorderWidth: isFilled ? 2 : 0,
        pointBackgroundColor: color,
        fill: isFilled,
        tension: 0.3,
        yAxisID: ds.yAxisId ?? "y",
        type: spec.type === "combo" ? ds.kind ?? "bar" : undefined,
      };
    }),
  };

  const handleIndexClick =
    spec.dimension && onSlice
      ? (index: number) => {
          const label = spec.labels[index];
          if (label) onSlice({ ...spec.drillScope, ...dimensionFilter(spec.dimension!, label) });
        }
      : undefined;

  let body: React.ReactNode;

  if (spec.type === "gauge") {
    const surface = getSurfaceColor();
    const grid = getGridColor();
    const value = Math.max(0, Math.min(100, spec.datasets[0]?.data[0] ?? 0));
    const gaugeColor = gaugeColorFor(value);
    body = (
      <div className="gauge-wrap">
        <Doughnut
          data={{
            labels: [spec.datasets[0]?.label ?? "Value", "Remaining"],
            datasets: [
              {
                data: [value, 100 - value],
                backgroundColor: [gaugeColor, grid],
                borderColor: surface,
                borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            cutout: "75%",
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
          }}
        />
        <div className="gauge-center">
          <div className="gauge-value" style={{ color: gaugeColor }}>
            {value.toFixed(1)}%
          </div>
        </div>
      </div>
    );
  } else if (spec.type === "doughnut") {
    const surface = getSurfaceColor();
    const sliceValues = spec.datasets[0]?.data ?? [];
    const sliceTotal = sliceValues.reduce((sum, v) => sum + v, 0);
    body = (
      <Doughnut
        data={{
          labels: spec.labels,
          datasets: [{ data: sliceValues, backgroundColor: palette, borderColor: surface, borderWidth: 2 }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          onClick: handleIndexClick
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (_event: any, elements: { index: number }[]) => {
                if (elements.length > 0) handleIndexClick(elements[0].index);
              }
            : undefined,
          onHover: handleIndexClick
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (event: any, elements: unknown[]) => {
                if (event.native?.target) {
                  event.native.target.style.cursor = elements.length ? "pointer" : "default";
                }
              }
            : undefined,
          plugins: {
            legend: { position: "bottom", labels: { color: ink, usePointStyle: true } },
            tooltip: {
              backgroundColor: ink,
              titleColor: surface,
              bodyColor: surface,
              cornerRadius: 8,
              padding: 10,
              callbacks: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                label: (ctx: any) => {
                  const pct = sliceTotal > 0 ? (ctx.parsed / sliceTotal) * 100 : 0;
                  return `${ctx.label}: ${formatNumber(ctx.parsed)} (${pct.toFixed(1)}%)`;
                },
              },
            },
          },
        }}
      />
    );
  } else if (spec.type === "hbar") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Bar data={data as any} options={baseOptions(false, "y", handleIndexClick)} />;
  } else if (spec.type === "line") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Line data={data as any} options={baseOptions(false, "x", handleIndexClick)} />;
  } else if (spec.type === "combo") {
    const hasSecondAxis = spec.datasets.some((d) => d.yAxisId === "y1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Chart type="bar" data={data as any} options={baseOptions(hasSecondAxis, "x", handleIndexClick)} />;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Bar data={data as any} options={baseOptions(false, "x", handleIndexClick)} />;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">{spec.title}</div>
          {spec.caption && <div className="panel-caption">{spec.caption}</div>}
        </div>
      </div>
      <div className="chart-panel-body">{body}</div>
    </div>
  );
}
