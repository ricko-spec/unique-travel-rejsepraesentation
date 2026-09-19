"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCustomerPreview } from "@/lib/format";
import {
  DEFAULT_VIEW,
  PAGE_SIZE,
  applyView,
  isSearching,
  paginate,
  remainingCount,
  type ActivityFilter,
  type MineFilter,
  type SalesViewState,
  type SortKey,
} from "@/lib/sales-overview-view";
import {
  COPY,
  contactLines,
  lastActivityText,
  matchText,
  moreText,
  openedLines,
  sectionsLines,
  showingText,
} from "@/lib/sales-overview-copy";
import type { SalesOverview, SalesOverviewRow } from "@/lib/sales-overview-types";

// Vision 3.0 Fase 4 (Issue #76) — salgsoversigten: rejseforslagslisten med MÅLT
// kundeaktivitet. Ren visning af det kompakte DTO fra GET /admin/api/trips; al
// beslutningslogik (filtre, sortering, tilstande, tekster) ligger i
// src/lib/sales-overview-view.ts / -copy.ts og er unit-testet.
//
// PRINCIPPER (docs/VISION-3.0-PHASE-4-PLAN.md §3-§4): kun observerede fakta — ingen
// fortolkning. En fejlet kilde eller ukendt vurdering vises med egen tekst
// ("Kunne ikke hentes"/"Kunne ikke vurderes"), aldrig som "Ingen registreret".

const MUTED = { color: "var(--grey-text)" } as const;

function Lines({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div>
      <div>{primary}</div>
      {secondary && (
        <div style={{ fontSize: 11, color: "var(--grey-text)", marginTop: 2 }}>{secondary}</div>
      )}
    </div>
  );
}

function OpenedCell({ row }: { row: SalesOverviewRow }) {
  const l = openedLines(row.opened);
  const positive = row.opened.kind === "opened";
  return (
    <div style={positive ? undefined : MUTED}>
      <Lines {...l} />
    </div>
  );
}

function SectionsCell({ row }: { row: SalesOverviewRow }) {
  const l = sectionsLines(row.sections);
  const positive = row.sections.kind === "reached";
  return (
    <div style={positive ? undefined : MUTED}>
      <Lines {...l} />
    </div>
  );
}

function ContactCell({ row }: { row: SalesOverviewRow }) {
  const lines = contactLines(row.contact);
  const positive = row.contact.kind === "clicked";
  return (
    <div style={positive ? undefined : MUTED}>
      {lines.map((t) => (
        <div key={t}>{t}</div>
      ))}
    </div>
  );
}

