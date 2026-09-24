// Delte test-fixtures for konverteringsmålingens admin-lag (kun tests —
// importeres aldrig af app-kode). Ingen kundedata: alle nøgler er syntetiske.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTRACT_VERSION } from "./contract";

export type StateRow = {
  status: string;
  contract_version: number;
  measurement_started_at: string | null;
  last_successful_sync_at: string | null;
};

export function cohortRawRow(i: number, overrides: Record<string, unknown> = {}) {
  return {
    deal_key: i.toString(16).padStart(64, "0"),
    booking_match_key: "a".repeat(64),
    first_seen_at: "2026-10-10T03:00:00Z",
    last_observed_at: "2027-02-27T03:00:00Z",
    first_qualified_observation_at: "2026-10-10T03:00:00Z",
    exposure_group: "ONLINE",
    exposure_frozen_at: "2026-10-10T03:00:00Z",
    eligibility_status: "ENROLLED",
    exclusion_reason: null,
    booking_conflict_detected_at: null,
    outcome_status: "NOT_BOOKED",
    first_booked_at: null,
    lost_observed_at: null,
    outcome_conflict_observed_at: null,
    contract_version: CONTRACT_VERSION,
    ...overrides,
  };
}

export function fakeAdminSupabase(options: {
  stateError?: { code?: string; message: string } | null;
  stateRow?: StateRow | null;
  cohortRows?: Record<string, unknown>[];
  cohortError?: { message: string } | null;
  serverMaxRows?: number;
}) {
  const client = {
    from(table: string) {
      if (table === "conversion_measurement_state") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: () =>
            Promise.resolve(options.stateError ? { data: null, error: options.stateError } : { data: options.stateRow ?? null, error: null }),
        };
        return q;
      }
      if (table === "conversion_deal_cohort") {
        return {
          select(_c: string, sel?: { count?: string }) {
            const withCount = sel?.count === "exact";
            const q = {
              order: () => q,
              range(from: number, to: number) {
                if (options.cohortError) return Promise.resolve({ data: null, error: options.cohortError, count: null });
                const all = options.cohortRows ?? [];
                const max = options.serverMaxRows ?? 1000;
                return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + max)), error: null, count: withCount ? all.length : null });
              },
            };
            return q;
          },
        };
      }
      throw new Error(`uventet tabel i fake: ${table}`);
    },
  };
  return client as unknown as SupabaseClient;
}
