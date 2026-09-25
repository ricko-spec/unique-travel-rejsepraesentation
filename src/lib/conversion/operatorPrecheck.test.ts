// Gate C1 (Issue #84) — regressionstests for kategoriseret før/efter-tælling.
// Første live dry-run (head 560fced) fejlede lukket med PRECHECK_FAILED uden at
// sige hvilken tabel eller hvorfor. Disse tests låser, at værktøjet nu siger
// tabel + kategori (AUTH/PERMISSION/TABLE_NOT_FOUND/NETWORK/INVALID_RESPONSE)
// og ALDRIG rå fejltekst, URL, headers, nøgler eller data.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { HubSpotReadAdapter } from "./hubspotAdapter";
import {
  COUNT_TABLES,
  classifyCountResponse,
  countConversionTables,
  formatOperatorReport,
  runOperatorDryRun,
  supabaseTableCounter,
  type CountFailure,
  type TableCountResponse,
} from "./operatorDryRun";
import type { ConversionPersistence } from "./persistence";

// Falske "hemmeligheder"/rå fejldetaljer, der aldrig må optræde i noget output.
const LEAKS = [
  "sb_secret_FAKEFAKEFAKE",
  "eyJhbGciOiJIUzI1NiJ9.FAKE.FAKE",
  "Bearer",
  "apikey",
  "iunixfpthdftmkgpugex",
  "?select=",
  "permission denied for table",
  "relation \"public.conversion_sync_runs\" does not exist",
  "Hansen",
  "fetch failed",
  "ECONNRESET",
];
const RAW_ERROR = { message: `permission denied for table conversion_sync_runs Hansen ${LEAKS[0]}`, details: LEAKS[1], hint: "Bearer apikey ?select=", code: "42501" };

const ok = (count: number): TableCountResponse => ({ status: 200, count, error: null });

describe("classifyCountResponse — kategori fra status/kode, aldrig fra tekst", () => {
  const cases: Array<[string, unknown, ReturnType<typeof classifyCountResponse>]> = [
    ["200 + heltal", ok(0), { ok: true, count: 0 }],
    ["200 + 12", ok(12), { ok: true, count: 12 }],
    ["401 (HEAD: tom body)", { status: 401, count: null, error: { message: "" } }, { ok: false, category: "AUTH" }],
    ["PGRST301 (JWT)", { status: 401, count: null, error: { code: "PGRST301" } }, { ok: false, category: "AUTH" }],
    ["PGRST302", { status: 401, count: null, error: { code: "PGRST302" } }, { ok: false, category: "AUTH" }],
    ["PGRST301 afgør uanset status", { status: 400, count: null, error: { code: "PGRST301" } }, { ok: false, category: "AUTH" }],
    ["count uden status 200", { status: 206, count: 3, error: null }, { ok: false, category: "INVALID_RESPONSE" }],
    ["count uden status", { count: 3, error: null }, { ok: false, category: "INVALID_RESPONSE" }],
    ["403", { status: 403, count: null, error: { message: "" } }, { ok: false, category: "PERMISSION" }],
    ["42501 vinder over status", { status: 401, count: null, error: RAW_ERROR }, { ok: false, category: "PERMISSION" }],
    ["404", { status: 404, count: null, error: { message: "" } }, { ok: false, category: "TABLE_NOT_FOUND" }],
    ["42P01", { status: 400, count: null, error: { code: "42P01" } }, { ok: false, category: "TABLE_NOT_FOUND" }],
    ["PGRST205", { status: 400, count: null, error: { code: "PGRST205" } }, { ok: false, category: "TABLE_NOT_FOUND" }],
    ["postgrest-js HEAD-404-quirk: 204 uden count og uden fejl", { status: 204, count: null, error: null }, { ok: false, category: "TABLE_NOT_FOUND" }],
    ["status 0 (fetch-fejl fanget af klienten)", { status: 0, count: null, error: { message: "TypeError: fetch failed" } }, { ok: false, category: "NETWORK" }],
    ["200 uden count", { status: 200, count: null, error: null }, { ok: false, category: "INVALID_RESPONSE" }],
    ["negativt count", ok(-1), { ok: false, category: "INVALID_RESPONSE" }],
    ["ikke-heltal", ok(1.5), { ok: false, category: "INVALID_RESPONSE" }],
    ["NaN", ok(Number.NaN), { ok: false, category: "INVALID_RESPONSE" }],
    ["count som streng", { status: 200, count: "3", error: null }, { ok: false, category: "INVALID_RESPONSE" }],
    ["500", { status: 500, count: null, error: { message: "boom" } }, { ok: false, category: "INVALID_RESPONSE" }],
    ["503", { status: 503, count: null, error: { message: "" } }, { ok: false, category: "INVALID_RESPONSE" }],
    ["200 med fejl-objekt", { status: 200, count: 3, error: { message: "x" } }, { ok: false, category: "INVALID_RESPONSE" }],
    ["null", null, { ok: false, category: "INVALID_RESPONSE" }],
    ["streng", "nope", { ok: false, category: "INVALID_RESPONSE" }],
    ["tomt objekt", {}, { ok: false, category: "INVALID_RESPONSE" }],
  ];
  it.each(cases)("%s", (_label, input, expected) => {
    expect(classifyCountResponse(input)).toEqual(expected);
  });
});

