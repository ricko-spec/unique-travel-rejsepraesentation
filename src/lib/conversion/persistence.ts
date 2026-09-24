// Vision 3.0 Fase 5, Gate B (Issue #80) — persistence-adapter-KONTRAKT +
// Supabase-implementering + en in-memory fake til tests. Skemaet er
// BYGGET SOM MIGRATION (supabase/013_conversion_measurement.sql) men IKKE
// ANVENDT i denne PR — den rigtige Supabase-implementering kan derfor ikke
// køres mod en live database før Gate B2. Al testdækning bruger
// `createInMemoryConversionPersistence()`.
//
// "Persistence er idempotent og transaktionel": upsertCohortRows() skriver
// ALLE rækker i ÉT `.upsert()`-kald (ét SQL-statement = én implicit
// Postgres-transaktion — enten lander alle rækker, eller ingen). Selve
// klassifikationen (classify.ts) garanterer allerede at en terminal rækkes
// frosne felter ekkoes uændret tilbage — persistence-laget har derfor ikke
// selv brug for en COALESCE-baseret delvis opdatering.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClassifiedDealResult,
  ExistingCohortState,
  MeasurementState,
  SyncRunErrorCode,
  TravelPlanIndex,
} from "./types";
import { computeBookingMatchKey } from "../analytics-bridge";

export type SyncRunRecord =
  | { status: "SUCCEEDED"; contractVersion: number; deals: { observed: number; enrolled: number; excluded: number; booked: number } }
  | { status: "FAILED"; contractVersion: number; errorCode: SyncRunErrorCode; message: string };

export type ConversionPersistence = {
  loadMeasurementState: () => Promise<MeasurementState | null>;
  loadTravelPlanIndex: () => Promise<TravelPlanIndex>;
  /** Kun de deal_key'er sync-motoren rent faktisk har observeret denne kørsel. */
  loadExistingCohortStates: (dealKeys: string[]) => Promise<Map<string, ExistingCohortState>>;
  /** Alle booking_match_key-værdier der allerede er brugt af en persisteret række, uanset deal_key. */
  loadUsedBookingMatchKeys: () => Promise<Set<string>>;
  /** Skriver HELE batchen atomart (ét upsert-kald). Kaldes KUN når en sync er fuldt læst og klassificeret. */
  upsertCohortRows: (rows: ClassifiedDealResult[]) => Promise<{ ok: true } | { ok: false; message: string }>;
  recordSyncRun: (record: SyncRunRecord) => Promise<void>;
};

// ----------------------------------------------------------------------------
// Supabase-implementering
// ----------------------------------------------------------------------------

const COHORT_COLUMNS =
  "deal_key, booking_match_key, first_seen_at, first_qualified_observation_at, exposure_group, eligibility_status, exclusion_reason, outcome_status, first_booked_at, lost_observed_at, contract_version";

