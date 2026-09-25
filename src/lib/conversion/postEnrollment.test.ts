// Gate C1 (Issue #84) — Rickos to beslutninger før dry-run, regressionstests
// skrevet FØR implementeringen:
//   1. unique_travel_dealstatus = "Solgt (andet booking nr.)" ⇒ bevares som
//      revisionsspor, men udelukkes fra tæller OG nævner med årsagen
//      BOOKED_OTHER_REFERENCE_UNRESOLVED — aldrig NOT_BOOKED, aldrig BOOKED.
//   2. En optaget deal, der senere flyttes til Dubletter/Test Leads ⇒ markeres
//      efterfølgende ugyldig (INVALIDATED_DUPLICATE_OR_TEST), slettes ikke, den
//      oprindelige observation omskrives ikke, og den indgår ikke i publicerede tal.
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, classifyOutcomeSignal } from "./contract";
import { reduceDealCohort, validateObservation, type ReduceDealCohortInput } from "./classify";
import { fixtureObservation, createFixtureHubSpotAdapter } from "./hubspotAdapter";
import { buildConversionAggregate, type CohortAggregateRow } from "./aggregate";
import { runConversionSync } from "./syncEngine";
import { createInMemoryConversionPersistence, supabaseConversionPersistence, cohortRowViolation, cohortTransitionViolation } from "./persistence";
import { computeDealKey } from "./dealKey";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CohortState } from "./types";

const OTHER_REF = "Solgt (andet booking nr.)";
const STAGE = {
  quote: "1098732868",
  updated: "1169407502",
  lead: "1098732865",
  sold: "1098732870",
  soldOther: "1419023367",
  screenet: "1386314544",
  dubletter: "1110279232",
  test: "1110279233",
  afslag: "1354831680",
};
const CLOSED = new Set([STAGE.sold, STAGE.soldOther, STAGE.screenet, STAGE.dubletter, STAGE.test, STAGE.afslag]);
const T1 = new Date("2026-10-02T03:00:00Z");
const T2 = new Date("2026-10-03T03:00:00Z");
const T3 = new Date("2026-10-04T03:00:00Z");

function step(stage: string, at: Date, existing: CohortState | null, dealStatusRaw: string | null = null, closedWon = false) {
  const v = validateObservation(
    fixtureObservation({ rawDealId: "1", dealStageId: stage, hubspotClosed: CLOSED.has(stage), hubspotClosedWon: closedWon, dealStatusRaw, bookingNumberRaw: "12345" }),
  );
  if (!v.ok) throw new Error("uventet kontraktdrift i test");
  const input: ReduceDealCohortInput = {
    dealKey: "d".repeat(64),
    observedAt: at,
    isBaseline: false,
    validated: v.value,
    booking: { kind: "valid", normalized: "12345" },
    currentBookingMatchKey: "a".repeat(64),
    existing,
    travelPlanIndex: new Map(),
    sharedBookingMatchKeys: new Set(),
    contractVersion: CONTRACT_VERSION,
  };
  const { dealKey: _k, ...state } = reduceDealCohort(input);
  return state;
}

