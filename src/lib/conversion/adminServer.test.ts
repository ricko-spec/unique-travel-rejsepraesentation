import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConversionAdminOverview } from "./adminServer";

type StateRow = {
  status: "NOT_STARTED" | "ACTIVE" | "PAUSED";
  contract_version: number;
  measurement_started_at: string | null;
  last_successful_sync_at: string | null;
};

type CohortRow = {
  eligibility_status: string;
  exclusion_reason: string | null;
  first_qualified_observation_at: string | null;
  exposure_group: string | null;
  outcome_status: string;
  first_booked_at: string | null;
  lost_observed_at: string | null;
};

function fakeSupabase(options: {
  stateError?: { code?: string; message: string } | null;
  stateRow?: StateRow | null;
  cohortRows?: CohortRow[];
  cohortError?: { message: string } | null;
}) {
  const client = {
    from(table: string) {
      if (table === "conversion_measurement_state") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            if (options.stateError) return Promise.resolve({ data: null, error: options.stateError });
            return Promise.resolve({ data: options.stateRow ?? null, error: null });
          },
        };
      }
      if (table === "conversion_deal_cohort") {
        return {
          select(_columns: string, sel?: { count?: string }) {
            const withCount = sel?.count === "exact";
            return {
              order() {
                return this;
              },
              range(from: number, to: number) {
                if (options.cohortError) {
                  return Promise.resolve({ data: null, error: options.cohortError, count: null });
                }
                const all = options.cohortRows ?? [];
                const slice = all.slice(from, to + 1);
                return Promise.resolve({ data: slice, error: null, count: withCount ? all.length : null });
              },
            };
          },
        };
      }
      throw new Error(`uventet tabel i fake: ${table}`);
    },
  };
  return client as unknown as SupabaseClient;
}

describe("loadConversionAdminOverview — fail-closed 'ikke startet'", () => {
  it("manglende tabel (42P01) behandles som IKKE STARTET, aldrig som fejl", async () => {
    const client = fakeSupabase({ stateError: { code: "42P01", message: "relation does not exist" } });
    const result = await loadConversionAdminOverview(client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.aggregate.measurement.status).toBe("NOT_STARTED");
      expect(result.aggregate.hasPublishableComparison).toBe(false);
    }
  });

  it("ingen singleton-række endnu => IKKE STARTET", async () => {
    const client = fakeSupabase({ stateRow: null });
    const result = await loadConversionAdminOverview(client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.aggregate.measurement.status).toBe("NOT_STARTED");
  });

  it("status=NOT_STARTED i DB => IKKE STARTET-visning, ingen kohorte-læsning forsøgt", async () => {
    const client = fakeSupabase({
      stateRow: { status: "NOT_STARTED", contract_version: 1, measurement_started_at: null, last_successful_sync_at: null },
    });
    const result = await loadConversionAdminOverview(client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.aggregate.measurement.status).toBe("NOT_STARTED");
  });

  it("en anden, uventet DB-fejl på state-læsningen giver 'degraded', ikke et falsk NOT_STARTED", async () => {
    const client = fakeSupabase({ stateError: { code: "53300", message: "too many connections" } });
    const result = await loadConversionAdminOverview(client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("degraded");
  });
});

describe("loadConversionAdminOverview — aktiv måling", () => {
  it("læser kohorte-rækker og bygger et rigtigt aggregat, når målingen er ACTIVE", async () => {
    const cohortRows: CohortRow[] = Array.from({ length: 12 }, () => ({
      eligibility_status: "ENROLLED",
      exclusion_reason: null,
      first_qualified_observation_at: "2026-10-01T00:00:00Z",
      exposure_group: "ONLINE",
      outcome_status: "NOT_BOOKED",
      first_booked_at: null,
      lost_observed_at: null,
    }));
    const client = fakeSupabase({
      stateRow: {
        status: "ACTIVE",
        contract_version: 1,
        measurement_started_at: "2026-10-01T00:00:00Z",
        last_successful_sync_at: "2026-12-01T00:00:00Z",
      },
      cohortRows,
    });
    const result = await loadConversionAdminOverview(client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.aggregate.measurement.status).toBe("ACTIVE");
      expect(result.aggregate.groups.ONLINE.totalEnrolled).toBe(12);
    }
  });

  it("en fejlet/afkortet kohorte-læsning giver 'degraded', ikke en tom liste", async () => {
    const client = fakeSupabase({
      stateRow: {
        status: "ACTIVE",
        contract_version: 1,
        measurement_started_at: "2026-10-01T00:00:00Z",
        last_successful_sync_at: null,
      },
      cohortError: { message: "boom" },
    });
    const result = await loadConversionAdminOverview(client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("degraded");
  });
});
