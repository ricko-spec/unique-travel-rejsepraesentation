// Vision 3.0 Fase 5, Gate B (Issue #80) — server-side loader til
// adminvisningen. FAIL-CLOSED "IKKE STARTET": Gate B1's migration
// (013_conversion_measurement.sql) er BYGGET SOM FIL MEN IKKE ANVENDT i
// production. Denne loader må derfor ALDRIG kaste eller 500'e, hvis
// tabellerne endnu ikke findes — Postgres' "undefined_table" (42P01)
// behandles eksplicit som NOT_STARTED. Enhver anden fejl, afkortning eller
// ugyldig værdi er "degraded" — aldrig falske nul-tal.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows, type PageRequest, type PageResponse } from "../paged-read";
import { buildConversionAggregate, type CohortAggregateRow } from "./aggregate";
import { CONTRACT_VERSION } from "./contract";
import { parseCohortRow } from "./persistence";
import type { MeasurementState } from "./types";
import { toConversionWire, type ConversionWire } from "./wire";

export type ConversionAdminResult = { ok: true; wire: ConversionWire } | { ok: false; reason: "degraded" };

const NOT_STARTED_STATE: MeasurementState = {
  status: "NOT_STARTED",
  contractVersion: CONTRACT_VERSION,
  measurementStartedAt: null,
  lastSuccessfulSyncAt: null,
};

function isMissingTableError(error: { code?: string | null } | null): boolean {
  return error?.code === "42P01";
}

function parseIso(v: string | null): Date | null | "invalid" {
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export async function loadConversionAdminOverview(
  supabase: SupabaseClient,
  asOf: Date = new Date(),
): Promise<ConversionAdminResult> {
  const stateRes = await supabase
    .from("conversion_measurement_state")
    .select("status, contract_version, measurement_started_at, last_successful_sync_at")
    .eq("id", 1)
    .maybeSingle();

  if (stateRes.error) {
    if (isMissingTableError(stateRes.error)) {
      return { ok: true, wire: toConversionWire(buildConversionAggregate([], NOT_STARTED_STATE, asOf)) };
    }
    // Kun en kategorisk markør logges — aldrig rækker eller payloads.
    console.error("[conversion] state-læsning fejlede", stateRes.error.code ?? "ukendt");
    return { ok: false, reason: "degraded" };
  }

  if (!stateRes.data) {
    return { ok: true, wire: toConversionWire(buildConversionAggregate([], NOT_STARTED_STATE, asOf)) };
  }

  const d = stateRes.data;
  const started = parseIso(d.measurement_started_at);
  const lastSync = parseIso(d.last_successful_sync_at);
  if (
    (d.status !== "NOT_STARTED" && d.status !== "ACTIVE" && d.status !== "PAUSED") ||
    started === "invalid" ||
    lastSync === "invalid"
  ) {
    return { ok: false, reason: "degraded" };
  }
  const measurement: MeasurementState = {
    status: d.status,
    contractVersion: d.contract_version,
    measurementStartedAt: started,
    lastSuccessfulSyncAt: lastSync,
  };

  // Ingen baseline endnu (NOT_STARTED, eller ACTIVE der afventer baseline):
  // der findes ingen kohorte at vise.
  if (!measurement.measurementStartedAt) {
    return { ok: true, wire: toConversionWire(buildConversionAggregate([], measurement, asOf)) };
  }

  type Raw = Parameters<typeof parseCohortRow>[0];
  const page = (req: PageRequest) =>
    supabase
      .from("conversion_deal_cohort")
      .select(
        "deal_key, booking_match_key, first_seen_at, last_observed_at, first_qualified_observation_at, exposure_group, exposure_frozen_at, eligibility_status, exclusion_reason, booking_conflict_detected_at, outcome_status, first_booked_at, lost_observed_at, outcome_conflict_observed_at, contract_version",
        req.withCount ? { count: "exact" } : undefined,
      )
      .order("deal_key", { ascending: true })
      .range(req.from, req.to) as unknown as PromiseLike<PageResponse<Raw>>;

  const readResult = await readAllRows<Raw>(page);
  if (!readResult.ok) {
    console.error("[conversion] kohorte-læsning fejlede", readResult.reason);
    return { ok: false, reason: "degraded" };
  }

  const rows: CohortAggregateRow[] = [];
  for (const raw of readResult.rows) {
    const parsed = parseCohortRow(raw);
    if (!parsed) return { ok: false, reason: "degraded" };
    rows.push(parsed.state);
  }
  return { ok: true, wire: toConversionWire(buildConversionAggregate(rows, measurement, asOf)) };
}
