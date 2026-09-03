"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TabBar } from "@/components/dashboard/TabBar";
import { DashboardTabView } from "@/components/dashboard/DashboardTabView";
import { DrillThroughModal } from "@/components/dashboard/DrillThroughModal";
import type { DashboardFilters, FilterOptions, SyncStatusPayload, TabId, TabPayload } from "@/lib/types";

function filtersToParams(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  filters.brands?.forEach((v) => params.append("brand", v));
  filters.cuisines?.forEach((v) => params.append("cuisine", v));
  filters.locations?.forEach((v) => params.append("location", v));
  filters.channels?.forEach((v) => params.append("channel", v));
  filters.paymentMethods?.forEach((v) => params.append("payment", v));
  return params.toString();
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("order-details");
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [payload, setPayload] = useState<TabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<SyncStatusPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);

  useEffect(() => {
    fetch("/api/filter-options")
      .then((r) => r.json())
      .then(setOptions)
      .catch(() => {});
  }, []);

  const loadSyncStatus = useCallback(() => {
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then(setSync)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSyncStatus();
    const id = setInterval(loadSyncStatus, 15000);
    return () => clearInterval(id);
  }, [loadSyncStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/kpis/${activeTab}?${filtersToParams(filters)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, filters]);

  const updateFilters = (next: DashboardFilters) => {
    setLoading(true);
    setFilters(next);
  };

  const updateTab = (next: TabId) => {
    setLoading(true);
    setActiveTab(next);
  };

  const handleImport = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    await fetch("/api/import/csv", { method: "POST", body: form });
    updateFilters({ ...filters });
  };

  const handleExport = () => {
    // Intentional: triggers a file download from an API route, not a page navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/export/csv?${filtersToParams(filters)}`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch("/api/sync/trigger", { method: "POST" });
    setTimeout(() => {
      loadSyncStatus();
      setRefreshing(false);
      updateFilters({ ...filters });
    }, 4000);
  };

  return (
    <div>
      <Header sync={sync} onImport={handleImport} onExport={handleExport} onRefresh={handleRefresh} refreshing={refreshing} />
      <FilterBar
        filters={filters}
        options={options}
        onChange={updateFilters}
        onReset={() => updateFilters({})}
        scopeLabel={payload ? `${payload.scope.orderCount} orders in scope` : "Loading feed…"}
      />
      <TabBar active={activeTab} onChange={updateTab} />
      <main className="dashboard-main">
        <DashboardTabView payload={payload} loading={loading} onRowClick={() => setDrillOpen(true)} />
      </main>
      {drillOpen && <DrillThroughModal filters={filters} onClose={() => setDrillOpen(false)} />}
    </div>
  );
}
