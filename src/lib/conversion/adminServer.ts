// Vision 3.0 Fase 5, Gate B (Issue #80) — server-side loader til
// adminvisningen. FAIL-CLOSED "IKKE STARTET": Gate B1's migration
// (013_conversion_measurement.sql) er BYGGET SOM FIL MEN IKKE ANVENDT i
// production. Denne loader må derfor ALDRIG kaste eller 500'e, hvis
// tabellerne endnu ikke findes — den skal opføre sig identisk med
// "målingen er ikke startet endnu" (Postgres' "undefined_table", kode
// 42P01, behandles eksplicit som NOT_STARTED, ikke som en fejl). Det er
// selve mekanismen, der gør PR'en reviewklar UDEN at kræve en opdelt
// udrulning: koden kan monteres i produktion FØR migrationen anvendes,
// uden at admin-siden vælter.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows, type PageRequest, type PageResponse } from "../paged-read";
import { buildConversionAggregate, type CohortAggregateRow, type ConversionAggregate } from "./aggregate";
import { CONTRACT_VERSION } from "./contract";
import type { MeasurementState } from "./types";

// "Ikke startet" er BEVIDST ikke en fejl-variant her — det er en gyldig,
// tom aggregat-tilstand (ok: true, EMPTY_AGGREGATE), fordi det er den
// forventede, normale tilstand i Gate B1 (migrationen er ikke anvendt
// endnu). Kun en reel, uventet DB-fejl er "degraded".
export type ConversionAdminResult =
  | { ok: true; aggregate: ConversionAggregate }
  | { ok: false; reason: "degraded"; message: string };

const NOT_STARTED_STATE: MeasurementState = {
  status: "NOT_STARTED",
  contractVersion: CONTRACT_VERSION,
  measurementStartedAt: null,
  lastSuccessfulSyncAt: null,
};

const EMPTY_AGGREGATE: ConversionAggregate = buildConversionAggregate([], NOT_STARTED_STATE, new Date());

function isMissingTableError(error: { code?: string | null } | null): boolean {
  // Postgres "undefined_table" — den forventede fejl før migration 013 er anvendt.
  return error?.code === "42P01";
}

export async function loadConversionAdminOverview(supabase: SupabaseClient): Promise<ConversionAdminResult> {
  const stateRes = await supabase
    .from("conversion_measurement_state")
    .select("status, contract_version, measurement_started_at, last_successful_sync_at")
    .eq("id", 1)
    .maybeSingle();

  if (stateRes.error) {
    if (isMissingTableError(stateRes.error)) {
      return { ok: true, aggregate: EMPTY_AGGREGATE };
    }
    console.error("[conversion] kunne ikke læse conversion_measurement_state", stateRes.error);
    return { ok: false, reason: "degraded", message: "målingens status kunne ikke hentes" };
  }

  if (!stateRes.data || stateRes.data.status === "NOT_STARTED" || !stateRes.data.measurement_started_at) {
    return { ok: true, aggregate: EMPTY_AGGREGATE };
  }

  const measurement: MeasurementState = {
    status: stateRes.data.status,
    contractVersion: stateRes.data.contract_version,
    measurementStartedAt: new Date(stateRes.data.measurement_started_at),
    lastSuccessfulSyncAt: stateRes.data.last_successful_sync_at
      ? new Date(stateRes.data.last_successful_sync_at)
      : null,
  };

  const page: (req: PageRequest) => PromiseLike<PageResponse<CohortRawRow>> = (req) => {
    const q = supabase
      .from("conversion_deal_cohort")
      .select(
        "eligibility_status, exclusion_reason, first_qualified_observation_at, exposure_group, outcome_status, first_booked_at, lost_observed_at",
        req.withCount ? { count: "exact" } : undefined,
      )
      .order("deal_key", { ascending: true })
      .range(req.from, req.to);
    return q as unknown as PromiseLike<PageResponse<CohortRawRow>>;
  };

  const readResult = await readAllRows<CohortRawRow>(page);
  if (!readResult.ok) {
    console.error("[conversion] kunne ikke læse conversion_deal_cohort", readResult);
    return { ok: false, reason: "degraded", message: "kohorte-data kunne ikke hentes fuldstændigt" };
  }

  const rows: CohortAggregateRow[] = readResult.rows.map(toAggregateRow);
  const aggregate = buildConversionAggregate(rows, measurement, new Date());
  return { ok: true, aggregate };
}

type CohortRawRow = {
  eligibility_status: CohortAggregateRow["eligibilityStatus"];
  exclusion_reason: CohortAggregateRow["exclusionReason"];
  first_qualified_observation_at: string | null;
  exposure_group: CohortAggregateRow["exposureGroup"];
  outcome_status: CohortAggregateRow["outcomeStatus"];
  first_booked_at: string | null;
  lost_observed_at: string | null;
};

function toAggregateRow(row: CohortRawRow): CohortAggregateRow {
  return {
    eligibilityStatus: row.eligibility_status,
    exclusionReason: row.exclusion_reason,
    firstQualifiedObservationAt: row.first_qualified_observation_at
      ? new Date(row.first_qualified_observation_at)
      : null,
    exposureGroup: row.exposure_group,
    outcomeStatus: row.outcome_status,
    firstBookedAt: row.first_booked_at ? new Date(row.first_booked_at) : null,
    lostObservedAt: row.lost_observed_at ? new Date(row.lost_observed_at) : null,
  };
}
