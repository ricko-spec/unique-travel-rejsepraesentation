"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UsagePeriod, UsageSummary } from "@/lib/usage";

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: "7d", label: "7 dage" },
  { value: "30d", label: "30 dage" },
  { value: "all", label: "Siden tracking startede" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UsageOverview() {
  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/admin/api/usage?period=${period}`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({ error: "Uventet svar" }));
        if (cancelled) return;
        if (!res.ok) {
          // ISSUE-38-integritetsprincip: vis en fejl — vis ALDRIG tomme
          // nul-tal som om ingen har brugt systemet.
          setError(j.error ?? "Kunne ikke hente brugsdata");
          setSummary(null);
          return;
        }
        setSummary(j as UsageSummary);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Kunne ikke hente brugsdata");
        setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="admin-shell">
      <div className="admin-wrap">
        <div className="admin-header">
          <div>
            <div className="admin-title">Brugsoverblik</div>
            <div className="admin-sub">Unique Travel · Upload-tracking pr. sælger</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link className="admin-btn admin-btn-secondary" href="/admin">
              Til administration
            </Link>
          </div>
        </div>

        <div className="admin-card">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <h2 style={{ marginBottom: 0 }}>Periode</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  className={
                    p.value === period ? "admin-btn" : "admin-btn admin-btn-secondary"
                  }
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div style={{ color: "var(--grey-text)", fontSize: 13 }}>
              <span className="admin-spinner" />
              Henter brugsdata...
            </div>
          )}

          {!loading && error && (
            <div className="admin-error">
              Brugsdata kunne ikke hentes: {error}. Prøv at genindlæse siden — tallene vises
              bevidst ikke som nul, da det ville se ud som om ingen har uploadet.
            </div>
          )}

          {!loading && !error && summary && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <StatTile label="Uploads i perioden" value={summary.totalUploads} />
                <StatTile label="Aktive brugere" value={summary.activeUsers} />
                <StatTile label="Brugere uden uploads" value={summary.zeroUploadUsers} />
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--grey-text)",
                  marginBottom: 16,
                  padding: 12,
                  background: "rgba(0,78,80,0.04)",
                  borderRadius: 2,
                }}
              >
                Eksakt upload-tracking gælder fra{" "}
                <strong>
                  {summary.trackingSince ? formatDateTime(summary.trackingSince) : "endnu ingen uploads"}
                </strong>
                . Ældre rejser tælles ikke med i uploadstatistikken — se{" "}
                <code>trips.created_by</code> for et historisk (ikke eksakt) signal.
                {summary.stalledEvents > 0 && (
                  <>
                    {" "}
                    <strong>{summary.stalledEvents}</strong> upload
                    {summary.stalledEvents === 1 ? "" : "s"} står uafsluttet (modtaget/parset for
                    over 24 timer siden) — kan være brugere der lukkede siden før gem.
                  </>
                )}
                {summary.historicalActorEvents > 0 && (
                  <>
                    {" "}
                    <strong>{summary.historicalActorEvents}</strong> event
                    {summary.historicalActorEvents === 1 ? "" : "s"} har ingen tilknyttet bruger
                    (brugeren er slettet siden) — navnet er bevaret som snapshot.
                  </>
                )}
              </div>

              {summary.users.length === 0 ? (
                <div style={{ color: "var(--grey-text)", fontSize: 13 }}>
                  Ingen sælgerprofiler fundet.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Sælger</th>
                        <th>Uploads</th>
                        <th>Publiceret</th>
                        <th>Nye rejseplaner</th>
                        <th>Re-uploads</th>
                        <th>Fejl</th>
                        <th>Parset, ikke gemt</th>
                        <th>Seneste upload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.users.map((u) => (
                        <tr key={u.userId}>
                          <td>{u.name}</td>
                          <td>{u.uploads}</td>
                          <td>{u.published}</td>
                          <td>{u.newTrips}</td>
                          <td>{u.reuploads}</td>
                          <td>{u.errors}</td>
                          <td>{u.parsedNotSaved}</td>
                          <td style={{ color: "var(--grey-text)" }}>
                            {formatDateTime(u.lastUploadAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 14,
        background: "rgba(0,78,80,0.04)",
        borderRadius: 2,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--grey-text)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-cormorant), serif",
          fontStyle: "italic",
          fontSize: 28,
          color: "var(--rainforest)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
