import { describe, expect, it, vi } from "vitest";
import { runConversionSync, type RunConversionSyncOptions } from "./syncEngine";
import { createFixtureHubSpotAdapter, fixtureObservation } from "./hubspotAdapter";
import { createInMemoryConversionPersistence, type ConversionPersistence } from "./persistence";
import { computeBookingKeyForConversion, computeDealKey } from "./dealKey";
import { CONTRACT_VERSION, type PipelineStageContract } from "./contract";
import type { HubSpotDealObservation, MeasurementState } from "./types";

const DEAL_SECRET = "d".repeat(40);
const BOOKING_SECRET = "b".repeat(40);
const T0 = new Date("2026-10-01T03:00:00Z");
const T1 = new Date("2026-10-02T03:00:00Z");
const T2 = new Date("2026-10-03T03:00:00Z");
const T3 = new Date("2026-10-04T03:00:00Z");

const STAGES = { screened: "screened", quote: "1098732868", updated: "1169407502", sold: "solgt", lost: "tabt" };
const CONTRACT: PipelineStageContract = {
  pipelineId: "754595640",
  complete: true,
  stages: {
    [STAGES.screened]: "PRE_QUOTE",
    [STAGES.quote]: "QUOTE_OR_LATER",
    [STAGES.updated]: "QUOTE_OR_LATER",
    [STAGES.sold]: "QUOTE_OR_LATER",
    [STAGES.lost]: "CLOSED_AMBIGUOUS",
  },
};
const LIVE_STAGES = Object.keys(CONTRACT.stages);

const ARMED: MeasurementState = { status: "ACTIVE", contractVersion: CONTRACT_VERSION, measurementStartedAt: null, lastSuccessfulSyncAt: null };

function opts(now: Date, extra: Partial<RunConversionSyncOptions> = {}): RunConversionSyncOptions {
  return { dealKeySecret: DEAL_SECRET, bookingMatchSecret: BOOKING_SECRET, now, stageContract: CONTRACT, ...extra };
}

function deal(id: string, spec: Partial<HubSpotDealObservation> = {}) {
  // Unikt, rent numerisk bookingnummer pr. deal-id (medmindre testen selv sætter et).
  const uniqueBooking = "9" + Array.from(id, (c) => c.charCodeAt(0)).join("");
  return fixtureObservation({ rawDealId: id, dealStageId: STAGES.quote, bookingNumberRaw: uniqueBooking, ...spec });
}

function adapter(deals: HubSpotDealObservation[], extra: Partial<Parameters<typeof createFixtureHubSpotAdapter>[0]> = {}) {
  return createFixtureHubSpotAdapter({ deals, stages: LIVE_STAGES, pageSize: 100, ...extra });
}

const key = (id: string) => computeDealKey(id, DEAL_SECRET);

/** Persistence med kørt baseline (T0) over `baselineDeals`, klar til daglige syncs. */
async function started(baselineDeals: HubSpotDealObservation[] = [deal("seed", { dealStageId: STAGES.screened, bookingNumberRaw: null })]) {
  let clock = T0;
  const p = createInMemoryConversionPersistence({ measurementState: ARMED, clock: () => clock });
  const res = await runConversionSync(adapter(baselineDeals), p, opts(T0));
  expect(res.ok).toBe(true);
  return { p, setClock: (d: Date) => (clock = d) };
}

function spyPersistence(p: ConversionPersistence) {
  const calls: string[] = [];
  const wrapped = {} as ConversionPersistence;
  for (const k of Object.keys(p) as (keyof ConversionPersistence)[]) {
    const fn = p[k] as (...a: unknown[]) => unknown;
    (wrapped as Record<string, unknown>)[k] = (...a: unknown[]) => {
      calls.push(k);
      return fn(...a);
    };
  }
  return { wrapped, calls };
}

