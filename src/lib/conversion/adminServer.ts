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
import { COHORT_COLUMNS, parseCohortRow, type CohortRawRow } from "./persistence";
import type { MeasurementState } from "./types";
import { SMALL_CELL_THRESHOLD } from "./contract";
import { SYNC_RUN_ERROR_CODES, type SyncRunErrorCode } from "./types";
import { toConversionWire, type ConversionWire, type LastSyncRunWire } from "./wire";

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

/**
 * Seneste sync-kørsel (Gate D). Streng parsing: en uventet værdi ⇒ fejl
 * (degraded), aldrig en stille default. Manglende tabel ⇒ ingen kørsel.
 */
async function loadLastSyncRun(supabase: SupabaseClient): Promise<{ ok: true; run: LastSyncRunWire | null } | { ok: false }> {
  const { data, error } = await supabase
    .from("conversion_sync_runs")
    .select("status, started_at, finished_at, error_code, is_baseline, deals_observed_count")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return isMissingTableError(error) ? { ok: true, run: null } : { ok: false };
  if (!data) return { ok: true, run: null };
  const started = parseIso(data.started_at);
  const finished = parseIso(data.finished_at);
  if (started === null || started === "invalid" || finished === "invalid") return { ok: false };
  if (data.status !== "RUNNING" && data.status !== "SUCCEEDED" && data.status !== "FAILED") return { ok: false };
  if (data.error_code !== null && !SYNC_RUN_ERROR_CODES.includes(data.error_code as SyncRunErrorCode)) return { ok: false };
  if (data.is_baseline !== null && typeof data.is_baseline !== "boolean") return { ok: false };
  const n = data.deals_observed_count;
  if (n !== null && !(Number.isInteger(n) && n >= 0)) return { ok: false };
  return {
    ok: true,
    run: {
      status: data.status,
      startedAt: started.toISOString(),
      finishedAt: finished ? finished.toISOString() : null,
      errorCode: data.error_code as SyncRunErrorCode | null,
      isBaseline: data.is_baseline,
      observed: n === null || (n > 0 && n < SMALL_CELL_THRESHOLD) ? null : n,
    },
  };
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

  const lastRunRes = await loadLastSyncRun(supabase);
  if (!lastRunRes.ok) {
    console.error("[conversion] læsning af seneste sync-kørsel fejlede");
    return { ok: false, reason: "degraded" };
  }
  const lastRun = lastRunRes.run;

  // Ingen baseline endnu (NOT_STARTED, eller ACTIVE der afventer baseline):
  // der findes ingen kohorte at vise — men et mislykket baseline-forsøg vises.
  if (!measurement.measurementStartedAt) {
    return { ok: true, wire: toConversionWire(buildConversionAggregate([], measurement, asOf), lastRun) };
  }

  type Raw = CohortRawRow;
  const page = (req: PageRequest) =>
    supabase
      .from("conversion_deal_cohort")
      // Samme kolonneliste som sync-motoren (inkl. migration 014's markering):
      // en markeret deal kan aldrig læses uden markeringen og dermed publiceres.
      .select(COHORT_COLUMNS, req.withCount ? { count: "exact" } : undefined)
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
  return { ok: true, wire: toConversionWire(buildConversionAggregate(rows, measurement, asOf), lastRun) };
}
