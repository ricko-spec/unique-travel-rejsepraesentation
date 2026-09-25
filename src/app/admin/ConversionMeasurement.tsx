"use client";

import { useEffect, useState } from "react";
import { parseConversionWire, type ConversionWire } from "@/lib/conversion/wire";

// Vision 3.0 Fase 5, Gate B (Issue #80) — adminvisning for den prospektive
// konverteringsmåling. Læser GET /admin/api/conversion og VALIDERER svaret
// som wire-DTO (ISO-strenge, ingen Date-cast — PR #81 review-runde 1, fund
// 6). Gate B1-tilstand: målingen er NOT_STARTED (migration ikke anvendt);
// alle øvrige tilstande er dækket af fixture-tests
// (ConversionMeasurement.test.tsx).

const WINDOWS = [30, 60, 90] as const;
const WINDOW_LABELS: Record<(typeof WINDOWS)[number], string> = { 30: "30 dage", 60: "60 dage", 90: "90 dage" };
const REASON_LABELS: Record<keyof ConversionWire["dataQuality"]["excludedByReason"], string> = {
  MISSING_BOOKING_NO: "mangler bookingnummer",
  INVALID_BOOKING_NO_FORMAT: "ugyldigt bookingnummer",
  SHARED_BOOKING_REFERENCE: "delt bookingnummer",
  CLOSED_BEFORE_QUALIFIED_OBSERVATION: "lukket før tilbud kunne observeres",
  BOOKED_BEFORE_QUALIFIED_OBSERVATION: "booket før tilbud blev observeret",
};

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1).replace(".", ",")} %`;
}

function formatDiff(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1).replace(".", ",")} pp`;
}

/** Små/undertrykte tal vises aldrig som et tal — kun som "under 10"/skjult. */
function formatCount(v: number | null): string {
  return v === null ? "skjult (lille tal)" : String(v);
}

/** Sikker formatering af en ISO-streng fra wire-DTO'en — kaster aldrig. */
export function formatIsoDate(iso: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime
    ? d.toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })
    : d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Copenhagen" });
}

function formatPeriod(index: number, from: string, to: string): string {
  return `Periode ${index} (${from === to ? from : `${from} – ${to}`})`;
}

export function ConversionMeasurement() {
  const [wire, setWire] = useState<ConversionWire | null>(null);
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
        const parsed = parseConversionWire(await res.json());
        if (!cancelled) {
          if (parsed) setWire(parsed);
          else setError("Konverteringsmålingen returnerede et uventet format.");
        }
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

      {!loading && !error && wire && <ConversionBody wire={wire} />}
    </div>
  );
}

const NOTE_STYLE = { background: "rgba(0,78,80,0.04)", color: "var(--grey-text)" } as const;

