import { getSupabaseService } from "./supabase/server";

// Vision 3.0 Fase 1B (Issue #65) — best-effort skrivning af en kundeåbning.
// Kaldet via waitUntil() i src/app/[bookingId]/page.tsx, ALDRIG afventet
// (await) på kritisk-vej-siden. recordTripVisit() må derfor ALDRIG kunne
// kaste, uanset hvad der går galt — kunden har allerede fået sin side.
//
// Fail-open, bevidst modsat Issue #38's upload_events (fail-closed): prisen
// for et upload_events-svigt bæres af en kollega der kan prøve igen; prisen
// for et fail-closed-svigt her ville bæres af KUNDEN, fordi vores statistik
// havde en dårlig dag. Et tabt datapunkt i en tæller er en ubetydelig
// omkostning; et ødelagt kundetilbud er ikke. Se
// docs/VISION-3.0-EVENT-MODEL.md §9 for den fulde begrundelse og det ni-trins
// bevis for at denne funktion hverken kan forsinke eller ødelægge kundesiden.

// Ressourceværn, IKKE et latensværn — kundens latens er allerede løst
// strukturelt af waitUntil() (responsen er sendt før dette kald overhovedet
// startes). Loftet forhindrer blot at en hængende DB-forbindelse holder
// funktions-instansen kunstigt i live og brænder eksekveringstid på et kald
// der aldrig bliver til noget.
const WRITE_TIMEOUT_MS = 2000;

/**
 * Registrerer én kvalificeret kundeåbning for `tripId` via den atomare
 * `record_trip_visit`-RPC (supabase/010_trip_visits.sql). Best-effort:
 * kaster ALDRIG, uanset RPC-fejl, timeout eller uventet exception.
 *
 * Loggrænsen: kun `tripId` (allerede en intern, opaque uuid) + Postgres'
 * sanitiserede `error.code`/`error.message` logges. ALDRIG booking_no, slug,
 * kundenavn, rejsedata, rå request-headere, IP eller User-Agent — heller
 * ikke delvist, heller ikke "til debug".
 */
export async function recordTripVisit(tripId: string): Promise<void> {
  try {
    const supabase = getSupabaseService();
    const write = supabase.rpc("record_trip_visit", { p_trip_id: tripId });
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), WRITE_TIMEOUT_MS);
    });

    const result = await Promise.race([write, timeout]);

    if (result === null) {
      console.error("[trip-visit] timeout", { tripId });
      return;
    }

    // Fejlen er et OBJEKT fra PostgREST, ikke en kastet exception — skal
    // tjekkes eksplicit, ellers går den ubemærket.
    const { error } = result;
    if (error) {
      console.error("[trip-visit] rpc-fejl", {
        tripId,
        code: error.code,
        message: error.message,
      });
    }
  } catch (e) {
    // Aldrig det rå exception-objekt: kan i teorien bære stack traces eller
    // andre interne detaljer. Kun navn + tripId.
    const name = e instanceof Error ? e.name : "unknown";
    console.error("[trip-visit] uventet fejl", { tripId, name });
  }
  // Kaster ALDRIG — funktionen returnerer altid, uanset udfald.
}
