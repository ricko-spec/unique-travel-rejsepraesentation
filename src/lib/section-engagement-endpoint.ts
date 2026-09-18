// Vision 3.0 Fase 2 (Issue #71) — beslutningskæden bag
// POST /[bookingId]/engagement, udtrukket fra route.ts så den kan testes uden
// at mocke Next.js (Request/cookies()/headers()) eller Supabase. route.ts er
// en tynd adapter: den læser request'en, kalder handleSectionEngagement() og
// oversætter det returnerede udfald til en HTTP-status. ALL sikkerheds-
// kritisk rækkefølge lever HER — der er ingen parallel kopi i route.ts.
//
// Rent afhængigheds-injiceret: ingen Supabase-/Next-/process.env-imports.
// Alt I/O (trip-opslag, galleri-opslag, DB-skrivning) kommer ind som deps.

import {
  sectionEngagementBodySchema,
  shouldRecordSectionEngagement,
  computeEligibleSectionsForTrip,
  type SectionId,
} from "./section-engagement";
import { hasValidTripAccess } from "./trip-access";
import { tripSchema, normalizeTrip } from "./types";
import type { VisitDecisionInput } from "./trip-visit";

/** De kolonner endpointet skal bruge fra `trips` (aldrig `select("*")`). */
export type EngagementTripRow = {
  id: string;
  booking_no: string;
  destination: string;
  data: unknown;
};

export type EngagementDeps = {
  /** Aktiv trip for slug'en, ellers null (ikke fundet, inaktiv ELLER DB-fejl). */
  loadTrip: (slug: string) => Promise<EngagementTripRow | null>;
  /** Destinationens galleri-URL'er (samme opslag som kundesiden). */
  loadGalleryImages: (destination: string) => Promise<string[]>;
  /** Selve skrivningen. Kaster aldrig; returnerer om den lykkedes. */
  recordSection: (tripId: string, section: SectionId) => Promise<{ kind: string }>;
};

export type EngagementInput = {
  slug: string;
  /** Den parsede request-body (eller null hvis den ikke kunne parses). */
  body: unknown;
  /** Værdien af trip_access_<slug>-cookien, hvis den findes. */
  accessCookieValue: string | undefined;
  /** Production/host/bot/admin-gatens input. */
  gate: VisitDecisionInput;
};

/**
 * `reason` er kun til tests/observability — route.ts eksponerer det ALDRIG i
 * svaret. 204 er bevidst det ENESTE svar klienten ser for både "skrevet",
 * "gaten afviste" og "sektionen findes ikke på denne trip": klienten må aldrig
 * kunne skelne dem (og retry'er aldrig).
 */
export type EngagementResult =
  | { status: 400; reason: "bad-body" }
  | { status: 404; reason: "no-trip-or-access" }
  | { status: 204; reason: "gated" | "ineligible" | "recorded" }
  | { status: 500; reason: "write-failed" };

export async function handleSectionEngagement(
  input: EngagementInput,
  deps: EngagementDeps,
): Promise<EngagementResult> {
  // 1. Body — strict Zod: kun de fem kendte sections, ingen ekstra nøgler.
  // Klienten kan strukturelt aldrig sende sit eget trip_id.
  const parsed = sectionEngagementBodySchema.safeParse(input.body);
  if (!parsed.success) return { status: 400, reason: "bad-body" };
  const section = parsed.data.section;

  // 2. Trip + adgang. "Trip findes ikke/er inaktiv" og "adgangscookien er
  // forkert/mangler" giver BEVIDST samme 404 (ingen slug-/adgangs-oracle).
  const trip = await deps.loadTrip(input.slug);
  if (!trip || !hasValidTripAccess(input.accessCookieValue, trip.booking_no)) {
    return { status: 404, reason: "no-trip-or-access" };
  }

  // 3. Production/host/bot/admin-gate (samme princip som Fase 1B). Preview
  // deler production-DB'en og må aldrig skrive til den.
  if (!shouldRecordSectionEngagement(input.gate)) {
    return { status: 204, reason: "gated" };
  }

  // 4. Server-side eligibility. Klientens eligibility er UX/dedup, IKKE en
  // trust boundary: en kunde med gyldig adgangscookie kan manuelt POSTe fx
  // { "section": "contact" } for en rejseplan uden kontaktsektion. Vi afgør
  // derfor selv, ud fra trippens egne data og destinationens galleri, om
  // sektionen findes — med samme funktion (computeEligibleSectionsForTrip)
  // som kundesiden. Ineligible = harmless 204 no-op, INGEN skrivning: samme
  // svar som en gate-afvisning eller et lykkedes write, så endpointet ikke
  // kan bruges til at udspørge en rejseplans indhold. Trip-data der ikke kan
  // parses (kundesiden viser så sin fejlside uden sektioner) er ligeledes
  // ineligible.
  const tripData = tripSchema.safeParse(trip.data);
  if (!tripData.success) return { status: 204, reason: "ineligible" };
  const normalized = normalizeTrip(tripData.data);
  const galleryImages = await deps.loadGalleryImages(trip.destination);
  const eligible = computeEligibleSectionsForTrip(normalized, galleryImages);
  if (!eligible.includes(section)) return { status: 204, reason: "ineligible" };

  // 5. Selve skrivningen — trip.id er SERVER-afledt fra slug-opslaget, aldrig
  // fra klienten; section er den validerede, parsede værdi.
  const outcome = await deps.recordSection(trip.id, section);
  if (outcome.kind !== "ok") return { status: 500, reason: "write-failed" };
  return { status: 204, reason: "recorded" };
}
