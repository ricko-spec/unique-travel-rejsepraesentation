// Gate C1 (Issue #84) — regressionstests for stagekontrakt v3, skrevet FØR
// implementeringen. Evidens: live read-only metadata for pipeline 754595640
// (18 stages), hentet af Ricko 2026-09-25 og postet på Issue #84.
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, PIPELINE_STAGE_CONTRACT, stageContractViolation, type StageClass } from "./contract";
import { reduceDealCohort, validateObservation, verifyStageContract, type ReduceDealCohortInput } from "./classify";
import { fixtureObservation } from "./hubspotAdapter";
import { createHubSpotLiveAdapter } from "./hubspotLiveAdapter";
import { runOperatorDryRun } from "./operatorDryRun";
import { runConversionSync } from "./syncEngine";
import { createInMemoryConversionPersistence } from "./persistence";

/** Live-metadata (displayOrder · id · label · isClosed). */
const LIVE: [number, string, string, boolean][] = [
  [0, "1098732865", "Lead (Aktive)", false],
  [1, "1098732866", "Assigned", false],
  [2, "1169086048", "Forsøgt kontaktet (1)", false],
  [3, "1400145244", "Forsøgt kontaktet (2)", false],
  [4, "1110279228", "Følg op", false],
  [5, "1098732867", "Lav tilbud", false],
  [6, "1098732868", "Tilbud sendt", false],
  [7, "1169407502", "Opdateret tilbud", false],
  [8, "1098732870", "Solgt", true],
  [9, "1419023367", "Solgt (I andet bookingnr.)", true],
  [10, "1407668785", "Billetter sendt", true],
  [11, "1354831680", "Afslag (Alle)", true],
  [12, "1386314544", "Screenet", true],
  [13, "1110279229", "På rejse", false],
  [14, "1110279231", "Hjemvendt", false],
  [15, "1110279230", "Aflyst rejse (Alle)", true],
  [16, "1110279232", "Dubletter", true],
  [17, "1110279233", "Test Leads", true],
];

const EXPECTED: Record<string, StageClass> = {
  "Lead (Aktive)": "PRE_QUOTE",
  Assigned: "PRE_QUOTE",
  "Forsøgt kontaktet (1)": "PRE_QUOTE",
  "Forsøgt kontaktet (2)": "PRE_QUOTE",
  "Følg op": "PRE_QUOTE",
  "Lav tilbud": "PRE_QUOTE",
  "Tilbud sendt": "QUOTE_OR_LATER",
  "Opdateret tilbud": "QUOTE_OR_LATER",
  Solgt: "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  "Solgt (I andet bookingnr.)": "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  "Billetter sendt": "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  "Afslag (Alle)": "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  Screenet: "CLOSED_NO_QUOTE",
  "På rejse": "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  Hjemvendt: "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  "Aflyst rejse (Alle)": "OUTCOME_WITHOUT_QUOTE_EVIDENCE",
  Dubletter: "CLOSED_NO_QUOTE",
  "Test Leads": "CLOSED_NO_QUOTE",
};

const idOf = (label: string) => LIVE.find((s) => s[2] === label)![1];
const liveStages = LIVE.map(([, id, , closed]) => ({ id, closed }));

describe("stagekontrakt v3 — komplet og 1:1 med live-metadata", () => {
  it("version 3, complete, pipeline 754595640 og præcis de 18 live-stages", () => {
    expect(CONTRACT_VERSION).toBe(3);
    expect(PIPELINE_STAGE_CONTRACT.complete).toBe(true);
    expect(PIPELINE_STAGE_CONTRACT.pipelineId).toBe("754595640");
    expect(Object.keys(PIPELINE_STAGE_CONTRACT.stages).sort()).toEqual(LIVE.map((s) => s[1]).sort());
  });

  it.each(LIVE)("displayOrder %s · %s (%s): klasse, closed-flag og label matcher live", (_o, id, label, closed) => {
    const entry = PIPELINE_STAGE_CONTRACT.stages[id];
    const invalidates = label === "Dubletter" || label === "Test Leads";
    expect(entry).toEqual({ class: EXPECTED[label], closed, label, ...(invalidates ? { invalidatesEnrollment: true } : {}) });
  });

  it("kontrakten er internt konsistent (PRE_QUOTE åben, CLOSED_NO_QUOTE lukket, kun 'Tilbud sendt'/'Opdateret tilbud' kvalificerer)", () => {
    expect(stageContractViolation(PIPELINE_STAGE_CONTRACT)).toBeNull();
    const qualifying = Object.entries(PIPELINE_STAGE_CONTRACT.stages).filter(([, e]) => e.class === "QUOTE_OR_LATER").map(([id]) => id);
    expect(qualifying.sort()).toEqual(["1098732868", "1169407502"]);
    expect(stageContractViolation({ ...PIPELINE_STAGE_CONTRACT, stages: { x: { class: "PRE_QUOTE", closed: true, label: "x" } } })).not.toBeNull();
    expect(stageContractViolation({ ...PIPELINE_STAGE_CONTRACT, stages: { x: { class: "CLOSED_NO_QUOTE", closed: false, label: "x" } } })).not.toBeNull();
  });

  it("en internt inkonsistent kontrakt afvises af verifyStageContract, selv hvis live matcher den", () => {
    const bad = { pipelineId: "754595640", complete: true, stages: { x: { class: "PRE_QUOTE" as const, closed: true, label: "x" } } };
    expect(verifyStageContract({ pipelineId: "754595640", stages: [{ id: "x", closed: true }] }, bad)).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
  });

  it("live stage-listen (id + closed) matcher kontrakten mekanisk", () => {
    expect(verifyStageContract({ pipelineId: "754595640", stages: liveStages })).toEqual({ ok: true });
  });

  it("ukendt, manglende, dubleret stage eller ændret closed-flag i live-metadata ⇒ CONTRACT_DRIFT", () => {
    expect(verifyStageContract({ pipelineId: "754595640", stages: [...liveStages, { id: "999", closed: false }] }).ok).toBe(false);
    expect(verifyStageContract({ pipelineId: "754595640", stages: liveStages.slice(1) }).ok).toBe(false);
    expect(verifyStageContract({ pipelineId: "754595640", stages: [...liveStages, liveStages[0]] }).ok).toBe(false);
    const flipped = liveStages.map((s) => (s.id === idOf("Solgt") ? { ...s, closed: false } : s));
    expect(verifyStageContract({ pipelineId: "754595640", stages: flipped })).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
    expect(verifyStageContract({ pipelineId: "1", stages: liveStages }).ok).toBe(false);
  });
});

