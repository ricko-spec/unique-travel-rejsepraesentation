import { describe, it, expect } from "vitest";
import { describeRecordSectionEngagementOutcome } from "./section-engagement-write";

// recordSectionEngagement() selv rører en rigtig Supabase-klient og har
// derfor ingen direkte unit-test (samme etablerede mønster som
// recordTripVisit()/checkRateLimit() — kun den rene klassifikationslogik
// testes). describeRecordSectionEngagementOutcome() er udtrukket specifikt
// så den kan testes uden at mocke Supabase/fetch — samme mønster som
// describeRecordTripVisitOutcome() i trip-visit-write.test.ts.
describe("describeRecordSectionEngagementOutcome", () => {
  it("ingen fejl → ok", () => {
    expect(describeRecordSectionEngagementOutcome({ error: null, aborted: false })).toEqual({
      kind: "ok",
    });
  });

  it("fejl + vores egen abort udløste den → timeout", () => {
    expect(
      describeRecordSectionEngagementOutcome({
        error: { code: "", message: "AbortError: This operation was aborted" },
        aborted: true,
      }),
    ).toEqual({ kind: "timeout" });
  });

  it("fejl uden abort → rpc-error med code/message viderebragt", () => {
    expect(
      describeRecordSectionEngagementOutcome({
        error: { code: "23514", message: "new row violates check constraint" },
        aborted: false,
      }),
    ).toEqual({
      kind: "rpc-error",
      code: "23514",
      message: "new row violates check constraint",
    });
  });

  it("fejl med manglende code/message → tomme strenge, aldrig undefined/null", () => {
    expect(
      describeRecordSectionEngagementOutcome({ error: {}, aborted: false }),
    ).toEqual({ kind: "rpc-error", code: "", message: "" });
  });
});
