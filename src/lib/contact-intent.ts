// Vision 3.0 Fase 3 (Issue #73) — ren, testbar kontakt-intent-logik. Ingen
// Supabase-/React-/process.env-imports her, så alt kan unit-testes uden
// browser eller DB — samme mønster som section-engagement.ts/trip-visit.ts.

import { z } from "zod";
import type { Trip } from "./types";
import {
  isProductionHost,
  isBotUserAgent,
  hasAdminAuthCookie,
  type VisitDecisionInput,
} from "./trip-visit";

// ----------------------------------------------------------------------------
// Kanal-enum — ÉN kilde til sandhed
// ----------------------------------------------------------------------------

// Den kontrollerede enum DB'en (CHECK-constraint, supabase/012_*.sql) og
// endpointet (Zod) accepterer. Kun to stærke intent-signaler:
//   email — mailto-linket i ContactCTA
//   phone — ALLE faktiske tel:-links (rådgiverens nummer i ContactCTA og
//           "Ring" i ActionBar; samme forretningssignal, så der gemmes
//           bevidst IKKE hvilken knap der blev brugt)
// Det interne "Kontakt os"-link (#kontakt) er navigation og er ALDRIG en kanal.
export const CONTACT_CHANNELS = ["email", "phone"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export function isContactChannel(value: unknown): value is ContactChannel {
  return typeof value === "string" && (CONTACT_CHANNELS as readonly string[]).includes(value);
}

// Delt mellem endpointet (src/app/[bookingId]/intent/route.ts via
// contact-intent-endpoint.ts) og dets tests. `.strict()`: en ukendt ekstra
// body-nøgle (fx et forsøgt "trip_id") AFVISES frem for stille at blive
// ignoreret — kroppen kan strukturelt aldrig vælge sit eget trip_id.
export const contactIntentBodySchema = z
  .object({ channel: z.enum(CONTACT_CHANNELS) })
  .strict();

// ----------------------------------------------------------------------------
// Eligibility — server-side, ud fra trippens egne (normaliserede) data
// ----------------------------------------------------------------------------

/**
 * Hvilke kanaler findes reelt som klikbare links for DENNE rejseplan.
 *   email: kun hvis trip.advisorEmail findes (samme betingelse som ContactCTA
 *          bruger til at rendere mailto-linket).
 *   phone: ALTID — ActionBar renderer altid et faktisk tel:+4559498630-link
 *          på en gyldig kunderejse; rådgivertelefonen i ContactCTA er blot
 *          endnu en phone-surface.
 * Klientens klik-handler er IKKE en trust boundary: endpointet kalder denne
 * funktion (på normalizeTrip-output) før enhver skrivning.
 */
export function computeEligibleChannels(
  trip: Pick<Trip, "advisorEmail">,
): ContactChannel[] {
  return CONTACT_CHANNELS.filter((channel) => {
    switch (channel) {
      case "email":
        return !!trip.advisorEmail;
      case "phone":
        return true;
    }
  });
}

// ----------------------------------------------------------------------------
// Tracking-gate — samme production/host/bot/admin-princip som Fase 1B/2
// ----------------------------------------------------------------------------

/**
 * Bevidst en NY, selvstændig funktion — trip-visit.ts og section-engagement.ts
 * røres ikke af Fase 3 (scope guardrail: ingen ændring af Fase 1B/2's
 * semantik). Genbruger de UNDERLIGGENDE, allerede eksporterede primitiver
 * (isProductionHost/isBotUserAgent/hasAdminAuthCookie) — komponeret til
 * præcis de samme fire betingelser: kun production, kun det kanoniske host,
 * ikke en bot, og ingen sælger med en gyldig admin-session. Fejler ét:
 * registrér intet.
 */
export function shouldRecordContactIntent(input: VisitDecisionInput): boolean {
  if (input.vercelEnv !== "production") return false;
  if (!isProductionHost(input.host)) return false;
  if (isBotUserAgent(input.userAgent)) return false;
  if (hasAdminAuthCookie(input.cookieNames)) return false;
  return true;
}

// ----------------------------------------------------------------------------
// Dedup pr. page load — ren, in-memory
// ----------------------------------------------------------------------------

/**
 * Samme kanal højst én gang pr. page load; email og phone kan begge sendes.
 * `alreadySent` er UDELUKKENDE en in-memory Set ejet af
 * ContactIntentProvider (src/components/trip/ContactIntentLink.tsx) — aldrig
 * cookie/localStorage/sessionStorage (Issue #73).
 */
export function shouldSendChannel(
  alreadySent: ReadonlySet<ContactChannel>,
  channel: ContactChannel,
): boolean {
  return !alreadySent.has(channel);
}

// ----------------------------------------------------------------------------
// Admin-visning — "Kontakt-intent"
// ----------------------------------------------------------------------------

// Formen af en trip_contact_intent-række som den kommer retur fra Supabase —
// bevidst løs (alle felter optional/nullable), samme princip som
// RawSectionEngagementRow: en ukendt/malformed channel-værdi eller et
// ugyldigt tidsstempel må aldrig få visningen til at påstå noget forkert. En
// sådan række IGNORERES (falsk signal aldrig), den gør ALDRIG hele visningen
// "unavailable" — det er forbeholdt en reelt fejlet forespørgsel.
export type RawContactIntentRow = {
  channel?: string | null;
  last_clicked_at?: string | null;
};

export type ContactChannelState = {
  channel: ContactChannel;
  clicked: boolean;
  /** ISO-streng, kun sat når clicked=true OG tidsstemplet kunne parses. */
  lastClickedAt: string | null;
};

export type ContactIntentDisplay =
  | { kind: "available"; channels: ContactChannelState[] }
  /** DB-læsningen fejlede. */
  | { kind: "unavailable" }
  /**
   * Trip-data kunne ikke valideres (tripSchema/normalizeTrip), så vi ved ikke
   * hvilke kanaler der overhovedet fandtes som links — og kan derfor hverken
   * påstå "klikket" eller "ikke klikket".
   */
  | { kind: "unassessable" };

// Visningsrækkefølge: telefon først, så email (som i Issue #73).
const DISPLAY_ORDER: readonly ContactChannel[] = ["phone", "email"];

/**
 * Bygger sælger-visningen for ÉN trips kontakt-intent. `eligibleChannels` er
 * beregnet af resolveContactChannels() (src/lib/contact-intent-trip.ts — SAMME
 * runtime-sandhed som kundesiden og endpointet: tripSchema + normalizeTrip) —
 * kun eligible kanaler optræder nogensinde. En ineligible email ("denne trip
 * har ingen rådgiver-email") vises ALDRIG som et minus — det ville ligne et
 * negativt kundesignal.
 *
 * `eligibleChannels: null` betyder at trip-data ikke kunne valideres. Så vises
 * ALDRIG "Telefon/Email klikket —" (kundesiden viser i så fald sin fejlside
 * uden kontaktlinks, så et "—" ville være et falsk negativt signal), men
 * "unassessable".
 *
 * `readFailed: true` giver ALTID "unavailable" — uafhængigt af `rows` og
 * eligibility — samme fail-open-kontrakt som Fase 1C/2: en fejlet forespørgsel
 * må aldrig vises som "ikke klikket".
 *
 * Betydningen af et "—" (`clicked: false`): KUN "ingen registreret klik siden
 * kontakt-intent-tracking blev sat i drift" (CONTACT_INTENT_TRACKING_SINCE i
 * src/lib/contact-intent-tracking.ts) — aldrig historisk viden fra før
 * funktionen fandtes. UI'et scoper det med buildContactIntentTrackingNote().
 *
 * Fase 2's "Kontakt set" er en HELT anden datakilde og blandes aldrig ind her.
 */
export function buildContactIntentDisplay(input: {
  eligibleChannels: ContactChannel[] | null;
  rows: RawContactIntentRow[] | null;
  readFailed: boolean;
}): ContactIntentDisplay {
  if (input.readFailed) return { kind: "unavailable" };
  if (input.eligibleChannels === null) return { kind: "unassessable" };
  const eligibleChannels = input.eligibleChannels;

  const clickedByChannel = new Map<ContactChannel, string | null>();
  for (const row of input.rows ?? []) {
    if (!isContactChannel(row.channel)) continue; // ukendt/malformed channel — ignorér raden
    const lastClickedAt =
      typeof row.last_clicked_at === "string" &&
      !Number.isNaN(new Date(row.last_clicked_at).getTime())
        ? row.last_clicked_at
        : null;
    clickedByChannel.set(row.channel, lastClickedAt);
  }

  const channels: ContactChannelState[] = DISPLAY_ORDER.filter((channel) =>
    eligibleChannels.includes(channel),
  ).map((channel) => {
    const clicked = clickedByChannel.has(channel);
    return {
      channel,
      clicked,
      lastClickedAt: clicked ? (clickedByChannel.get(channel) ?? null) : null,
    };
  });

  return { kind: "available", channels };
}