function obs(label: string, over: Record<string, unknown> = {}) {
  const closed = LIVE.find((s) => s[2] === label)![3];
  return fixtureObservation({ rawDealId: "1", dealStageId: idOf(label), hubspotClosed: closed, bookingNumberRaw: "12345", ...over });
}

describe("validateObservation v3 — deal-niveau", () => {
  it("hs_is_closed skal matche stagens closed-flag fra metadata; ellers kontraktdrift", () => {
    expect(validateObservation(obs("Tilbud sendt")).ok).toBe(true);
    expect(validateObservation(obs("Tilbud sendt", { hubspotClosed: true })).ok).toBe(false);
    expect(validateObservation(obs("Screenet", { hubspotClosed: false })).ok).toBe(false);
    expect(validateObservation(obs("På rejse")).ok).toBe(true); // åben post-salg-stage er gyldig
    expect(validateObservation(obs("Solgt", { hubspotClosedWon: true, dealStatusRaw: "Solgt" })).ok).toBe(true);
  });
});

const T0 = new Date("2026-10-01T03:00:00Z");
const T1 = new Date("2026-10-02T03:00:00Z");
function reduce(label: string, isBaseline: boolean, existing: ReduceDealCohortInput["existing"] = null, dealStatusRaw: string | null = null) {
  const v = validateObservation(obs(label, { dealStatusRaw }));
  if (!v.ok) throw new Error("uventet drift");
  return reduceDealCohort({
    dealKey: "d".repeat(64),
    observedAt: isBaseline ? T0 : T1,
    isBaseline,
    validated: v.value,
    booking: { kind: "valid", normalized: "12345" },
    currentBookingMatchKey: "a".repeat(64),
    existing,
    travelPlanIndex: new Map(),
    sharedBookingMatchKeys: new Set(),
    contractVersion: CONTRACT_VERSION,
  });
}

describe("reduceDealCohort v3 — ingen optagelse uden bevis for 'Tilbud sendt'", () => {
  it.each(["Screenet", "Dubletter", "Test Leads"])("%s optages aldrig som tilbudskohorte (efter baseline: pending; ved baseline: PRE_START)", (label) => {
    expect(reduce(label, false).eligibilityStatus).toBe("ELIGIBLE_PENDING");
    expect(reduce(label, true).eligibilityStatus).toBe("PRE_START_EXISTING");
  });

  it.each(["Solgt", "Solgt (I andet bookingnr.)", "Billetter sendt", "Afslag (Alle)", "Aflyst rejse (Alle)", "På rejse", "Hjemvendt"])(
    "%s beviser ikke et observeret tilbud: ny/pending deal ⇒ EXCLUDED (aldrig ENROLLED); ved baseline ⇒ PRE_START",
    (label) => {
      const post = reduce(label, false, null, "Solgt");
      expect(post.eligibilityStatus).toBe("EXCLUDED");
      expect(post.exclusionReason).toBe("CLOSED_BEFORE_QUALIFIED_OBSERVATION");
      expect(post.exposureGroup).toBeNull();
      expect(reduce(label, true).eligibilityStatus).toBe("PRE_START_EXISTING");
    },
  );

  it.each(["Lead (Aktive)", "Assigned", "Forsøgt kontaktet (1)", "Forsøgt kontaktet (2)", "Følg op", "Lav tilbud"])("%s ⇒ pending (tilbud ikke sendt endnu)", (label) => {
    expect(reduce(label, false).eligibilityStatus).toBe("ELIGIBLE_PENDING");
    expect(reduce(label, true).eligibilityStatus).toBe("ELIGIBLE_PENDING");
  });

  it("kun 'Tilbud sendt' og 'Opdateret tilbud' optager; en optaget deal forbliver optaget, når den senere når Solgt/På rejse", () => {
    const enrolled = reduce("Tilbud sendt", false);
    expect(enrolled.eligibilityStatus).toBe("ENROLLED");
    expect(reduce("Opdateret tilbud", false).eligibilityStatus).toBe("ENROLLED");
    const { dealKey: _k, ...state } = enrolled;
    for (const later of ["Solgt", "Billetter sendt", "På rejse", "Hjemvendt", "Afslag (Alle)"]) {
      const r = reduce(later, false, { ...state }, later === "Afslag (Alle)" ? null : "Solgt");
      expect(r.eligibilityStatus).toBe("ENROLLED");
      expect(r.firstQualifiedObservationAt).toEqual(state.firstQualifiedObservationAt);
    }
  });

  it("BOOKED afgøres fortsat kun af unique_travel_dealstatus — ikke af stage 'Solgt' eller hs_is_closed_won", () => {
    const { dealKey: _k, ...state } = reduce("Tilbud sendt", false);
    expect(reduce("Solgt", false, { ...state }, null).outcomeStatus).toBe("NOT_BOOKED");
    expect(reduce("Solgt (I andet bookingnr.)", false, { ...state }, "Solgt (andet booking nr.)").outcomeStatus).toBe("NOT_BOOKED");
    expect(reduce("Billetter sendt", false, { ...state }, "Billetter sendt").outcomeStatus).toBe("BOOKED");
  });
});

