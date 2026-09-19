// Vision 3.0 Fase 4 (Issue #76) — KLIENT-side visningslogik for salgsoversigten:
// filtre, sortering og pagination over det allerede hentede, kompakte DTO. Ren og
// afhængighedsfri (kun typer + trip-search), så den kan unit-testes og deles med
// dashboardet uden at trække zod/Supabase ind i admin-bundlet.
//
// Godkendte beslutninger (Issue #76 / docs/VISION-3.0-PHASE-4-PLAN.md §5-§6):
//   * DEFAULT: alle AKTIVE rejseforslag, sorteret efter "Seneste aktivitet" (nyeste
//     øverst); rækker uden målt aktivitet ligger UNDER dem, sorteret efter Oprettet ↓.
//     Intet skjules som default (der er kun få rejseforslag med data i starten).
//   * Tre filtre (Aktivitet, Sælger, Vis deaktiverede) + den eksisterende fritekstsøgning.
//   * Tre sorteringer med deterministiske tie-breakers: dato ↓, dernæst Oprettet ↓,
//     dernæst id.
//   * "Mine" er et bekvemmelighedsfilter — ALDRIG adgangskontrol (alle sælgere ser alle).

import { filterTrips, hasSearchQuery } from "./trip-search";
import type { SalesOverviewRow } from "./sales-overview-types";

export const PAGE_SIZE = 50;

export type ActivityFilter = "all" | "has-activity" | "contact-click" | "no-activity";
export type MineFilter = "all" | "mine";
export type SortKey = "latest-activity" | "created" | "last-opened";

export type SalesViewState = {
  activity: ActivityFilter;
  mine: MineFilter;
  showInactive: boolean;
  sort: SortKey;
  search: string;
};

export const DEFAULT_VIEW: SalesViewState = {
  activity: "all",
  mine: "all",
  showInactive: false,
  sort: "latest-activity",
  search: "",
};

/** Har rækken nogen MÅLT (observeret) aktivitet? */
export function hasMeasuredActivity(row: SalesOverviewRow): boolean {
  return row.lastActivityAt !== null;
}

/**
 * Er mindst ét af de tre signaler ukendt (kilde fejlet / trip-data kan ikke vurderes)?
 * Sådan en række kan hverken påstås at HAVE eller IKKE have aktivitet — den indgår
 * derfor aldrig i "Ingen målt aktivitet" (et falsk "ingen").
 */
export function isActivityUnknown(row: SalesOverviewRow): boolean {
  return (
    row.opened.kind === "unavailable" ||
    row.sections.kind === "unavailable" ||
    row.sections.kind === "unassessable" ||
    row.contact.kind === "unavailable" ||
    row.contact.kind === "unassessable"
  );
}

export function matchesActivity(row: SalesOverviewRow, filter: ActivityFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "has-activity":
      return hasMeasuredActivity(row);
    case "contact-click":
      return row.contact.kind === "clicked";
    case "no-activity":
      return !hasMeasuredActivity(row) && !isActivityUnknown(row);
  }
}

function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const v = new Date(iso).getTime();
  return Number.isNaN(v) ? 0 : v;
}

function byCreatedThenId(a: SalesOverviewRow, b: SalesOverviewRow): number {
  const d = ms(b.created_at) - ms(a.created_at);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function lastOpenedMs(row: SalesOverviewRow): number | null {
  return row.opened.kind === "opened" ? ms(row.opened.lastOpenedAt) : null;
}

/** Ren, deterministisk sortering (muterer ikke input). */
export function sortRows(rows: SalesOverviewRow[], sort: SortKey): SalesOverviewRow[] {
  const copy = [...rows];
  switch (sort) {
    case "created":
      return copy.sort(byCreatedThenId);
    case "latest-activity":
      return copy.sort((a, b) => {
        const aHas = hasMeasuredActivity(a);
        const bHas = hasMeasuredActivity(b);
        if (aHas !== bHas) return aHas ? -1 : 1; // rækker MED aktivitet først
        if (aHas && bHas) {
          const d = ms(b.lastActivityAt) - ms(a.lastActivityAt);
          if (d !== 0) return d;
        }
        return byCreatedThenId(a, b);
      });
    case "last-opened":
      return copy.sort((a, b) => {
        const ao = lastOpenedMs(a);
        const bo = lastOpenedMs(b);
        if ((ao === null) !== (bo === null)) return ao === null ? 1 : -1; // åbnede først
        if (ao !== null && bo !== null && ao !== bo) return bo - ao;
        return byCreatedThenId(a, b);
      });
  }
}

/** Filtrér (aktive/mine/aktivitet/søgning) og sortér. Filtrene kombineres (AND). */
export function applyView(rows: SalesOverviewRow[], view: SalesViewState): SalesOverviewRow[] {
  let result = rows;
  if (!view.showInactive) result = result.filter((r) => r.active);
  if (view.mine === "mine") result = result.filter((r) => r.mine);
  if (view.activity !== "all") result = result.filter((r) => matchesActivity(r, view.activity));
  result = filterTrips(result, view.search); // eksisterende søgning, uændret
  return sortRows(result, view.sort);
}

/** Er en søgning aktiv? (Aktiv søgning viser ALLE match — som før Fase 4.) */
export function isSearching(view: SalesViewState): boolean {
  return hasSearchQuery(view.search);
}

/** Klient-side pagination: de første `visibleCount` rækker. */
export function paginate<T>(rows: T[], visibleCount: number): T[] {
  return rows.slice(0, Math.max(0, visibleCount));
}

/** Hvor mange rækker skjules af pagination? */
export function remainingCount(total: number, visibleCount: number): number {
  return Math.max(0, total - Math.max(0, visibleCount));
}
