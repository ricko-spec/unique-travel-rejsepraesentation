import { createHmac, timingSafeEqual } from "node:crypto";

// Ren logik for Analytics Bridge API (Issue #45): auth, HMAC-match-nøgle og
// cursor-håndtering til GET /api/internal/analytics/travel-plans. Udskilt
// fra route-handleren så den kan unit-testes uden en Next.js-request/DB —
// samme mønster som src/lib/progress-nav.ts og src/lib/usage.ts.

// ============================================================================
// Auth — Authorization: Bearer <ANALYTICS_BRIDGE_API_KEY>
// ============================================================================

// Konstant-tid sammenligning: almindelig `===` på secrets lækker (meget
// svagt) timing-information om hvor mange tegn der matcher. Bruges kun til
// selve API-nøglen — ikke et krav for uuid'er/timestamps andre steder her.
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual kaster ved forskellig længde — det er i sig selv en
  // (uskadelig) timing-lækage af længden, men aldrig af selve indholdet.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Fail closed: mangler enten header eller server-konfigureret nøgle, er
// requesten IKKE autoriseret. En tom/manglende ANALYTICS_BRIDGE_API_KEY må
// aldrig tolkes som "auth slået fra".
export function isAuthorizedRequest(
  authorizationHeader: string | null,
  expectedApiKey: string | undefined,
): boolean {
  if (!expectedApiKey) return false;
  if (!authorizationHeader) return false;
  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) return false;
  const provided = authorizationHeader.slice(prefix.length);
  if (!provided) return false;
  return timingSafeEqualStrings(provided, expectedApiKey);
}

// ============================================================================
// booking_match_key — HMAC-SHA256(BOOKING_MATCH_SECRET, normalized_booking_no)
// ============================================================================

// Normalisering FØR HMAC: kun trim. Ingen store/små bogstaver-normalisering,
// ingen locale-transformation — bookingnumre i dette system er rene
// cifre-strenge (fx "35930"), så der er ikke noget "case" at folde. Marketing
// Dashboard skal reproducere PRÆCIS denne funktion mod HubSpots bookingnummer
// for at få samme match-key — dokumentér kontrakten ordret i README/docs,
// ikke kun her.
export function normalizeBookingNo(bookingNo: string): string {
  return bookingNo.trim();
}

// Hex-digest (64 små bogstaver/cifre) — det mest utvetydige format at dele
// mellem to systemer (ingen base64 URL-safe/standard-tvetydighed).
export function computeBookingMatchKey(bookingNo: string, secret: string): string {
  const normalized = normalizeBookingNo(bookingNo);
  return createHmac("sha256", secret).update(normalized, "utf8").digest("hex");
}

// ============================================================================
// Pagination — id-keyset inden for et fast `since`-vindue pr. kald
// ============================================================================
// To adskilte bekymringer, løst hver for sig i stedet for sammenfiltret i én
// tuple-cursor:
//
// 1. "Hvilke rækker hører til dette sync-kald?" — afgøres af `since`, som
//    FORBRUGEREN sætter til sit eget ur-tidspunkt (`now()`) FØR forrige
//    vellykkede kald blev sendt, og først opdaterer sit gemte high-water-mark
//    til EFTER et kald er lykkedes fuldt ud. Det er standardmønstret for
//    idempotent, ikke-tabende incremental sync ("checkpoint på egen tid, ikke
//    på kildedata") — en række der ændres midt i et crawl har enten en
//    updated_at ældre end forbrugerens NÆSTE `since` (fanges automatisk næste
//    gang) eller nyere (var reelt ikke en del af dette vindue). Serveren
//    behøver ALDRIG selv udlede det næste `since` af de returnerede rækker.
// 2. "Hvordan bladres der gennem ét vindues rækker uden huller/dubletter?" —
//    ren id-keyset (`id > cursor.id`, aldrig OFFSET). `id` er UUID-primærnøgle
//    og derfor 100% kollisionsfri — i modsætning til updated_at (mikrosekund-
//    præcision, men to rækker der IKKE er identiske i virkeligheden kan i
//    teorien dele værdi). At bruge id kun til side-vandring inden for et
//    allerede fastlagt, tidsmæssigt vindue eliminerer alle rækkefølge-
//    problemer helt — ingen tuple-sammenligning, intet reviewfund at gentage
//    fra Issue #38/PR #39.
//
// Cursoren er selv-indeholdende: den bærer det `since` sekvensen blev startet
// med, så en side 2-forespørgsel ikke er afhængig af at forbrugeren husker at
// gensende samme `since` — kun `cursor` er nødvendig for at fortsætte.

