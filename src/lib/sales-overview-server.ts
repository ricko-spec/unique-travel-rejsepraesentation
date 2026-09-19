// Vision 3.0 Fase 4 (Issue #76) — SERVER-side læsning til salgsoversigten.
//
// FAST ANTAL LOGISKE LÆSNINGER — SEKS, uanset antal rejseplaner, ingen N+1:
//   trips · profiles · trip_visits · trip_section_engagement · trip_contact_intent ·
//   destinations
// Hver læsning er ÉT set-baseret opslag (paginerer kun teknisk over PostgRESTs
// rækkegrænse, se paged-read.ts) — aldrig ét kald pr. række, og ALDRIG
// `.in("trip_id", [...])` (lærdom fra PR #70: en voksende URL). Hele sæt læses
// ufiltreret og flettes i hukommelsen (≈ 270 trips, ≤ 5 sektions- og ≤ 2
// kontaktrækker pr. trip).
//
// Profiles læses ÉN gang og dækker både "Oprettet af" (fuldt navn) og den
// indloggedes advisor_match_name ("Mine") — det erstatter det tidligere,
// separate `profiles.in("id", creatorIds)`-opslag.
//
// `data` læses KUN her (til runtime-eligibility/rådgiver) og forlader aldrig
// serveren; `raw_pdf_text` og `hero_photo`/`updated_at` læses slet ikke.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows, type PageRequest, type PageResponse } from "./paged-read";
import {
  buildSalesOverview,
  type SalesContactRow,
  type SalesProfileRow,
  type SalesSectionRow,
  type SalesTripRow,
  type SalesVisitRow,
  type SourceRows,
} from "./sales-overview";
import type { DestinationRecord } from "./destination-match";
import type { SalesOverview } from "./sales-overview-types";

export type PageFetcher<T> = (req: PageRequest) => PromiseLike<PageResponse<T>>;

export type SalesSources = {
  trips: PageFetcher<SalesTripRow>;
  profiles: PageFetcher<SalesProfileRow>;
  visits: PageFetcher<SalesVisitRow>;
  sections: PageFetcher<SalesSectionRow>;
  contact: PageFetcher<SalesContactRow>;
  destinations: PageFetcher<DestinationRecord>;
};

/** Rejseplan-læsningen fejlede: listen kan ikke vises (route svarer 500, som før Fase 4). */
export class SalesOverviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesOverviewError";
  }
}

// Kun de kolonner der rent faktisk bruges. INGEN raw_pdf_text/hero_photo/updated_at.
export const SALES_COLUMNS = {
  trips: "id, booking_no, slug, destination, customer_name, active, created_at, created_by, data",
  profiles: "id, full_name, email, advisor_match_name",
  visits: "trip_id, first_opened_at, last_opened_at, visit_count, open_count",
  sections: "trip_id, section, last_seen_at",
  contact: "trip_id, channel, last_clicked_at",
  destinations: "name, hero_url, gallery",
} as const;

/** Den rigtige Supabase-implementering af de seks læsninger (stabil sortering pr. primærnøgle). */
export function supabaseSalesSources(supabase: SupabaseClient): SalesSources {
  function page<T>(table: string, columns: string, orderBy: string[]): PageFetcher<T> {
    return (req) => {
      let q = supabase.from(table).select(columns, req.withCount ? { count: "exact" } : undefined);
      for (const col of orderBy) q = q.order(col, { ascending: true });
      return q.range(req.from, req.to) as unknown as PromiseLike<PageResponse<T>>;
    };
  }
  return {
    trips: page("trips", SALES_COLUMNS.trips, ["id"]),
    profiles: page("profiles", SALES_COLUMNS.profiles, ["id"]),
    visits: page("trip_visits", SALES_COLUMNS.visits, ["trip_id"]),
    sections: page("trip_section_engagement", SALES_COLUMNS.sections, ["trip_id", "section"]),
    contact: page("trip_contact_intent", SALES_COLUMNS.contact, ["trip_id", "channel"]),
    destinations: page("destinations", SALES_COLUMNS.destinations, ["name"]),
  };
}

function toSource<T>(
  name: string,
  result: Awaited<ReturnType<typeof readAllRows<T>>>,
): SourceRows<T> {
  if (result.ok) return { ok: true, rows: result.rows };
  // Sanitiseret: kun kildens navn + fejlklasse + Postgres' fejltekst — aldrig rækkedata.
  console.error("[sales-overview] kilde kunne ikke læses", {
    source: name,
    reason: result.reason,
    message: result.message,
  });
  return { ok: false };
}

/**
 * Læser alle seks kilder parallelt og bygger DTO'et. En fejlet AKTIVITETSkilde er
 * fail-open (kolonnen viser "kunne ikke hentes"); en fejlet trips-læsning kaster
 * SalesOverviewError (listen kan ikke vises).
 */
export async function loadSalesOverview(
  sources: SalesSources,
  viewerId: string | null,
): Promise<SalesOverview> {
  const [trips, profiles, visits, sections, contact, destinations] = await Promise.all([
    readAllRows(sources.trips),
    readAllRows(sources.profiles),
    readAllRows(sources.visits),
    readAllRows(sources.sections),
    readAllRows(sources.contact),
    readAllRows(sources.destinations),
  ]);

  if (!trips.ok) {
    throw new SalesOverviewError(`trips kunne ikke læses (${trips.reason}): ${trips.message}`);
  }

  return buildSalesOverview({
    trips: trips.rows,
    visits: toSource("visits", visits),
    sections: toSource("sections", sections),
    contact: toSource("contact", contact),
    destinations: toSource("destinations", destinations),
    profiles: toSource("profiles", profiles),
    viewerId,
  });
}
