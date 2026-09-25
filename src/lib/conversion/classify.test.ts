import { describe, expect, it } from "vitest";
import {
  computeSharedBookingMatchKeys,
  markUnobservedConflicts,
  reduceDealCohort,
  validateObservation,
  verifyStageContract,
  type ReduceDealCohortInput,
  type ValidatedObservation,
} from "./classify";
import { CONTRACT_VERSION, classifyOutcomeSignal, type PipelineStageContract } from "./contract";
import { fixtureObservation } from "./hubspotAdapter";
import type { ClassifiedDealResult, CohortState } from "./types";

const T0 = new Date("2026-10-01T03:00:00Z"); // baseline
const T1 = new Date("2026-10-02T03:00:00Z");
const T2 = new Date("2026-10-03T03:00:00Z");
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

const OPEN_NOT_BOOKED = { booked: false, lostObserved: false, conflict: false };

const TEST_CONTRACT: PipelineStageContract = {
  pipelineId: "754595640",
  complete: true,
  stages: {
    screened: { class: "PRE_QUOTE", closed: false, label: "screened" },
    "1098732868": { class: "QUOTE_OR_LATER", closed: false, label: "Tilbud sendt" },
    "1169407502": { class: "QUOTE_OR_LATER", closed: false, label: "Opdateret tilbud" },
    solgt: { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "solgt" },
    tabt: { class: "OUTCOME_WITHOUT_QUOTE_EVIDENCE", closed: true, label: "tabt" },
  },
};

function validated(stageClass: ValidatedObservation["stageClass"], outcome = OPEN_NOT_BOOKED): ValidatedObservation {
  return { stageClass, outcome };
}

function input(overrides: Partial<ReduceDealCohortInput> = {}): ReduceDealCohortInput {
  return {
    dealKey: "d".repeat(64),
    observedAt: T1,
    isBaseline: false,
    validated: validated("QUOTE_OR_LATER"),
    booking: { kind: "valid", normalized: "1000" },
    currentBookingMatchKey: KEY_A,
    existing: null,
    travelPlanIndex: new Map(),
    sharedBookingMatchKeys: new Set(),
    contractVersion: CONTRACT_VERSION,
    ...overrides,
  };
}

function toState(r: ClassifiedDealResult): CohortState {
  const { dealKey: _k, ...state } = r;
  return state;
}