export function supabaseConversionPersistence(supabase: SupabaseClient): ConversionPersistence {
  return {
    async loadMeasurementState() {
      const { data, error } = await supabase
        .from("conversion_measurement_state")
        .select("status, contract_version, measurement_started_at, last_successful_sync_at")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) return null;
      return {
        status: data.status,
        contractVersion: data.contract_version,
        measurementStartedAt: data.measurement_started_at ? new Date(data.measurement_started_at) : null,
        lastSuccessfulSyncAt: data.last_successful_sync_at ? new Date(data.last_successful_sync_at) : null,
      };
    },

    async loadTravelPlanIndex() {
      // Samme HMAC-kontrakt som Analytics Bridge (Issue #45) — beregnet
      // lokalt her, aldrig via en HTTP-runde til vores eget offentlige API.
      const secret = process.env.BOOKING_MATCH_SECRET;
      if (!secret) throw new Error("BOOKING_MATCH_SECRET er ikke sat");
      const { data, error } = await supabase.from("trips").select("booking_no, created_at");
      if (error) throw new Error(`kunne ikke læse trips: ${error.message}`);
      const index = new Map<string, { createdAt: Date }>();
      for (const row of data ?? []) {
        const key = computeBookingMatchKey(row.booking_no as string, secret);
        index.set(key, { createdAt: new Date(row.created_at as string) });
      }
      return index;
    },

    async loadExistingCohortStates(dealKeys) {
      const result = new Map<string, ExistingCohortState>();
      if (dealKeys.length === 0) return result;
      const { data, error } = await supabase
        .from("conversion_deal_cohort")
        .select(COHORT_COLUMNS)
        .in("deal_key", dealKeys);
      if (error) throw new Error(`kunne ikke læse conversion_deal_cohort: ${error.message}`);
      for (const row of data ?? []) {
        result.set(row.deal_key as string, {
          firstSeenAt: new Date(row.first_seen_at as string),
          eligibilityStatus: row.eligibility_status,
          exclusionReason: row.exclusion_reason,
          firstQualifiedObservationAt: row.first_qualified_observation_at
            ? new Date(row.first_qualified_observation_at as string)
            : null,
          exposureGroup: row.exposure_group,
          bookingMatchKey: row.booking_match_key,
          outcomeStatus: row.outcome_status,
          firstBookedAt: row.first_booked_at ? new Date(row.first_booked_at as string) : null,
          lostObservedAt: row.lost_observed_at ? new Date(row.lost_observed_at as string) : null,
        });
      }
      return result;
    },

    async loadUsedBookingMatchKeys() {
      const { data, error } = await supabase
        .from("conversion_deal_cohort")
        .select("booking_match_key")
        .not("booking_match_key", "is", null);
      if (error) throw new Error(`kunne ikke læse booking_match_key'er: ${error.message}`);
      return new Set((data ?? []).map((r) => r.booking_match_key as string));
    },

    async upsertCohortRows(rows) {
      if (rows.length === 0) return { ok: true };
      const payload = rows.map((r) => ({
        deal_key: r.dealKey,
        booking_match_key: r.bookingMatchKey,
        first_seen_at: r.firstSeenAt.toISOString(),
        first_qualified_observation_at: r.firstQualifiedObservationAt?.toISOString() ?? null,
        exposure_group: r.exposureGroup,
        exposure_frozen_at: r.exposureFrozenAt?.toISOString() ?? null,
        eligibility_status: r.eligibilityStatus,
        exclusion_reason: r.exclusionReason,
        outcome_status: r.outcomeStatus,
        first_booked_at: r.firstBookedAt?.toISOString() ?? null,
        lost_observed_at: r.lostObservedAt?.toISOString() ?? null,
        contract_version: r.contractVersion,
      }));
      const { error } = await supabase
        .from("conversion_deal_cohort")
        .upsert(payload, { onConflict: "deal_key" });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    },

    async recordSyncRun(record) {
      const base = {
        finished_at: new Date().toISOString(),
        contract_version: record.contractVersion,
      };
      if (record.status === "SUCCEEDED") {
        await supabase.from("conversion_sync_runs").insert({
          ...base,
          status: "SUCCEEDED",
          deals_observed_count: record.deals.observed,
          deals_enrolled_count: record.deals.enrolled,
          deals_excluded_count: record.deals.excluded,
          deals_booked_count: record.deals.booked,
        });
      } else {
        await supabase.from("conversion_sync_runs").insert({
          ...base,
          status: "FAILED",
          error_code: record.errorCode,
        });
      }
    },
  };
}

// ----------------------------------------------------------------------------
// In-memory fake — al testdækning i Gate B1 bruger denne (ingen live DB).
// ----------------------------------------------------------------------------

export function createInMemoryConversionPersistence(seed?: {
  measurementState?: MeasurementState;
  travelPlanIndex?: TravelPlanIndex;
  cohortRows?: Map<string, ExistingCohortState>;
}): ConversionPersistence & {
  getCohortRow: (dealKey: string) => ExistingCohortState;
  getSyncRuns: () => SyncRunRecord[];
  setMeasurementState: (state: MeasurementState) => void;
} {
  let measurementState: MeasurementState | null = seed?.measurementState ?? null;
  const travelPlanIndex: TravelPlanIndex = seed?.travelPlanIndex ?? new Map();
  const cohort = new Map<string, ExistingCohortState>(seed?.cohortRows ?? []);
  const syncRuns: SyncRunRecord[] = [];

  return {
    async loadMeasurementState() {
      return measurementState;
    },
    async loadTravelPlanIndex() {
      return travelPlanIndex;
    },
    async loadExistingCohortStates(dealKeys) {
      const result = new Map<string, ExistingCohortState>();
      for (const key of dealKeys) {
        if (cohort.has(key)) result.set(key, cohort.get(key)!);
      }
      return result;
    },
    async loadUsedBookingMatchKeys() {
      const keys = new Set<string>();
      for (const row of cohort.values()) {
        if (row?.bookingMatchKey) keys.add(row.bookingMatchKey);
      }
      return keys;
    },
    async upsertCohortRows(rows) {
      for (const r of rows) {
        cohort.set(r.dealKey, {
          firstSeenAt: r.firstSeenAt,
          eligibilityStatus: r.eligibilityStatus,
          exclusionReason: r.exclusionReason,
          firstQualifiedObservationAt: r.firstQualifiedObservationAt,
          exposureGroup: r.exposureGroup,
          bookingMatchKey: r.bookingMatchKey,
          outcomeStatus: r.outcomeStatus,
          firstBookedAt: r.firstBookedAt,
          lostObservedAt: r.lostObservedAt,
        });
      }
      return { ok: true };
    },
    async recordSyncRun(record) {
      syncRuns.push(record);
    },
    getCohortRow: (dealKey: string) => cohort.get(dealKey) ?? null,
    getSyncRuns: () => syncRuns,
    setMeasurementState: (state: MeasurementState) => {
      measurementState = state;
    },
  };
}
