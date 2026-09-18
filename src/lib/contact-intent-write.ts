import { getSupabaseService } from "./supabase/server";
import type { ContactChannel } from "./contact-intent";

// Vision 3.0 Fase 3 (Issue #73) — best-effort skrivning af én kanals
// kontakt-intent. Kaldet direkte (awaited) fra
// src/app/[bookingId]/intent/route.ts via handleContactIntent() — samme
// mønster som src/lib/section-engagement-write.ts (Issue #71).
// recordContactIntent() må derfor ALDRIG kaste — orkestreringen stoler på at
// altid få et roligt, klassificeret udfald tilbage.
//
// Samme fail-open-kontrakt og samme loggrænse som Fase 1B/2: kun tripId
// (allerede en intern, opaque uuid) + channel (en af to kendte enum-værdier)
// + Postgres' sanitiserede error.code/error.message logges. ALDRIG
// booking_no, slug, kundenavn, rejsedata, rå request-headere, IP eller
// User-Agent.

const WRITE_TIMEOUT_MS = 2000;

export type RecordContactIntentOutcome =
  | { kind: "ok" }
  | { kind: "timeout" }
  | { kind: "rpc-error"; code: string; message: string };

/** Samme rene klassifikationsmønster som describeRecordSectionEngagementOutcome(). */
export function describeRecordContactIntentOutcome(input: {
  error: { code?: string | null; message?: string | null } | null;
  aborted: boolean;
}): RecordContactIntentOutcome {
  if (!input.error) return { kind: "ok" };
  if (input.aborted) return { kind: "timeout" };
  return {
    kind: "rpc-error",
    code: input.error.code ?? "",
    message: input.error.message ?? "",
  };
}

/**
 * Registrerer at `channel` blev brugt for `tripId` via den atomare
 * `record_trip_contact_intent`-RPC (supabase/012_trip_contact_intent.sql).
 * Best-effort: kaster ALDRIG, uanset RPC-fejl, timeout eller uventet
 * exception — returnerer altid et klassificeret udfald. Service-role-klienten
 * (getSupabaseService) bruges udelukkende her, server-side.
 *
 * Timeout er en reel abort (AbortController) — annullerer det faktiske
 * HTTP-kald til PostgREST. Timeren ryddes altid (`finally`).
 */
export async function recordContactIntent(
  tripId: string,
  channel: ContactChannel,
): Promise<RecordContactIntentOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);

  try {
    const supabase = getSupabaseService();
    const { error } = await supabase
      .rpc("record_trip_contact_intent", { p_trip_id: tripId, p_channel: channel })
      .abortSignal(controller.signal);

    const outcome = describeRecordContactIntentOutcome({
      error,
      aborted: controller.signal.aborted,
    });
    switch (outcome.kind) {
      case "ok":
        break;
      case "timeout":
        console.error("[contact-intent] timeout", { tripId, channel });
        break;
      case "rpc-error":
        console.error("[contact-intent] rpc-fejl", {
          tripId,
          channel,
          code: outcome.code,
          message: outcome.message,
        });
        break;
    }
    return outcome;
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    console.error("[contact-intent] uventet fejl", { tripId, channel, name });
    return { kind: "rpc-error", code: "", message: name };
  } finally {
    clearTimeout(timer);
  }
}