describe("regel 1 — dealstatus 'Solgt (andet booking nr.)'", () => {
  it("udfaldssignalet er hverken booket, tabt eller konflikt, men eksplicit uafklaret — også når HubSpot siger lukket-tabt", () => {
    for (const [closed, won] of [[false, false], [true, false], [true, true]] as const) {
      expect(classifyOutcomeSignal({ dealStatusRaw: OTHER_REF, hubspotClosed: closed, hubspotClosedWon: won })).toEqual({
        kind: "valid",
        booked: false,
        lostObserved: false,
        conflict: false,
        otherReferenceUnresolved: true,
      });
    }
    expect(classifyOutcomeSignal({ dealStatusRaw: "Solgt", hubspotClosed: true, hubspotClosedWon: true })).toMatchObject({ otherReferenceUnresolved: false, booked: true });
  });

  it("optaget deal der senere får statussen: rækken bevares, oprindelig observation uændret, markeres BOOKED_OTHER_REFERENCE_UNRESOLVED", () => {
    const enrolled = step(STAGE.quote, T1, null);
    const later = step(STAGE.soldOther, T2, enrolled, OTHER_REF, false);
    expect(later).toMatchObject({
      eligibilityStatus: "ENROLLED",
      firstQualifiedObservationAt: T1,
      exposureGroup: enrolled.exposureGroup,
      exposureFrozenAt: T1,
      postEnrollmentExclusionReason: "BOOKED_OTHER_REFERENCE_UNRESOLVED",
      postEnrollmentExcludedAt: T2,
      firstBookedAt: null,
      lostObservedAt: null,
    });
  });

  it("deal der optages med statussen allerede sat, markeres i samme observation", () => {
    const r = step(STAGE.quote, T1, null, OTHER_REF);
    expect(r).toMatchObject({ eligibilityStatus: "ENROLLED", postEnrollmentExclusionReason: "BOOKED_OTHER_REFERENCE_UNRESOLVED", postEnrollmentExcludedAt: T1 });
  });

  it("markeringen fjernes ikke, selv hvis statussen senere bliver 'Solgt' (først en sikker løsning må ændre det)", () => {
    const flagged = step(STAGE.soldOther, T2, step(STAGE.quote, T1, null), OTHER_REF);
    const solgt = step(STAGE.sold, T3, flagged, "Solgt", true);
    expect(solgt.postEnrollmentExclusionReason).toBe("BOOKED_OTHER_REFERENCE_UNRESOLVED");
    expect(solgt.postEnrollmentExcludedAt).toEqual(T2);
  });
});

describe("regel 2 — optaget deal flyttes senere til Dubletter/Test Leads", () => {
  it.each([["Dubletter", STAGE.dubletter], ["Test Leads", STAGE.test]])("%s ⇒ INVALIDATED_DUPLICATE_OR_TEST; oprindelig observation omskrives ikke", (_n, stage) => {
    const enrolled = step(STAGE.quote, T1, null);
    const later = step(stage, T2, enrolled);
    expect(later).toMatchObject({
      eligibilityStatus: "ENROLLED",
      firstQualifiedObservationAt: T1,
      exposureGroup: enrolled.exposureGroup,
      exposureFrozenAt: T1,
      bookingMatchKey: enrolled.bookingMatchKey,
      postEnrollmentExclusionReason: "INVALIDATED_DUPLICATE_OR_TEST",
      postEnrollmentExcludedAt: T2,
    });
  });

  it("markeringen er permanent (ingen fjernelse ved flytning tilbage) og den første årsag vinder", () => {
    const inval = step(STAGE.dubletter, T2, step(STAGE.quote, T1, null));
    const back = step(STAGE.updated, T3, inval, OTHER_REF);
    expect(back.postEnrollmentExclusionReason).toBe("INVALIDATED_DUPLICATE_OR_TEST");
    expect(back.postEnrollmentExcludedAt).toEqual(T2);
  });

  it("Screenet, Afslag eller Solgt ugyldiggør IKKE en optaget deal (kun Dubletter/Test Leads)", () => {
    for (const s of [STAGE.screenet, STAGE.afslag, STAGE.sold]) {
      expect(step(s, T2, step(STAGE.quote, T1, null), s === STAGE.sold ? "Solgt" : null, s === STAGE.sold).postEnrollmentExclusionReason).toBeNull();
    }
  });

  it("kun ENROLLED markeres: en PRE_START- eller EXCLUDED-deal i Test Leads/med uafklaret status forbliver umarkeret", () => {
    const { dealKey: _a, ...preStart } = reduceDealCohort({
      dealKey: "d".repeat(64),
      observedAt: T1,
      isBaseline: true,
      validated: (validateObservation(fixtureObservation({ rawDealId: "1", dealStageId: STAGE.quote })) as { ok: true; value: never }).value,
      booking: { kind: "valid", normalized: "12345" },
      currentBookingMatchKey: "a".repeat(64),
      existing: null,
      travelPlanIndex: new Map(),
      sharedBookingMatchKeys: new Set(),
      contractVersion: CONTRACT_VERSION,
    });
    expect(preStart.eligibilityStatus).toBe("PRE_START_EXISTING");
    for (const [stage, status] of [[STAGE.test, null], [STAGE.soldOther, OTHER_REF]] as const) {
      const r = step(stage, T2, { ...preStart }, status);
      expect(r).toMatchObject({ eligibilityStatus: "PRE_START_EXISTING", postEnrollmentExclusionReason: null, postEnrollmentExcludedAt: null });
      expect(cohortRowViolation(r)).toBeNull();
    }
  });

  it("en pending deal i Dubletter/Test Leads forbliver pending (ingen markering, ingen optagelse)", () => {
    const pending = step(STAGE.lead, T1, null);
    const r = step(STAGE.test, T2, pending);
    expect(r).toMatchObject({ eligibilityStatus: "ELIGIBLE_PENDING", postEnrollmentExclusionReason: null });
  });
});

