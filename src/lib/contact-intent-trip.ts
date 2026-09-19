// Vision 3.0 Fase 3 (Issue #73) — ÉN runtime-sandhed for "hvilke kontakt-
// kanaler findes som faktiske links på DENNE rejseplan". Brugt af BÅDE
// engagement-endpointet (src/lib/contact-intent-endpoint.ts, før enhver
// skrivning) og sælger-visningen (src/app/admin/trips/[id]/page.tsx) — så de
// to aldrig kan divergere.
//
// Bevidst en SEPARAT fil fra contact-intent.ts: contact-intent.ts importeres af
// klient-bundlet (ContactIntentLink), og tripSchema/normalizeTrip (types.ts) er
// runtime-tunge og hører ikke hjemme dér.
//
// `trips.data` er JSONB og er IKKE runtime-valideret af databasen. Kundesiden
// (src/app/[bookingId]/page.tsx) kører tripSchema.safeParse → normalizeTrip, og
// viser sin FEJLSIDE — uden ContactCTA og ActionBar — hvis data ikke passer
// schemaet. Eligibility skal afledes af præcis samme parse, ellers kan admin
// vise "Telefon klikket —" for en rejseplan hvor der aldrig fandtes et
// telefonlink (et falsk negativt kundesignal).

import { computeEligibleChannels, type ContactChannel } from "./contact-intent";
import { parseNormalizedTrip } from "./trip-eligibility";

/**
 * Eligible kanaler for rå `trips.data`, eller `null` hvis trip-data ikke kan
 * valideres (tripSchema fejler, eller normalizeTrip kaster). `null` er en
 * ÆRLIG "ukendt" — ALDRIG en tom liste: kaldere må ikke behandle den som "ingen
 * kanaler", og sælger-visningen må ikke vise "ikke klikket" for den. Kaster aldrig.
 */
export function resolveContactChannels(rawTripData: unknown): ContactChannel[] | null {
  const trip = parseNormalizedTrip(rawTripData);
  return trip ? computeEligibleChannels(trip) : null;
}
