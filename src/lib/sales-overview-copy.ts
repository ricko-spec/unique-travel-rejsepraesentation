// Vision 3.0 Fase 4 (Issue #76) — ALLE UI-tekster i salgsoversigten samlet ét sted,
// så de kan kontrolleres mod ordlisten (AK-12): INGEN fortolkende ord som hot, varm,
// lead, score, interesseret eller sandsynlig. En sælger skal aldrig få den
// fortolkning serveret at aktivitet = interesse, at et kontaktklik = en gennemført
// samtale, eller at "ikke åbnet" = "ikke sendt"/"ikke interesseret".
// Formuleringer beskriver KUN hvad der er observeret (eller ikke kan siges).

import { formatDateLongDK, formatVisitTimestampShort } from "./trip-engagement";
import type {
  ActivityFilter,
  MineFilter,
  SortKey,
} from "./sales-overview-view";
import type { ContactCell, OpenedCell, SalesSource, SectionsCell } from "./sales-overview-types";

export const COPY = {
  title: "Alle præsentationer",
  searchPlaceholder: "Søg bookingnummer, kunde eller destination",
  searchAria: "Søg i rejsepræsentationer",
  filters: {
    activity: "Aktivitet",
    seller: "Sælger",
    sort: "Sortér efter",
    showInactive: "Vis deaktiverede",
  },
  activityOptions: {
    all: "Alle",
    "has-activity": "Har målt aktivitet",
    "contact-click": "Kontaktklik",
    "no-activity": "Ingen målt aktivitet",
  } satisfies Record<ActivityFilter, string>,
  mineOptions: {
    all: "Alle sælgere",
    mine: "Mine",
  } satisfies Record<MineFilter, string>,
  sortOptions: {
    "latest-activity": "Seneste aktivitet",
    created: "Oprettet (nyeste)",
    "last-opened": "Senest åbnet",
  } satisfies Record<SortKey, string>,
  columns: {
    booking: "Booking",
    destination: "Destination",
    customer: "Kunde",
    created: "Oprettet",
    opened: "Åbnet",
    sections: "Set",
    contact: "Kontakt",
    lastActivity: "Seneste aktivitet",
    status: "Status",
    actions: "Handlinger",
  },
  empty: {
    noTrips: "Ingen præsentationer endnu.",
    noMatch: "Ingen rejsepræsentationer fundet.",
  },
  more: "Vis flere",
  none: "Ingen registreret",
  notAssessable: "Kunne ikke vurderes",
  notFetched: "Kunne ikke hentes",
  noneMeasured: "Ingen målt",
  priceReached: "Pris nået",
  phoneClicked: "Telefon klikket",
  emailClicked: "Email klikket",
  degradedBanner: "Nogle aktivitetsdata kunne ikke hentes. De berørte kolonner viser dette tydeligt, og rækkerne er ikke udeladt:",
  degradedSources: {
    visits: "Åbnet",
    sections: "Set",
    contact: "Kontakt",
    destinations: "Set (billedgalleri)",
    profiles: "Oprettet af / Mine",
  } satisfies Record<SalesSource, string>,
  footnote:
    "Kolonnerne viser målt aktivitet — ikke personer eller enheder, og ikke om kontakt er gennemført. En åbning er en læseperiode, et klik er et klik.",
} as const;

export function showingText(shown: number, total: number): string {
  return shown === total
    ? `Viser ${total} ${total === 1 ? "præsentation" : "præsentationer"}`
    : `Viser ${shown} af ${total} præsentationer`;
}

export function matchText(count: number): string {
  return count === 1
    ? "1 præsentation matcher søgningen"
    : `${count} præsentationer matcher søgningen`;
}

export function moreText(remaining: number): string {
  return `${COPY.more} (${remaining})`;
}

/** Tekstlinjer for "Åbnet"-cellen. */
export function openedLines(cell: OpenedCell): { primary: string; secondary?: string } {
  switch (cell.kind) {
    case "opened":
      return {
        primary: cell.visitCount === 1 ? "1 besøg" : `${cell.visitCount} besøg`,
        secondary: `Senest ${formatVisitTimestampShort(cell.lastOpenedAt)}`,
      };
    case "not-opened":
      return { primary: "Ikke åbnet endnu" };
    case "not-measured":
      return { primary: `Ingen åbning målt siden ${formatDateLongDK(cell.since)}` };
    case "no-recent-data":
      return { primary: "Ingen registrerede åbninger de seneste 12 måneder" };
    case "unavailable":
      return { primary: COPY.notFetched };
  }
}

/** Tekstlinjer for "Set"-cellen. */
export function sectionsLines(cell: SectionsCell): { primary: string; secondary?: string } {
  switch (cell.kind) {
    case "reached":
      return {
        primary: `${cell.reached} af ${cell.total} afsnit`,
        secondary: cell.price ? COPY.priceReached : undefined,
      };
    case "none-registered":
      return { primary: COPY.none };
    case "unassessable":
      return { primary: COPY.notAssessable };
    case "unavailable":
      return { primary: COPY.notFetched };
  }
}

/** Tekstlinjer for "Kontakt"-cellen (klikket — aldrig "kontaktet"). */
export function contactLines(cell: ContactCell): string[] {
  switch (cell.kind) {
    case "clicked":
      return [
        ...(cell.phone ? [COPY.phoneClicked] : []),
        ...(cell.email ? [COPY.emailClicked] : []),
      ];
    case "none-registered":
      return [COPY.none];
    case "unassessable":
      return [COPY.notAssessable];
    case "unavailable":
      return [COPY.notFetched];
  }
}

/** "Seneste aktivitet"-cellen: dato, eller neutral "Ingen målt". */
export function lastActivityText(iso: string | null): string {
  return iso ? formatVisitTimestampShort(iso) : COPY.noneMeasured;
}

/** Alle statiske UI-strenge (til ordliste-testen). */
export function allStaticCopy(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(COPY);
  return out;
}
