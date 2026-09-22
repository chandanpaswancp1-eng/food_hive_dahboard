"use client";

import { useMemo, useState, type DragEvent } from "react";
import { Check, GripVertical, Pencil, Settings2 } from "lucide-react";
import type { DashboardFilters, KpiValue, TabId } from "@/lib/types";
import { Sparkline } from "./Sparkline";
import { clearKpiOrder, loadKpiOrder, saveKpiOrder } from "@/lib/kpiOrder";

interface Props {
  kpis: KpiValue[];
  activeTab: TabId;
  onDrill?: (filter: Partial<DashboardFilters>, tabOverride?: TabId) => void;
  onEditCommission?: (channel: string, currentCommissionRate: number, currentDeliveryChargeRate: number) => void;
}

interface Chunk {
  /** The group name for a grouped pair, or the single card's own key — either way, a stable id for this chunk's saved position. */
  id: string;
  group?: string;
  cells: KpiValue[];
}

// Consecutive cards sharing a `group` (e.g. a week's Gross + Net) are one
// draggable unit — dragging the pair keeps them together, matching how the
// grid already never splits them across rows.
function chunksFor(kpis: KpiValue[]): Chunk[] {
  const chunks: Chunk[] = [];
  kpis.forEach((k) => {
    const last = chunks[chunks.length - 1];
    if (k.group && last?.group === k.group) last.cells.push(k);
    else chunks.push({ id: k.group ?? k.key, group: k.group, cells: [k] });
  });
  return chunks;
}

/**
 * Reorders `chunks` to match a previously-saved id order. A chunk not in the
 * saved order — a new KPI that showed up since the user last customized this
 * tab, or simply the first render before anything's been dragged — keeps its
 * natural payload position rather than disappearing or jumping to the end.
 */
function applySavedOrder(chunks: Chunk[], savedOrder: string[] | null): Chunk[] {
  if (!savedOrder) return chunks;
  const remaining = new Map(chunks.map((c) => [c.id, c]));
  const ordered: Chunk[] = [];
  for (const id of savedOrder) {
    const c = remaining.get(id);
    if (c) {
      ordered.push(c);
      remaining.delete(id);
    }
  }
  for (const c of chunks) {
    if (remaining.has(c.id)) ordered.push(c);
  }
  return ordered;
}

