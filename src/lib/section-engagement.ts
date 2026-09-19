// Vision 3.0 Fase 2 (Issue #71) — ren, testbar sektionsengagement-logik.
// Ingen Supabase-/React-/process.env-imports her, så alt kan unit-testes
// uden browser eller DB — samme mønster som trip-visit.ts/trip-engagement.ts.

import { z } from "zod";
import { filterGalleryImages } from "./progress-nav";
import type { Trip } from "./types";
import {
  isProductionHost,
  isBotUserAgent,
  hasAdminAuthCookie,
  type VisitDecisionInput,
} from "./trip-visit";

// ----------------------------------------------------------------------------
// Sektions-enum og DOM-mapping — ÉN kilde til sandhed
// ----------------------------------------------------------------------------

// Den kontrollerede enum DB'en (CHECK-constraint, supabase/011_*.sql) og
// endpointet (Zod) accepterer. Bevidst engelsk/stabilt — helt uafhængigt af
// den danske DOM-anker-tekst, som kan ændre sig uden at det bør røre
// datamodellen. IKKE "intro" — en kvalificeret åbning er allerede Fase 1B's
// ansvar (trip_visits); at registrere intro ville være redundant (Issue #71).
export const SECTION_IDS = ["itinerary", "gallery", "hotels", "price", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && (SECTION_IDS as readonly string[]).includes(value);
}

// Delt mellem endpointet (src/app/[bookingId]/engagement/route.ts) og dets
// tests — eksporteret herfra (i stedet for defineret inline i route.ts) så
// "ugyldig section afvises"-kontrakten kan testes direkte, uden at skulle
// mocke Next.js' Request/cookies()/headers() (samme "udtræk det testbare"-
// princip som resten af filen). `.strict()`: en ukendt ekstra body-nøgle (fx
// et forsøgt "trip_id") AFVISES frem for stille at blive ignoreret — kroppen
// kan strukturelt aldrig vælge sit eget trip_id.
export const sectionEngagementBodySchema = z
  .object({ section: z.enum(SECTION_IDS) })
  .strict();

// De faktiske DOM-id'er kundesidens sektioner allerede har (Timeline.tsx,
// DestinationGallery.tsx, Hotels.tsx, PriceAndNote.tsx, ContactCTA.tsx) —
// samme ankre som src/lib/progress-nav.ts's NavSectionId bruger til desktop
// progress-nav'en. Holdt som en separat, eksplicit mapping her (i stedet for
// at importere progress-nav.ts's type) for bevidst at UDELUKKE "intro", som
// progress-nav.ts's NavSectionId inkluderer, men som IKKE er et Fase
// 2-sektions-id.
export const SECTION_DOM_ID: Record<SectionId, string> = {
  itinerary: "rejseplan",
  gallery: "billeder",
  hotels: "hoteller",
  price: "pris",
  contact: "kontakt",
};

// ----------------------------------------------------------------------------
// Eligibility — én source of truth baseret på eksisterende render-data
// ----------------------------------------------------------------------------

export type SectionEligibilityInput = {
  hasItinerary: boolean; // trip.itinerary.length > 0
  galleryImageCount: number; // filterGalleryImages(galleryImages).length
  hasHotels: boolean; // trip.hotels.length > 0
  hasContact: boolean; // hasContact / samme betingelse som ContactCTA renderer på
};

/**
 * Hvilke af de fem sektioner findes reelt i DOM'en for DENNE rejseplan.
 * `price` er altid eligible (sektionen har sin egen legitime tom/pris-
 * separat-tilstand og fjernes derfor aldrig helt fra DOM'en, jf.
 * PriceAndNote.tsx). Rækkefølgen matcher altid SECTION_IDS.
 */
export function computeEligibleSections(input: SectionEligibilityInput): SectionId[] {
  return SECTION_IDS.filter((section) => {
    switch (section) {
      case "itinerary":
        return input.hasItinerary;
      case "gallery":
        return input.galleryImageCount > 0;
      case "hotels":
        return input.hasHotels;
      case "price":
        return true;
      case "contact":
        return input.hasContact;
    }
  });
}