export type Cursor = { since: string | null; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Opaque for forbrugeren: Marketing Dashboard skal blot ekkoere strengen
// tilbage som `cursor`-query-param, aldrig parse den selv.
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

// Streng validering: en ugyldig/manipuleret cursor må ALDRIG stille skifte
// forespørgslens betydning (fx til "ingen filter" = fuld eksport). Ugyldigt
// input giver null, og route-handleren svarer 400 — ikke et tavst fallback.
export function decodeCursor(raw: string): Cursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { since, id } = parsed as Record<string, unknown>;
  if (since !== null && !isValidIsoTimestamp(since)) return null;
  if (!isValidUuid(id)) return null;
  return { since: since as string | null, id };
}

export function isValidSinceParam(value: string): boolean {
  return isValidIsoTimestamp(value);
}

// ============================================================================
// limit — clamp til et sikkert interval. Ugyldig/manglende input er IKKE en
// klientfejl her (i modsætning til en ugyldig cursor) — det klampes stille
// til default, fordi en forkert `limit` ikke kan få forespørgslen til at
// betyde noget andet end "en side data", kun en anden sidestørrelse.
// ============================================================================

export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

export function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

// ============================================================================
// Output-sanitisering
// ============================================================================
// Denne type er BEVIDST snæver — kun de felter der reelt bruges. Selv hvis
// route-handleren en dag ved en fejl SELECT'er flere kolonner (booking_no
// ud over det nødvendige til HMAC'en, customer_name, data, slug osv.),
// læser toTravelPlanRecord kun de seks felter herunder og bygger et helt
// NYT objekt — der spredes aldrig `...row`. Et ekstra felt på input kan
// derfor aldrig lække med ud. Se analytics-bridge.test.ts for et test der
// beviser præcis det ved at sende et "beskidt" input-objekt ind.
export type TripRowForExport = {
  id: string;
  booking_no: string;
  destination: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export const ANALYTICS_BRIDGE_SCHEMA_VERSION = 1;

export type TravelPlanRecord = {
  trip_id: string;
  booking_match_key: string;
  online_plan_created_at: string;
  active: boolean;
  destination: string;
};

// online_plan_updated_at er BEVIDST udeladt: trips.updated_at opdateres af
// en generisk trigger ved ENHVER ændring af rækken — re-upload, en sælgers
// intro-redigering, eller blot at slå `active` til/fra. Feltet fortæller
// "rækken blev rørt", ikke "rejseplanen blev genudgivet", og er derfor ikke
// semantisk pålideligt som et forretningssignal (jf. Issue #45's eget
// forbehold: "hvis feltet findes OG er semantisk pålideligt"). updated_at
// bruges stadig INTERNT som pagineringsnøgle (se Cursor ovenfor) — det er en
// helt anden, langt svagere kontrakt ("rækken ændrede sig, hent den igen")
// end at udstille den som et analysefelt.
export function toTravelPlanRecord(
  row: TripRowForExport,
  bookingMatchSecret: string,
): TravelPlanRecord {
  return {
    trip_id: row.id,
    booking_match_key: computeBookingMatchKey(row.booking_no, bookingMatchSecret),
    online_plan_created_at: row.created_at,
    active: row.active,
    destination: row.destination,
  };
}
