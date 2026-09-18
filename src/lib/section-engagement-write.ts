import { getSupabaseService } from "./supabase/server";
import type { SectionId } from "./section-engagement";

// Vision 3.0 Fase 2 (Issue #71) — best-effort skrivning af én sektions
// engagement. Kaldet direkte (awaited) fra
// src/app/[bookingId]/engagement/route.ts — modsat Fase 1B's
// scheduleTripVisit()/waitUntil() er der her ingen sideeffekt på en
// kunde-siderendering at beskytte (dette ER hele endpointets job, ikke et
// bikald under en anden request), så et almindeligt await er både enklere
// og mere korrekt. recordSectionEngagement() må derfor ALDRIG kaste —
// route-handleren stoler på at altid få et roligt, klassificeret udfald
// tilbage, aldrig en exception den selv skal fange.
//
// Samme ni-trins fail-open-kontrakt og samme loggrænse som
// src/lib/trip-visit-write.ts (Issue #65, to review-runder): kun tripId
// (allerede en intern, opaque uuid) + section (en af fem kendte
// enum-værdier) + Postgres' sanitiserede error.code/error.message logges.
// ALDRIG booking_no, slug, kundenavn, rejsedata, rå request-headere, IP
// eller User-Agent.

const WRITE_TIMEOUT_MS = 2000;

export type RecordSectionEngagementOutcome =
  | { kind: "ok" }
  | { kind: "timeout" }
  | { kind: "rpc-error"; code: string; message: string };

/** Samme rene klassifikationsmønster som describeRecordTripVisitOutcome(). */
export function describeRecordSectionEngagementOutcome(input: {
  error: { code?: string | null; message?: string | null } | null;
  aborted: boolean;
}): RecordSectionEngagementOutcome {
  if (!input.error) return { kind: "ok" };
  if (input.aborted) return { kind: "timeout" };
  return {
    kind: "rpc-error",
    code: input.error.code ?? "",
    message: input.error.message ?? "",
  };
}

/**
 * Registrerer at `section` er set for `tripId` via den atomare
 * `record_trip_section_engagement`-RPC (supabase/011_trip_section_engagement.sql).
 * Best-effort: kaster ALDRIG, uanset RPC-fejl, timeout eller uventet
 * exception — returnerer altid et klassificeret udfald.
 *
 * Timeout er en reel abort (samme AbortController-mønster som
 * recordTripVisit()) — annullerer det faktiske HTTP-kald til PostgREST, ikke
 * kun vores egen venten. Timeren ryddes altid (`finally`).
 */
export async function recordSectionEngagement(
  tripId: string,
  section: SectionId,
): Promise<RecordSectionEngagementOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);

  try {
    const supabase = getSupabaseService();
    const { error } = await supabase
      .rpc("record_trip_section_engagement", { p_trip_id: tripId, p_section: section })
      .abortSignal(controller.signal);

    const outcome = describeRecordSectionEngagementOutcome({
      error,
      aborted: controller.signal.aborted,
    });
    switch (outcome.kind) {
      case "ok":
        break;
      case "timeout":
        console.error("[section-engagement] timeout", { tripId, section });
        break;
      case "rpc-error":
        console.error("[section-engagement] rpc-fejl", {
          tripId,
          section,
          code: outcome.code,
          message: outcome.message,
        });
        break;
    }
    return outcome;
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    console.error("[section-engagement] uventet fejl", { tripId, section, name });
    return { kind: "rpc-error", code: "", message: name };
  } finally {
    clearTimeout(timer);
  }
}
