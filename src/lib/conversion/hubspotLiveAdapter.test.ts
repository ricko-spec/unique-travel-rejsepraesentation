import { describe, expect, it } from "vitest";
import {
  DEAL_PROPERTIES,
  HUBSPOT_API_BASE,
  MIN_REQUEST_INTERVAL_MS,
  PIPELINE_PATH,
  SEARCH_PATH,
  createHubSpotLiveAdapter,
} from "./hubspotLiveAdapter";
import { runConversionSync } from "./syncEngine";
import { createInMemoryConversionPersistence } from "./persistence";

const TOKEN = "pat-eu1-" + "x".repeat(36);
const PIPE = "754595640";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Resp = { status: number; json?: unknown; throwJson?: boolean };

function fakeFetch(responder: (call: Call, index: number) => Resp | "throw") {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const r = responder(call, calls.length - 1);
    if (r === "throw") throw new Error("ECONNRESET secret-ish detail");
    return {
      status: r.status,
      json: async () => {
        if (r.throwJson) throw new SyntaxError("bad json");
        return r.json;
      },
    };
  };
  return { fetchImpl, calls };
}

function deal(id: number, over: Record<string, unknown> = {}) {
  return {
    id: String(id),
    properties: {
      pipeline: PIPE,
      dealstage: "1098732868",
      unique_travel_bookingno: String(50000 + id),
      unique_travel_dealstatus: null,
      hs_is_closed: "false",
      hs_is_closed_won: "false",
      hs_object_id: String(id),
      ...over,
    },
    archived: false,
  };
}

/** Simulerer HubSpot search over `n` deals med heltals-cursor. */
function searchServer(n: number, opts: { pageTotalOverride?: (page: number) => number; emptyPage?: number } = {}) {
  const all = Array.from({ length: n }, (_, i) => deal(i + 1));
  return (call: Call): Resp => {
    if (call.method === "GET") return { status: 200, json: { id: PIPE, label: "UT", stages: [{ id: "1098732868" }, { id: "1169407502" }] } };
    const body = call.body as { after?: string; limit: number };
    const start = body.after ? Number(body.after) : 0;
    const page = Math.floor(start / body.limit);
    const results = opts.emptyPage === page ? [] : all.slice(start, start + body.limit);
    const next = start + body.limit < n ? { next: { after: String(start + body.limit) } } : undefined;
    return { status: 200, json: { total: opts.pageTotalOverride ? opts.pageTotalOverride(page) : n, results, ...(next ? { paging: next } : {}) } };
  };
}

const noSleep = async () => {};

