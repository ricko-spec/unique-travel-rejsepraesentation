// Gate C1 (Issue #84), Codex-review 5318246169 (blokerende): stagekontrakten
// skal bindes til den metadata, som den semantiske klassifikation bygger på —
// normaliseret label, displayOrder og archived — ud over id og isClosed.
// Rename, reorder eller ændret archived-status ⇒ CONTRACT_DRIFT (fail-closed).
// Testene går gennem den RIGTIGE live-adapterform (HubSpot pipeline-JSON →
// createHubSpotLiveAdapter → verifyStageContract / sync-motor / operatør-dry-run).

import { describe, expect, it } from "vitest";
import { PIPELINE_STAGE_CONTRACT, normalizeStageLabel, stageContractViolation } from "./contract";
import { verifyStageContract } from "./classify";
import { createFixtureHubSpotAdapter, fixtureObservation, liveStagesFromContract } from "./hubspotAdapter";
import { createHubSpotLiveAdapter } from "./hubspotLiveAdapter";
import { runOperatorDryRun } from "./operatorDryRun";
import { createInMemoryConversionPersistence } from "./persistence";
import { runConversionSync } from "./syncEngine";

/** Live-metadata fra Issue #84 (displayOrder · id · label · isClosed · archived). */
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
const idOf = (label: string) => LIVE.find((s) => s[2] === label)![1];

type StageJson = { id: unknown; label?: unknown; displayOrder?: unknown; archived?: unknown; metadata: { isClosed: unknown; probability: string } };
type PipelineJson = { id: string; label: string; archived?: unknown; stages: StageJson[] };

/** Præcis HubSpots GET /crm/v3/pipelines/deals/{id}-form (som i Gate C1-metadataen). */
function pipelineJson(): PipelineJson {
  return {
    id: "754595640",
    label: "Unique Travel",
    archived: false,
    stages: LIVE.map(([displayOrder, id, label, closed]) => ({
      id,
      label,
      displayOrder,
      archived: false,
      metadata: { isClosed: String(closed), probability: "0.1" },
    })),
  };
}

function liveAdapter(mutate: (p: PipelineJson) => void = () => {}) {
  const p = pipelineJson();
  mutate(p);
  const deals = LIVE.map(([, stageId, , closed], i) => ({
    id: String(1000 + i),
    properties: {
      pipeline: "754595640",
      dealstage: stageId,
      unique_travel_bookingno: String(80000 + i),
      unique_travel_dealstatus: null,
      hs_is_closed: String(closed),
      hs_is_closed_won: "false",
    },
  }));
  const fetchImpl = async (_url: string, init: { method: string }) => ({
    status: 200,
    json: async () => (init.method === "GET" ? p : { total: deals.length, results: deals }),
  });
  return createHubSpotLiveAdapter({ token: "pat-eu1-" + "x".repeat(36), fetchImpl, sleep: async () => {} });
}

const stage = (p: PipelineJson, label: string) => p.stages.find((s) => s.label === label)!;

async function verifyVia(mutate: (p: PipelineJson) => void) {
  const c = await liveAdapter(mutate).confirmStageContract();
  if (!c.ok) return { adapter: c.reason };
  return verifyStageContract(c);
}

async function dryRun(mutate: (p: PipelineJson) => void) {
  return runOperatorDryRun({
    adapter: liveAdapter(mutate),
    persistence: createInMemoryConversionPersistence({ measurementState: null }),
    countRows: async () => ({ ok: true, counts: { state: 0, cohort: 0, runs: 0 } }),
    dealKeySecret: "d".repeat(64),
    bookingMatchSecret: "b".repeat(64),
  });
}

describe("kontrakten bærer label, displayOrder og archived for alle 18 stages", () => {
  it.each(LIVE)("displayOrder %s · %s (%s) · closed %s · archived false", (displayOrder, id, label, closed) => {
    expect(PIPELINE_STAGE_CONTRACT.stages[id]).toMatchObject({ label, displayOrder, archived: false, closed });
  });

  it("uændret live-metadata ⇒ MATCH (verifikation og dry-run PASS)", async () => {
    expect(await verifyVia(() => {})).toEqual({ ok: true });
    expect(await dryRun(() => {})).toMatchObject({ verdict: "PASS", stageContract: "MATCH", writeAttempts: 0 });
  });

  it("live-adapteren returnerer label, displayOrder og archived pr. stage og pipelinens archived-flag", async () => {
    const c = await liveAdapter().confirmStageContract();
    // Numeriske objektnøgler ordnes numerisk i JS — derfor sammenlignes på displayOrder, ikke nøglerækkefølge.
    const byOrder = <T extends { displayOrder: number }>(xs: T[]) => [...xs].sort((a, b) => a.displayOrder - b.displayOrder);
    expect(c.ok && { ...c, stages: byOrder(c.stages) }).toEqual({
      ok: true,
      pipelineId: "754595640",
      pipelineArchived: false,
      stages: byOrder(liveStagesFromContract(PIPELINE_STAGE_CONTRACT)),
    });
    expect(c.ok && c.stages.map((s) => s.label)).toEqual(LIVE.map((s) => s[2]));
  });
});

