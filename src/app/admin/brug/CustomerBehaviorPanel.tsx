"use client";

import { useEffect, useState } from "react";
import { SalesOverviewTable } from "../SalesOverviewTable";
import { fetchSalesOverview } from "@/lib/sales-overview-client";
import type { SalesOverview } from "@/lib/sales-overview-types";

// Issue #92: fanen "Kundeadfærd" under Analyse. Samme datakilde og samme
// komponent som admin-forsidens liste (GET /admin/api/trips via
// fetchSalesOverview → SalesOverviewTable), men i tilstanden "behavior":
// Åbnet, Set, Kontakt, Seneste aktivitet, filtre, sortering, pagination og
// Detaljer-link. Egen loading- og fejltilstand: en fejlet hentning vises som
// fejl — aldrig som "ingen aktivitet" eller en tom liste.
export function CustomerBehaviorPanel() {
  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    const result = await fetchSalesOverview();
    if (result.ok) setOverview(result.overview);
    else setError(true);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return <CustomerBehaviorView loading={loading} error={error} overview={overview} onRetry={load} />;
}

/** Ren visning (testbar uden fetch): loading, fejl eller tabellen i tilstanden "behavior". */
export function CustomerBehaviorView({
  loading,
  error,
  overview,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  overview: SalesOverview | null;
  onRetry: () => void;
}) {
  return (
    <div className="admin-card">
      {loading ? (
        <div style={{ color: "var(--grey-text)", fontSize: 13 }} data-state="customer-behavior-loading">
          <span className="admin-spinner" />
          Henter kundeadfærd...
        </div>
      ) : error || !overview ? (
        <div
          className="admin-error"
          data-state="customer-behavior-error"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <span>Kundeadfærd kunne ikke hentes lige nu. Der vises bevidst ingen tal, da det ville ligne ingen aktivitet.</span>
          <button className="admin-btn admin-btn-secondary" onClick={onRetry}>
            Prøv igen
          </button>
        </div>
      ) : (
        <SalesOverviewTable mode="behavior" overview={overview} />
      )}
    </div>
  );
}