describe("end-to-end: live-svarform (18 stages) → live-adapter → operatør-dry-run", () => {
  const pipelineJson = {
    id: "754595640",
    label: "Unique Travel",
    archived: false,
    stages: LIVE.map(([displayOrder, id, label, closed]) => ({ id, label, displayOrder, archived: false, metadata: { isClosed: String(closed), probability: "0.1" } })),
  };
  const dealsJson = LIVE.map(([, stageId, label, closed], i) => ({
    id: String(1000 + i),
    properties: {
      pipeline: "754595640",
      dealstage: stageId,
      unique_travel_bookingno: String(80000 + i),
      unique_travel_dealstatus: label === "Solgt" || label === "Billetter sendt" ? label : null,
      hs_is_closed: String(closed),
      hs_is_closed_won: label.startsWith("Solgt") || label === "Billetter sendt" ? "true" : "false",
    },
  }));
  const fetchImpl = async (url: string, init: { method: string }) => ({
    status: 200,
    json: async () => (init.method === "GET" ? pipelineJson : { total: dealsJson.length, results: dealsJson }),
  });
  const adapter = () => createHubSpotLiveAdapter({ token: "pat-eu1-" + "x".repeat(36), fetchImpl, sleep: async () => {} });

  it("dry-run PASS uden singleton-række: stage-kontrakt MATCH, baseline-klassifikation, 0 skrivninger", async () => {
    const r = await runOperatorDryRun({
      adapter: adapter(),
      persistence: createInMemoryConversionPersistence({ measurementState: null }),
      countRows: async () => ({ ok: true, counts: { state: 0, cohort: 0, runs: 0 } }),
      dealKeySecret: "d".repeat(64),
      bookingMatchSecret: "b".repeat(64),
    });
    expect(r).toMatchObject({ verdict: "PASS", stageContract: "MATCH", isBaseline: true, observed: 18, enrolled: 0, writeAttempts: 0, rowsUnchanged: true });
    // Ved baseline: kun de 6 åbne PRE_QUOTE-stages er pending; alle andre (inkl. Screenet/Dubletter/Test Leads) er PRE_START.
    expect(r.summary?.byEligibility).toEqual({ PRE_START_EXISTING: 12, ELIGIBLE_PENDING: 6, ENROLLED: 0, EXCLUDED: 0 });
    expect(r.booked).toBe(2); // kun dealstatus "Solgt"/"Billetter sendt" — ikke stage 'Solgt (I andet bookingnr.)'
  });

  it("production-DB på contract_version 2 blokerer en non-dry-run mod kode v3 (CONTRACT_VERSION_MISMATCH) — men ikke dry-run", async () => {
    const dbV2 = { status: "ACTIVE" as const, contractVersion: 2, measurementStartedAt: null, lastSuccessfulSyncAt: null };
    const p = createInMemoryConversionPersistence({ measurementState: dbV2 });
    const nonDry = await runConversionSync(adapter(), p, { dealKeySecret: "d".repeat(64), bookingMatchSecret: "b".repeat(64) });
    expect(nonDry).toEqual({ ok: false, errorCode: "CONTRACT_VERSION_MISMATCH", auditRecorded: false });
    expect(p.getSyncRuns()).toEqual([]);
    const dry = await runConversionSync(adapter(), p, { dealKeySecret: "d".repeat(64), bookingMatchSecret: "b".repeat(64), dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true });
    expect(p.getAllCohortRows().size).toBe(0);
  });
});