describe("rename ⇒ CONTRACT_DRIFT", () => {
  it.each([
    ["Tilbud sendt", "Tilbud afsendt"],
    ["Lav tilbud", "Tilbud sendt (kladde)"],
    ["Screenet", "Kvalificeret"],
    ["Følg op", "Folg op"],
    ["Dubletter", "Dubletter/arkiv"],
  ])("%s → %s", async (from, to) => {
    expect(await verifyVia((p) => void (stage(p, from).label = to))).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
    expect(await dryRun((p) => void (stage(p, from).label = to))).toMatchObject({ verdict: "FAIL", errorCode: "CONTRACT_DRIFT", stageContract: "CONTRACT_DRIFT", writeAttempts: 0 });
  });

  it("stage-id genbrugt til en anden betydning (to labels byttet) ⇒ CONTRACT_DRIFT", async () => {
    const r = await verifyVia((p) => {
      stage(p, "Følg op").label = "__tmp";
      stage(p, "Tilbud sendt").label = "Følg op";
      stage(p, "__tmp").label = "Tilbud sendt";
    });
    expect(r).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
  });

  it("kun normaliseringsforskelle (NFD, omgivende/dobbelt whitespace) er IKKE drift", async () => {
    // "å" nedbrydes i NFD (a + ring); "ø" gør ikke — derfor testes NFC på "På rejse".
    expect("På rejse".normalize("NFD")).not.toBe("På rejse");
    const r = await verifyVia((p) => {
      stage(p, "På rejse").label = "På rejse".normalize("NFD");
      stage(p, "Tilbud sendt").label = "  Tilbud   sendt ";
      stage(p, "Følg op").label = "Følg\top";
    });
    expect(r).toEqual({ ok: true });
  });

  it("store/små bogstaver normaliseres ikke væk (fail-closed)", async () => {
    expect(await verifyVia((p) => void (stage(p, "Tilbud sendt").label = "Tilbud Sendt"))).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
  });
});

describe("reorder ⇒ CONTRACT_DRIFT", () => {
  it("'Lav tilbud' flyttes efter 'Tilbud sendt' (semantisk relevant)", async () => {
    const mutate = (p: PipelineJson) => {
      stage(p, "Lav tilbud").displayOrder = 6;
      stage(p, "Tilbud sendt").displayOrder = 5;
    };
    expect(await verifyVia(mutate)).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
    expect(await dryRun(mutate)).toMatchObject({ verdict: "FAIL", errorCode: "CONTRACT_DRIFT", writeAttempts: 0 });
  });

  it("to PRE_QUOTE-stages byttes (enhver ombytning)", async () => {
    expect(
      await verifyVia((p) => {
        stage(p, "Lead (Aktive)").displayOrder = 1;
        stage(p, "Assigned").displayOrder = 0;
      }),
    ).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
  });

  it("én stage får et nyt displayOrder (hul/forskydning)", async () => {
    expect(await verifyVia((p) => void (stage(p, "Test Leads").displayOrder = 18))).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
  });

  it("rækkefølgen i JSON-arrayet alene er ikke drift — displayOrder er sandheden", async () => {
    expect(await verifyVia((p) => void p.stages.reverse())).toEqual({ ok: true });
  });
});

describe("archived ⇒ CONTRACT_DRIFT", () => {
  it.each(["Tilbud sendt", "Lead (Aktive)", "Screenet", "Test Leads"])("stage '%s' arkiveres", async (label) => {
    expect(await verifyVia((p) => void (stage(p, label).archived = true))).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
    expect(await dryRun((p) => void (stage(p, label).archived = true))).toMatchObject({ verdict: "FAIL", errorCode: "CONTRACT_DRIFT", writeAttempts: 0 });
  });

  it("pipelinen arkiveres (verifikation, sync-motor og dry-run)", async () => {
    expect(await verifyVia((p) => void (p.archived = true))).toEqual({ ok: false, code: "CONTRACT_DRIFT" });
    expect(await dryRun((p) => void (p.archived = true))).toMatchObject({ verdict: "FAIL", errorCode: "CONTRACT_DRIFT", stageContract: "CONTRACT_DRIFT", writeAttempts: 0 });
  });

  it("liveStagesFromContract bærer alle fem felter uændret (også archived=true)", () => {
    const contract = { pipelineId: "754595640", complete: true, stages: { x: { class: "CLOSED_NO_QUOTE" as const, closed: true, label: "X", displayOrder: 3, archived: true } } };
    expect(liveStagesFromContract(contract)).toEqual([{ id: "x", closed: true, label: "X", displayOrder: 3, archived: true }]);
  });

  it("en kontrakt, der forventer archived=true, matcher ikke en ikke-arkiveret live-stage (begge retninger)", () => {
    const id = idOf("Hjemvendt");
    const contract = { ...PIPELINE_STAGE_CONTRACT, stages: { ...PIPELINE_STAGE_CONTRACT.stages, [id]: { ...PIPELINE_STAGE_CONTRACT.stages[id], archived: true } } };
    expect(verifyStageContract({ pipelineId: "754595640", pipelineArchived: false, stages: liveStagesFromContract(PIPELINE_STAGE_CONTRACT) }, contract)).toEqual({
      ok: false,
      code: "CONTRACT_DRIFT",
    });
  });
});