export function KpiStrip({ kpis, activeTab, onDrill, onEditCommission }: Props) {
  const [editing, setEditing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // Bumped after every reorder/reset so the memos below re-read localStorage
  // — this component is the only writer of that key, so a plain counter is
  // enough to invalidate the memo without reaching for external state.
  const [orderVersion, setOrderVersion] = useState(0);

  const naturalChunks = useMemo(() => chunksFor(kpis), [kpis]);
  const savedOrder = useMemo(
    () => loadKpiOrder(activeTab),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, orderVersion],
  );
  const chunks = useMemo(() => applySavedOrder(naturalChunks, savedOrder), [naturalChunks, savedOrder]);

  const persist = (next: Chunk[]) => {
    saveKpiOrder(activeTab, next.map((c) => c.id));
    setOrderVersion((v) => v + 1);
  };

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const fromIndex = chunks.findIndex((c) => c.id === draggedId);
    const toIndex = chunks.findIndex((c) => c.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...chunks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persist(next);
  };

  const dragPropsFor = (id: string) =>
    editing
      ? {
          draggable: true,
          onDragStart: () => setDraggedId(id),
          onDragOver: (e: DragEvent<HTMLDivElement>) => e.preventDefault(),
          onDrop: () => handleDrop(id),
          onDragEnd: () => setDraggedId(null),
        }
      : {};

  const renderCellInner = (k: KpiValue) => (
    <>
      {k.editCommission && onEditCommission && !editing && (
        <button
          type="button"
          className="kpi-edit-btn"
          title="Edit commission %"
          onClick={(e) => {
            e.stopPropagation();
            onEditCommission(
              k.editCommission!.channel,
              k.editCommission!.currentCommissionRate,
              k.editCommission!.currentDeliveryChargeRate,
            );
          }}
        >
          <Pencil size={12} />
        </button>
      )}
      <div className="kpi-body">
        <div className="kpi-label">{k.label}</div>
        <div className="kpi-value-row">
          <div className={`kpi-value${k.accent ? " accent" : ""}`}>{k.value}</div>
          {k.trend && (
            <span className={`kpi-trend-pill${k.trend.pct < 0 ? " down" : ""}`}>
              {k.trend.pct >= 0 ? "▲" : "▼"} {Math.abs(k.trend.pct).toFixed(1)}%
            </span>
          )}
        </div>
        {/* Exact figure behind a compacted value (e.g. "AED 5.2K")
            shown outright — a hover-only tooltip is invisible on
            touch devices, where there's no hover at all. */}
        {k.fullValue && k.fullValue !== k.value && <div className="kpi-full-value">{k.fullValue}</div>}
        {k.subtitle && <div className="kpi-subtitle">{k.subtitle}</div>}
      </div>
      {k.sparkline && k.sparkline.length > 1 && <Sparkline values={k.sparkline} />}
    </>
  );

  // A card inside a group is still individually drillable exactly as before
  // — only drag behavior lives on the group's own wrapper, not per-cell.
  const renderGroupedCell = (k: KpiValue) => {
    const isDrillable = !editing && Boolean(onDrill && (k.drillTab || k.drillFilter));
    return (
      <div
        className={`kpi-cell${isDrillable ? " kpi-clickable" : ""}`}
        key={k.key}
        role={isDrillable ? "button" : undefined}
        tabIndex={isDrillable ? 0 : undefined}
        title={isDrillable ? `${k.fullValue ?? k.value} — click for order details` : (k.fullValue ?? k.value)}
        onClick={isDrillable ? () => onDrill!(k.drillFilter ?? {}, k.drillTab) : undefined}
        onKeyDown={
          isDrillable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDrill!(k.drillFilter ?? {}, k.drillTab);
                }
              }
            : undefined
        }
      >
        {renderCellInner(k)}
      </div>
    );
  };

  const renderStandaloneChunk = (chunk: Chunk) => {
    const k = chunk.cells[0];
    const isDrillable = !editing && Boolean(onDrill && (k.drillTab || k.drillFilter));
    const editingClass = editing ? " kpi-editing" : "";
    const draggingClass = draggedId === chunk.id ? " kpi-dragging" : "";
    return (
      <div
        className={`kpi-cell${isDrillable ? " kpi-clickable" : ""}${editingClass}${draggingClass}`}
        key={chunk.id}
        role={isDrillable ? "button" : undefined}
        tabIndex={isDrillable ? 0 : undefined}
        title={isDrillable ? `${k.fullValue ?? k.value} — click for order details` : (k.fullValue ?? k.value)}
        onClick={isDrillable ? () => onDrill!(k.drillFilter ?? {}, k.drillTab) : undefined}
        onKeyDown={
          isDrillable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDrill!(k.drillFilter ?? {}, k.drillTab);
                }
              }
            : undefined
        }
        {...dragPropsFor(chunk.id)}
      >
        {editing && <GripVertical className="kpi-drag-handle" size={14} />}
        {renderCellInner(k)}
      </div>
    );
  };

  const renderGroupChunk = (chunk: Chunk) => {
    const editingClass = editing ? " kpi-editing" : "";
    const draggingClass = draggedId === chunk.id ? " kpi-dragging" : "";
    return (
      <div className={`kpi-group${editingClass}${draggingClass}`} key={chunk.id} {...dragPropsFor(chunk.id)}>
        {editing && <GripVertical className="kpi-drag-handle" size={14} />}
        {chunk.cells.map(renderGroupedCell)}
      </div>
    );
  };

  return (
    <>
      <div className="kpi-strip-toolbar">
        {editing && savedOrder && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearKpiOrder(activeTab);
              setOrderVersion((v) => v + 1);
            }}
          >
            Reset order
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => setEditing((e) => !e)}>
          {editing ? <Check size={14} /> : <Settings2 size={14} />}
          {editing ? "Done" : "Customize"}
        </button>
      </div>
      <div className="kpi-strip">{chunks.map((c) => (c.group ? renderGroupChunk(c) : renderStandaloneChunk(c)))}</div>
    </>
  );
}
