// Vision 3.0 Fase 1C (Issue #69) — sælgervendt visning af de besøgsdata Fase
// 1B (Issue #65) allerede indsamler i trip_visits. Ren, testbar
// klassifikations- og formateringslogik: ingen Supabase-import, ingen React,
// ingen process.env. Samme mønster som trip-visit.ts/trip-creator.ts.
//
// "no row" og "query fejlede" er to VIDT forskellige tilstande — en fejlet
// forespørgsel må ALDRIG vises som "Ikke åbnet endnu" (Issue #69). Derfor har
// klassifikationen fire udfald, ikke tre.

import { TRACKING_SINCE } from "./trip-visit";

export type TripEngagementState =
  | {
      kind: "opened";
      firstOpenedAt: string;
      lastOpenedAt: string;
      visitCount: number;
      openCount: number;
    }
  | { kind: "not-opened" }
  | { kind: "no-recent-data" }
  | { kind: "unavailable" };

// Kompakt variant til adminlistens response (review-fund på PR #70): listens
// UI bruger kun `kind`, `visitCount` og `lastOpenedAt` — hverken
// `firstOpenedAt` (kun trip-detaljesiden) eller `openCount` (vises bevidst
// slet ikke i sælger-UI'et, se TripDetail.tsx). "Send ikke unødvendige rå
// analytics-/interne DB-felter, hvis UI'et ikke bruger dem" (Issue #69).
// Trip-detaljesiden bruger fortsat den fulde TripEngagementState server-side.
export type TripEngagementListState =
  | { kind: "opened"; lastOpenedAt: string; visitCount: number }
  | { kind: "not-opened" }
  | { kind: "no-recent-data" }
  | { kind: "unavailable" };

/** Beskærer en fuld TripEngagementState til den kompakte list-variant. */
export function toTripEngagementListState(state: TripEngagementState): TripEngagementListState {
  if (state.kind !== "opened") return state;
  return { kind: "opened", lastOpenedAt: state.lastOpenedAt, visitCount: state.visitCount };
}

// Formen af en trip_visits-række som den kommer retur fra Supabase — bevidst
// løs (alle felter optional/nullable), fordi klassifikationen selv skal
// kunne afvise malformed data ("hellere unavailable end falsk not-opened",
// Issue #69) i stedet for at lade et forkert UI-udsagn slippe igennem.
export type RawTripVisitRow = {
  first_opened_at?: string | null;
  last_opened_at?: string | null;
  visit_count?: number | null;
  open_count?: number | null;
};