describe("countConversionTables — hvilken tabel fejlede", () => {
  it("de tre tabeller tælles præcis én gang hver, i fast rækkefølge", async () => {
    const seen: string[] = [];
    const r = await countConversionTables(async (t) => {
      seen.push(t);
      return ok(0);
    });
    expect(COUNT_TABLES).toEqual(["conversion_measurement_state", "conversion_deal_cohort", "conversion_sync_runs"]);
    expect([...seen].sort()).toEqual([...COUNT_TABLES].sort());
    expect(r).toEqual({ ok: true, counts: { state: 0, cohort: 0, runs: 0 } });
  });

  it("tal mappes til den rigtige tabel", async () => {
    const n: Record<string, number> = { conversion_measurement_state: 1, conversion_deal_cohort: 20, conversion_sync_runs: 3 };
    expect(await countConversionTables(async (t) => ok(n[t]))).toEqual({ ok: true, counts: { state: 1, cohort: 20, runs: 3 } });
  });

  it.each(COUNT_TABLES)("kun %s fejler ⇒ kun den tabel rapporteres", async (bad) => {
    const r = await countConversionTables(async (t) => (t === bad ? { status: 401, count: null, error: RAW_ERROR } : ok(0)));
    expect(r).toEqual({ ok: false, failures: [{ table: bad, category: "PERMISSION" }] });
  });

  it("flere fejl rapporteres alle, i fast tabelrækkefølge", async () => {
    const byTable: Record<string, TableCountResponse> = {
      conversion_measurement_state: { status: 401, count: null, error: { message: "" } },
      conversion_deal_cohort: ok(0),
      conversion_sync_runs: { status: 204, count: null, error: null },
    };
    expect(await countConversionTables(async (t) => byTable[t])).toEqual({
      ok: false,
      failures: [
        { table: "conversion_measurement_state", category: "AUTH" },
        { table: "conversion_sync_runs", category: "TABLE_NOT_FOUND" },
      ],
    });
  });

  it("en kastet exception for én tabel ⇒ NETWORK for netop den tabel; beskeden slipper ikke ud", async () => {
    const r = await countConversionTables(async (t) => {
      if (t === "conversion_deal_cohort") throw new TypeError(`fetch failed ${LEAKS.join(" ")}`);
      return ok(0);
    });
    expect(r).toEqual({ ok: false, failures: [{ table: "conversion_deal_cohort", category: "NETWORK" }] });
    for (const leak of LEAKS) expect(JSON.stringify(r)).not.toContain(leak);
  });

  it("rå fejlobjekter efterlader intet spor i resultatet", async () => {
    const r = await countConversionTables(async () => ({ status: 403, count: null, error: RAW_ERROR }));
    for (const leak of LEAKS) expect(JSON.stringify(r)).not.toContain(leak);
  });
});

