// Issue #47: sanitiserer hotellets website-URL. Bruges af normalizeTrip() ved
// hver visning af en trip (både ved parse og ved kundens sidevisning, se
// src/app/[bookingId]/page.tsx) — så selv en URL der på en eller anden måde
// er endt forkert i data (fremtidig direkte DB-redigering, gammel/korrupt
// rækkedata) aldrig kan nå frem til et faktisk <a href> uden at passere
// denne funktion først.

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

// null = intet link skal vises. Aldrig et gæt/fallback — kun http(s)-URLs der
// rent faktisk parser som en absolut URL.
export function sanitizeHotelWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Ikke en absolut URL (fx "example.com" uden protokol, eller "//evil.com"
    // protokol-relativt) — afvises i stedet for at gætte et https://-præfiks.
    return null;
  }

  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null;

  return parsed.toString();
}
