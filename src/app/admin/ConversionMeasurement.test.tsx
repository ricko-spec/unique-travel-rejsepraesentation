// Fund 6 (PR #81 review-runde 1): komponent-/integrationstest med den
// FAKTISKE JSON-form fra GET /admin/api/conversion. Routen kaldes med mocket
// session + fake Supabase, svaret går gennem Response.json() (ISO-strenge,
// ingen Date-objekter), valideres af klientens skema og renderes server-side.
// Dækker de fire UI-tilstande som fixture-bevis (ingen screenshots i repoet).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTRACT_VERSION } from "@/lib/conversion/contract";
import { parseConversionWire } from "@/lib/conversion/wire";
import { cohortRawRow, fakeAdminSupabase, type StateRow } from "@/lib/conversion/testFixtures";
import { ConversionBody, formatIsoDate } from "./ConversionMeasurement";

const session = vi.hoisted(() => ({ user: { id: "u" } as { id: string } | null, client: null as unknown }));
vi.mock("@/lib/supabase/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseService: () => session.client }));

import { GET } from "./api/conversion/route";

const NOW = new Date("2027-03-01T12:00:00Z");
const ACTIVE: StateRow = {
  status: "ACTIVE",
  contract_version: CONTRACT_VERSION,
  measurement_started_at: "2026-10-01T03:00:00Z",
  last_successful_sync_at: "2027-03-01T03:00:00Z",
};

function monthRows(group: "ONLINE" | "PDF_ONLY", start: string, n: number, booked: number, offset: number) {
  const bookedAt = new Date(new Date(start).getTime() + 5 * 86400000).toISOString();
  return Array.from({ length: n }, (_, i) =>
    cohortRawRow(offset + i, {
      exposure_group: group,
      first_qualified_observation_at: start,
      exposure_frozen_at: start,
      first_seen_at: start,
      outcome_status: i < booked ? "BOOKED" : "NOT_BOOKED",
      first_booked_at: i < booked ? bookedAt : null,
    }),
  );
}

async function routeJson(client: SupabaseClient): Promise<{ status: number; json: unknown }> {
  session.client = client;
  const res = await GET();
  // Samme vej som browseren: rå tekst → JSON.parse. Ingen Date-objekter overlever.
  return { status: res.status, json: JSON.parse(await res.text()) };
}

function render(json: unknown): string {
  const wire = parseConversionWire(json);
  expect(wire).not.toBeNull();
  return renderToStaticMarkup(createElement(ConversionBody, { wire: wire! }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  session.user = { id: "u" };
});

describe("GET /admin/api/conversion → ConversionBody (faktisk JSON-form)", () => {
  it("uden session: 401 før nogen læsning", async () => {
    session.user = null;
    const { status } = await routeJson(fakeAdminSupabase({ stateError: { code: "53300", message: "må ikke læses" } }));
    expect(status).toBe(401);
  });

  it("1. målingen er ikke startet (migration ikke anvendt / 42P01)", async () => {
    const { status, json } = await routeJson(fakeAdminSupabase({ stateError: { code: "42P01", message: "x" } }));
    expect(status).toBe(200);
    expect((json as { measurement: { measurementStartedAt: unknown } }).measurement.measurementStartedAt).toBeNull();
    const html = render(json);
    expect(html).toContain('data-state="not-started"');
    expect(html).toContain("Målingen er ikke startet endnu");
  });

  it("aktiveret, afventer baseline", async () => {
    const { json } = await routeJson(fakeAdminSupabase({ stateRow: { ...ACTIVE, measurement_started_at: null, last_successful_sync_at: null } }));
    expect(render(json)).toContain('data-state="awaiting-baseline"');
  });

  it("2. aktiv men ikke moden — datoer er strenge i JSON og UI'et kaster ikke", async () => {
    const rows = monthRows("ONLINE", "2027-02-20T03:00:00Z", 15, 0, 1);
    const { status, json } = await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }));
    expect(status).toBe(200);
    const m = (json as { measurement: Record<string, unknown> }).measurement;
    expect(typeof m.measurementStartedAt).toBe("string");
    expect(typeof m.lastSuccessfulSyncAt).toBe("string");
    const html = render(json);
    expect(html).toContain('data-state="not-mature"');
    expect(html).toContain("Ikke nok data endnu");
    expect(html).toContain(formatIsoDate("2026-10-01T03:00:00Z"));
    expect(html).toContain(">15<"); // ONLINE-total (≥10) vises
  });

  it("3. moden og publicerbar — rater, forskel og trend vises", async () => {
    const rows = [
      ...monthRows("ONLINE", "2026-10-10T03:00:00Z", 40, 20, 1),
      ...monthRows("PDF_ONLY", "2026-10-10T03:00:00Z", 60, 15, 1000),
    ];
    const { json } = await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }));
    const html = render(json);
    expect(html).toContain('data-state="publishable"');
    expect(html).toContain("50,0 %");
    expect(html).toContain("25,0 %");
    expect(html).toContain("+25,0 pp");
    expect(html).toContain("2026-10");
    expect(html).toContain("observeret sammenhæng");
  });

  it("4. privacy-undertrykt — små celler og deres komplement vises aldrig som tal", async () => {
    const rows = [
      ...monthRows("ONLINE", "2026-10-10T03:00:00Z", 30, 25, 1), // komplement 5
      ...monthRows("PDF_ONLY", "2026-10-10T03:00:00Z", 30, 5, 1000), // booket 5
      cohortRawRow(5000, { eligibility_status: "EXCLUDED", exclusion_reason: "MISSING_BOOKING_NO", exposure_group: null, exposure_frozen_at: null, booking_match_key: null }),
    ];
    const { json } = await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }));
    const html = render(json);
    expect(html).toContain('data-state="not-mature"');
    expect(html).not.toMatch(/>\s*25\s*</);
    expect(html).not.toMatch(/>\s*5\s*</);
    expect(html).not.toContain("83,3 %");
    expect(html).not.toContain("16,7 %");
    expect(html).toContain("skjult (lille tal)");
  });

  it("forældede data markeres tydeligt", async () => {
    const rows = monthRows("ONLINE", "2027-02-20T03:00:00Z", 15, 0, 1);
    const { json } = await routeJson(
      fakeAdminSupabase({ stateRow: { ...ACTIVE, last_successful_sync_at: "2027-02-20T03:00:00Z" }, cohortRows: rows }),
    );
    expect(render(json)).toContain('data-freshness="stale"');
  });

  describe("Issue #92 — Konvertering-fanen er lettere at forstå", () => {
    const pendingRows = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        cohortRawRow(9000 + i, {
          eligibility_status: "ELIGIBLE_PENDING",
          exposure_group: null,
          exposure_frozen_at: null,
          first_qualified_observation_at: null,
          booking_match_key: null,
        }),
      );

    it("ACTIVE med 0 optagne i begge grupper: forklarer at målingen kører og afventer nye tilbud; 'afventer tilbud' fremhæves dynamisk", async () => {
      const { json } = await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: pendingRows(168) }));
      const out = render(json);
      expect(out).toContain('data-state="awaiting-first-enrollment"');
      expect(out).toContain("Målingen kører");
      expect(out).toMatch(/data-stat="eligible-pending"[\s\S]*?Afventer tilbud[\s\S]*?>168</);
    });

    it("med optagne tilbud vises forklaringen ikke; 1–9 afventende vises aldrig som tal", async () => {
      const rows = [...monthRows("ONLINE", "2027-02-20T03:00:00Z", 15, 0, 1), ...pendingRows(4)];
      const out = render((await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }))).json);
      expect(out).not.toContain('data-state="awaiting-first-enrollment"');
      expect(out).toMatch(/data-stat="eligible-pending"[\s\S]*?skjult \(lille tal\)/);
    });

    it("datakvalitet er sammenklappet som standard (details uden open) og i samme markup — ingen ny hentning", async () => {
      const out = render((await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: pendingRows(168) }))).json);
      const details = out.match(/<details[^>]*data-details="data-quality"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
      expect(details).not.toBe("");
      expect(details).not.toMatch(/<details[^>]*\sopen/);
      expect(details).toContain("Vis datakvalitet og detaljer");
      expect(details).toContain("Datakvalitet:");
    });

    it("FAILED og STALE vises tydeligt UDEN FOR det sammenklappede felt", async () => {
      const out = render(
        (
          await routeJson(
            fakeAdminSupabase({
              stateRow: { ...ACTIVE, last_successful_sync_at: "2027-02-20T03:00:00Z" },
              cohortRows: pendingRows(168),
              lastRun: { status: "FAILED", started_at: "2027-03-01T03:00:00Z", finished_at: "2027-03-01T03:01:00Z", error_code: "HTTP_5XX", is_baseline: false, deals_observed_count: null },
            }),
          )
        ).json,
      );
      const details = out.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "";
      const outside = out.replace(details, "");
      expect(outside).toContain('data-last-run="failed"');
      expect(outside).toContain('data-freshness="stale"');
      expect(details).not.toContain("data-last-run");
      expect(details).not.toContain("data-freshness");
    });
  });

  describe("Gate D (Issue #89) — seneste sync-kørsel som fejlalarm", () => {
    const run = (over: Record<string, unknown> = {}) => ({
      status: "SUCCEEDED",
      started_at: "2027-03-01T03:00:00Z",
      finished_at: "2027-03-01T03:02:00Z",
      error_code: null,
      is_baseline: true,
      deals_observed_count: 2652,
      ...over,
    });
    const awaiting = { ...ACTIVE, measurement_started_at: null, last_successful_sync_at: null };

    it("mislykket baseline vises som fejl med kategorisk kode, mens målingen afventer baseline", async () => {
      const { json } = await routeJson(
        fakeAdminSupabase({ stateRow: awaiting, lastRun: run({ status: "FAILED", error_code: "HTTP_5XX", deals_observed_count: null }) }),
      );
      const html = render(json);
      expect(html).toContain('data-state="awaiting-baseline"');
      expect(html).toContain('data-last-run="failed"');
      expect(html).toContain("fejlkode HTTP_5XX");
      expect(html).toContain("baseline-synkronisering");
    });

    it("gennemført kørsel viser tidspunkt og observeret total; 1–9 vises aldrig", async () => {
      const ok = render((await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: monthRows("ONLINE", "2027-02-20T03:00:00Z", 15, 0, 1), lastRun: run({ is_baseline: false }) }))).json);
      expect(ok).toContain('data-last-run="succeeded"');
      expect(ok).toContain("2652 deals observeret");
      const small = render((await routeJson(fakeAdminSupabase({ stateRow: awaiting, lastRun: run({ deals_observed_count: 7 }) }))).json);
      expect(small).toContain('data-last-run="succeeded"');
      expect(small).not.toContain("7 deals");
    });

    it("igangværende kørsel vises; ugyldig kørselsrække eller læsefejl ⇒ degraded (500)", async () => {
      expect(render((await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: [], lastRun: run({ status: "RUNNING", finished_at: null }) }))).json)).toContain(
        'data-last-run="running"',
      );
      for (const client of [
        fakeAdminSupabase({ stateRow: ACTIVE, lastRun: run({ error_code: "NOGET_ANDET" }) }),
        fakeAdminSupabase({ stateRow: ACTIVE, lastRun: run({ status: "HMM" }) }),
        fakeAdminSupabase({ stateRow: ACTIVE, lastRun: run({ started_at: "x" }) }),
        fakeAdminSupabase({ stateRow: ACTIVE, lastRunError: { code: "53300", message: "intern" } }),
      ]) {
        expect((await routeJson(client)).status).toBe(500);
      }
    });

    it("ingen singleton ⇒ kørsler læses ikke (NOT_STARTED)", async () => {
      const { json } = await routeJson(fakeAdminSupabase({ stateRow: null, lastRunError: { code: "53300", message: "må ikke læses" } }));
      expect(render(json)).toContain('data-state="not-started"');
    });
  });

  it("degraded ⇒ 500 med generisk tekst (ingen interne detaljer)", async () => {
    const { status, json } = await routeJson(fakeAdminSupabase({ stateError: { code: "53300", message: "intern hemmelig detalje" } }));
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("intern hemmelig detalje");
  });

  it("et JSON-svar med Date-lignende men ugyldige felter afvises af skemaet i stedet for at kaste", () => {
    expect(parseConversionWire({ measurement: { measurementStartedAt: 123 } })).toBeNull();
    expect(formatIsoDate("ikke-en-dato")).toBe("—");
  });
});

describe("review-runde 3 — trendtabel med to perioder i samme måned", () => {
  it("renderer to adskilte rækker med unik identitet (Periode 1 og Periode 2)", async () => {
    const rows = [
      ...monthRows("ONLINE", "2026-10-05T03:00:00Z", 30, 15, 1),
      ...monthRows("ONLINE", "2026-10-20T03:00:00Z", 30, 12, 100),
      ...monthRows("PDF_ONLY", "2026-10-05T03:00:00Z", 40, 10, 1000),
    ];
    const { json } = await routeJson(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }));
    const html = render(json);
    expect(html).toContain("Periode 1");
    expect(html).toContain("Periode 2");
    expect(html.match(/Periode 1/g)).toHaveLength(2); // én pr. gruppe-tabel
  });

  it("React-nøglen i trendtabellen er periodeindekset — ikke måneden, der kan gentages", () => {
    const src = readFileSync(join(process.cwd(), "src/app/admin/ConversionMeasurement.tsx"), "utf8");
    expect(src).toContain("key={p.periodIndex}");
    expect(src).not.toContain("key={p.fromMonth}");
  });
});
