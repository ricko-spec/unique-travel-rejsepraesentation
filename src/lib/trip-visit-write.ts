import { waitUntil } from "@vercel/functions";
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

// Udfaldet af ét record_trip_visit-forsøg, adskilt fra selve RPC-kaldet så
// klassifikationen kan unit-testes uden at mocke Supabase-klienten (samme
// grundmønster som evaluateRateLimit/checkRateLimit-adskillelsen i
// rate-limit.ts). Rummer UDELUKKENDE de felter der må logges — aldrig
// tripId, rå headers eller andet, som holdes uden for denne type med vilje.
export type RecordTripVisitOutcome =
  | { kind: "ok" }
  | { kind: "timeout" }
  | { kind: "rpc-error"; code: string; message: string };

/**
 * Ren beslutningsfunktion: givet PostgREST-fejlen (eller null) og hvorvidt
 * VORES egen timeout udløste abort-signalet, afgør den hvad der skete.
 * `aborted` afgøres af os selv (vi kalder controller.abort()), så den er en
 * pålidelig kilde til "var dette en timeout" — uafhængig af hvordan
 * PostgREST/fetch tilfældigvis formulerer AbortError-beskeden.
 */
export function describeRecordTripVisitOutcome(input: {
  error: { code?: string | null; message?: string | null } | null;
  aborted: boolean;
}): RecordTripVisitOutcome {
  if (!input.error) return { kind: "ok" };
  if (input.aborted) return { kind: "timeout" };
  return {
    kind: "rpc-error",
    code: input.error.code ?? "",
    message: input.error.message ?? "",
  };
}

/**
 * Registrerer én kvalificeret kundeåbning for `tripId` via den atomare
 * `record_trip_visit`-RPC (supabase/010_trip_visits.sql). Best-effort:
 * kaster ALDRIG, uanset RPC-fejl, timeout eller uventet exception.
 *
 * Timeout er en reel abort, ikke kun "stop med at vente": `AbortController`
 * + `.abortSignal()` sender signalet videre til den underliggende `fetch`
 * (@supabase/postgrest-js's PostgrestBuilder sætter `signal: this.signal` på
 * selve fetch-kaldet), så VORES HTTP-forbindelse til PostgREST lukkes med
 * det samme timeout'et udløber. Vi kan IKKE garantere at en eventuel
 * igangværende forespørgsel inde i Postgres på serversiden stopper i samme
 * øjeblik — det afhænger af PostgREST/Postgres' egen håndtering af en lukket
 * klientforbindelse — kun at VI stopper med at vente, og at netværks-
 * forbindelsen lukkes. Timeren ryddes altid (`finally`), uanset udfald.
 *
 * Loggrænsen: kun `tripId` (allerede en intern, opaque uuid) + Postgres'
 * sanitiserede `error.code`/`error.message` logges. ALDRIG booking_no, slug,
 * kundenavn, rejsedata, rå request-headere, IP eller User-Agent — heller
 * ikke delvist, heller ikke "til debug".
 */
export async function recordTripVisit(tripId: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);

  try {
    const supabase = getSupabaseService();
    const { error } = await supabase
      .rpc("record_trip_visit", { p_trip_id: tripId })
      .abortSignal(controller.signal);

    const outcome = describeRecordTripVisitOutcome({ error, aborted: controller.signal.aborted });
    switch (outcome.kind) {
      case "ok":
        break;
      case "timeout":
        console.error("[trip-visit] timeout", { tripId });
        break;
      case "rpc-error":
        console.error("[trip-visit] rpc-fejl", {
          tripId,
          code: outcome.code,
          message: outcome.message,
        });
        break;
    }
  } catch (e) {
    // Aldrig det rå exception-objekt: kan i teorien bære stack traces eller
    // andre interne detaljer. Kun navn + tripId.
    const name = e instanceof Error ? e.name : "unknown";
    console.error("[trip-visit] uventet fejl", { tripId, name });
  } finally {
    // Undgår at en hurtigt-afsluttet RPC efterlader en hængende timer, som
    // ville kunne holde funktions-instansen kunstigt i live.
    clearTimeout(timer);
  }
  // Kaster ALDRIG — funktionen returnerer altid, uanset udfald.
}

/**
 * Planlægger recordTripVisit() via waitUntil() uden at kunne vælte kundens
 * sidevisning — heller ikke hvis selve SCHEDULING-kaldet (waitUntil, ikke
 * recordTripVisit) skulle kaste synkront (fx uden for en gyldig
 * serverless-kontekst). recordTripVisit() er en async-funktion der allerede
 * garanteret aldrig kaster/rejecter (se ovenfor), så den eneste reelle
 * fejlkilde her er selve platform-primitiven. Holder src/app/[bookingId]/
 * page.tsx fri for try/catch-logik (review-fund på PR #66).
 *
 * Samme loggrænse som recordTripVisit(): kun tripId + fejlnavn, aldrig
 * booking_no, slug, kundeinfo eller rå headers.
 */
export function scheduleTripVisit(tripId: string): void {
  try {
    waitUntil(recordTripVisit(tripId));
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    console.error("[trip-visit] scheduling-fejl", { tripId, name });
  }
}
