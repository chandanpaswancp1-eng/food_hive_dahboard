"use client";

import "@/lib/chartSetup";
import { Bar, Line, Doughnut, Chart } from "react-chartjs-2";
import type { ChartSpec } from "@/lib/types";

const INK = "#201e1d";
const ACCENT = "#ec3013";
const MUTE = "#9b9797";
const LIGHT = "#d7d3d3";
const DEEP = "#7c1405";
const SLATE = "#605d5d";

const PALETTE = [INK, ACCENT, MUTE, LIGHT, DEEP, SLATE];

// Sums/averages computed via floating-point arithmetic (e.g. 2929.8399999999992)
// need rounding before display — Chart.js shows raw values otherwise.
function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(value);
}

function baseOptions(hasSecondAxis: boolean, indexAxis: "x" | "y" = "x") {
  const valueTicks = { callback: (value: unknown) => formatNumber(Number(value)) };

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    plugins: {
      legend: { display: true, position: "bottom" as const },
      tooltip: {
        backgroundColor: INK,
        cornerRadius: 0,
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
        grid: { color: LIGHT },
        border: { color: INK },
        ...(indexAxis === "y" ? { ticks: valueTicks } : {}),
      },
      y: {
        grid: { color: LIGHT },
        border: { color: INK },
        position: "left" as const,
        ...(indexAxis === "x" ? { ticks: valueTicks } : {}),
      },
      ...(hasSecondAxis
        ? { y1: { position: "right" as const, grid: { display: false }, border: { color: INK }, ticks: valueTicks } }
        : {}),
    },
  };
}

export function ChartPanel({ spec }: { spec: ChartSpec }) {
  const data = {
    labels: spec.labels,
    datasets: spec.datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.kind === "line" ? "transparent" : PALETTE[i % PALETTE.length],
      borderColor: PALETTE[i % PALETTE.length],
      borderRadius: 0,
      borderWidth: ds.kind === "line" ? 2 : 0,
      pointRadius: ds.kind === "line" ? 2 : 0,
      tension: 0.3,
      yAxisID: ds.yAxisId ?? "y",
      type: spec.type === "combo" ? ds.kind ?? "bar" : undefined,
    })),
  };

  let body: React.ReactNode;

  if (spec.type === "doughnut") {
    body = (
      <Doughnut
        data={{ labels: spec.labels, datasets: [{ data: spec.datasets[0]?.data ?? [], backgroundColor: PALETTE }] }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              backgroundColor: INK,
              cornerRadius: 0,
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
    body = <Bar data={data as any} options={baseOptions(false, "y")} />;
  } else if (spec.type === "line") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Line data={data as any} options={baseOptions(false)} />;
  } else if (spec.type === "combo") {
    const hasSecondAxis = spec.datasets.some((d) => d.yAxisId === "y1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Chart type="bar" data={data as any} options={baseOptions(hasSecondAxis)} />;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body = <Bar data={data as any} options={baseOptions(false)} />;
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