describe("invarianter (spejler kommende DB-regler)", () => {
  it("markering kræver ENROLLED, årsag og tidspunkt sammen, og kan ikke fjernes eller ændres", () => {
    const enrolled = step(STAGE.quote, T1, null);
    const flagged = step(STAGE.dubletter, T2, enrolled);
    expect(cohortRowViolation(flagged)).toBeNull();
    expect(cohortRowViolation({ ...flagged, postEnrollmentExcludedAt: null })).not.toBeNull();
    expect(cohortRowViolation({ ...step(STAGE.lead, T1, null), postEnrollmentExclusionReason: "INVALIDATED_DUPLICATE_OR_TEST", postEnrollmentExcludedAt: T1 })).not.toBeNull();
    expect(cohortTransitionViolation(flagged, { ...flagged, postEnrollmentExclusionReason: null, postEnrollmentExcludedAt: null })).not.toBeNull();
    expect(cohortTransitionViolation(flagged, { ...flagged, postEnrollmentExclusionReason: "BOOKED_OTHER_REFERENCE_UNRESOLVED" })).not.toBeNull();
  });
});

function aggRow(o: Partial<CohortAggregateRow>): CohortAggregateRow {
  return {
    eligibilityStatus: "ENROLLED",
    exclusionReason: null,
    firstQualifiedObservationAt: new Date("2026-10-10T03:00:00Z"),
    exposureGroup: "ONLINE",
    bookingConflictDetectedAt: null,
    postEnrollmentExclusionReason: null,
    outcomeStatus: "NOT_BOOKED",
    firstBookedAt: null,
    lostObservedAt: null,
    outcomeConflictObservedAt: null,
    ...o,
  };
}

describe("publicering — ekskluderede deals er hverken i tæller, nævner eller tabt, og tæller aldrig som NOT_BOOKED", () => {
  const measurement = { status: "ACTIVE" as const, contractVersion: CONTRACT_VERSION, measurementStartedAt: new Date("2026-10-01T00:00:00Z"), lastSuccessfulSyncAt: new Date("2027-03-01T03:00:00Z") };
  const start = new Date("2026-10-10T03:00:00Z");
  const normal = Array.from({ length: 30 }, (_, i) =>
    aggRow({ outcomeStatus: i < 15 ? "BOOKED" : "NOT_BOOKED", firstBookedAt: i < 15 ? new Date(start.getTime() + 5 * 86400000) : null }),
  );
  const unresolved = Array.from({ length: 12 }, () => aggRow({ postEnrollmentExclusionReason: "BOOKED_OTHER_REFERENCE_UNRESOLVED", lostObservedAt: new Date() }));
  const invalid = Array.from({ length: 11 }, (_, i) =>
    aggRow({ postEnrollmentExclusionReason: "INVALIDATED_DUPLICATE_OR_TEST", outcomeStatus: i < 3 ? "BOOKED" : "NOT_BOOKED", firstBookedAt: i < 3 ? new Date(start.getTime() + 86400000) : null }),
  );

  it("vinduer, trend og gruppetotal tæller kun de 30 normale deals — de 23 ekskluderede indgår hverken som booket eller ikke-booket", () => {
    const a = buildConversionAggregate([...normal, ...unresolved, ...invalid], measurement, new Date("2027-03-01T12:00:00Z"));
    for (const w of [30, 60, 90] as const) expect(a.groups.ONLINE.windows[w]).toMatchObject({ denominator: 30, numerator: 15 });
    expect(a.groups.ONLINE.totalEnrolled).toBe(30);
    expect(a.groups.ONLINE.trend30.reduce((s, t) => s + t.enrolled, 0)).toBe(30);
    expect(a.dataQuality.postEnrollmentExcluded).toEqual({ BOOKED_OTHER_REFERENCE_UNRESOLVED: 12, INVALIDATED_DUPLICATE_OR_TEST: 11 });
    expect(a.dataQuality.lostObserved).toBe(0); // de uafklarede tælles heller ikke som tabt
  });
});

