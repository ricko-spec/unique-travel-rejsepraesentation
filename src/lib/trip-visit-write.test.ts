import { describe, it, expect } from "vitest";
import { describeRecordTripVisitOutcome } from "./trip-visit-write";

// recordTripVisit() selv rører en rigtig Supabase-klient og har derfor ingen
// direkte unit-test (samme etableret mønster som checkRateLimit() i
// rate-limit.ts — kun den rene beslutningslogik testes, ikke DB-kaldet).
// describeRecordTripVisitOutcome() er den rene klassifikation der afgør
// hvad der skal logges, udtrukket specifikt så den kan testes uden at mocke
// Supabase/fetch (review-fund på PR #66).
describe("describeRecordTripVisitOutcome", () => {
  it("ingen fejl → ok", () => {
    expect(describeRecordTripVisitOutcome({ error: null, aborted: false })).toEqual({
      kind: "ok",
    });
  });

  it("ingen fejl, selvom aborted tilfældigvis er sand (race ved succes-i-sidste-øjeblik) → stadig ok", () => {
    // Skulle abort-signalet nå at blive sat lige efter et vellykket svar er
    // modtaget, er der ingen fejl at rapportere — succes trumfer.
    expect(describeRecordTripVisitOutcome({ error: null, aborted: true })).toEqual({
      kind: "ok",
    });
  });

  it("fejl + vores egen abort udløste den → timeout, uanset fejlteksten fra fetch/PostgREST", () => {
    expect(
      describeRecordTripVisitOutcome({
        error: { code: "", message: "AbortError: This operation was aborted" },
        aborted: true,
      }),
    ).toEqual({ kind: "timeout" });
  });

  it("fejl uden abort → rpc-error med code/message viderebragt", () => {
    expect(
      describeRecordTripVisitOutcome({
        error: { code: "42501", message: "permission denied for function record_trip_visit" },
        aborted: false,
      }),
    ).toEqual({
      kind: "rpc-error",
      code: "42501",
      message: "permission denied for function record_trip_visit",
    });
  });

  it("fejl med manglende/null code/message → tomme strenge, aldrig undefined/null i log-payloaden", () => {
    expect(
      describeRecordTripVisitOutcome({
        error: { code: null, message: null },
        aborted: false,
      }),
    ).toEqual({ kind: "rpc-error", code: "", message: "" });

    expect(
      describeRecordTripVisitOutcome({
        error: {},
        aborted: false,
      }),
    ).toEqual({ kind: "rpc-error", code: "", message: "" });
  });

  it("returnerer udelukkende de tre dokumenterede felter — aldrig ekstra nøgler (fx tripId hører ikke til her)", () => {
    const outcome = describeRecordTripVisitOutcome({
      error: { code: "08006", message: "connection failure" },
      aborted: false,
    });
    expect(Object.keys(outcome).sort()).toEqual(["code", "kind", "message"]);
  });
});
