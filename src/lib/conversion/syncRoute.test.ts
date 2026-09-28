// Gate D (Issue #89) — fail-closed-grene i sync-routens handler, gennem den
// rigtige sync-motor, produktionens stagekontrakt v3, fixture-HubSpot og den
// in-memory persistence, der spejler RPC-semantikken (lease, generation,
// frys-regler, alt-eller-intet).
import { describe, expect, it } from "vitest";
import { handleConversionSyncRequest, type ConversionSyncEnv } from "./syncRoute";
import { createFixtureHubSpotAdapter, fixtureObservation, liveStagesFromContract, type HubSpotReadAdapter } from "./hubspotAdapter";
import { createInMemoryConversionPersistence, type ConversionPersistence } from "./persistence";
import { CONTRACT_VERSION, PIPELINE_STAGE_CONTRACT } from "./contract";
import type { HubSpotDealObservation, MeasurementState } from "./types";

const CRON = "c".repeat(48);
const TOKEN = "pat-eu1-" + "t".repeat(36);
const ENV: ConversionSyncEnv = {
  CRON_SECRET: CRON,
  VERCEL_ENV: "production",
  HUBSPOT_PRIVATE_APP_TOKEN: TOKEN,
  HUBSPOT_DEAL_KEY_SECRET: "d".repeat(64),
  BOOKING_MATCH_SECRET: "b".repeat(64),
};
const AUTH = `Bearer ${CRON}`;
const T0 = new Date("2026-10-05T04:00:00Z");
const T1 = new Date("2026-10-06T04:00:00Z");
const STAGE = { lead: "1098732865", quote: "1098732868", sold: "1098732870" };

const ARMED: MeasurementState = { status: "ACTIVE", contractVersion: CONTRACT_VERSION, measurementStartedAt: null, lastSuccessfulSyncAt: null };

function deals(n: number, stage = STAGE.lead): HubSpotDealObservation[] {
  return Array.from({ length: n }, (_, i) => fixtureObservation({ rawDealId: `${1000 + i}`, dealStageId: stage, bookingNumberRaw: `${50000 + i}` }));
}

function setup(opts: { state?: MeasurementState | null; adapter?: HubSpotReadAdapter; clock?: () => Date } = {}) {
  let clock = T0;
  const p = createInMemoryConversionPersistence({ measurementState: opts.state === undefined ? ARMED : opts.state, clock: opts.clock ?? (() => clock) });
  const calls = { adapter: 0, persistence: 0 };
  const adapter = opts.adapter ?? createFixtureHubSpotAdapter({ deals: deals(12) });
  const deps = {
    createAdapter: (token: string) => {
      calls.adapter += 1;
      if (token !== TOKEN) throw new Error("uventet token");
      return adapter;
    },
    createPersistence: () => {
      calls.persistence += 1;
      return p as ConversionPersistence;
    },
    now: () => clock,
  };
  return { p, deps, calls, setClock: (d: Date) => (clock = d) };
}

const run = (s: ReturnType<typeof setup>, auth: string | null = AUTH, env: ConversionSyncEnv = ENV) => handleConversionSyncRequest(auth, env, s.deps);

describe("adgang — afvises før enhver læsning og skrivning", () => {
  it.each([
    ["ingen header", null, ENV],
    ["forkert secret", `Bearer ${"x".repeat(48)}`, ENV],
    ["uden Bearer-præfiks", CRON, ENV],
    ["serverens CRON_SECRET mangler", AUTH, { ...ENV, CRON_SECRET: undefined }],
    ["serverens CRON_SECRET er tom", "Bearer ", { ...ENV, CRON_SECRET: "  " }],
    ["serverens CRON_SECRET er kun mellemrum, og headeren matcher dem", "Bearer   ", { ...ENV, CRON_SECRET: "  " }],
  ])("%s ⇒ 401", async (_n, auth, env) => {
    const s = setup();
    const r = await run(s, auth, env);
    expect(r).toEqual({ status: 401, body: { result: "REJECTED", errorCode: "UNAUTHORIZED", baseline: null, observed: null, auditRecorded: false } });
    expect(s.calls).toEqual({ adapter: 0, persistence: 0 });
  });

  it.each([["preview"], ["development"], [undefined]])("VERCEL_ENV=%s ⇒ 403 (preview deler production-DB)", async (vercelEnv) => {
    const s = setup();
    const r = await run(s, AUTH, { ...ENV, VERCEL_ENV: vercelEnv });
    expect(r.status).toBe(403);
    expect(r.body.errorCode).toBe("NOT_PRODUCTION");
    expect(s.calls).toEqual({ adapter: 0, persistence: 0 });
  });
});

