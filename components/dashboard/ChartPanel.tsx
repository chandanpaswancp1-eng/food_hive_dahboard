"use client";

import "@/lib/chartSetup";
import { Bar, Line, Doughnut, Chart } from "react-chartjs-2";
import type { ChartSpec, DashboardFilters } from "@/lib/types";
import { dimensionFilter } from "@/lib/drillthrough";
import { getChartPalette, getGridColor, getInkColor, getSurfaceColor } from "@/lib/theme";

// Sums/averages computed via floating-point arithmetic (e.g. 2929.8399999999992)
// need rounding before display — Chart.js shows raw values otherwise.
function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(value);
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

  const data = {
    labels: spec.labels,
    datasets: spec.datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.kind === "line" ? "transparent" : palette[i % palette.length],
      borderColor: ds.kind === "line" ? palette[i % palette.length] : "transparent",
      borderRadius: ds.kind === "line" ? 0 : 6,
      borderWidth: ds.kind === "line" ? 2 : 0,
      pointRadius: ds.kind === "line" ? 2 : 0,
      pointBackgroundColor: palette[i % palette.length],
      tension: 0.3,
      yAxisID: ds.yAxisId ?? "y",
      type: spec.type === "combo" ? ds.kind ?? "bar" : undefined,
    })),
  };

  const handleIndexClick =
    spec.dimension && onSlice
      ? (index: number) => {
          const label = spec.labels[index];
          if (label) onSlice(dimensionFilter(spec.dimension!, label));
        }
      : undefined;

  let body: React.ReactNode;

  if (spec.type === "doughnut") {
    const surface = getSurfaceColor();
    body = (
      <Doughnut
        data={{
          labels: spec.labels,
          datasets: [{ data: spec.datasets[0]?.data ?? [], backgroundColor: palette, borderColor: surface, borderWidth: 2 }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
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
                label: (ctx: any) => `${ctx.label}: ${formatNumber(ctx.parsed)}`,
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
