// Vision 3.0 Fase 3 (Issue #73) — beslutningskæden bag
// POST /[bookingId]/intent, udtrukket fra route.ts så den kan testes uden at
// mocke Next.js (Request/cookies()/headers()) eller Supabase — samme mønster
// som src/lib/section-engagement-endpoint.ts (Issue #71). route.ts er en tynd
// adapter: den læser request'en, kalder handleContactIntent() og oversætter
// det returnerede udfald til en HTTP-status. ALL sikkerhedskritisk rækkefølge
// lever HER — der er ingen parallel kopi i route.ts, og testene kører præcis
// denne funktion.
//
// Rent afhængigheds-injiceret: ingen Supabase-/Next-/process.env-imports.

import {
  contactIntentBodySchema,
  shouldRecordContactIntent,
  computeEligibleChannels,
  type ContactChannel,
} from "./contact-intent";
import { hasValidTripAccess } from "./trip-access";
import { tripSchema, normalizeTrip } from "./types";
import type { VisitDecisionInput } from "./trip-visit";

/** De kolonner endpointet skal bruge fra `trips` (aldrig `select("*")`). */
export type ContactIntentTripRow = {
  id: string;
  booking_no: string;
  data: unknown;
};

export type ContactIntentDeps = {
  /** Aktiv trip for slug'en, ellers null (ikke fundet, inaktiv ELLER DB-fejl). */
  loadTrip: (slug: string) => Promise<ContactIntentTripRow | null>;
  /** Selve skrivningen. Kaster aldrig; returnerer om den lykkedes. */
  recordIntent: (tripId: string, channel: ContactChannel) => Promise<{ kind: string }>;
};

export type ContactIntentInput = {
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
 * "gaten afviste" og "kanalen findes ikke på denne trip": klienten må aldrig
 * kunne skelne dem (og retry'er aldrig).
 */
export type ContactIntentResult =
  | { status: 400; reason: "bad-body" }
  | { status: 404; reason: "no-trip-or-access" }
  | { status: 204; reason: "gated" | "ineligible" | "recorded" }
  | { status: 500; reason: "write-failed" };

export async function handleContactIntent(
  input: ContactIntentInput,
  deps: ContactIntentDeps,
): Promise<ContactIntentResult> {
  // 1. Body — strict Zod: kun { channel: "email" | "phone" }, ingen ekstra
  // nøgler. Klienten kan strukturelt aldrig sende sit eget trip_id — og en
  // ugyldig body når aldrig at udløse et trip-opslag.
  const parsed = contactIntentBodySchema.safeParse(input.body);
  if (!parsed.success) return { status: 400, reason: "bad-body" };
  const channel = parsed.data.channel;

  // 2. Trip + adgang. "Trip findes ikke/er inaktiv" og "adgangscookien er
  // forkert/mangler" giver BEVIDST samme 404 (ingen slug-/adgangs-oracle).
  // Adgangscookien er scoped til sin egen slug (trip_access_<slug>), og
  // trip'en slås op på URL-slug'en: en gyldig cookie til slug A kan aldrig
  // validere mod slug B's booking_no.
  const trip = await deps.loadTrip(input.slug);
  if (!trip || !hasValidTripAccess(input.accessCookieValue, trip.booking_no)) {
    return { status: 404, reason: "no-trip-or-access" };
  }

  // 3. Production/host/bot/admin-gate (samme princip som Fase 1B/2). Preview
  // deler production-DB'en og må aldrig skrive til den.
  if (!shouldRecordContactIntent(input.gate)) {
    return { status: 204, reason: "gated" };
  }

  // 4. Server-side eligibility. Klientens klik-handler er IKKE en trust
  // boundary: en kunde med gyldig adgangscookie kan manuelt POSTe
  // { "channel": "email" } for en rejseplan uden rådgiver-email. Vi afgør
  // derfor selv, ud fra trippens normaliserede data (tripSchema +
  // normalizeTrip, ikke løs læsning af rå JSON), om kanalen findes som et
  // faktisk link — email kun med advisorEmail, phone altid. Ineligible =
  // harmløst 204 no-op, INGEN skrivning: samme svar som en gate-afvisning
  // eller et lykkedes write, så endpointet ikke kan bruges til at udspørge
  // en rejseplans indhold. Trip-data der ikke kan parses (kundesiden viser så
  // sin fejlside uden ActionBar/ContactCTA) er ligeledes ineligible.
  const tripData = tripSchema.safeParse(trip.data);
  if (!tripData.success) return { status: 204, reason: "ineligible" };
  const eligible = computeEligibleChannels(normalizeTrip(tripData.data));
  if (!eligible.includes(channel)) return { status: 204, reason: "ineligible" };

  // 5. Selve skrivningen — trip.id er SERVER-afledt fra slug-opslaget, aldrig
  // fra klienten; channel er den validerede, parsede værdi.
  const outcome = await deps.recordIntent(trip.id, channel);
  if (outcome.kind !== "ok") return { status: 500, reason: "write-failed" };
  return { status: 204, reason: "recorded" };
}