// Ende-til-ende gennem den ÆGTE supabase-js/postgrest-js med en falsk fetch:
// låser postgrest-js' HEAD-adfærd (ingen body ⇒ ingen fejlkode; tom 404 ⇒ 204).
describe("supabaseTableCounter — ægte klient, falsk fetch (ingen netværk)", () => {
  const client = (fetchImpl: typeof fetch) =>
    createClient("https://example.invalid", "sb_secret_FAKEFAKEFAKE", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchImpl },
    });
  const respond = (status: number, headers: Record<string, string> = {}) =>
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("HEAD");
      return new Response(null, { status, headers });
    });

  it("200 + content-range ⇒ tal; kun HEAD, count=exact", async () => {
    const f = respond(200, { "content-range": "*/0" });
    const r = await countConversionTables(supabaseTableCounter(client(f as unknown as typeof fetch)));
    expect(r).toEqual({ ok: true, counts: { state: 0, cohort: 0, runs: 0 } });
    expect(f).toHaveBeenCalledTimes(3);
    for (const [, init] of f.mock.calls) expect(new Headers(init?.headers).get("Prefer") ?? "").toContain("count=exact");
  });

  it.each([
    [401, "AUTH"],
    [403, "PERMISSION"],
    [404, "TABLE_NOT_FOUND"],
    [500, "INVALID_RESPONSE"],
  ] as const)("HTTP %i ⇒ %s for alle tre tabeller", async (status, category) => {
    const r = await countConversionTables(supabaseTableCounter(client(respond(status) as unknown as typeof fetch)));
    expect(r).toEqual({ ok: false, failures: COUNT_TABLES.map((table) => ({ table, category })) });
  });

  it("200 uden content-range ⇒ INVALID_RESPONSE", async () => {
    const r = await countConversionTables(supabaseTableCounter(client(respond(200) as unknown as typeof fetch)));
    expect(r).toEqual({ ok: false, failures: COUNT_TABLES.map((table) => ({ table, category: "INVALID_RESPONSE" })) });
  });

  it("fetch kaster ⇒ NETWORK, ingen retry-storm (præcis ét kald pr. tabel)", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed ECONNRESET sb_secret_FAKEFAKEFAKE");
    });
    const r = await countConversionTables(supabaseTableCounter(client(f as unknown as typeof fetch)));
    expect(r).toEqual({ ok: false, failures: COUNT_TABLES.map((table) => ({ table, category: "NETWORK" })) });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("kun én tabel afvises ⇒ netop den tabel", async () => {
    const f = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("/conversion_sync_runs") ? new Response(null, { status: 401 }) : new Response(null, { status: 200, headers: { "content-range": "*/0" } }),
    );
    const r = await countConversionTables(supabaseTableCounter(client(f as unknown as typeof fetch)));
    expect(r).toEqual({ ok: false, failures: [{ table: "conversion_sync_runs", category: "AUTH" }] });
  });
});

