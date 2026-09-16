// Issue #56: rene, testbare dele af kundens adgangskontrol. Udskilt fra
// src/app/[bookingId]/page.tsx og actions.ts, som fortsat gør det faktiske
// Next.js-arbejde (cookies(), redirect(), Supabase-kald) — disse funktioner
// har INGEN Next.js-/DB-afhængighed, så kontrakten kan låses fast med tests
// der overlever fremtidigt Vision 3/middleware-arbejde uden at nogen
// utilsigtet svækker de private rejseplaner.
//
// ÆNDR IKKE disse værdier uden Rickos eksplicitte godkendelse — det er
// nøjagtig den beskyttelse Issue #56 findes for at give.

export function tripAccessCookieName(slug: string): string {
  return `trip_access_${slug}`;
}

export function tripAccessCookiePath(slug: string): string {
  return `/${slug}`;
}

// 30 dage. Nuværende kontrakt — se Issue #56.
export const TRIP_ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const TRIP_ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: TRIP_ACCESS_COOKIE_MAX_AGE_SECONDS,
};

// Robots-kontrakten for kundens rejseplan-side (generateMetadata i page.tsx)
// — noindex/nofollow uanset trip-data, uændret siden altid.
export const TRIP_PAGE_ROBOTS = { index: false, follow: false } as const;

/**
 * Den faktiske adgangsbeslutning for DENNE rejseplan: har cookie-værdien
 * adgang? En cookie mintet for trip A's booking_no matcher aldrig trip B's
 * booking_no, så denne funktion alene forhindrer krydsadgang — path-scoping
 * (tripAccessCookiePath) er kun browserens (ekstra) forsvarslinje, ikke den
 * eneste. undefined cookie-værdi (ingen cookie) giver altid false.
 */
export function hasValidTripAccess(
  cookieValue: string | undefined,
  bookingNo: string,
): boolean {
  return cookieValue === bookingNo;
}
