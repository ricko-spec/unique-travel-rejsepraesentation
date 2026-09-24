"use client";

import { useEffect, useState } from "react";
import type { ConversionAggregate } from "@/lib/conversion/aggregate";

// Vision 3.0 Fase 5, Gate B (Issue #80) — adminvisning for den prospektive
// konverteringsmåling. Læser GET /admin/api/conversion (aggregater KUN).
// Gate B1-tilstand: målingen er altid NOT_STARTED (migration ikke anvendt,
// ingen sync har kørt) — komponenten viser da den fail-closed
// "ikke startet"-tilstand. Den fulde sammenlignings-UI er implementeret og
// testet (fixtures i aggregate.test.ts/dette komponents egne tests), men
// kan først vise rigtige tal efter Gate D.

const WINDOW_LABELS: Record<30 | 60 | 90, string> = { 30: "30 dage", 60: "60 dage", 90: "90 dage" };

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1).replace(".", ",")} %`;
}

function formatDiff(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1).replace(".", ",")} pp`;
}

function formatCount(v: number | null): string {
  return v === null ? "—" : String(v);
}

export function ConversionMeasurement() {
  const [aggregate, setAggregate] = useState<ConversionAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/admin/api/conversion");
        if (!res.ok) {
          if (!cancelled) setError("Konverteringsmålingen kunne ikke hentes lige nu.");
          return;
        }
        const j = (await res.json()) as ConversionAggregate;
        if (!cancelled) setAggregate(j);
      } catch {
        if (!cancelled) setError("Konverteringsmålingen kunne ikke hentes lige nu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-card">
      <h2>Konverteringsmåling — online rejseplan vs. kun PDF</h2>
      <p style={{ fontSize: 12, color: "var(--grey-text)", marginTop: -8, marginBottom: 16 }}>
        Prospektiv, automatisk måling (Vision 3.0 Fase 5). Viser observeret sammenhæng — ikke bevist årsag.
      </p>

      {loading && (
        <div style={{ color: "var(--grey-text)", fontSize: 13 }}>
          <span className="admin-spinner" />
          Henter...
        </div>
      )}

      {!loading && error && <div className="admin-error">{error}</div>}

      {!loading && !error && aggregate && (
        <ConversionBody aggregate={aggregate} />
      )}
    </div>
  );
}

function ConversionBody({ aggregate }: { aggregate: ConversionAggregate }) {
  if (aggregate.measurement.status === "NOT_STARTED" || !aggregate.measurement.measurementStartedAt) {
    return (
      <div className="admin-success" style={{ background: "rgba(0,78,80,0.04)", color: "var(--grey-text)" }}>
        Målingen er ikke startet endnu. Den starter automatisk ved første godkendte produktionssynkronisering
        (Gate D) — ingen historisk data indgår.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--grey-text)", marginBottom: 12 }}>
        Målingsstart:{" "}
        {aggregate.measurement.measurementStartedAt.toLocaleDateString("da-DK", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        {" · "}
        Seneste synkronisering:{" "}
        {aggregate.measurement.lastSuccessfulSyncAt
          ? aggregate.measurement.lastSuccessfulSyncAt.toLocaleString("da-DK")
          : "endnu ingen"}
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
        <GroupCard label="PDF + online rejseplan" stats={aggregate.groups.ONLINE} />
        <GroupCard label="Kun PDF" stats={aggregate.groups.PDF_ONLY} />
      </div>

      {!aggregate.hasPublishableComparison ? (
        <div className="admin-success" style={{ background: "rgba(0,78,80,0.04)", color: "var(--grey-text)" }}>
          Ikke nok data endnu til en sammenligning — vises igen når begge grupper har et modent og
          publicerbart grundlag.
        </div>
      ) : (
        <table style={{ width: "100%", fontSize: 13, marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Vindue</th>
              <th>PDF + online</th>
              <th>Kun PDF</th>
              <th>Forskel</th>
            </tr>
          </thead>
          <tbody>
            {([30, 60, 90] as const).map((w) => (
              <tr key={w}>
                <td>{WINDOW_LABELS[w]}</td>
                <td style={{ textAlign: "center" }}>{formatPercent(aggregate.groups.ONLINE.windows[w].ratePercent)}</td>
                <td style={{ textAlign: "center" }}>{formatPercent(aggregate.groups.PDF_ONLY.windows[w].ratePercent)}</td>
                <td style={{ textAlign: "center" }}>{formatDiff(aggregate.differencePercentPoints[w])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ fontSize: 12, color: "var(--grey-text)" }}>
        Datakvalitet: {aggregate.dataQuality.totalObserved} deals observeret ·{" "}
        {aggregate.dataQuality.eligiblePendingCount} afventer tilbud ·{" "}
        {aggregate.dataQuality.preStartExistingCount} udelukket (var allerede i gang før målingsstart) ·{" "}
        {Object.values(aggregate.dataQuality.excludedByReason).reduce((a, b) => a + b, 0)} udelukket
        (bookingnummer-problem) · {aggregate.dataQuality.lostObservedCount} tabt/afvist observeret (kun
        datakvalitet, indgår ikke i konverteringsprocenten)
      </div>

      <p style={{ fontSize: 11, color: "var(--grey-text)", marginTop: 12, fontStyle: "italic" }}>
        Forskellen ovenfor er en observeret sammenhæng, ikke et bevis for at online rejseplanen forårsager
        højere konvertering — sælgere, destinationer og kundeprofil kan variere mellem grupperne.
      </p>
    </div>
  );
}

function GroupCard({ label, stats }: { label: string; stats: ConversionAggregate["groups"]["ONLINE"] }) {
  return (
    <div style={{ flex: 1, padding: 12, background: "rgba(0,78,80,0.03)", borderRadius: 2 }}>
      <div style={{ fontSize: 12, color: "var(--grey-text)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: "var(--font-cormorant), serif" }}>
        {formatCount(stats.totalEnrolled)}
      </div>
      <div style={{ fontSize: 11, color: "var(--grey-text)" }}>tilbud i målingen</div>
    </div>
  );
}
