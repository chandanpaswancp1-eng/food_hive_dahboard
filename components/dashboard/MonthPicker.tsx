"use client";

import { CalendarRange } from "lucide-react";
import type { DashboardFilters } from "@/lib/types";
import { daysInDubaiMonth } from "@/lib/grubtech/dubaiTime";

interface Props {
  filters: DashboardFilters;
  /** "YYYY-MM" months that have data, newest first. */
  months: string[];
  /** Current GST date ("YYYY-MM-DD") — null until /api/today resolves. */
  todayGst: string | null;
  onChange: (next: DashboardFilters) => void;
}

const CUSTOM = "custom";

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Which month the current date filters amount to: none set means the Weekly
 * tab's default (the current month), an exact whole-month range (or the
 * month so far, for the current one) is that month, anything else is custom.
 */
function selectedMonth(filters: DashboardFilters, todayMonth: string | null): string {
  const { dateFrom, dateTo } = filters;
  if (!dateFrom && !dateTo) return todayMonth ?? CUSTOM;
  if (!dateFrom || !dateTo) return CUSTOM;

  const month = dateFrom.slice(0, 7);
  const isFirst = dateFrom === `${month}-01`;
  const isWholeMonth = dateTo === `${month}-${String(daysInDubaiMonth(dateFrom)).padStart(2, "0")}`;
  return isFirst && isWholeMonth ? month : CUSTOM;
}

export function MonthPicker({ filters, months, todayGst, onChange }: Props) {
  const todayMonth = todayGst?.slice(0, 7) ?? null;
  // The options list is only fetched once on load, so the current month is
  // always added here — it must stay selectable across a month rollover.
  const allMonths = [...new Set([...(todayMonth ? [todayMonth] : []), ...months])].sort((a, b) => (a < b ? 1 : -1));
  const value = selectedMonth(filters, todayMonth);

  const pick = (month: string) => {
    if (month === CUSTOM) return;
    onChange({
      ...filters,
      dateFrom: `${month}-01`,
      dateTo: `${month}-${String(daysInDubaiMonth(`${month}-01`)).padStart(2, "0")}`,
    });
  };

  return (
    <div className="month-picker">
      <CalendarRange size={14} />
      <label htmlFor="month-picker">Month</label>
      <select id="month-picker" className="input" value={value} onChange={(e) => pick(e.target.value)}>
        {value === CUSTOM && <option value={CUSTOM}>Custom range</option>}
        {allMonths.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
            {m === todayMonth ? " (current)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
