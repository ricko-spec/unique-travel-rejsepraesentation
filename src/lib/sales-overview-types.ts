// Vision 3.0 Fase 4 (Issue #76) — DTO-typer for salgsoversigten (rejseforslagslisten).
// KUN typer: ingen runtime-imports, så både server (builder) og klient (visning)
// kan dele dem uden at trække zod/types.ts ind i admin-bundlet.
//
// Listen udleveres som et KOMPAKT DTO. Browseren modtager ALDRIG `data`,
// `raw_pdf_text` eller `created_by` (kundetekst/interne id'er) — kun det afledte,
// og kun observerede fakta: se docs/VISION-3.0-PHASE-4-PLAN.md §3-§4.

import type { TripEngagementListState } from "./trip-engagement";

/** Åbnet (Fase 1B/1C): opened | not-opened | not-measured | no-recent-data | unavailable. */
export type OpenedCell = TripEngagementListState;

/**
 * Set (Fase 2): "n af m" hovedafsnit nået. `reached`/`total` tæller kun de afsnit
 * rejseplanen faktisk HAR (eligibility fra tripSchema + normalizeTrip).
 */
export type SectionsCell =
  | { kind: "reached"; reached: number; total: number; price: boolean }
  | { kind: "none-registered" }
  /** trip-data kan ikke valideres ⇒ vi ved ikke hvilke afsnit der findes. */
  | { kind: "unassessable" }
  /** kilden (eller destinations-opslaget galleri-eligibility afhænger af) kunne ikke læses. */
  | { kind: "unavailable" };

/** Kontakt (Fase 3): kun KLIKKET — aldrig "kontaktet"/"booket". */
export type ContactCell =
  | { kind: "clicked"; phone: boolean; email: boolean }
  | { kind: "none-registered" }
  | { kind: "unassessable" }
  | { kind: "unavailable" };

export type SalesOverviewRow = {
  id: string;
  booking_no: string;
  slug: string;
  destination: string;
  customer_name: string | null;
  active: boolean;
  created_at: string;
  /** Afledt navn (aldrig den rå created_by-uuid). UDELADT når ukendt (kompakt DTO). */
  created_by_name?: string;
  /**
   * Bekvemmelighedsfilter (ikke adgangskontrol): rejseplanens rådgiver = den indloggede
   * advisor_match_name. UDELADT når falsk (kompakt DTO).
   */
  mine?: true;
  opened: OpenedCell;
  sections: SectionsCell;
  contact: ContactCell;
  /**
   * Nyeste af de observerede tidsstempler (senest åbnet, seneste sete afsnit, seneste
   * kontaktklik) — ren dato-aritmetik, ingen vægtning. UDELADT = ingen målt aktivitet.
   */
  lastActivityAt?: string;
};

/** Datakilder der kan fejle uafhængigt af hinanden (fail-open pr. kilde). */
export type SalesSource = "visits" | "sections" | "contact" | "destinations" | "profiles";

export type SalesOverview = {
  trips: SalesOverviewRow[];
  viewer: {
    /** "Mine"-filteret vises kun hvis den indloggedes profil har en advisor_match_name. */
    mineAvailable: boolean;
  };
  /** Kilder der ikke kunne læses — de berørte kolonner viser "kunne ikke hentes". */
  degraded: SalesSource[];
};