export function ConversionBody({ wire }: { wire: ConversionWire }) {
  const m = wire.measurement;
  if (m.status === "NOT_STARTED") {
    return (
      <div className="admin-success" style={NOTE_STYLE} data-state="not-started">
        Målingen er ikke startet endnu. Den starter ved første godkendte produktionssynkronisering (Gate D) —
        ingen historisk data indgår.
      </div>
    );
  }
  if (!m.measurementStartedAt) {
    return (
      <div className="admin-success" style={NOTE_STYLE} data-state="awaiting-baseline">
        Målingen er aktiveret og afventer den første officielle baseline-synkronisering.
      </div>
    );
  }

  const dq = wire.dataQuality;
  const excludedParts = (Object.keys(REASON_LABELS) as (keyof typeof REASON_LABELS)[]).map(
    (k) => `${formatCount(dq.excludedByReason[k])} ${REASON_LABELS[k]}`,
  );

  return (
    <div data-state={wire.hasPublishableComparison ? "publishable" : "not-mature"}>
      <div style={{ fontSize: 12, color: "var(--grey-text)", marginBottom: 12 }}>
        Målingsstart: {formatIsoDate(m.measurementStartedAt)}
        {" · "}
        Seneste succesfulde synkronisering: {m.lastSuccessfulSyncAt ? formatIsoDate(m.lastSuccessfulSyncAt, true) : "endnu ingen"}
        {m.status === "PAUSED" && " · Målingen er sat på pause"}
      </div>

      {wire.freshness === "STALE" && (
        <div className="admin-error" style={{ marginBottom: 12 }} data-freshness="stale">
          Data er forældede — seneste succesfulde synkronisering er mere end 36 timer gammel. Tallene nedenfor er
          ikke opdaterede.
        </div>
      )}

      <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
        <GroupCard label="PDF + online rejseplan" total={wire.groups.ONLINE.totalEnrolled} />
        <GroupCard label="Kun PDF" total={wire.groups.PDF_ONLY.totalEnrolled} />
      </div>

      {!wire.hasPublishableComparison ? (
        <div className="admin-success" style={NOTE_STYLE}>
          Ikke nok data endnu til en sammenligning — vises når begge grupper har et modent og publicerbart grundlag.
        </div>
      ) : (
        <>
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
              {WINDOWS.map((w) => (
                <tr key={w}>
                  <td>{WINDOW_LABELS[w]}</td>
                  <td style={{ textAlign: "center" }}>{formatPercent(wire.groups.ONLINE.windows[w].ratePercent)}</td>
                  <td style={{ textAlign: "center" }}>{formatPercent(wire.groups.PDF_ONLY.windows[w].ratePercent)}</td>
                  <td style={{ textAlign: "center" }}>{formatDiff(wire.differencePercentPoints[w])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TrendTable label="Udvikling pr. kohorteperiode — PDF + online (30 dage)" periods={wire.groups.ONLINE.trend30} />
          <TrendTable label="Udvikling pr. kohorteperiode — kun PDF (30 dage)" periods={wire.groups.PDF_ONLY.trend30} />
        </>
      )}

      <div style={{ fontSize: 12, color: "var(--grey-text)" }}>
        Datakvalitet: {formatCount(dq.totalObserved)} deals observeret · {formatCount(dq.eligiblePending)} afventer
        tilbud · {formatCount(dq.preStartExisting)} udelukket (var allerede i gang før målingsstart) ·{" "}
        {excludedParts.join(" · ")} · {formatCount(dq.bookingConflicts)} taget ud pga. senere opdaget delt bookingnummer ·{" "}
        {formatCount(dq.postEnrollmentExcluded.BOOKED_OTHER_REFERENCE_UNRESOLVED)} taget ud pga. salg på andet bookingnummer
        (uafklaret) · {formatCount(dq.postEnrollmentExcluded.INVALIDATED_DUPLICATE_OR_TEST)} taget ud som dublet/test ·{" "}
        {formatCount(dq.lostObserved)} tabt/afvist observeret · {formatCount(dq.outcomeConflicts)} med modstridende
        status (tabt/afvist og konflikter er kun datakvalitet og indgår ikke i konverteringsprocenten). Små tal under
        10 vises ikke.
      </div>

      <p style={{ fontSize: 11, color: "var(--grey-text)", marginTop: 12, fontStyle: "italic" }}>
        Forskellen er en observeret sammenhæng, ikke et bevis for at online rejseplanen forårsager højere
        konvertering — sælgere, destinationer og kundeprofil kan variere mellem grupperne. &quot;Online rejseplan&quot;
        betyder at planen eksisterede, da tilbuddet første gang blev observeret — ikke at kunden åbnede den.
      </p>
    </div>
  );
}

function GroupCard({ label, total }: { label: string; total: number | null }) {
  return (
    <div style={{ flex: 1, minWidth: 160, padding: 12, background: "rgba(0,78,80,0.03)", borderRadius: 2 }}>
      <div style={{ fontSize: 12, color: "var(--grey-text)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: "var(--font-cormorant), serif" }}>{formatCount(total)}</div>
      <div style={{ fontSize: 11, color: "var(--grey-text)" }}>tilbud i målingen</div>
    </div>
  );
}

function TrendTable({ label, periods }: { label: string; periods: ConversionWire["groups"]["ONLINE"]["trend30"] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "var(--grey-text)", marginBottom: 4 }}>{label}</div>
      {periods.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--grey-text)" }}>Ingen modne, publicerbare perioder endnu.</div>
      ) : (
        <table style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Kohorteperiode</th>
              <th>Tilbud</th>
              <th>Booket</th>
              <th>Konvertering</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.periodIndex}>
                <td>{formatPeriod(p.periodIndex, p.fromMonth, p.toMonth)}</td>
                <td style={{ textAlign: "center" }}>{p.enrolled}</td>
                <td style={{ textAlign: "center" }}>{p.booked}</td>
                <td style={{ textAlign: "center" }}>{formatPercent(p.ratePercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