/**
 * Eligibility for en konkret, allerede normaliseret rejseplan + dens
 * destinationsgalleri. ÉN funktion, brugt af BÅDE kundesiden (page.tsx, til
 * hvilke sektioner klient-trackeren observerer) og engagement-endpointet
 * (server-side, FØR skrivning) — så de to aldrig kan divergere. Betingelserne
 * er de samme som selve sektionskomponenterne bruger til at (ikke-)rendere
 * sig selv: itinerary/hotels ud fra trip-arrays, gallery ud fra
 * filterGalleryImages() (samme filter som DestinationGallery), contact ud fra
 * advisorEmail (samme som ContactCTA), price altid.
 *
 * `trip` skal være output af normalizeTrip() (samme input som kundesiden
 * render'er ud fra).
 */
export function computeEligibleSectionsForTrip(
  trip: Pick<Trip, "itinerary" | "hotels" | "advisorEmail">,
  galleryImages: string[],
): SectionId[] {
  return computeEligibleSections({
    hasItinerary: trip.itinerary.length > 0,
    galleryImageCount: filterGalleryImages(galleryImages).length,
    hasHotels: trip.hotels.length > 0,
    hasContact: !!trip.advisorEmail,
  });
}

// ----------------------------------------------------------------------------
// Tracking-gate — samme production/host/bot/admin-princip som Fase 1B
// ----------------------------------------------------------------------------

/**
 * Bevidst en NY, selvstændig funktion — ikke et genbrug af
 * shouldRecordTripVisit() selv (trip-visit.ts røres ikke af Fase 2, jf.
 * Issue #71's scope guardrail "ændring af Fase 1B's ... logik"). Genbruger
 * derimod de UNDERLIGGENDE, allerede eksporterede primitiver
 * (isProductionHost/isBotUserAgent/hasAdminAuthCookie) — samme regex, samme
 * host-streng, ingen duplikeret logik — komponeret til præcis de samme fire
 * betingelser: kun production, kun det kanoniske host, ikke en bot, og ingen
 * sælger med en gyldig admin-session. Fejler kun ét: registrér intet.
 */
export function shouldRecordSectionEngagement(input: VisitDecisionInput): boolean {
  if (input.vercelEnv !== "production") return false;
  if (!isProductionHost(input.host)) return false;
  if (isBotUserAgent(input.userAgent)) return false;
  if (hasAdminAuthCookie(input.cookieNames)) return false;
  return true;
}

// ----------------------------------------------------------------------------
// Dwell-state-machine — ren, ingen DOM/timer-API'er
// ----------------------------------------------------------------------------

// 750 ms sammenhængende synlighed, jf. Issue #71. Eksporteres så
// klientkomponenten aldrig hardkoder tallet et andet sted, og så testene kan
// referere til den samme konstant.
export const SECTION_DWELL_MS = 750;

export type DwellState = "idle" | "pending" | "qualified";
export type DwellAction = "enter" | "leave" | "timeout";
export type DwellEffect = "start-timer" | "cancel-timer" | "qualify" | "none";

/**
 * Lille, eksplicit state machine for ÉN sektions dwell-tilstand. Ingen
 * setTimeout/IntersectionObserver her — kalderen (SectionEngagementTracker)
 * ejer de rigtige timere og oversætter "enter"/"leave" fra
 * IntersectionObserver-callbacket og "timeout" fra en reel timer til kald
 * ind i denne reducer, og udfører den returnerede effekt (starte/annullere
 * timeren, eller sende sektionen som "set"). At logikken er en ren reducer
 * betyder den kan unit-testes med en sekvens af actions uden nogen browser
 * eller rigtig timer (Issue #71's egen anbefaling, da IntersectionObserver
 * er besværlig at unit-teste direkte).
 *
 * "qualified" er et slutstadie: yderligere actions (fx et sent, forsinket
 * "timeout" fra en allerede annulleret timer, eller endnu et "enter") er
 * no-ops. Det gør reduceren robust mod almindelige timing-races uden at
 * kalderen selv skal huske at ignorere dem.
 */
export function dwellReducer(
  state: DwellState,
  action: DwellAction,
): { state: DwellState; effect: DwellEffect } {
  if (state === "qualified") return { state: "qualified", effect: "none" };

  switch (action) {
    case "enter":
      if (state === "idle") return { state: "pending", effect: "start-timer" };
      return { state, effect: "none" }; // allerede pending — en duplikeret enter er en no-op
    case "leave":
      if (state === "pending") return { state: "idle", effect: "cancel-timer" };
      return { state, effect: "none" };
    case "timeout":
      if (state === "pending") return { state: "qualified", effect: "qualify" };
      // En "timeout" der ankommer efter en "leave" (state er allerede idle) —
      // fx en timer der ikke nåede at blive ryddet i tide — skal IKKE
      // kvalificere. Reducerens egen state-tjek er derfor et andet,
      // uafhængigt værn end selve clearTimeout()-kaldet i kalderen.
      return { state, effect: "none" };
  }
}

