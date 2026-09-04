"use client";

import { TAB_IMPORT_CONFIG, type ReportTypeHint, type TabId } from "@/lib/types";

interface Props {
  tab: TabId;
  importing: boolean;
  onImport: (file: File, hint?: ReportTypeHint) => void;
}

export function TabImportButton({ tab, importing, onImport }: Props) {
  const config = TAB_IMPORT_CONFIG[tab];

  return (
    <label className="btn btn-secondary">
      {importing ? "Importing…" : config.label}
      <input
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && !importing) onImport(file, config.hint);
          e.target.value = "";
        }}
      />
    </label>
  );
}