describe("createHubSpotLiveAdapter — fastlåst API-grænse", () => {
  it("kalder kun de to tilladte endpoints med korrekt metode på api.hubapi.com", async () => {
    const { fetchImpl, calls } = fakeFetch(searchServer(3));
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl, sleep: noSleep });
    await a.confirmStageContract();
    await a.readDealsPage(null);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${HUBSPOT_API_BASE}${PIPELINE_PATH}`,
      `POST ${HUBSPOT_API_BASE}${SEARCH_PATH}`,
    ]);
    expect(HUBSPOT_API_BASE).toBe("https://api.hubapi.com");
    expect(PIPELINE_PATH).toBe("/crm/v3/pipelines/deals/754595640");
    expect(SEARCH_PATH).toBe("/crm/objects/2026-09/deals/search");
    for (const c of calls) {
      expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(new URL(c.url).search).toBe(""); // ingen query-parametre (fx propertiesWithHistory/associations)
    }
  });

  it("search-body: nøjagtigt pipelinefilter, kun de seks properties, stabil sortering, ingen historik/associations", async () => {
    const { fetchImpl, calls } = fakeFetch(searchServer(3));
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl, sleep: noSleep, pageSize: 50 });
    await a.readDealsPage(null);
    await a.readDealsPage("50");
    const b0 = calls[0].body as Record<string, unknown>;
    expect(b0).toEqual({
      filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: "754595640" }] }],
      properties: [...DEAL_PROPERTIES],
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      limit: 50,
    });
    expect(Object.keys(calls[1].body as object).sort()).toEqual(["after", "filterGroups", "limit", "properties", "sorts"]);
    expect((calls[1].body as { after: string }).after).toBe("50");
    expect(JSON.stringify(calls)).not.toMatch(/history|associations|contacts|companies/i);
  });

  it("kaster ved enhver anden URL/metode — allowlisten kan ikke omgås (monkey-patch af konstanterne virker ikke)", async () => {
    // Adapteren eksponerer ingen path-/host-parameter; eneste mulige kald er de to konstanter.
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl: fakeFetch(searchServer(1)).fetchImpl, sleep: noSleep });
    expect(Object.keys(a).sort()).toEqual(["confirmStageContract", "readDealsPage"]);
  });

  it("afviser tomt/kort token og ugyldig sidestørrelse", () => {
    expect(() => createHubSpotLiveAdapter({ token: "" })).toThrow("HUBSPOT_TOKEN_INVALID");
    expect(() => createHubSpotLiveAdapter({ token: TOKEN, pageSize: 201 })).toThrow("HUBSPOT_PAGE_SIZE_INVALID");
    expect(() => createHubSpotLiveAdapter({ token: TOKEN, pageSize: 0 })).toThrow("HUBSPOT_PAGE_SIZE_INVALID");
  });

  it("holder mindst 250 ms mellem requests (HubSpot: 5 search-req/s)", async () => {
    let t = 0;
    const waits: number[] = [];
    const { fetchImpl } = fakeFetch(searchServer(5));
    const a = createHubSpotLiveAdapter({
      token: TOKEN,
      fetchImpl,
      now: () => t,
      sleep: async (ms) => {
        waits.push(ms);
        t += ms;
      },
      pageSize: 1,
    });
    await a.readDealsPage(null);
    await a.readDealsPage("1");
    expect(waits).toEqual([MIN_REQUEST_INTERVAL_MS]);
  });
});

describe("createHubSpotLiveAdapter — kategoriske, fail-closed fejl uden rå data", () => {
  it.each([
    [401, "http-401"],
    [403, "http-403"],
    [429, "http-429"],
    [500, "http-5xx"],
    [503, "http-5xx"],
    [400, "page-inconsistent"],
    [404, "page-inconsistent"],
  ])("HTTP %s ⇒ %s (ingen retry)", async (status, reason) => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status, json: { message: "deal 12345 secret payload" } }));
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl, sleep: noSleep });
    expect(await a.readDealsPage(null)).toEqual({ ok: false, reason });
    expect(await a.confirmStageContract()).toEqual({ ok: false, reason });
    expect(calls).toHaveLength(2);
  });

  it("netværksfejl ⇒ network-error; ugyldig JSON ⇒ page-inconsistent; ingen rå tekst i resultatet", async () => {
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl: fakeFetch(() => "throw").fetchImpl, sleep: noSleep });
    const r = await a.readDealsPage(null);
    expect(r).toEqual({ ok: false, reason: "network-error" });
    expect(JSON.stringify(r)).not.toContain("ECONNRESET");
    const b = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl: fakeFetch(() => ({ status: 200, throwJson: true })).fetchImpl, sleep: noSleep });
    expect(await b.readDealsPage(null)).toEqual({ ok: false, reason: "page-inconsistent" });
  });

  it.each([
    ["mangler total", { results: [] }, "total-mismatch"],
    ["total ikke heltal", { total: "3", results: [] }, "total-mismatch"],
    ["total > 10.000 (HubSpot-søgegrænse)", { total: 10001, results: [] }, "total-mismatch"],
    ["results ikke array", { total: 1, results: {} }, "total-mismatch"],
    ["deal uden id", { total: 1, results: [{ properties: deal(1).properties }] }, "page-inconsistent"],
    ["ikke-numerisk deal-id", { total: 1, results: [{ ...deal(1), id: "abc" }] }, "page-inconsistent"],
    ["manglende dealstage", { total: 1, results: [deal(1, { dealstage: null })] }, "page-inconsistent"],
    ["hs_is_closed ukendt værdi", { total: 1, results: [deal(1, { hs_is_closed: "maybe" })] }, "page-inconsistent"],
    ["hs_is_closed_won mangler", { total: 1, results: [deal(1, { hs_is_closed_won: null })] }, "page-inconsistent"],
    ["bookingnummer ikke streng", { total: 1, results: [deal(1, { unique_travel_bookingno: 123 })] }, "page-inconsistent"],
    ["ikke-numerisk cursor", { total: 2, results: [deal(1)], paging: { next: { after: "abc" } } }, "page-inconsistent"],
  ])("%s ⇒ %s", async (_n, json, reason) => {
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl: fakeFetch(() => ({ status: 200, json })).fetchImpl, sleep: noSleep });
    expect(await a.readDealsPage(null)).toEqual({ ok: false, reason });
  });

  it("ikke-numerisk cursor ind i readDealsPage afvises før netværkskald", async () => {
    const { fetchImpl, calls } = fakeFetch(searchServer(1));
    const a = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl, sleep: noSleep });
    expect(await a.readDealsPage("x1")).toEqual({ ok: false, reason: "page-inconsistent" });
    expect(calls).toHaveLength(0);
  });

  it("pipeline-metadata: stages uden id eller forkert form ⇒ page-inconsistent; ellers stage-listen i live-rækkefølge", async () => {
    const bad = createHubSpotLiveAdapter({ token: TOKEN, fetchImpl: fakeFetch(() => ({ status: 200, json: { id: PIPE, stages: [{ label: "x" }] } })).fetchImpl, sleep: noSleep });
    expect(await bad.confirmStageContract()).toEqual({ ok: false, reason: "page-inconsistent" });
    const good = createHubSpotLiveAdapter({
      token: TOKEN,
      fetchImpl: fakeFetch(() => ({ status: 200, json: { id: PIPE, stages: [{ id: "b" }, { id: "a" }] } })).fetchImpl,
      sleep: noSleep,
    });
    expect(await good.confirmStageContract()).toEqual({ ok: true, pipelineId: PIPE, stageIds: ["b", "a"] });
  });

  it("mapper KUN de tilladte felter til observationen (ingen ekstra HubSpot-felter slipper igennem)", async () => {
    const a = createHubSpotLiveAdapter({
      token: TOKEN,
      fetchImpl: fakeFetch(() => ({ status: 200, json: { total: 1, results: [deal(7, { dealname: "Kunde Hansen", amount: "99" })] } })).fetchImpl,
      sleep: noSleep,
    });
    const r = await a.readDealsPage(null);
    expect(r.ok && Object.keys(r.observations[0]).sort()).toEqual(
      ["bookingNumberRaw", "dealStageId", "dealStatusRaw", "hubspotClosed", "hubspotClosedWon", "pipelineId", "rawDealId"].sort(),
    );
    expect(JSON.stringify(r)).not.toContain("Hansen");
  });
});

describe("live adapter + sync-motor (dry-run) — paginering fail-closed end-to-end", () => {
  const contract = { pipelineId: PIPE, complete: true, stages: { "1098732868": "QUOTE_OR_LATER" as const, "1169407502": "QUOTE_OR_LATER" as const } };
  const run = (server: (c: Call) => Resp, pageSize = 100) =>
    runConversionSync(
      createHubSpotLiveAdapter({ token: TOKEN, fetchImpl: fakeFetch(server).fetchImpl, sleep: noSleep, pageSize }),
      createInMemoryConversionPersistence({ measurementState: null }),
      { dealKeySecret: "d".repeat(40), bookingMatchSecret: "b".repeat(40), dryRun: true, stageContract: contract },
    );

  it("2.600 deals over 26 sider læses komplet", async () => {
    expect(await run(searchServer(2600))).toMatchObject({ ok: true, dryRun: true, counts: { observed: 2600 } });
  });

  it("ændret total undervejs ⇒ TOTAL_MISMATCH", async () => {
    expect(await run(searchServer(250, { pageTotalOverride: (p) => (p === 1 ? 251 : 250) }))).toMatchObject({ ok: false, errorCode: "TOTAL_MISMATCH" });
  });

  it("tom mellemside ⇒ fail-closed (PAGE_INCONSISTENT)", async () => {
    expect(await run(searchServer(250, { emptyPage: 1 }))).toMatchObject({ ok: false, errorCode: "PAGE_INCONSISTENT" });
  });

  it("ustabil paginering (samme deal på to sider) ⇒ DUPLICATE_DEAL", async () => {
    const base = searchServer(150);
    const server = (c: Call): Resp => {
      const r = base(c);
      const b = c.body as { after?: string } | undefined;
      if (c.method === "POST" && b?.after === "100") {
        const j = r.json as { results: unknown[] };
        j.results[0] = deal(5);
      }
      return r;
    };
    expect(await run(server)).toMatchObject({ ok: false, errorCode: "DUPLICATE_DEAL" });
  });

  it("forkert pipeline i metadata ⇒ CONTRACT_DRIFT", async () => {
    const server = (c: Call): Resp => (c.method === "GET" ? { status: 200, json: { id: "999", stages: [{ id: "1098732868" }, { id: "1169407502" }] } } : searchServer(1)(c));
    expect(await run(server)).toMatchObject({ ok: false, errorCode: "CONTRACT_DRIFT" });
  });

  it("deal i fremmed pipeline i søgeresultatet ⇒ CONTRACT_DRIFT", async () => {
    const server = (c: Call): Resp => (c.method === "GET" ? searchServer(1)(c) : { status: 200, json: { total: 1, results: [deal(1, { pipeline: "999" })] } });
    expect(await run(server)).toMatchObject({ ok: false, errorCode: "CONTRACT_DRIFT" });
  });

  it("ukendt, manglende eller dubleret live-stage ⇒ fail-closed", async () => {
    for (const stages of [
      [{ id: "1098732868" }, { id: "1169407502" }, { id: "ny" }],
      [{ id: "1098732868" }],
      [{ id: "1098732868" }, { id: "1169407502" }, { id: "1169407502" }],
    ]) {
      const server = (c: Call): Resp => (c.method === "GET" ? { status: 200, json: { id: PIPE, stages } } : searchServer(1)(c));
      expect(await run(server)).toMatchObject({ ok: false, errorCode: "CONTRACT_DRIFT" });
    }
  });
});