describe("persistence — ingen DB-ændring i C1: markeringen kan ikke committes før migration 014", () => {
  it("Supabase-adapteren afviser en commit med markering (COMMIT_REJECTED) UDEN at kalde RPC'en", async () => {
    const calls: string[] = [];
    const client = { rpc: (fn: string) => (calls.push(fn), Promise.resolve({ data: null, error: null })) } as unknown as SupabaseClient;
    const flagged = step(STAGE.dubletter, T2, step(STAGE.quote, T1, null));
    const r = await supabaseConversionPersistence(client).commitSyncRun({
      runId: "r",
      syncGeneration: 0,
      contractVersion: CONTRACT_VERSION,
      observedAt: T2,
      isBaseline: false,
      rows: [{ ...flagged, dealKey: "d".repeat(64) }],
    });
    expect(r).toEqual({ ok: false, code: "COMMIT_REJECTED" });
    expect(calls).toEqual([]);
  });
});

describe("end-to-end (in-memory) — sync-motoren anvender begge regler", () => {
  it("optaget deal → Test Leads og en anden → 'Solgt (andet booking nr.)': begge ENROLLED+markeret, ingen i publicerbare tal", async () => {
    const ds = "d".repeat(40);
    const bs = "b".repeat(40);
    let clock = new Date("2026-10-01T03:00:00Z");
    const p = createInMemoryConversionPersistence({ measurementState: { status: "ACTIVE", contractVersion: CONTRACT_VERSION, measurementStartedAt: null, lastSuccessfulSyncAt: null }, clock: () => clock });
    const run = (deals: ReturnType<typeof fixtureObservation>[], at: Date) => runConversionSync(createFixtureHubSpotAdapter({ deals }), p, { dealKeySecret: ds, bookingMatchSecret: bs, now: at });
    const d = (id: string, stage: string, over: Record<string, unknown> = {}) =>
      fixtureObservation({ rawDealId: id, dealStageId: stage, hubspotClosed: CLOSED.has(stage), bookingNumberRaw: `9${id}`, ...over });
    await run([d("1", STAGE.lead), d("2", STAGE.lead)], clock);
    clock = T1;
    await run([d("1", STAGE.quote), d("2", STAGE.quote)], T1);
    clock = T2;
    expect(await run([d("1", STAGE.test), d("2", STAGE.soldOther, { dealStatusRaw: OTHER_REF })], T2)).toMatchObject({ ok: true });
    expect(p.getCohortRow(computeDealKey("1", ds))).toMatchObject({ eligibilityStatus: "ENROLLED", firstQualifiedObservationAt: T1, postEnrollmentExclusionReason: "INVALIDATED_DUPLICATE_OR_TEST" });
    expect(p.getCohortRow(computeDealKey("2", ds))).toMatchObject({ eligibilityStatus: "ENROLLED", firstQualifiedObservationAt: T1, postEnrollmentExclusionReason: "BOOKED_OTHER_REFERENCE_UNRESOLVED", outcomeStatus: "NOT_BOOKED" });
    const rows = [...p.getAllCohortRows().values()];
    const a = buildConversionAggregate(rows, p.getMeasurementState()!, new Date("2027-03-01T00:00:00Z"));
    expect((a.groups.ONLINE.totalEnrolled ?? 0) + (a.groups.PDF_ONLY.totalEnrolled ?? 0)).toBe(0);
  });
});