describe("konfiguration og tilstand afvises FØR læsning og skrivning", () => {
  it.each([
    ["tomme secrets", "", ""],
    ["for korte secrets", "kort", "kort2"],
    ["identiske secrets", "x".repeat(40), "x".repeat(40)],
    ["kun whitespace", " ".repeat(40), "y".repeat(40)],
  ])("%s ⇒ CONFIG_INVALID uden et eneste persistence-/HubSpot-kald", async (_n, dealKeySecret, bookingMatchSecret) => {
    const { wrapped, calls } = spyPersistence(createInMemoryConversionPersistence({ measurementState: ARMED }));
    const a = adapter([deal("1")]);
    const res = await runConversionSync(a, wrapped, { dealKeySecret, bookingMatchSecret, now: T0, stageContract: CONTRACT });
    expect(res).toEqual({ ok: false, errorCode: "CONFIG_INVALID", auditRecorded: false });
    expect(calls).toEqual([]);
    expect(a.pageCalls()).toBe(0);
  });

  it("NOT_STARTED / PAUSED / manglende singleton ⇒ NOT_ACTIVE, ingen lease og ingen skrivning", async () => {
    for (const state of [null, { ...ARMED, status: "NOT_STARTED" as const }, { ...ARMED, status: "PAUSED" as const }]) {
      const p = createInMemoryConversionPersistence({ measurementState: state });
      const res = await runConversionSync(adapter([deal("1")]), p, opts(T0));
      expect(res).toMatchObject({ ok: false, errorCode: "NOT_ACTIVE" });
      expect(p.getSyncRuns()).toEqual([]);
      expect(p.getAllCohortRows().size).toBe(0);
    }
  });

  it("state-kontraktversion ≠ runtime CONTRACT_VERSION ⇒ CONTRACT_VERSION_MISMATCH", async () => {
    const p = createInMemoryConversionPersistence({ measurementState: { ...ARMED, contractVersion: CONTRACT_VERSION - 1 } });
    const res = await runConversionSync(adapter([deal("1")]), p, opts(T0));
    expect(res).toMatchObject({ ok: false, errorCode: "CONTRACT_VERSION_MISMATCH" });
    expect(p.getSyncRuns()).toEqual([]);
  });

  it("den faktiske repo-kontrakt (ufuldstændig) ⇒ FAILED CONTRACT_INCOMPLETE, ingen kohorte", async () => {
    const p = createInMemoryConversionPersistence({ measurementState: ARMED });
    const res = await runConversionSync(adapter([deal("1")]), p, { ...opts(T0), stageContract: undefined });
    expect(res).toEqual({ ok: false, errorCode: "CONTRACT_INCOMPLETE", auditRecorded: true });
    expect(p.getSyncRuns().map((r) => [r.status, r.errorCode])).toEqual([["FAILED", "CONTRACT_INCOMPLETE"]]);
    expect(p.getAllCohortRows().size).toBe(0);
  });
});

