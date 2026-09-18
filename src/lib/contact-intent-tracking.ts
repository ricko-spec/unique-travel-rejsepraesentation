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
// `null` INDTIL release-cutover: vi kender endnu ikke det faktiske production
// go-live-tidspunkt, og et gættet tidspunkt ville være en falsk påstand i
// sælger-UI'et. Værdien sættes UDELUKKENDE i den afsluttende release-cutover
// commit — EFTER migration 012 er kørt i production og umiddelbart FØR
// merge/deploy — som en fast, hardkodet ISO-8601 UTC-streng (samme princip som
// Fase 1B: aldrig Date.now(), en env-var, migrationens tidspunkt eller et
// dynamisk databaseopslag). Release-metadata i kode; ingen ny DB-kolonne.
export const CONTACT_INTENT_TRACKING_SINCE: string | null = null;

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
