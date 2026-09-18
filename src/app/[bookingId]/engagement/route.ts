import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getSupabaseService } from "@/lib/supabase/server";
import { hasValidTripAccess, tripAccessCookieName } from "@/lib/trip-access";
import {
  sectionEngagementBodySchema,
  shouldRecordSectionEngagement,
} from "@/lib/section-engagement";
import { recordSectionEngagement } from "@/lib/section-engagement-write";

// Vision 3.0 Fase 2 (Issue #71) — write-endpoint for sektionsengagement.
//
// BEVIDST PLACERET UNDER src/app/[bookingId]/engagement/, IKKE under
// src/app/api/…: den eksisterende adgangs-cookie (trip_access_<slug>, se
// src/lib/trip-access.ts) er scoped til path=/<slug> — et endpoint under
// /api/… ville simpelthen ikke modtage cookien overhovedet. Ruten her nedarver
// samme path-præfiks (/<slug>/engagement), så cookien altid følger med.
//
// runtime = "nodejs": samme som /admin/api/trips — service-role-klienten er
// ikke edge-egnet.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { bookingId: string } },
) {
  // 1. Body — kun de fem kendte sections er gyldige, ingen ekstra nøgler
  // (sectionEngagementBodySchema, src/lib/section-engagement.ts). Alt andet
  // er 400.
  const json = await req.json().catch(() => null);
  const parsed = sectionEngagementBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // 2-4. Slå trippen op via slug'en fra URL'en og kræv en AKTIV trip — samme
  // opslag som page.tsx's loadTrip(), men kun de to kolonner vi rent
  // faktisk skal bruge (id til RPC'en, booking_no til adgangstjekket).
  const supabase = getSupabaseService();
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id, booking_no")
    .eq("slug", params.bookingId)
    .eq("active", true)
    .maybeSingle();

  // 5. Adgangscookie — samme helper som kundesiden selv bruger
  // (hasValidTripAccess, src/lib/trip-access.ts). "Trip findes ikke/er
  // inaktiv" og "adgangscookien er forkert/mangler" giver BEVIDST samme
  // 404-svar (i stedet for hhv. 404 og 401/403): dette er et
  // maskine-endpoint uden nogen UX-grund til at lade en klient skelne
  // "dette slug findes slet ikke" fra "dette slug findes, men koden er
  // forkert" — begge cases giver et helt tomt sikkerhedsmæssigt signal at
  // opnå ved at kunne skelne dem, så vi undgår at gøre endpointet til en
  // slug-/adgangs-oracle. Kundens page.tsx skal derimod skelne (den skal
  // vise AccessGate-formularen for en reel, aktiv trip) — det er en helt
  // anden, menneskevendt kontekst end dette fire-and-forget-kald.
  const accessCookie = cookies().get(tripAccessCookieName(params.bookingId));
  if (tripError || !trip || !hasValidTripAccess(accessCookie?.value, trip.booking_no)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // 6. Samme production/host/bot/admin-gate-princip som Fase 1B (Issue #65)
  // — se src/lib/section-engagement.ts for hvorfor dette er en ny,
  // selvstændig funktion og ikke et genbrug af selve trip-visit.ts-koden.
  // Afviser gaten (preview, ikke-kanonisk host, bot, eller en sælger med
  // gyldig admin-session), returneres et harmless no-op-svar — INGEN
  // DB-skrivning. Preview deler production-DB'en og må derfor ALDRIG kunne
  // skrive til den, og en admin-browser der (fx via QA-siden) også har en
  // gyldig kunde-adgangscookie må heller aldrig kunne forurene
  // sektionsdataen.
  const shouldRecord = shouldRecordSectionEngagement({
    vercelEnv: process.env.VERCEL_ENV,
    host: headers().get("host"),
    userAgent: headers().get("user-agent"),
    cookieNames: cookies()
      .getAll()
      .map((cookie) => cookie.name),
  });
  if (!shouldRecord) {
    // Bevidst identisk statuskode (204) som et vellykket write nedenfor —
    // klienten skal ALDRIG kunne skelne "gaten afviste" fra "skrivningen
    // lykkedes", og skal under ingen omstændigheder retry'e på baggrund af
    // svaret her.
    return new NextResponse(null, { status: 204 });
  }

  // 7-9. Selve skrivningen: service-role server-side, aldrig client Supabase.
  // recordSectionEngagement() kaster aldrig og logger allerede sanitiseret
  // (kun tripId + section + Postgres' error.code/message — se
  // src/lib/section-engagement-write.ts).
  const outcome = await recordSectionEngagement(trip.id, parsed.data.section);
  if (outcome.kind !== "ok") {
    // Fail-open for KUNDEN: client tracker ignorerer denne statuskode helt
    // og retry'er aldrig (se SectionEngagementTracker.tsx) — non-2xx er kun
    // synligt server-side/i observability.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