describe("prospektiv baseline og optagelse (fund 1)", () => {
  it("baseline: kvalificerede/lukkede ⇒ PRE_START_EXISTING, åbne PRE_QUOTE ⇒ ELIGIBLE_PENDING, nulpunkt = baseline-kørslens observedAt", async () => {
    const p = createInMemoryConversionPersistence({ measurementState: ARMED, clock: () => T0 });
    const res = await runConversionSync(
      adapter([
        deal("q", { dealStageId: STAGES.quote }),
        deal("u", { dealStageId: STAGES.updated }),
        deal("s", { dealStageId: STAGES.sold, dealStatusRaw: "Solgt", hubspotClosed: true, hubspotClosedWon: true }),
        deal("l", { dealStageId: STAGES.lost, hubspotClosed: true }),
        deal("p", { dealStageId: STAGES.screened }),
      ]),
      p,
      opts(T0),
    );
    expect(res).toMatchObject({ ok: true, isBaseline: true });
    expect(p.getMeasurementState()?.measurementStartedAt).toEqual(T0);
    expect(p.getCohortRow(key("q"))?.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(p.getCohortRow(key("u"))?.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(p.getCohortRow(key("s"))?.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(p.getCohortRow(key("l"))?.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(p.getCohortRow(key("p"))?.eligibilityStatus).toBe("ELIGIBLE_PENDING");
    for (const row of p.getAllCohortRows().values()) expect(row.firstQualifiedObservationAt).toBeNull();
  });

  it("pending deal optages præcis én gang ved første kvalificerede observation; Opdateret tilbud nulstiller intet", async () => {
    const { p, setClock } = await started([deal("p", { dealStageId: STAGES.screened })]);
    setClock(T1);
    await runConversionSync(adapter([deal("p", { dealStageId: STAGES.screened })]), p, opts(T1));
    expect(p.getCohortRow(key("p"))?.eligibilityStatus).toBe("ELIGIBLE_PENDING");

    setClock(T2);
    await runConversionSync(adapter([deal("p", { dealStageId: STAGES.quote })]), p, opts(T2));
    const enrolled = p.getCohortRow(key("p"))!;
    expect(enrolled.eligibilityStatus).toBe("ENROLLED");
    expect(enrolled.firstQualifiedObservationAt).toEqual(T2);

    setClock(T3);
    await runConversionSync(adapter([deal("p", { dealStageId: STAGES.updated })]), p, opts(T3));
    const after = p.getCohortRow(key("p"))!;
    expect(after.firstQualifiedObservationAt).toEqual(T2);
    expect(after.exposureGroup).toBe(enrolled.exposureGroup);
    expect(p.getSyncRuns().filter((r) => r.status === "SUCCEEDED")).toHaveLength(4);
  });

  it("ONLINE afgøres af trips.created_at ≤ kohortestart; en plan oprettet senere flytter ikke PDF_ONLY", async () => {
    const bk = computeBookingKeyForConversion("5555", BOOKING_SECRET);
    let clock = T0;
    const index = new Map<string, { createdAt: Date }>();
    const p = createInMemoryConversionPersistence({ measurementState: ARMED, travelPlanIndex: index, clock: () => clock });
    await runConversionSync(adapter([deal("seed", { dealStageId: STAGES.screened })]), p, opts(T0));
    clock = T1;
    await runConversionSync(adapter([deal("x", { bookingNumberRaw: "5555" })]), p, opts(T1));
    expect(p.getCohortRow(key("x"))?.exposureGroup).toBe("PDF_ONLY");
    index.set(bk, { createdAt: T1 });
    clock = T2;
    await runConversionSync(adapter([deal("x", { bookingNumberRaw: "5555" })]), p, opts(T2));
    expect(p.getCohortRow(key("x"))?.exposureGroup).toBe("PDF_ONLY");
  });
});

describe("fail-closed læsning af HubSpot (fund 4)", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => deal(`d${i}`, { bookingNumberRaw: String(10000 + i) }));

  it.each([
    ["5xx på side 2", { failOnPageIndex: 2, failReason: "http-5xx" as const }, "HTTP_5XX"],
    ["429 på side 1", { failOnPageIndex: 1, failReason: "http-429" as const }, "HTTP_429"],
    ["401 på første side", { failOnPageIndex: 0, failReason: "http-401" as const }, "HTTP_401"],
    ["rapporteret total ≠ faktisk", { reportedTotal: 251 }, "TOTAL_MISMATCH"],
    ["total ændrer sig undervejs", { totalChangesOnPageIndex: 1 }, "TOTAL_MISMATCH"],
    ["kontrakt-metadata 403", { contractFailure: "http-403" as const }, "HTTP_403"],
  ])("%s ⇒ FAILED run og ingen nye kohorterækker", async (_n, extra, code) => {
    const { p, setClock } = await started();
    const before = p.getAllCohortRows();
    setClock(T1);
    const res = await runConversionSync(adapter(many(250), { pageSize: 50, ...extra }), p, opts(T1));
    expect(res).toEqual({ ok: false, errorCode: code, auditRecorded: true });
    expect(p.getAllCohortRows()).toEqual(before);
    expect(p.getMeasurementState()?.lastSuccessfulSyncAt).toEqual(T0);
  });

  it("samme deal-id på to sider ⇒ DUPLICATE_DEAL, intet skrevet", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const deals = [...many(60), deal("d5")];
    const res = await runConversionSync(adapter(deals, { pageSize: 50 }), p, opts(T1));
    expect(res).toMatchObject({ ok: false, errorCode: "DUPLICATE_DEAL" });
    expect(p.getCohortRow(key("d0"))).toBeNull();
  });

  it("tom kilde ⇒ EMPTY_SOURCE (en tom pipeline er aldrig et gyldigt 'intet nyt')", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    expect(await runConversionSync(adapter([]), p, opts(T1))).toMatchObject({ ok: false, errorCode: "EMPTY_SOURCE" });
  });

  it("en ukendt stage midt i kilden ⇒ CONTRACT_DRIFT for hele kørslen", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const res = await runConversionSync(adapter([deal("a"), deal("b", { dealStageId: "ny-stage" })]), p, opts(T1));
    expect(res).toMatchObject({ ok: false, errorCode: "CONTRACT_DRIFT" });
    expect(p.getCohortRow(key("a"))).toBeNull();
  });

  it("adapter der kaster ⇒ NETWORK_ERROR, aldrig ok", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const a = adapter([deal("a")]);
    a.readDealsPage = async () => {
      throw new Error("socket hang up");
    };
    expect(await runConversionSync(a, p, opts(T1))).toMatchObject({ ok: false, errorCode: "NETWORK_ERROR" });
  });

  it("store mængder deals (5.000 over 50 sider) klassificeres og committes komplet", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const res = await runConversionSync(adapter(many(5000), { pageSize: 100 }), p, opts(T1));
    expect(res).toMatchObject({ ok: true, counts: { observed: 5000, enrolled: 5000 } });
  });
});

