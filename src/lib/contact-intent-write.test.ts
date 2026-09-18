import { describe, it, expect } from "vitest";
import { describeRecordContactIntentOutcome } from "./contact-intent-write";

// recordContactIntent() selv rører en rigtig Supabase-klient og har derfor
// ingen direkte unit-test (samme etablerede mønster som recordSectionEngagement()/
// recordTripVisit() — kun den rene klassifikationslogik testes).
// describeRecordContactIntentOutcome() er udtrukket specifikt så den kan testes
// uden at mocke Supabase/fetch.
describe("describeRecordContactIntentOutcome", () => {
  it("ingen fejl → ok", () => {
    expect(describeRecordContactIntentOutcome({ error: null, aborted: false })).toEqual({
      kind: "ok",
    });
  });

  it("fejl + vores egen abort udløste den → timeout", () => {
    expect(
      describeRecordContactIntentOutcome({
        error: { code: "", message: "AbortError: This operation was aborted" },
        aborted: true,
      }),
    ).toEqual({ kind: "timeout" });
  });

  it("fejl uden abort → rpc-error med code/message viderebragt", () => {
    expect(
      describeRecordContactIntentOutcome({
        error: { code: "23514", message: "new row violates check constraint" },
        aborted: false,
      }),
    ).toEqual({ kind: "rpc-error", code: "23514", message: "new row violates check constraint" });
  });

  it("fejl med manglende code/message → tomme strenge, aldrig undefined/null", () => {
    expect(describeRecordContactIntentOutcome({ error: {}, aborted: false })).toEqual({
      kind: "rpc-error",
      code: "",
      message: "",
    });
  });
});
