"use client";

import { CalendarCheck, RotateCcw } from "lucide-react";
import type { DashboardFilters, FilterOptions } from "@/lib/types";

interface Props {
  filters: DashboardFilters;
  options: FilterOptions | null;
  onChange: (next: DashboardFilters) => void;
  onReset: () => void;
  /** Current GST calendar date ("YYYY-MM-DD"), from /api/today — null until the first fetch resolves. */
  todayGst: string | null;
  onToday: () => void;
  scopeLabel: string;
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="filter-field">
      <label>{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterBar({ filters, options, onChange, onReset, todayGst, onToday, scopeLabel }: Props) {
  const setSingle = (key: keyof DashboardFilters, value: string) => {
    onChange({ ...filters, [key]: value ? [value] : undefined });
  };

  return (
    <div className="filter-bar">
      <div className="filter-field">
        <label>Received From</label>
        <input
          type="date"
          className="input"
          value={filters.dateFrom ?? ""}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
        />
      </div>
      <div className="filter-field">
        <label>Received To</label>
        <input
          type="date"
          className="input"
          value={filters.dateTo ?? ""}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
        />
      </div>
      <Select label="Brand" value={filters.brands?.[0] ?? ""} options={options?.brands ?? []} onChange={(v) => setSingle("brands", v)} />
      <Select label="Cuisine" value={filters.cuisines?.[0] ?? ""} options={options?.cuisines ?? []} onChange={(v) => setSingle("cuisines", v)} />
      <Select label="Location" value={filters.locations?.[0] ?? ""} options={options?.locations ?? []} onChange={(v) => setSingle("locations", v)} />
      <Select label="Channel" value={filters.channels?.[0] ?? ""} options={options?.channels ?? []} onChange={(v) => setSingle("channels", v)} />
      <Select
        label="Payment"
        value={filters.paymentMethods?.[0] ?? ""}
        options={options?.paymentMethods ?? []}
        onChange={(v) => setSingle("paymentMethods", v)}
      />
      <button className="btn btn-ghost" onClick={onToday} disabled={!todayGst}>
        <CalendarCheck size={14} />
        Today
      </button>
      <button className="btn btn-ghost" onClick={onReset}>
        <RotateCcw size={14} />
        Reset
      </button>
      <div className="filter-scope">{scopeLabel}</div>
    </div>
  );
}
