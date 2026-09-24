import { createHmac } from "node:crypto";
import { computeBookingMatchKey, normalizeBookingNo } from "../analytics-bridge";
import { BOOKING_NUMBER_FORMAT_RE, MIN_SECRET_LENGTH } from "./contract";

// Vision 3.0 Fase 5, Gate B (Issue #80) — pseudonymisering. To SEPARATE
// HMAC-nøglerum, med to uafhængige secrets, aldrig krydset:
//
//   deal_key           = HMAC(HUBSPOT_DEAL_KEY_SECRET, "dealkey:v1:" + rawDealId)
//   booking_match_key  = HMAC(BOOKING_MATCH_SECRET,     booking_no.trim())  [genbrugt fra analytics-bridge.ts]
//
// Rå HubSpot deal-id'er og rå bookingnumre forlader ALDRIG denne funktion —
// kaldere modtager kun de hashede nøgler. Domæneadskillelsen (forskellig
// secret + et versioneret præfiks på deal-key-siden) betyder at de to
// secrets kan roteres uafhængigt, uden at det ene nøglerum kan afledes af
// det andet — samme princip som ANALYTICS_BRIDGE_API_KEY ≠
// BOOKING_MATCH_SECRET (docs/ANALYTICS-BRIDGE-API.md).

const DEAL_KEY_DOMAIN_PREFIX = "dealkey:v1:";

/**
 * Afgør om de to HMAC-secrets kan bruges. Tomme, for korte (under
 * MIN_SECRET_LENGTH efter trim) eller IDENTISKE secrets afvises — en tom
 * secret ville give en offentligt reproducerbar "pseudonymisering", og ens
 * secrets ville kollapse domæneadskillelsen. Kaldes af sync-motoren FØR
 * nogen læsning eller skrivning. Returnerer aldrig selve værdierne.
 */
export function secretsAreUsable(dealKeySecret: unknown, bookingMatchSecret: unknown): boolean {
  if (typeof dealKeySecret !== "string" || typeof bookingMatchSecret !== "string") return false;
  if (dealKeySecret.trim().length < MIN_SECRET_LENGTH) return false;
  if (bookingMatchSecret.trim().length < MIN_SECRET_LENGTH) return false;
  return dealKeySecret !== bookingMatchSecret;
}

export function computeDealKey(rawHubspotDealId: string, secret: string): string {
  const trimmed = rawHubspotDealId.trim();
  return createHmac("sha256", secret).update(DEAL_KEY_DOMAIN_PREFIX + trimmed, "utf8").digest("hex");
}

/** Genbrug af Analytics Bridge-kontrakten (Issue #45) — samme normalisering, samme HMAC-opskrift. */
export function computeBookingKeyForConversion(bookingNo: string, secret: string): string {
  return computeBookingMatchKey(bookingNo, secret);
}

export type BookingNumberValidation =
  | { kind: "valid"; normalized: string }
  | { kind: "missing" }
  | { kind: "invalid-format"; normalized: string };

/**
 * Ren validering — afgør KUN om et bookingnummer kan bruges pålideligt til
 * matching, aldrig om det rent faktisk matcher en online rejseplan (det er
 * en separat opslags-beslutning i classify.ts). Delte referencer på tværs af
 * flere deals er IKKE noget denne funktion kan se — det kræver kendskab til
 * hele batchen og afgøres af syncEngine.ts's dedup-pas.
 */
export function validateBookingNumber(raw: string | null | undefined): BookingNumberValidation {
  if (raw == null || raw.trim() === "") return { kind: "missing" };
  const normalized = normalizeBookingNo(raw);
  if (!BOOKING_NUMBER_FORMAT_RE.test(normalized)) {
    return { kind: "invalid-format", normalized };
  }
  return { kind: "valid", normalized };
}
