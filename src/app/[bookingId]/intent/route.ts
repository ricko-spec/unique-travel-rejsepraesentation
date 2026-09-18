import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getSupabaseService } from "@/lib/supabase/server";
import { tripAccessCookieName } from "@/lib/trip-access";
import { recordContactIntent } from "@/lib/contact-intent-write";
import { handleContactIntent, type ContactIntentTripRow } from "@/lib/contact-intent-endpoint";

// Vision 3.0 Fase 3 (Issue #73) — write-endpoint for kontakt-intent.
//
// BEVIDST PLACERET UNDER src/app/[bookingId]/intent/, IKKE under
// src/app/api/…: den eksisterende adgangs-cookie (trip_access_<slug>, se
// src/lib/trip-access.ts) er scoped til path=/<slug> — et endpoint under
// /api/… ville simpelthen ikke modtage cookien overhovedet. Ruten her nedarver
// samme path-præfiks (/<slug>/intent), så cookien altid følger med. Samme
// begrundelse som /<slug>/engagement (Issue #71).
//
// runtime = "nodejs": service-role-klienten er ikke edge-egnet.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Denne route er en TYND ADAPTER. Hele den sikkerhedskritiske beslutningskæde
// (strict body → trip + adgang → production/host/bot/admin-gate → server-side
// kanal-eligibility → skrivning) lever i handleContactIntent()
// (src/lib/contact-intent-endpoint.ts), hvor den er dækket af tests
// (src/lib/contact-intent-endpoint.test.ts) — route.ts har ingen egen kopi af
// rækkefølgen, kun I/O:
//   - læser request (body, cookie, headers) og sender det ind som data
//   - leverer de to afhængigheder (trip-opslag, skrivning)
//   - oversætter det returnerede udfald til en HTTP-status
//
// Svarene: 400 (ugyldig body), 404 (trip findes ikke/er inaktiv ELLER
// adgangscookien mangler/er forkert — BEVIDST samme svar, ingen slug-/
// adgangs-oracle), 204 (skrevet, gate-afvist ELLER kanalen findes ikke på
// denne rejseplan — klienten må aldrig kunne skelne, og retry'er aldrig), 500
// (DB-skrivningen fejlede; kun synlig server-side — klienten ignorerer
// statuskoden, se src/lib/contact-intent-client.ts).
export async function POST(
  req: Request,
  { params }: { params: { bookingId: string } },
) {
  const body = await req.json().catch(() => null);

  const result = await handleContactIntent(
    {
      slug: params.bookingId,
      body,
      accessCookieValue: cookies().get(tripAccessCookieName(params.bookingId))?.value,
      gate: {
        vercelEnv: process.env.VERCEL_ENV,
        host: headers().get("host"),
        userAgent: headers().get("user-agent"),
        cookieNames: cookies()
          .getAll()
          .map((cookie) => cookie.name),
      },
    },
    {
      // Kun de kolonner endpointet skal bruge (id til RPC'en, booking_no til
      // adgangstjekket, data til server-side eligibility) — samme filter
      // (slug + aktiv) som kundesidens loadTrip(). Fejl og "ikke fundet" er
      // bevidst det samme (null) → samme 404.
      loadTrip: async (slug) => {
        const { data, error } = await getSupabaseService()
          .from("trips")
          .select("id, booking_no, data")
          .eq("slug", slug)
          .eq("active", true)
          .maybeSingle();
        if (error || !data) return null;
        return data as ContactIntentTripRow;
      },
      // Kaster aldrig og logger allerede sanitiseret (kun tripId + channel +
      // Postgres' error.code/message — se src/lib/contact-intent-write.ts).
      recordIntent: recordContactIntent,
    },
  );

  if (result.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ ok: false }, { status: result.status });
}