describe("fail-closed læsning af Supabase-kilder (fund 4)", () => {
  it.each(["loadTravelPlanIndex", "loadAllCohortStates"] as const)(
    "fejl i %s ⇒ SOURCE_READ_FAILED, ingen deal klassificeres (heller ikke som PDF_ONLY)",
    async (fault) => {
      const { p, setClock } = await started();
      p.faults[fault] = true;
      setClock(T1);
      const res = await runConversionSync(adapter([deal("x")]), p, opts(T1));
      expect(res).toEqual({ ok: false, errorCode: "SOURCE_READ_FAILED", auditRecorded: true });
      expect(p.getCohortRow(key("x"))).toBeNull();
    },
  );
});

describe("atomisk persistence og revisionsspor (fund 2)", () => {
  it("afvist commit ⇒ ok:false + FAILED run; friskhed og kohorte uændret", async () => {
    const { p, setClock } = await started();
    p.faults.commitSyncRun = true;
    setClock(T1);
    const res = await runConversionSync(adapter([deal("x")]), p, opts(T1));
    expect(res).toEqual({ ok: false, errorCode: "COMMIT_REJECTED", auditRecorded: true });
    expect(p.getCohortRow(key("x"))).toBeNull();
    expect(p.getMeasurementState()?.lastSuccessfulSyncAt).toEqual(T0);
    expect(p.getSyncRuns().at(-1)).toMatchObject({ status: "FAILED", errorCode: "COMMIT_REJECTED" });
  });

  it("hvis selv FAILED-revisionsrækken ikke kan skrives, returneres ok:false med auditRecorded:false", async () => {
    const { p, setClock } = await started();
    p.faults.commitSyncRun = true;
    p.faults.failSyncRun = true;
    setClock(T1);
    const res = await runConversionSync(adapter([deal("x")]), p, opts(T1));
    expect(res).toEqual({ ok: false, errorCode: "COMMIT_REJECTED", auditRecorded: false });
  });

  it("en uventet exception efter lease ⇒ FAILED UNKNOWN, aldrig succes", async () => {
    const { p, setClock } = await started();
    p.loadAllCohortStates = async () => {
      throw new Error("boom");
    };
    setClock(T1);
    const res = await runConversionSync(adapter([deal("x")]), p, opts(T1));
    expect(res).toEqual({ ok: false, errorCode: "UNKNOWN", auditRecorded: true });
  });

  it("begin-fejl ⇒ ok:false uden nogen skrivning", async () => {
    const { p, setClock } = await started();
    p.faults.beginSyncRun = true;
    setClock(T1);
    expect(await runConversionSync(adapter([deal("x")]), p, opts(T1))).toEqual({ ok: false, errorCode: "UNKNOWN", auditRecorded: false });
    expect(p.getCohortRow(key("x"))).toBeNull();
  });

  it("samtidige kørsler: den anden afvises med SYNC_ALREADY_RUNNING og kan ikke overskrive", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const slow = adapter([deal("x")]);
    const original = slow.readDealsPage;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    slow.readDealsPage = async (c) => {
      await gate;
      return original(c);
    };
    const first = runConversionSync(slow, p, opts(T1));
    await vi.waitFor(() => expect(p.getSyncRuns().some((r) => r.status === "RUNNING")).toBe(true));
    const second = await runConversionSync(adapter([deal("y")]), p, opts(new Date(T1.getTime() + 1000)));
    expect(second).toEqual({ ok: false, errorCode: "SYNC_ALREADY_RUNNING", auditRecorded: false });
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(p.getCohortRow(key("y"))).toBeNull();
  });

  it("crash midt i en kørsel (lease taget, ingen commit): kohorten er urørt; næste kørsel efter lease-udløb markerer den ABANDONED", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const crashed = await p.beginSyncRun({ contractVersion: CONTRACT_VERSION, leaseSeconds: 1800 });
    expect(crashed.ok).toBe(true);
    // Kørslen "dør" her. Inden lease-udløb blokeres nye kørsler:
    expect(await runConversionSync(adapter([deal("x")]), p, opts(T1))).toMatchObject({ errorCode: "SYNC_ALREADY_RUNNING" });
    setClock(T2);
    expect(await runConversionSync(adapter([deal("x")]), p, opts(T2))).toMatchObject({ ok: true });
    const runs = p.getSyncRuns();
    expect(runs.find((r) => crashed.ok && r.id === crashed.runId)).toMatchObject({ status: "FAILED", errorCode: "ABANDONED" });
  });

  it("en forældet kørsel (lease udløbet og overtaget) kan ikke committe bagefter", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    const stale = await p.beginSyncRun({ contractVersion: CONTRACT_VERSION, leaseSeconds: 1800 });
    setClock(T2);
    await runConversionSync(adapter([deal("x")]), p, opts(T2));
    if (!stale.ok) throw new Error("uventet");
    const commit = await p.commitSyncRun({
      runId: stale.runId,
      syncGeneration: stale.syncGeneration,
      contractVersion: CONTRACT_VERSION,
      observedAt: T3,
      isBaseline: false,
      rows: [],
    });
    expect(commit.ok).toBe(false);
  });

  it("genkørsel med identiske observationer ændrer kun last_observed_at (idempotent)", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([deal("x", { bookingNumberRaw: "42" })]), p, opts(T1));
    const first = p.getCohortRow(key("x"))!;
    setClock(T2);
    await runConversionSync(adapter([deal("x", { bookingNumberRaw: "42" })]), p, opts(T2));
    const second = p.getCohortRow(key("x"))!;
    expect({ ...second, lastObservedAt: first.lastObservedAt }).toEqual(first);
  });

  it("gemmer aldrig rå deal-id'er eller bookingnumre", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([deal("RAW-DEAL-777", { bookingNumberRaw: "98765" })]), p, opts(T1));
    const dump = JSON.stringify([...p.getAllCohortRows()]) + JSON.stringify(p.getSyncRuns());
    expect(dump).not.toContain("RAW-DEAL-777");
    expect(dump).not.toContain("98765");
    expect(dump).not.toContain(DEAL_SECRET);
  });
});

