// Fund 6 (PR #81 review-runde 1): komponent-/integrationstest med den
// FAKTISKE JSON-form fra GET /admin/api/conversion. Routen kaldes med mocket
// session + fake Supabase, svaret går gennem Response.json() (ISO-strenge,
// ingen Date-objekter), valideres af klientens skema og renderes server-side.
// Dækker de fire UI-tilstande som fixture-bevis (ingen screenshots i repoet).
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
