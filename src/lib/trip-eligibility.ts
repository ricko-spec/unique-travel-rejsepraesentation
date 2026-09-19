// Vision 3.0 Fase 4 (Issue #76) — ÉN runtime-validering af `trips.data` og ÉN
// sandhed for "hvilke hovedafsnit findes reelt på DENNE rejseplan". Brugt af ALLE
// tre steder der afgør sektions-eligibility, så de aldrig kan være uenige:
//   - Fase 2-endpointet   (src/lib/section-engagement-endpoint.ts, før skrivning)
//   - admin-detaljesiden  (src/app/admin/trips/[id]/page.tsx)
//   - salgsoversigten     (src/lib/sales-overview*.ts)
// — og af contact-intent-trip.ts (kanaler) via parseNormalizedTrip().
//
// `trips.data` er JSONB og er IKKE runtime-valideret af databasen. Kundesiden
// (src/app/[bookingId]/page.tsx) kører tripSchema.safeParse → normalizeTrip og
// viser en FEJLSIDE, hvis data ikke passer. Læst som rå JSON (som Fase 2's admin
// gjorde) kan en malformed/legacy trip få et falsk "ikke set" for afsnit der
// aldrig fandtes. Ugyldig data giver derfor `null` = "kan ikke vurderes" — aldrig
// en tom liste, og aldrig et falsk minus.
//
// Bevidst en SEPARAT fil fra section-engagement.ts/contact-intent.ts: de importeres
// af klient-bundlet og skal ikke trække tripSchema/normalizeTrip (types.ts) med.

import { computeEligibleSectionsForTrip, type SectionId } from "./section-engagement";
import { tripSchema, normalizeTrip, type Trip } from "./types";

/**
 * Rå `trips.data` → normaliseret Trip (samme parse som kundesiden), eller `null`
 * hvis data ikke kan valideres (tripSchema fejler, eller normalizeTrip kaster).
 * Kaster aldrig.
 */
export function parseNormalizedTrip(rawTripData: unknown): Trip | null {
  try {
    const parsed = tripSchema.safeParse(rawTripData);
    if (!parsed.success) return null;
    return normalizeTrip(parsed.data);
  } catch {
    return null;
  }
}

/**
 * Eligible hovedafsnit for rå `trips.data` + destinationens galleri-URL'er, eller
 * `null` hvis trip-data ikke kan valideres. `null` er en ÆRLIG "ukendt" —
 * kaldere må aldrig behandle den som "ingen afsnit" eller vise "ikke set".
 * Kaster aldrig. Betingelserne pr. afsnit er computeEligibleSectionsForTrip's
 * (samme som kundesidens render).
 */
export function resolveEligibleSections(
  rawTripData: unknown,
  galleryImages: string[],
): SectionId[] | null {
  const trip = parseNormalizedTrip(rawTripData);
  return trip ? computeEligibleSectionsForTrip(trip, galleryImages) : null;
}