describe("validateObservation / verifyStageContract — versioneret, fail-closed snapshot-kontrakt", () => {
  it("kendt stage giver sin klasse; ukendt stage, forkert pipeline eller umulige flag er kontraktdrift", () => {
    expect(validateObservation(fixtureObservation({ rawDealId: "1", dealStageId: "1169407502" }), TEST_CONTRACT)).toEqual({
      ok: true,
      value: { stageClass: "QUOTE_OR_LATER", invalidatesEnrollment: false, outcome: { ...OPEN_NOT_BOOKED, otherReferenceUnresolved: false } },
    });
    expect(validateObservation(fixtureObservation({ rawDealId: "1", dealStageId: "ukendt" }), TEST_CONTRACT).ok).toBe(false);
    expect(validateObservation(fixtureObservation({ rawDealId: "1", pipelineId: "999" }), TEST_CONTRACT).ok).toBe(false);
    // hs_is_closed skal matche stagens lukke-flag (v3).
    expect(
      validateObservation(fixtureObservation({ rawDealId: "1", dealStageId: "screened", hubspotClosed: true }), TEST_CONTRACT).ok,
    ).toBe(false);
    expect(validateObservation(fixtureObservation({ rawDealId: "1", dealStageId: "tabt" }), TEST_CONTRACT).ok).toBe(false);
    // closed_won uden closed er umuligt.
    expect(
      validateObservation(fixtureObservation({ rawDealId: "1", hubspotClosed: false, hubspotClosedWon: true }), TEST_CONTRACT).ok,
    ).toBe(false);
  });

  it("stage-listen skal matche live 1:1 — ukendt live-stage, manglende stage eller dublet fejler lukket", () => {
    const all = Object.entries(TEST_CONTRACT.stages).map(([id, e]) => ({ id, closed: e.closed }));
    expect(verifyStageContract({ pipelineId: "754595640", stages: all }, TEST_CONTRACT)).toEqual({ ok: true });
    expect(verifyStageContract({ pipelineId: "754595640", stages: [...all, { id: "ny", closed: false }] }, TEST_CONTRACT)).toEqual({
      ok: false,
      code: "CONTRACT_DRIFT",
    });
    expect(verifyStageContract({ pipelineId: "754595640", stages: all.slice(1) }, TEST_CONTRACT).ok).toBe(false);
    expect(verifyStageContract({ pipelineId: "754595640", stages: [...all, all[0]] }, TEST_CONTRACT).ok).toBe(false);
    expect(verifyStageContract({ pipelineId: "1", stages: all }, TEST_CONTRACT).ok).toBe(false);
  });

  it("en ufuldstændig kontrakt giver stadig CONTRACT_INCOMPLETE (fail-closed)", () => {
    const incomplete = { ...TEST_CONTRACT, complete: false };
    const all = Object.entries(TEST_CONTRACT.stages).map(([id, e]) => ({ id, closed: e.closed }));
    expect(verifyStageContract({ pipelineId: "754595640", stages: all }, incomplete)).toEqual({ ok: false, code: "CONTRACT_INCOMPLETE" });
    expect(verifyStageContract({ pipelineId: "754595640", stages: [...all, { id: "ny", closed: false }] }, incomplete)).toEqual({
      ok: false,
      code: "CONTRACT_INCOMPLETE",
    });
  });
});

describe("classifyOutcomeSignal — én sandhedstabel (fund 7)", () => {
  const cases: [string | null, boolean, boolean, ReturnType<typeof classifyOutcomeSignal>][] = [
    ["Solgt", true, true, { kind: "valid", booked: true, lostObserved: false, conflict: false, otherReferenceUnresolved: false }],
    ["Billetter sendt", false, false, { kind: "valid", booked: true, lostObserved: false, conflict: false, otherReferenceUnresolved: false }],
    ["Solgt", true, false, { kind: "valid", booked: true, lostObserved: false, conflict: true, otherReferenceUnresolved: false }],
    [null, false, false, { kind: "valid", booked: false, lostObserved: false, conflict: false, otherReferenceUnresolved: false }],
    ["Tilbud", true, false, { kind: "valid", booked: false, lostObserved: true, conflict: false, otherReferenceUnresolved: false }],
    // hs_is_closed_won ALENE giver aldrig BOOKED — kun datakvalitets-konflikt.
    [null, true, true, { kind: "valid", booked: false, lostObserved: false, conflict: true, otherReferenceUnresolved: false }],
    ["Solgt", false, true, { kind: "contract-drift" }],
    [null, false, true, { kind: "contract-drift" }],
  ];
  it.each(cases)("dealstatus=%s closed=%s won=%s", (dealStatusRaw, hubspotClosed, hubspotClosedWon, expected) => {
    expect(classifyOutcomeSignal({ dealStatusRaw, hubspotClosed, hubspotClosedWon })).toEqual(expected);
  });
});