describe("secrets — CONFIG_INVALID uden læsning og skrivning", () => {
  it.each([
    ["manglende HubSpot-token", { HUBSPOT_PRIVATE_APP_TOKEN: undefined }],
    ["tomt HubSpot-token", { HUBSPOT_PRIVATE_APP_TOKEN: "   " }],
  ])("%s", async (_n, over) => {
    const s = setup();
    const r = await run(s, AUTH, { ...ENV, ...over });
    expect(r).toMatchObject({ status: 500, body: { result: "FAILED", errorCode: "CONFIG_INVALID", auditRecorded: false } });
    expect(s.calls).toEqual({ adapter: 0, persistence: 0 });
  });

  it("ugyldigt token (adapteren afviser det) ⇒ CONFIG_INVALID", async () => {
    const s = setup();
    s.deps.createAdapter = () => {
      throw new Error("HUBSPOT_TOKEN_INVALID");
    };
    expect(await run(s)).toMatchObject({ status: 500, body: { errorCode: "CONFIG_INVALID" } });
    expect(s.p.getSyncRuns()).toEqual([]);
  });

  it.each([
    ["manglende deal-key-secret", { HUBSPOT_DEAL_KEY_SECRET: undefined }],
    ["for kort deal-key-secret", { HUBSPOT_DEAL_KEY_SECRET: "kort" }],
    ["manglende BOOKING_MATCH_SECRET", { BOOKING_MATCH_SECRET: undefined }],
    ["ens secrets", { HUBSPOT_DEAL_KEY_SECRET: "b".repeat(64) }],
  ])("%s ⇒ CONFIG_INVALID, ingen lease og ingen kohorte", async (_n, over) => {
    const s = setup();
    const r = await run(s, AUTH, { ...ENV, ...over });
    expect(r).toMatchObject({ status: 500, body: { result: "FAILED", errorCode: "CONFIG_INVALID", auditRecorded: false } });
    expect(s.p.getSyncRuns()).toEqual([]);
    expect(s.p.getAllCohortRows().size).toBe(0);
  });
});

describe("målingstilstand", () => {
  it.each([
    ["ingen singleton-række", null],
    ["NOT_STARTED", { ...ARMED, status: "NOT_STARTED" as const }],
    ["PAUSED", { ...ARMED, status: "PAUSED" as const, measurementStartedAt: T0, lastSuccessfulSyncAt: T0 }],
  ])("%s ⇒ 200 SKIPPED, intet skrevet", async (_n, state) => {
    const s = setup({ state });
    const r = await run(s);
    expect(r).toEqual({ status: 200, body: { result: "SKIPPED", errorCode: "NOT_ACTIVE", baseline: null, observed: null, auditRecorded: false } });
    expect(s.p.getSyncRuns()).toEqual([]);
    expect(s.p.getAllCohortRows().size).toBe(0);
  });

  it("DB-kontraktversion ≠ kode (fx 2) ⇒ CONTRACT_VERSION_MISMATCH, intet skrevet", async () => {
    const s = setup({ state: { ...ARMED, contractVersion: 2 } });
    expect(await run(s)).toMatchObject({ status: 502, body: { result: "FAILED", errorCode: "CONTRACT_VERSION_MISMATCH", auditRecorded: false } });
    expect(s.p.getSyncRuns()).toEqual([]);
  });
});

