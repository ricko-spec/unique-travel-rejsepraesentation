import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConversionAdminOverview } from "./adminServer";
import { cohortRawRow, fakeAdminSupabase, type StateRow } from "./testFixtures";
import { CONTRACT_VERSION } from "./contract";
import { parseConversionWire } from "./wire";

const ASOF = new Date("2027-03-01T12:00:00Z");
const ACTIVE: StateRow = {
  status: "ACTIVE",
  contract_version: CONTRACT_VERSION,
  measurement_started_at: "2026-10-01T03:00:00Z",
  last_successful_sync_at: "2027-03-01T03:00:00Z",
};

describe("loadConversionAdminOverview — fail-closed 'ikke startet'", () => {
  it("manglende tabel (42P01) behandles som IKKE STARTET, aldrig som fejl", async () => {
    const r = await loadConversionAdminOverview(fakeAdminSupabase({ stateError: { code: "42P01", message: "x" } }), ASOF);
    expect(r.ok && r.wire.measurement.status).toBe("NOT_STARTED");
  });

  it("ingen singleton-række ⇒ IKKE STARTET", async () => {
    const r = await loadConversionAdminOverview(fakeAdminSupabase({ stateRow: null }), ASOF);
    expect(r.ok && r.wire.measurement.status).toBe("NOT_STARTED");
  });

  it("ACTIVE uden baseline ⇒ afventer baseline, ingen kohorte-læsning", async () => {
    const r = await loadConversionAdminOverview(
      fakeAdminSupabase({ stateRow: { ...ACTIVE, measurement_started_at: null, last_successful_sync_at: null }, cohortError: { message: "må ikke læses" } }),
      ASOF,
    );
    expect(r.ok && r.wire.measurement).toEqual({ status: "ACTIVE", contractVersion: CONTRACT_VERSION, measurementStartedAt: null, lastSuccessfulSyncAt: null });
  });

  it("anden DB-fejl, ugyldig status eller ugyldig dato ⇒ degraded, aldrig falsk NOT_STARTED", async () => {
    for (const client of [
      fakeAdminSupabase({ stateError: { code: "53300", message: "too many connections" } }),
      fakeAdminSupabase({ stateRow: { ...ACTIVE, status: "HMM" } }),
      fakeAdminSupabase({ stateRow: { ...ACTIVE, measurement_started_at: "ikke-en-dato" } }),
    ]) {
      expect(await loadConversionAdminOverview(client, ASOF)).toEqual({ ok: false, reason: "degraded" });
    }
  });
});

describe("loadConversionAdminOverview — aktiv måling", () => {
  it("returnerer en wire-DTO med ISO-strenge, som klientens skema accepterer", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => cohortRawRow(i + 1));
    const r = await loadConversionAdminOverview(fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }), ASOF);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wire.measurement.measurementStartedAt).toBe("2026-10-01T03:00:00.000Z");
    expect(r.wire.groups.ONLINE.totalEnrolled).toBe(12);
    expect(parseConversionWire(JSON.parse(JSON.stringify(r.wire)))).not.toBeNull();
  });

  it("afkortet/fejlet kohorte-læsning ⇒ degraded, ikke en tom liste", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => cohortRawRow(i + 1));
    const truncating = {
      from(table: string) {
        const base = fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: rows }) as unknown as { from: (t: string) => unknown };
        if (table !== "conversion_deal_cohort") return base.from(table);
        return {
          select: (_c: string, sel?: { count?: string }) => {
            const q = {
              order: () => q,
              range: (from: number) => Promise.resolve({ data: from === 0 ? rows.slice(0, 1000) : [], error: null, count: sel?.count ? 1500 : null }),
            };
            return q;
          },
        };
      },
    } as unknown as SupabaseClient;
    expect(await loadConversionAdminOverview(truncating, ASOF)).toEqual({ ok: false, reason: "degraded" });
    expect(await loadConversionAdminOverview(fakeAdminSupabase({ stateRow: ACTIVE, cohortError: { message: "boom" } }), ASOF)).toEqual({
      ok: false,
      reason: "degraded",
    });
  });

  it("en ugyldig kohorterække ⇒ degraded", async () => {
    const r = await loadConversionAdminOverview(
      fakeAdminSupabase({ stateRow: ACTIVE, cohortRows: [cohortRawRow(1, { outcome_status: "MAYBE" })] }),
      ASOF,
    );
    expect(r).toEqual({ ok: false, reason: "degraded" });
  });
});