// Ren dedup-beslutning — udtrukket fra SectionEngagementTracker.tsx så
// "samme sektion sendes højst én gang pr. page load" (og det eksplicitte
// fem-sektioners-loft) kan testes uden en browser. `alreadySent` er
// UDELUKKENDE en in-memory Set ejet af trackeren selv — aldrig cookie/
// localStorage/sessionStorage (Issue #71).
export function shouldSendSection(
  alreadySent: ReadonlySet<SectionId>,
  section: SectionId,
): boolean {
  if (alreadySent.has(section)) return false;
  return alreadySent.size < SECTION_IDS.length;
}

// ----------------------------------------------------------------------------
// Admin-visning — "Set i rejseplanen"
// ----------------------------------------------------------------------------

// Formen af en trip_section_engagement-række som den kommer retur fra
// Supabase — bevidst løs (alle felter optional/nullable), samme princip som
// RawTripVisitRow i trip-engagement.ts: en ukendt/malformed section-værdi
// eller et ugyldigt tidsstempel må aldrig få visningen til at påstå noget
// forkert. En sådan række IGNORERES simpelthen (behandles som "ikke set"),
// den gør ALDRIG hele visningen "unavailable" — det er forbeholdt en reelt
// fejlet forespørgsel (se buildSectionEngagementDisplay).
export type RawSectionEngagementRow = {
  section?: string | null;
  last_seen_at?: string | null;
};

export type SectionSeenState = {
  section: SectionId;
  seen: boolean;
  /** ISO-streng, kun sat når seen=true OG tidsstemplet kunne parses. */
  lastSeenAt: string | null;
};

export type SectionEngagementDisplay =
  | { kind: "available"; sections: SectionSeenState[] }
  /** DB-læsningen (eller destinations-opslaget galleri-eligibility afhænger af) fejlede. */
  | { kind: "unavailable" }
  /**
   * Trip-data kunne ikke valideres (tripSchema/normalizeTrip), så vi ved ikke hvilke
   * hovedafsnit rejseplanen overhovedet har — og kan hverken påstå "set" eller "ikke set"
   * (Fase 4, Issue #76: runtime-hardening; samme princip som kontakt-intent).
   */
  | { kind: "unassessable" };

/**
 * Bygger sælger-visningen for ÉN trips sektionsengagement. `eligibleSections`
 * er allerede beregnet server-side (computeEligibleSections) — kun eligible
 * sektioner optræder nogensinde i resultatet, i SECTION_IDS' faste
 * rækkefølge. Ineligible sektioner ("denne trip har intet galleri") vises
 * ALDRIG som et minus — det ville ligne et negativt kundesignal (Issue #71).
 *
 * `readFailed: true` giver ALTID "unavailable" — uafhængigt af `rows` —
 * samme fail-open-kontrakt som Fase 1C's classifyTripEngagement(): en fejlet
 * forespørgsel må aldrig vises som "ikke set".
 *
 * `eligibleSections: null` (trip-data kan ikke valideres, se
 * resolveEligibleSections i src/lib/trip-eligibility.ts) giver "unassessable" —
 * aldrig en tom/"ikke set"-visning.
 */
export function buildSectionEngagementDisplay(input: {
  eligibleSections: SectionId[] | null;
  rows: RawSectionEngagementRow[] | null;
  readFailed: boolean;
}): SectionEngagementDisplay {
  if (input.readFailed) return { kind: "unavailable" };
  if (input.eligibleSections === null) return { kind: "unassessable" };
  const eligibleSections = input.eligibleSections;

  const seenBySection = new Map<SectionId, string | null>();
  for (const row of input.rows ?? []) {
    if (!isSectionId(row.section)) continue; // ukendt/malformed section — ignorér raden
    const lastSeenAt =
      typeof row.last_seen_at === "string" && !Number.isNaN(new Date(row.last_seen_at).getTime())
        ? row.last_seen_at
        : null;
    seenBySection.set(row.section, lastSeenAt);
  }

  const sections: SectionSeenState[] = eligibleSections.map((section) => {
    const seen = seenBySection.has(section);
    return { section, seen, lastSeenAt: seen ? (seenBySection.get(section) ?? null) : null };
  });

  return { kind: "available", sections };
}