describe("runOperatorDryRun — kategoriseret precheck/postcheck, stadig fail-closed", () => {
  const persistence = {
    loadMeasurementState: vi.fn(),
    loadTravelPlanIndex: vi.fn(),
    loadAllCohortStates: vi.fn(),
    beginSyncRun: vi.fn(),
    commitSyncRun: vi.fn(),
    failSyncRun: vi.fn(),
  } as unknown as ConversionPersistence;
  const adapter = {} as HubSpotReadAdapter;
  const SECRETS = { dealKeySecret: "d".repeat(64), bookingMatchSecret: "b".repeat(64) };
  const failures: CountFailure[] = [{ table: "conversion_sync_runs", category: "AUTH" }];

  it("precheck-fejl ⇒ FAIL PRECHECK_FAILED med tabel+kategori; HubSpot/motor nås aldrig; 0 skrivninger", async () => {
    const engine = vi.fn();
    const r = await runOperatorDryRun({ adapter, persistence, countRows: async () => ({ ok: false, failures }), engine, ...SECRETS });
    expect(r).toMatchObject({ verdict: "FAIL", errorCode: "PRECHECK_FAILED", stageContract: "NOT_REACHED", writeAttempts: 0, pre: null, precheckFailures: failures });
    expect(engine).not.toHaveBeenCalled();
    expect(formatOperatorReport(r)).toContain("precheck-fejl: conversion_sync_runs=AUTH");
  });

  it("postcheck-fejl ⇒ FAIL POSTCHECK_FAILED med tabel+kategori", async () => {
    let n = 0;
    const countRows = async () => (n++ === 0 ? { ok: true as const, counts: { state: 0, cohort: 0, runs: 0 } } : { ok: false as const, failures: [{ table: "conversion_deal_cohort" as const, category: "NETWORK" as const }] });
    const engine = vi.fn(async () => ({ ok: true as const, dryRun: true as const, isBaseline: true, counts: { observed: 0, enrolled: 0, excluded: 0, booked: 0, conflicts: 0 } }));
    const r = await runOperatorDryRun({ adapter, persistence, countRows, engine: engine as never, ...SECRETS });
    expect(r).toMatchObject({ verdict: "FAIL", errorCode: "POSTCHECK_FAILED", postcheckFailures: [{ table: "conversion_deal_cohort", category: "NETWORK" }] });
    expect(formatOperatorReport(r)).toContain("postcheck-fejl: conversion_deal_cohort=NETWORK");
  });

  it("countRows der kaster ⇒ stadig PRECHECK_FAILED (ukategoriseret), aldrig exception-tekst", async () => {
    const r = await runOperatorDryRun({ adapter, persistence, countRows: async () => { throw new Error(LEAKS.join(" ")); }, ...SECRETS });
    expect(r).toMatchObject({ verdict: "FAIL", errorCode: "PRECHECK_FAILED", precheckFailures: [] });
    const out = formatOperatorReport(r).join("\n");
    expect(out).toContain("precheck-fejl: IKKE KATEGORISERET");
    for (const leak of LEAKS) expect(out).not.toContain(leak);
  });

  it("uden fejl vises ingen precheck-/postcheck-linje", async () => {
    const engine = vi.fn(async () => ({ ok: true as const, dryRun: true as const, isBaseline: true, counts: { observed: 0, enrolled: 0, excluded: 0, booked: 0, conflicts: 0 } }));
    const r = await runOperatorDryRun({ adapter, persistence, countRows: async () => ({ ok: true, counts: { state: 0, cohort: 0, runs: 0 } }), engine: engine as never, ...SECRETS });
    expect(r.verdict).toBe("PASS");
    expect(formatOperatorReport(r).join("\n")).not.toMatch(/precheck-fejl|postcheck-fejl/);
  });

  it("ende-til-ende: ægte klient + 401 på én tabel ⇒ formateret output er kategorisk og lækker intet", async () => {
    const f = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("/conversion_measurement_state") ? new Response(JSON.stringify(RAW_ERROR), { status: 401 }) : new Response(null, { status: 200, headers: { "content-range": "*/0" } }),
    );
    const c = createClient("https://iunixfpthdftmkgpugex.supabase.co", "sb_secret_FAKEFAKEFAKE", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: f as unknown as typeof fetch },
    });
    const engine = vi.fn();
    const r = await runOperatorDryRun({ adapter, persistence, countRows: () => countConversionTables(supabaseTableCounter(c)), engine, ...SECRETS });
    const out = formatOperatorReport(r).join("\n");
    expect(out).toContain("VERDICT: FAIL (PRECHECK_FAILED)");
    expect(out).toContain("precheck-fejl: conversion_measurement_state=PERMISSION");
    for (const leak of LEAKS) expect(out).not.toContain(leak);
    expect(engine).not.toHaveBeenCalled();
  });
});

describe("scripts/operator/conversion-dry-run.ts — bruger den kategoriserede tæller", () => {
  const src = readFileSync("scripts/operator/conversion-dry-run.ts", "utf8");
  it("tæller via countConversionTables(supabaseTableCounter(...)) og læser aldrig fejltekst", () => {
    expect(src).toMatch(/countConversionTables\(\s*supabaseTableCounter\(/);
    expect(src).not.toMatch(/\.message|\.details|\.hint|error\.code|\.stack/);
    expect(src).not.toMatch(/\.from\(/);
  });
});