describe("manglende/ugyldig metadata ⇒ fail-closed (page-inconsistent), aldrig MATCH", () => {
  it.each<[string, (p: PipelineJson) => void]>([
    ["label mangler", (p) => void delete stage(p, "Tilbud sendt").label],
    ["label tom", (p) => void (stage(p, "Tilbud sendt").label = "   ")],
    ["label ikke streng", (p) => void (stage(p, "Tilbud sendt").label = 7)],
    ["displayOrder mangler", (p) => void delete stage(p, "Tilbud sendt").displayOrder],
    ["displayOrder decimaltal", (p) => void (stage(p, "Tilbud sendt").displayOrder = 6.5)],
    ["displayOrder negativ", (p) => void (stage(p, "Tilbud sendt").displayOrder = -1)],
    ["displayOrder som streng", (p) => void (stage(p, "Tilbud sendt").displayOrder = "6")],
    ["archived mangler", (p) => void delete stage(p, "Tilbud sendt").archived],
    ["archived ugyldig", (p) => void (stage(p, "Tilbud sendt").archived = "måske")],
    ["pipeline.archived mangler", (p) => void delete p.archived],
  ])("%s", async (_label, mutate) => {
    expect(await verifyVia(mutate)).toEqual({ adapter: "page-inconsistent" });
    const r = await dryRun(mutate);
    expect(r.verdict).toBe("FAIL");
    expect(r.stageContract).not.toBe("MATCH");
    expect(r.writeAttempts).toBe(0);
  });
});

describe("drift stopper sync-motoren før deals læses (også non-dry-run)", () => {
  it("rename af 'Tilbud sendt' ⇒ CONTRACT_DRIFT uden sync-run eller skrivning", async () => {
    const p = createInMemoryConversionPersistence({ measurementState: null });
    const r = await runConversionSync(liveAdapter((j) => void (stage(j, "Tilbud sendt").label = "Tilbud afsendt")), p, {
      dealKeySecret: "d".repeat(64),
      bookingMatchSecret: "b".repeat(64),
      dryRun: true,
    });
    expect(r).toMatchObject({ ok: false, errorCode: "CONTRACT_DRIFT" });
    expect(p.getSyncRuns()).toEqual([]);
  });

  it("fixture-adapteren leverer som default præcis kontraktens fulde metadata (MATCH)", async () => {
    const r = await runConversionSync(createFixtureHubSpotAdapter({ deals: [fixtureObservation({ rawDealId: "1" })] }), createInMemoryConversionPersistence({ measurementState: null }), {
      dealKeySecret: "d".repeat(64),
      bookingMatchSecret: "b".repeat(64),
      dryRun: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe("intern kontraktkonsistens for de nye felter", () => {
  it("normalizeStageLabel: NFC, trim, sammenfoldet whitespace — intet andet", () => {
    expect(normalizeStageLabel(" Følg  op ".normalize("NFD"))).toBe("Følg op");
    expect(normalizeStageLabel("Tilbud Sendt")).toBe("Tilbud Sendt");
  });

  it("dublerede displayOrder, dublerede labels, tomme labels eller ugyldigt displayOrder i kontrakten ⇒ violation", () => {
    const base = PIPELINE_STAGE_CONTRACT.stages;
    const a = idOf("Lead (Aktive)");
    const b = idOf("Assigned");
    const variants = [
      { ...base, [b]: { ...base[b], displayOrder: base[a].displayOrder } },
      { ...base, [b]: { ...base[b], label: " Lead  (Aktive)" } },
      { ...base, [b]: { ...base[b], label: "  " } },
      { ...base, [b]: { ...base[b], displayOrder: 1.5 } },
      { ...base, [b]: { ...base[b], displayOrder: -1 } },
    ];
    for (const stages of variants) expect(stageContractViolation({ ...PIPELINE_STAGE_CONTRACT, stages })).not.toBeNull();
    expect(stageContractViolation(PIPELINE_STAGE_CONTRACT)).toBeNull();
  });
});