describe("baseline og daglig kørsel", () => {
  it("første kørsel efter ACTIVE er baseline: nulpunkt sat, SUCCEEDED, kun kategorisk svar", async () => {
    const s = setup();
    const r = await run(s);
    expect(r).toEqual({ status: 200, body: { result: "SUCCEEDED", errorCode: null, baseline: true, observed: 12, auditRecorded: true } });
    expect(s.p.getMeasurementState()?.measurementStartedAt).toEqual(T0);
    const text = JSON.stringify(r);
    for (const secret of [TOKEN, CRON, ENV.HUBSPOT_DEAL_KEY_SECRET!, ENV.BOOKING_MATCH_SECRET!, "1000", "50000"]) expect(text).not.toContain(secret);
  });

  it("observeret antal 1–9 small-cell-undertrykkes i svaret", async () => {
    const s = setup({ adapter: createFixtureHubSpotAdapter({ deals: deals(3) }) });
    expect((await run(s)).body).toMatchObject({ result: "SUCCEEDED", observed: null });
  });

  it("mislykket baseline efterlader nulpunktet tomt, og næste kørsel er igen baseline", async () => {
    const failing = createFixtureHubSpotAdapter({ deals: deals(12), pageSize: 5, failOnPageIndex: 1, failReason: "http-5xx" });
    const s = setup({ adapter: failing });
    const r1 = await run(s);
    expect(r1).toMatchObject({ status: 502, body: { result: "FAILED", errorCode: "HTTP_5XX", auditRecorded: true } });
    expect(s.p.getMeasurementState()?.measurementStartedAt).toBeNull();
    expect(s.p.getAllCohortRows().size).toBe(0);
    expect(s.p.getSyncRuns().map((x) => [x.status, x.errorCode])).toEqual([["FAILED", "HTTP_5XX"]]);

    s.deps.createAdapter = () => createFixtureHubSpotAdapter({ deals: deals(12) });
    s.setClock(T1);
    expect((await run(s)).body).toMatchObject({ result: "SUCCEEDED", baseline: true });
    expect(s.p.getMeasurementState()?.measurementStartedAt).toEqual(T1);
  });

  it("daglig kørsel efter baseline: ikke-baseline, optager deals i Tilbud sendt", async () => {
    const s = setup();
    await run(s);
    s.setClock(T1);
    s.deps.createAdapter = () => createFixtureHubSpotAdapter({ deals: deals(12, STAGE.quote) });
    expect((await run(s)).body).toMatchObject({ result: "SUCCEEDED", baseline: false, observed: 12 });
    expect([...s.p.getAllCohortRows().values()].every((r) => r.eligibilityStatus === "ENROLLED")).toBe(true);
  });
});

