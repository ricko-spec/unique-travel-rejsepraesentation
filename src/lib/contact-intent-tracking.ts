// Vision 3.0 Fase 3 (Issue #73) — tracking-cutover for kontakt-intent. Bevidst en
// LILLE, afhængighedsfri fil (ingen zod/Supabase/React): sælger-UI'et
// (TripDetail, en client-komponent) importerer herfra, og den må ikke trække
// contact-intent.ts' zod-schema ind i admin-bundlet.

// Hvornår kontakt-intent-tracking (Fase 3) blev sat i drift i production. Er
// ÆGTE en anden dato end Fase 1B's TRACKING_SINCE (src/lib/trip-visit.ts), som
// KUN gælder ÅBNINGER (trip_visits): Fase 3 går først live senere, og Fase 2
// har sin egen livetid. Et "—" på "Telefon/Email klikket" betyder derfor kun
// "ingen registreret klik siden DENNE dato" — aldrig siden Fase 1B, og aldrig
// historisk viden fra før funktionen fandtes.
//
// Fastlagt (Issue #76, godkendt beslutning #5; cutover-metode B): 2026-09-19T08:21:19Z
// = det tidspunkt Fase 3-koden blev LIVE i production — Vercel production-
// deploymenten af main 3e39c87 (dpl_HzNGQfgsg8iPFn8sUDRuALrPtNHd) blev READY
// 08:21:18,978Z. Værdien ligger dermed IKKE før den faktiske go-live (en tidligere
// dato ville lade et "—" påstå dækning for en periode uden tracking) og er ALDRIG
// migrationstidspunktet (07:43:41Z, kun DB-parathed). Den var `null` frem til denne
// kodeleverance, fordi et gættet tidspunkt før deploy ville have været en falsk
// påstand i sælger-UI'et.
//
// Fast, hardkodet ISO-8601 UTC-streng (aldrig Date.now(), en env-var, migrationens
// tidspunkt eller et dynamisk databaseopslag). Release-metadata i kode; ingen ny
// DB-kolonne. Typen forbliver `string | null`, så UI-fallbacken ("registreres fra det
// tidspunkt funktionen sættes i drift") fortsat er defineret og testet.
export const CONTACT_INTENT_TRACKING_SINCE: string | null = "2026-09-19T08:21:19Z";

/**
 * Den diskrete forklaring under "Kontakt-intent"-blokken, der scoper hvad et
 * "—" betyder. Ren (formatter injiceres). Uden en (gyldig) cutover-dato
 * påstås INTET konkret starttidspunkt — kun at registreringen gælder fra
 * idriftsættelsen.
 */
export function buildContactIntentTrackingNote(
  since: string | null,
  formatDate: (iso: string) => string,
): string {
  if (since !== null && !Number.isNaN(new Date(since).getTime())) {
    const formatted = formatDate(since);
    if (formatted) return `Kontaktklik måles fra ${formatted}.`;
  }
  return "Kontaktklik registreres fra det tidspunkt funktionen sættes i drift.";
}
