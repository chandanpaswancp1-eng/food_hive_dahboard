"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TabBar } from "@/components/dashboard/TabBar";
import { DashboardTabView } from "@/components/dashboard/DashboardTabView";
import { DrillThroughModal } from "@/components/dashboard/DrillThroughModal";
import type { DashboardFilters, FilterOptions, ReportTypeHint, SyncStatusPayload, TabId, TabPayload } from "@/lib/types";

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
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [drillScope, setDrillScope] = useState<Partial<DashboardFilters> | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  // Network to the DB has been intermittent (a real flaky-connection window,
  // not a one-off) — a fetch landing exactly during an outage would leave
  // the page stuck on the error banner forever with nothing to retry it.
  // This ticks every 15s so both effects below self-heal once the backend
  // recovers, without the user needing to change tabs/filters.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setRetryTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (options) return; // already loaded — no need to keep polling
    fetch("/api/filter-options")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          if (data?.error === "database_unavailable") setDbError(data.message);
          return;
        }
        setOptions(data);
      })
      .catch(() => {});
  }, [options, retryTick]);

  const loadSyncStatus = useCallback(() => {
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then(setSync)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSyncStatus();
  }, [loadSyncStatus, retryTick]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/kpis/${activeTab}?${filtersToParams(filters)}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          if (data?.error === "database_unavailable") {
            setDbError(data.message);
            setPayload(null);
          }
          return;
        }
        setDbError(null);
        setPayload(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, filters, retryTick]);

  const updateFilters = (next: DashboardFilters) => {
    setLoading(true);
    setFilters(next);
  };

  const updateTab = (next: TabId) => {
    setLoading(true);
    setActiveTab(next);
  };

  const handleImport = async (file: File, reportTypeHint?: ReportTypeHint) => {
    setImporting(true);
    setImportMessage(null);
    const form = new FormData();
    form.append("file", file);
    if (reportTypeHint) form.append("reportTypeHint", reportTypeHint);

    // Ingestion is DB-latency-bound and can take minutes for a large file —
    // the route starts it in the background and returns a jobId immediately
    // (see app/api/import/csv/route.ts), so we poll rather than await it.
    // A synchronous await here previously got killed by a platform proxy
    // timeout on a real 40MB import.
    try {
      const res = await fetch("/api/import/csv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.jobId) {
        setImporting(false);
        setImportMessage(data?.message ?? "Import failed to start");
        return;
      }

      const poll = async () => {
        const jobRes = await fetch(`/api/jobs/${data.jobId}`);
        const job = await jobRes.json();
        if (job.status === "RUNNING") {
          setTimeout(poll, 3000);
          return;
        }
        setImporting(false);
        if (job.status === "SUCCESS") {
          setImportMessage(
            `Imported ${job.recordsIngested} orders${job.errorMessage ? " (some rows had issues)" : ""}`,
          );
          updateFilters({ ...filters });
        } else {
          setImportMessage(job.errorMessage ?? "Import failed");
        }
      };
      poll();
    } catch {
      setImporting(false);
      setImportMessage("Import failed to start");
    }
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
      <Header
        sync={sync}
        onExport={handleExport}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        importMessage={importMessage}
      />
      <FilterBar
        filters={filters}
        options={options}
        onChange={updateFilters}
        onReset={() => updateFilters({})}
        scopeLabel={payload ? `${payload.scope.orderCount} orders in scope` : "Loading feed…"}
      />
      <TabBar active={activeTab} onChange={updateTab} />
      <main className="dashboard-main">
        {dbError ? (
          <div className="panel db-error-banner">
            <div className="badge">Database Unavailable</div>
            <h4>Can&rsquo;t reach the database</h4>
            <p>{dbError}</p>
          </div>
        ) : (
          <DashboardTabView
            payload={payload}
            loading={loading}
            activeTab={activeTab}
            importing={importing}
            onImport={handleImport}
            onDrill={setDrillScope}
          />
        )}
      </main>
      {drillScope && <DrillThroughModal filters={filters} scope={drillScope} onClose={() => setDrillScope(null)} />}
    </div>
  );
}