describe("reduceDealCohort — prospektiv baseline uden historik (fund 1)", () => {
  it("baseline: aktuelt kvalificerede deals ⇒ PRE_START_EXISTING, uden kohortestart", () => {
    const r = reduceDealCohort(input({ isBaseline: true, observedAt: T0, validated: validated("QUOTE_OR_LATER") }));
    expect(r.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(r.firstQualifiedObservationAt).toBeNull();
    expect(r.bookingMatchKey).toBeNull();
    expect(r.exposureGroup).toBeNull();
  });

  it("baseline: lukkede deals (også tvetydige) ⇒ PRE_START_EXISTING", () => {
    const r = reduceDealCohort(input({ isBaseline: true, observedAt: T0, validated: validated("OUTCOME_WITHOUT_QUOTE_EVIDENCE") }));
    expect(r.eligibilityStatus).toBe("PRE_START_EXISTING");
  });

  it("baseline: åbne PRE_QUOTE-deals ⇒ ELIGIBLE_PENDING", () => {
    const r = reduceDealCohort(input({ isBaseline: true, observedAt: T0, validated: validated("PRE_QUOTE") }));
    expect(r.eligibilityStatus).toBe("ELIGIBLE_PENDING");
    expect(r.firstSeenAt).toEqual(T0);
  });

  it("pending deal optages første gang den observeres kvalificeret; kohortestart = den aktuelle observedAt", () => {
    const pending = toState(reduceDealCohort(input({ isBaseline: true, observedAt: T0, validated: validated("PRE_QUOTE") })));
    const r = reduceDealCohort(input({ existing: pending, observedAt: T2 }));
    expect(r.eligibilityStatus).toBe("ENROLLED");
    expect(r.firstQualifiedObservationAt).toEqual(T2);
    expect(r.exposureFrozenAt).toEqual(T2);
    expect(r.firstSeenAt).toEqual(T0);
  });

  it("en helt ny deal efter baseline, der allerede er kvalificeret, optages med observedAt (aldrig et HubSpot-tidspunkt)", () => {
    const r = reduceDealCohort(input({ observedAt: T1 }));
    expect(r.eligibilityStatus).toBe("ENROLLED");
    expect(r.firstQualifiedObservationAt).toEqual(T1);
  });

  it("'Opdateret tilbud' senere nulstiller hverken kohortestart eller eksponering", () => {
    const enrolled = toState(reduceDealCohort(input({ observedAt: T1 })));
    const later = reduceDealCohort(input({ existing: enrolled, observedAt: T2, validated: validated("QUOTE_OR_LATER") }));
    expect(later.firstQualifiedObservationAt).toEqual(T1);
    expect(later.exposureGroup).toBe(enrolled.exposureGroup);
    expect(later.exposureFrozenAt).toEqual(T1);
    expect(later.lastObservedAt).toEqual(T2);
  });

  it("en deal der går tilbage til en PRE_QUOTE-stage efter optagelse, forbliver ENROLLED med frosne felter", () => {
    const enrolled = toState(reduceDealCohort(input({ observedAt: T1 })));
    const r = reduceDealCohort(input({ existing: enrolled, observedAt: T2, validated: validated("PRE_QUOTE") }));
    expect(r.eligibilityStatus).toBe("ENROLLED");
    expect(r.firstQualifiedObservationAt).toEqual(T1);
  });

  it("PRE_START_EXISTING optages aldrig senere, heller ikke ved 'Opdateret tilbud'", () => {
    const pre = toState(reduceDealCohort(input({ isBaseline: true, observedAt: T0 })));
    const r = reduceDealCohort(input({ existing: pre, observedAt: T2 }));
    expect(r.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(r.firstQualifiedObservationAt).toBeNull();
  });

  it("efter baseline: første observation i en udfalds-/senere stage uden tilbudsbevis ⇒ EXCLUDED CLOSED_BEFORE_QUALIFIED_OBSERVATION, aldrig PDF_ONLY", () => {
    const r = reduceDealCohort(input({ validated: validated("OUTCOME_WITHOUT_QUOTE_EVIDENCE") }));
    expect(r.eligibilityStatus).toBe("EXCLUDED");
    expect(r.exclusionReason).toBe("CLOSED_BEFORE_QUALIFIED_OBSERVATION");
    expect(r.exposureGroup).toBeNull();
  });
});

describe("reduceDealCohort — eksponering og bookingnummer", () => {
  it("ONLINE kun hvis rejseplanen eksisterede senest ved kohortestart; senere plan ændrer intet", () => {
    const online = reduceDealCohort(input({ travelPlanIndex: new Map([[KEY_A, { createdAt: T0 }]]) }));
    expect(online.exposureGroup).toBe("ONLINE");
    const pdf = reduceDealCohort(input({ travelPlanIndex: new Map([[KEY_A, { createdAt: T2 }]]) }));
    expect(pdf.exposureGroup).toBe("PDF_ONLY");
    const later = reduceDealCohort(
      input({ existing: toState(pdf), observedAt: T2, travelPlanIndex: new Map([[KEY_A, { createdAt: T1 }]]) }),
    );
    expect(later.exposureGroup).toBe("PDF_ONLY");
  });

  it("manglende/ugyldigt bookingnummer ⇒ EXCLUDED med årsag, aldrig PDF_ONLY", () => {
    const missing = reduceDealCohort(input({ booking: { kind: "missing" }, currentBookingMatchKey: null }));
    expect(missing).toMatchObject({ eligibilityStatus: "EXCLUDED", exclusionReason: "MISSING_BOOKING_NO", exposureGroup: null });
    const invalid = reduceDealCohort(input({ booking: { kind: "invalid-format", normalized: "X1" }, currentBookingMatchKey: null }));
    expect(invalid).toMatchObject({ eligibilityStatus: "EXCLUDED", exclusionReason: "INVALID_BOOKING_NO_FORMAT" });
  });

  it("delt reference ⇒ EXCLUDED SHARED_BOOKING_REFERENCE, nøglen gemmes til senere konfliktdetektion", () => {
    const r = reduceDealCohort(input({ sharedBookingMatchKeys: new Set([KEY_A]) }));
    expect(r).toMatchObject({ eligibilityStatus: "EXCLUDED", exclusionReason: "SHARED_BOOKING_REFERENCE", bookingMatchKey: KEY_A });
  });

  it("en ENROLLED deal, hvis frosne nøgle senere bliver delt, markeres konflikt — én gang, bevarer eksponering", () => {
    const enrolled = toState(reduceDealCohort(input({ observedAt: T1 })));
    const conflicted = reduceDealCohort(input({ existing: enrolled, observedAt: T2, sharedBookingMatchKeys: new Set([KEY_A]) }));
    expect(conflicted.eligibilityStatus).toBe("ENROLLED");
    expect(conflicted.exposureGroup).toBe(enrolled.exposureGroup);
    expect(conflicted.bookingConflictDetectedAt).toEqual(T2);
    const again = reduceDealCohort(
      input({ existing: toState(conflicted), observedAt: new Date("2026-10-04T03:00:00Z"), sharedBookingMatchKeys: new Set() }),
    );
    expect(again.bookingConflictDetectedAt).toEqual(T2);
  });

  it("computeSharedBookingMatchKeys er rækkefølge-uafhængig og tæller distinkte deals", () => {
    const pairs = [
      { dealKey: "1", bookingMatchKey: KEY_A },
      { dealKey: "2", bookingMatchKey: KEY_A },
      { dealKey: "3", bookingMatchKey: KEY_B },
      { dealKey: "3", bookingMatchKey: KEY_B }, // samme deal to gange (frosset + aktuel) er IKKE delt
    ];
    expect(computeSharedBookingMatchKeys(pairs)).toEqual(new Set([KEY_A]));
    expect(computeSharedBookingMatchKeys([...pairs].reverse())).toEqual(new Set([KEY_A]));
  });

  it("markUnobservedConflicts markerer også ENROLLED deals, der ikke er i denne sync", () => {
    const enrolled = toState(reduceDealCohort(input({ observedAt: T1 })));
    const rows = markUnobservedConflicts({
      persisted: new Map([["x".repeat(64), enrolled]]),
      observedDealKeys: new Set(),
      sharedBookingMatchKeys: new Set([KEY_A]),
      observedAt: T2,
      contractVersion: CONTRACT_VERSION,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].bookingConflictDetectedAt).toEqual(T2);
    expect(rows[0].lastObservedAt).toEqual(T1);
  });
});

describe("reduceDealCohort — udfald", () => {
  it("booket kan gå fra falsk til sand, aldrig tilbage; first_booked_at = observedAt og ændres aldrig", () => {
    const enrolled = toState(reduceDealCohort(input({ observedAt: T1 })));
    const booked = toState(
      reduceDealCohort(input({ existing: enrolled, observedAt: T2, validated: validated("QUOTE_OR_LATER", { booked: true, lostObserved: false, conflict: false }) })),
    );
    expect(booked.outcomeStatus).toBe("BOOKED");
    expect(booked.firstBookedAt).toEqual(T2);
    const drift = reduceDealCohort(input({ existing: booked, observedAt: new Date("2026-10-09T00:00:00Z") }));
    expect(drift.outcomeStatus).toBe("BOOKED");
    expect(drift.firstBookedAt).toEqual(T2);
  });

  it("tabt/afvist registreres kun som datakvalitet og ryddes aldrig", () => {
    const lost = toState(
      reduceDealCohort(input({ validated: validated("QUOTE_OR_LATER", { booked: false, lostObserved: true, conflict: false }) })),
    );
    expect(lost.outcomeStatus).toBe("NOT_BOOKED");
    expect(lost.lostObservedAt).toEqual(T1);
    const reopened = reduceDealCohort(input({ existing: lost, observedAt: T2 }));
    expect(reopened.lostObservedAt).toEqual(T1);
  });

  it("outcome-konflikt registreres én gang og ændrer ikke outcome", () => {
    const r = reduceDealCohort(input({ validated: validated("QUOTE_OR_LATER", { booked: false, lostObserved: false, conflict: true }) }));
    expect(r.outcomeStatus).toBe("NOT_BOOKED");
    expect(r.outcomeConflictObservedAt).toEqual(T1);
  });
});

describe("review-runde 2, fund 1 — booking observeret før første kvalificerede observation", () => {
  const BOOKED = { booked: true, lostObserved: false, conflict: false };

  it("PRE_QUOTE + BOOKED ⇒ forbliver ELIGIBLE_PENDING, men bookingtidspunktet huskes", () => {
    const r = reduceDealCohort(input({ validated: validated("PRE_QUOTE", BOOKED), observedAt: T1 }));
    expect(r.eligibilityStatus).toBe("ELIGIBLE_PENDING");
    expect(r.firstBookedAt).toEqual(T1);
  });

  it("pending (booket ved A) → kvalificeret ved B ⇒ EXCLUDED BOOKED_BEFORE_QUALIFIED_OBSERVATION, aldrig ENROLLED", () => {
    const pending = toState(reduceDealCohort(input({ validated: validated("PRE_QUOTE", BOOKED), observedAt: T1 })));
    const r = reduceDealCohort(input({ existing: pending, observedAt: T2, validated: validated("QUOTE_OR_LATER", BOOKED) }));
    expect(r.eligibilityStatus).toBe("EXCLUDED");
    expect(r.exclusionReason).toBe("BOOKED_BEFORE_QUALIFIED_OBSERVATION");
    expect(r.exposureGroup).toBeNull();
    expect(r.firstBookedAt).toEqual(T1);
    expect(r.firstQualifiedObservationAt).toEqual(T2);
  });

  it("baseline-pending der var booket, udelukkes også ved senere kvalifikation", () => {
    const pending = toState(reduceDealCohort(input({ isBaseline: true, observedAt: T0, validated: validated("PRE_QUOTE", BOOKED) })));
    const r = reduceDealCohort(input({ existing: pending, observedAt: T2 }));
    expect(r.exclusionReason).toBe("BOOKED_BEFORE_QUALIFIED_OBSERVATION");
  });

  it("booking og kvalifikation observeret i SAMME sync ⇒ interval 0 ⇒ ENROLLED og BOOKED (ikke før tilbuddet)", () => {
    const r = reduceDealCohort(input({ observedAt: T1, validated: validated("QUOTE_OR_LATER", BOOKED) }));
    expect(r.eligibilityStatus).toBe("ENROLLED");
    expect(r.firstBookedAt).toEqual(r.firstQualifiedObservationAt);
  });
});