describe("delte bookingreferencer (fund 5)", () => {
  const shared = (id: string, stage = STAGES.quote) => deal(id, { bookingNumberRaw: "7777", dealStageId: stage });
  const publishableOnline = (p: ReturnType<typeof createInMemoryConversionPersistence>) =>
    [...p.getAllCohortRows().values()].filter((r) => r.eligibilityStatus === "ENROLLED" && r.bookingConflictDetectedAt === null);

  it("to deals med samme reference i samme sync ⇒ begge EXCLUDED SHARED", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([shared("a"), shared("b")]), p, opts(T1));
    expect(p.getCohortRow(key("a"))?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
    expect(p.getCohortRow(key("b"))?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
    expect(publishableOnline(p)).toHaveLength(0);
  });

  it("konflikten opdages i en senere sync ⇒ den tidligere ENROLLED deal tages ud af publicerbare tal (revisionsspor bevaret)", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([shared("a")]), p, opts(T1));
    const before = p.getCohortRow(key("a"))!;
    expect(before.eligibilityStatus).toBe("ENROLLED");
    setClock(T2);
    await runConversionSync(adapter([shared("a"), shared("b")]), p, opts(T2));
    const a = p.getCohortRow(key("a"))!;
    expect(a).toMatchObject({ eligibilityStatus: "ENROLLED", exposureGroup: before.exposureGroup, bookingConflictDetectedAt: T2 });
    expect(p.getCohortRow(key("b"))?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
    expect(publishableOnline(p)).toHaveLength(0);
  });

  it("omvendt observationsrækkefølge giver samme udfald", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([shared("b")]), p, opts(T1));
    setClock(T2);
    await runConversionSync(adapter([shared("b"), shared("a")]), p, opts(T2));
    expect(p.getCohortRow(key("b"))?.bookingConflictDetectedAt).toEqual(T2);
    expect(p.getCohortRow(key("a"))?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
    expect(publishableOnline(p)).toHaveLength(0);
  });

  it("konflikt med en deal der ikke er kvalificeret endnu (pending) fanges også", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([shared("a"), shared("pending", STAGES.screened)]), p, opts(T1));
    expect(p.getCohortRow(key("a"))?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
  });

  it("den første deal forsvinder fra kilden, før konflikten opdages ⇒ markeres alligevel", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([shared("a")]), p, opts(T1));
    setClock(T2);
    await runConversionSync(adapter([shared("b")]), p, opts(T2));
    expect(p.getCohortRow(key("a"))?.bookingConflictDetectedAt).toEqual(T2);
    expect(p.getCohortRow(key("a"))?.lastObservedAt).toEqual(T1);
  });

  it("tre deals på samme reference over tre syncs ⇒ ingen af dem publicerbare; genkørsel er idempotent", async () => {
    const { p, setClock } = await started();
    setClock(T1);
    await runConversionSync(adapter([shared("a")]), p, opts(T1));
    setClock(T2);
    await runConversionSync(adapter([shared("a"), shared("b")]), p, opts(T2));
    setClock(T3);
    await runConversionSync(adapter([shared("a"), shared("b"), shared("c")]), p, opts(T3));
    expect(publishableOnline(p)).toHaveLength(0);
    expect(p.getCohortRow(key("c"))?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
    const snap = p.getAllCohortRows();
    const T4 = new Date("2026-10-05T03:00:00Z");
    setClock(T4);
    await runConversionSync(adapter([shared("a"), shared("b"), shared("c")]), p, opts(T4));
    for (const [k, row] of p.getAllCohortRows()) {
      expect({ ...row, lastObservedAt: snap.get(k)!.lastObservedAt }).toEqual(snap.get(k));
    }
    expect(p.getCohortRow(key("a"))?.bookingConflictDetectedAt).toEqual(T2);
  });
});

describe("dry-run", () => {
  it("læser og klassificerer uden nogen skrivning — også når målingen ikke er startet", async () => {
    const p = createInMemoryConversionPersistence({ measurementState: { ...ARMED, status: "NOT_STARTED" } });
    const res = await runConversionSync(adapter([deal("a"), deal("b", { dealStageId: STAGES.screened })]), p, opts(T0, { dryRun: true }));
    expect(res).toMatchObject({ ok: true, dryRun: true, isBaseline: true, counts: { observed: 2 } });
    expect(p.getSyncRuns()).toEqual([]);
    expect(p.getAllCohortRows().size).toBe(0);
  });
});