export function SalesOverviewTable({
  overview,
  onCopyLink,
  onToggleActive,
}: {
  overview: SalesOverview;
  onCopyLink: (slug: string) => void;
  onToggleActive: (id: string, currentlyActive: boolean) => void;
}) {
  const { trips, viewer, degraded } = overview;
  const [view, setView] = useState<SalesViewState>(DEFAULT_VIEW);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function updateView(patch: Partial<SalesViewState>) {
    setView((v) => ({ ...v, ...patch }));
    setVisibleCount(PAGE_SIZE); // et nyt filter/sortering starter forfra på første side
  }

  const matched = useMemo(() => applyView(trips, view), [trips, view]);
  // Aktiv søgning viser ALLE match (uændret fra før Fase 4); ellers pagineres.
  const searching = isSearching(view);
  const visible = searching ? matched : paginate(matched, visibleCount);
  const remaining = searching ? 0 : remainingCount(matched.length, visibleCount);

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginBottom: 0 }}>{COPY.title}</h2>
        {trips.length > 0 && (
          <input
            type="search"
            className="admin-input"
            style={{ width: "auto", minWidth: 240, flex: "0 1 320px" }}
            value={view.search}
            onChange={(e) => updateView({ search: e.target.value })}
            placeholder={COPY.searchPlaceholder}
            aria-label={COPY.searchAria}
          />
        )}
      </div>

      {trips.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 16,
            marginBottom: 14,
          }}
        >
          <label style={{ fontSize: 12, ...MUTED }}>
            <span style={{ display: "block", marginBottom: 4 }}>{COPY.filters.activity}</span>
            <select
              className="admin-input"
              style={{ width: "auto" }}
              value={view.activity}
              onChange={(e) => updateView({ activity: e.target.value as ActivityFilter })}
            >
              {(Object.keys(COPY.activityOptions) as ActivityFilter[]).map((k) => (
                <option key={k} value={k}>
                  {COPY.activityOptions[k]}
                </option>
              ))}
            </select>
          </label>

          {viewer.mineAvailable && (
            <label style={{ fontSize: 12, ...MUTED }}>
              <span style={{ display: "block", marginBottom: 4 }}>{COPY.filters.seller}</span>
              <select
                className="admin-input"
                style={{ width: "auto" }}
                value={view.mine}
                onChange={(e) => updateView({ mine: e.target.value as MineFilter })}
              >
                {(Object.keys(COPY.mineOptions) as MineFilter[]).map((k) => (
                  <option key={k} value={k}>
                    {COPY.mineOptions[k]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={{ fontSize: 12, ...MUTED }}>
            <span style={{ display: "block", marginBottom: 4 }}>{COPY.filters.sort}</span>
            <select
              className="admin-input"
              style={{ width: "auto" }}
              value={view.sort}
              onChange={(e) => updateView({ sort: e.target.value as SortKey })}
            >
              {(Object.keys(COPY.sortOptions) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {COPY.sortOptions[k]}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, paddingBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={view.showInactive}
              onChange={(e) => updateView({ showInactive: e.target.checked })}
            />
            {COPY.filters.showInactive}
          </label>
        </div>
      )}

      {degraded.length > 0 && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            fontSize: 13,
            background: "#fbf2dc",
            borderLeft: "3px solid var(--gold-soft)",
            color: "#5a4520",
          }}
        >
          {COPY.degradedBanner} {degraded.map((s) => COPY.degradedSources[s]).join(", ")}.
        </div>
      )}

      {trips.length === 0 ? (
        <div style={{ ...MUTED, fontSize: 13 }}>{COPY.empty.noTrips}</div>
      ) : matched.length === 0 ? (
        <div style={{ ...MUTED, fontSize: 13 }}>{COPY.empty.noMatch}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{COPY.columns.booking}</th>
                <th>{COPY.columns.destination}</th>
                <th>{COPY.columns.customer}</th>
                <th>{COPY.columns.created}</th>
                <th>{COPY.columns.opened}</th>
                <th>{COPY.columns.sections}</th>
                <th>{COPY.columns.contact}</th>
                <th>{COPY.columns.lastActivity}</th>
                <th>{COPY.columns.status}</th>
                <th>{COPY.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace" }}>#{t.booking_no}</td>
                  <td>{t.destination}</td>
                  <td style={MUTED} title={t.customer_name ?? undefined}>
                    {t.customer_name ? formatCustomerPreview(t.customer_name) : "—"}
                  </td>
                  <td style={MUTED}>
                    <div>{new Date(t.created_at).toLocaleDateString("da-DK")}</div>
                    {t.created_by_name && (
                      <div style={{ fontSize: 11, marginTop: 2 }}>{t.created_by_name}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <OpenedCell row={t} />
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <SectionsCell row={t} />
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <ContactCell row={t} />
                  </td>
                  <td style={{ fontSize: 12, ...(t.lastActivityAt ? {} : MUTED) }}>
                    {lastActivityText(t.lastActivityAt)}
                  </td>
                  <td>
                    {t.active ? (
                      <span className="admin-status-active">Aktiv</span>
                    ) : (
                      <span className="admin-status-inactive">Deaktiveret</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-btn admin-btn-secondary"
                        onClick={() => onCopyLink(t.slug)}
                        style={{ borderColor: "rgba(0,78,80,0.5)", color: "var(--rainforest)" }}
                      >
                        Kopiér link
                      </button>
                      <a
                        href={`/${t.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-btn admin-btn-secondary"
                        style={{ borderColor: "rgba(0,78,80,0.5)", color: "var(--rainforest)" }}
                      >
                        Åbn
                      </a>
                      <Link href={`/admin/trips/${t.id}`} className="admin-btn admin-btn-secondary">
                        Detaljer
                      </Link>
                      <Link href={`/admin/qa/${t.slug}`} className="admin-btn admin-btn-secondary">
                        Sammenlign
                      </Link>
                      <button
                        className="admin-btn admin-btn-danger"
                        onClick={() => onToggleActive(t.id, t.active)}
                      >
                        {t.active ? "Deaktivér" : "Aktivér"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 14, textAlign: "center", ...MUTED, fontSize: 13 }}>
            {searching ? matchText(matched.length) : showingText(visible.length, matched.length)}
          </div>
          {remaining > 0 && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                {moreText(remaining)}
              </button>
            </div>
          )}
          <p style={{ fontSize: 12, marginTop: 16, ...MUTED }}>{COPY.footnote}</p>
        </div>
      )}
    </>
  );
}
