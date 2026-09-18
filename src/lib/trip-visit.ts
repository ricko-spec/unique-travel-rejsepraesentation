// Vision 3.0 Fase 1B (Issue #65) — ren, testbar gate-logik for cookie-fri
// kundeåbnings-tracking (Model B, godkendt af Ricko 2026-09-17, jf. Issue
// #63/PR #64 + Issue #65). Ingen imports fra next/* eller Supabase her, så
// hele beslutningen kan unit-testes uden browser, DB eller process.env-
// manipulation — samme mønster som progress-nav.ts og trip-access.ts.
//
// Fail-safe med vilje: ukendt/malformed input (manglende env, null host,
// tom UA, osv.) falder ALTID til "track ikke" — aldrig omvendt. Se
// docs/VISION-3.0-EVENT-MODEL.md §8 for den fulde begrundelse pr. betingelse.

export type VisitDecisionInput = {
  vercelEnv: string | undefined; // process.env.VERCEL_ENV
  host: string | null; // headers().get("host")
  userAgent: string | null; // headers().get("user-agent")
  cookieNames: string[]; // cookies().getAll().map(c => c.name)
};

// 30 minutters rullende inaktivitetsvindue — se 30-min-logikken i
// record_trip_visit() (supabase/010_trip_visits.sql). Eksporteres KUN til
// dokumentation/UI-tekst her; vinduet selv beregnes udelukkende i Postgres
// med clock_timestamp() + en fast interval, aldrig ud fra denne konstant i Node.
export const VISIT_WINDOW_MINUTES = 30;

// Det eneste produktionsdomæne der tæller — se isProductionHost. Deployet
// er også nåbart på Vercels branch-alias, hvor VERCEL_ENV ER "production";
// derfor er host-tjekket et selvstændigt, nødvendigt andet lag.
const CANONICAL_PRODUCTION_HOST = "rejseplaner.uniquetravel.dk";

// Fast konstant — IKKE et dynamisk min() som upload_events' trackingSince
// (src/lib/usage.ts), fordi trip_visits-rækker selv kan blive slettet af
// den (endnu ikke aktiverede) 12-måneders retention og derfor ikke duer som
// kilde til "hvornår startede sporing". Bruges af en FREMTIDIG Fase 1C til
// at afgøre om "ingen trip_visits-række" kan læses som "aldrig åbnet" eller
// om trippen/sporingen er ældre end 12-måneders-retention-vinduet — se
// supabase/010b_trip_visits_retention.sql for den fulde begrundelse. Ikke
// brugt af shouldRecordTripVisit() eller record_trip_visit() — kun til
// fremtidig visningslogik.
//
// ⚠️ RELEASE-CUTOVER-BLOCKER, stadig bevidst `null` (opdateret 2026-09-18,
// PR #66). Migration 010 er NU kørt og verificeret i production
// (`iunixfpthdftmkgpugex`, migration `20260918113114_trip_visits_usage_tracking`,
// skema-tidspunkt 2026-09-18T11:31:14Z) — men DEN dato er hvornår
// DB-INFRASTRUKTUREN blev klar, ikke hvornår kundeåbninger faktisk begyndte
// at blive registreret. Denne kode (gaten + skrivevejen) er endnu ikke
// merget/deployet til production, så INGEN reel tracking sker endnu selvom
// tabellen findes. At sætte TRACKING_SINCE til migrations-tidspunktet nu
// ville derfor være forkert — en fremtidig Fase 1C ville fejlagtigt kunne
// tro at sporing var aktiv i vinduet mellem migration og faktisk deploy.
//
// TRACKING_SINCE forbliver `null` indtil en SEPARAT, sidste
// release-cutover-commit, umiddelbart før merge/deploy af denne PR, der
// sætter den til det faktiske UTC-tidspunkt hvor koden går live (+
// opdaterer testen i trip-visit.test.ts til samme værdi). Se
// "MERGE-BLOKERENDE TJEKLISTE" i supabase/README.md ("Driftsnote:
// trip_visits (Issue #65)") for den fulde rækkefølge.
export const TRACKING_SINCE: string | null = null;

// Ren regex, transient: strengen læses, matches, og forsvinder med
// requesten. Logges, hashes og gemmes ALDRIG — heller ikke som kategori.
// "bot" fanger langt de fleste navngivne crawlere/link-previews
// (Googlebot, Bingbot, Slackbot, Twitterbot, LinkedInBot, Applebot, …)
// automatisk; de eksplicitte mønstre dækker kendte værktøjer og botter der
// IKKE har "bot" i navnet.
const BOT_UA_RE =
  /bot|facebookexternalhit|whatsapp|telegrambot|discordbot|pinterest|curl|wget|python-requests|python-urllib|go-http-client|okhttp|headless|phantomjs|selenium|puppeteer|playwright|lighthouse|pingdom|uptimerobot|slurp|spider|crawl/i;

/** Tom/manglende User-Agent behandles som bot — en rigtig browser sender altid én. */
export function isBotUserAgent(ua: string | null): boolean {
  if (!ua || ua.trim() === "") return true;
  return BOT_UA_RE.test(ua);
}

// Supabase-auth-cookien har navnet sb-<project-ref>-auth-token, evt.
// chunket til sb-<project-ref>-auth-token.0 / .1 osv. når værdien er for
// stor til én cookie. Kun TILSTEDEVÆRELSE tjekkes, ikke sessionens
// gyldighed — et netværkskald til Supabase Auth pr. kundevisning er ikke
// prisen værd, og en falsk positiv koster kun ét utalt besøg (den sikre
// retning). Se docs/VISION-3.0-EVENT-MODEL.md §8, betingelse 2, for hvorfor
// dette REDUCERER (ikke lukker) sælger-hullet.
const ADMIN_AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;

export function hasAdminAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => ADMIN_AUTH_COOKIE_RE.test(name));
}

/** Kun det kanoniske produktionsdomæne tæller — case-insensitivt, ingen portsuffiks accepteret. */
export function isProductionHost(host: string | null): boolean {
  if (!host) return false;
  return host.trim().toLowerCase() === CANONICAL_PRODUCTION_HOST;
}

/**
 * De fire betingelser fra docs/VISION-3.0-EVENT-MODEL.md §8, evalueret
 * samlet. ALLE skal være opfyldt før et besøg registreres. Fejler én —
 * eller er input ukendt/malformed — registreres intet.
 */
export function shouldRecordTripVisit(input: VisitDecisionInput): boolean {
  if (input.vercelEnv !== "production") return false;
  if (!isProductionHost(input.host)) return false;
  if (isBotUserAgent(input.userAgent)) return false;
  if (hasAdminAuthCookie(input.cookieNames)) return false;
  return true;
}