const RETENTION_WINDOW_MONTHS = 12;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Skærpet validering (review-fund på PR #70): en EKSISTERENDE trip_visits-
// række kan pr. konstruktion aldrig have visit_count/open_count = 0 —
// record_trip_visit() (supabase/010_trip_visits.sql) sætter begge til 1 ved
// insert og inkrementerer kun derfra. Et positivt heltal er derfor det
// eneste gyldige — 0 (eller derunder) er i sig selv et tegn på malformed
// data, ikke en legitim "besøgt men talt 0 gange"-tilstand.
function isPositiveInteger(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 1;
}

// cutoff = max(trip.created_at, TRACKING_SINCE) — se
// supabase/010b_trip_visits_retention.sql for den fulde begrundelse. En trip
// oprettet FØR Fase 1B overhovedet eksisterede kan ikke bruge sin egen
// created_at som et troværdigt "sporet fra"-tidspunkt; TRACKING_SINCE er
// gulvet. trackingSince = null (kun muligt i tests) betyder "ingen kendt
// sporings-start" — cutoff falder da tilbage til trip.created_at alene.
function computeCutoff(tripCreatedAt: Date, trackingSince: Date | null): Date {
  if (!trackingSince) return tripCreatedAt;
  return tripCreatedAt.getTime() > trackingSince.getTime() ? tripCreatedAt : trackingSince;
}

// 12-måneders-grænsen. Operator-valg (bevidst, testet eksplicit på grænsen i
// trip-engagement.test.ts): cutoff PRÆCIS 12 kalendermåneder gammel ELLER
// ældre => "no-recent-data". Matcher retention-jobbets egen semantik
// (`delete ... where last_opened_at < now() - interval '12 months'` i
// supabase/010b_trip_visits_retention.sql — retention er IKKE aktiveret, men
// visningsreglen skal være korrekt den dag den bliver det): ved præcis
// 12 måneder kunne retention i princippet allerede have nået at fjerne en
// række, så vi tør ikke længere garantere "Ikke åbnet endnu". Er cutoff
// YNGRE end 12 måneder, er "Ikke åbnet endnu" derimod garanteret sandt,
// fordi retention (var den aktiveret) ikke kan have nået at slette noget
// endnu. `setUTCMonth` giver kalendermåneder (variabel længde/skudår), ikke
// en fast 365-dages-tilnærmelse — samme grundprincip som Postgres' egen
// `interval '12 months'`.
function isAtLeastTwelveMonthsOld(cutoff: Date, now: Date): boolean {
  const threshold = new Date(now);
  threshold.setUTCMonth(threshold.getUTCMonth() - RETENTION_WINDOW_MONTHS);
  return cutoff.getTime() <= threshold.getTime();
}

export function classifyTripEngagement(input: {
  /** null = forespørgslen lykkedes og fandt ingen række. */
  visitRow: RawTripVisitRow | null;
  /** true = selve opslaget fejlede — overtrumfer alt andet, se toppen af filen. */
  readFailed: boolean;
  tripCreatedAt: string;
  /** Injectable for deterministiske tests. Default: den faktiske "nu". */
  now?: Date;
  /** Injectable for tests. Default: den rigtige produktions-konstant. */
  trackingSince?: string | null;
}): TripEngagementState {
  if (input.readFailed) return { kind: "unavailable" };

  const now = input.now ?? new Date();
  const trackingSince = input.trackingSince === undefined ? TRACKING_SINCE : input.trackingSince;

  if (input.visitRow) {
    const firstOpenedAt = parseDate(input.visitRow.first_opened_at);
    const lastOpenedAt = parseDate(input.visitRow.last_opened_at);
    const { visit_count: visitCount, open_count: openCount } = input.visitRow;

    if (
      !firstOpenedAt ||
      !lastOpenedAt ||
      !isPositiveInteger(visitCount) ||
      !isPositiveInteger(openCount) ||
      // open_count tælles op ved HVER kvalificeret render, visit_count kun
      // ved en NY besøgsperiode (010_trip_visits.sql) — open_count kan derfor
      // aldrig være lavere end visit_count. Et brud er malformed data.
      openCount < visitCount
    ) {
      // Raden findes, men er malformed — vis ALDRIG en påstået tilstand ud
      // fra ugyldige data.
      return { kind: "unavailable" };
    }

    return {
      kind: "opened",
      firstOpenedAt: firstOpenedAt.toISOString(),
      lastOpenedAt: lastOpenedAt.toISOString(),
      visitCount,
      openCount,
    };
  }

  const tripCreatedAtDate = parseDate(input.tripCreatedAt);
  if (!tripCreatedAtDate) return { kind: "unavailable" };

  const cutoff = computeCutoff(tripCreatedAtDate, parseDate(trackingSince));

  return isAtLeastTwelveMonthsOld(cutoff, now)
    ? { kind: "no-recent-data" }
    : { kind: "not-opened" };
}

// ----------------------------------------------------------------------------
// Dansk, tidszone-eksplicit formatering (Europe/Copenhagen — aldrig serverens
// tilfældige runtime-tidszone). Database-tidsstempler er timestamptz/UTC;
// disse to helpers er de ENESTE steder Fase 1C konverterer dem til dansk
// lokal tid til visning.
// ----------------------------------------------------------------------------

const COPENHAGEN_TZ = "Europe/Copenhagen";

function copenhagenDateTimeParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: COPENHAGEN_TZ,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

/** Kort form til adminlisten: "18/09 14:33". Tom streng ved ugyldig input. */
export function formatVisitTimestampShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = copenhagenDateTimeParts(d);
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Dansk langform, kun dato: "18. september 2026". Tom streng ved ugyldig input. */
export function formatDateLongDK(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: COPENHAGEN_TZ,
  }).format(d);
}

/** Lang, læsbar form til trip-detaljesiden: "18. september 2026 kl. 14:33". */
export function formatVisitTimestampLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = formatDateLongDK(iso);
  const p = copenhagenDateTimeParts(d);
  return `${datePart} kl. ${p.hour}:${p.minute}`;
}