describe("fail-closed kilder og samtidighed — aldrig delvis commit", () => {
  it.each([
    ["kontraktdrift (ukendt stage)", { stages: [...liveStagesFromContract(PIPELINE_STAGE_CONTRACT), { id: "999", closed: false, label: "Ny", displayOrder: 99, archived: false }] }, "CONTRACT_DRIFT"],
    ["kontraktdrift (omdøbt stage)", { stages: liveStagesFromContract(PIPELINE_STAGE_CONTRACT).map((x) => (x.id === STAGE.quote ? { ...x, label: "Tilbud afsendt" } : x)) }, "CONTRACT_DRIFT"],
    ["HubSpot 401", { contractFailure: "http-401" as const }, "HTTP_401"],
    ["HubSpot 429 midt i pagineringen", { pageSize: 5, failOnPageIndex: 2, failReason: "http-429" as const }, "HTTP_429"],
    ["ufuldstændig paginering (total passer ikke)", { reportedTotal: 13 }, "TOTAL_MISMATCH"],
    ["total ændrer sig undervejs", { pageSize: 5, totalChangesOnPageIndex: 1 }, "TOTAL_MISMATCH"],
  ])("%s ⇒ FAILED med revisionsrække, ingen kohorte, nulpunkt urørt", async (_n, over, code) => {
    const s = setup({ adapter: createFixtureHubSpotAdapter({ deals: deals(12), ...over }) });
    const r = await run(s);
    expect(r).toMatchObject({ status: 502, body: { result: "FAILED", errorCode: code, auditRecorded: true } });
    expect(s.p.getAllCohortRows().size).toBe(0);
    expect(s.p.getMeasurementState()?.measurementStartedAt).toBeNull();
  });

  it.each(["loadTravelPlanIndex", "loadAllCohortStates"] as const)("Supabase-læsefejl (%s) ⇒ FAILED SOURCE_READ_FAILED", async (fault) => {
    const s = setup();
    s.p.faults[fault] = true;
    expect(await run(s)).toMatchObject({ status: 502, body: { result: "FAILED", errorCode: "SOURCE_READ_FAILED" } });
    expect(s.p.getAllCohortRows().size).toBe(0);
  });

  it("Supabase-fejl ved læsning af state ⇒ FAILED før lease (ingen revisionsrække)", async () => {
    const s = setup();
    s.p.faults.loadMeasurementState = true;
    expect(await run(s)).toMatchObject({ status: 502, body: { errorCode: "SOURCE_READ_FAILED", auditRecorded: false } });
    expect(s.p.getSyncRuns()).toEqual([]);
  });

  it("dobbelt scheduler-kørsel: den anden får 409 SYNC_ALREADY_RUNNING og skriver intet", async () => {
    // Første kørsel hænger i HubSpot-læsningen, mens den anden starter.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = createFixtureHubSpotAdapter({ deals: deals(12) });
    const slow: HubSpotReadAdapter = {
      confirmStageContract: base.confirmStageContract,
      readDealsPage: async (c) => {
        await gate;
        return base.readDealsPage(c);
      },
    };
    const s = setup({ adapter: slow });
    const first = run(s);
    await new Promise((r) => setTimeout(r, 0));
    const second = await run(s);
    expect(second).toMatchObject({ status: 409, body: { result: "FAILED", errorCode: "SYNC_ALREADY_RUNNING", auditRecorded: false } });
    release();
    expect((await first).body).toMatchObject({ result: "SUCCEEDED", baseline: true });
    expect(s.p.getSyncRuns().filter((x) => x.status === "SUCCEEDED")).toHaveLength(1);
  });

  it("forældet generation / udløbet lease ved commit ⇒ FAILED COMMIT_REJECTED, kohorten urørt", async () => {
    let now = T0;
    const s = setup({ clock: () => now });
    // Leasen (1800 s) udløber, mens kilden læses.
    const base = createFixtureHubSpotAdapter({ deals: deals(12) });
    s.deps.createAdapter = () => ({
      confirmStageContract: base.confirmStageContract,
      readDealsPage: async (c) => {
        now = new Date(T0.getTime() + 3600_000);
        return base.readDealsPage(c);
      },
    });
    expect(await run(s)).toMatchObject({ status: 502, body: { result: "FAILED", errorCode: "COMMIT_REJECTED" } });
    expect(s.p.lastCommitViolation()).toBe("lease_expired");
    expect(s.p.getAllCohortRows().size).toBe(0);
    expect(s.p.getMeasurementState()?.measurementStartedAt).toBeNull();
  });

  it("en persistence der kaster før lease ⇒ FAILED UNKNOWN, ingen revisionsrække", async () => {
    const s = setup();
    s.deps.createPersistence = () => {
      throw new Error("SUPABASE_ENV_MISSING");
    };
    expect(await run(s)).toMatchObject({ status: 502, body: { result: "FAILED", errorCode: "UNKNOWN", auditRecorded: false } });
  });
});
