// Vision 3.0 Fase 5, Gate B (Issue #80) — persistence-adapter-KONTRAKT +
// Supabase-implementering + en in-memory fake til tests. Skemaet er BYGGET
// SOM MIGRATION (supabase/013_conversion_measurement.sql) men IKKE ANVENDT i
// denne PR.
//
// TRANSAKTIONEL MODEL (PR #81 review-runde 1, fund 2):
//
//   1. beginSyncRun   — RPC conversion_begin_sync_run: tager en lease (højst
//                       én RUNNING-kørsel, håndhævet af et unikt partielt
//                       indeks + advisory lock), markerer forældede RUNNING-
//                       kørsler ABANDONED og returnerer state'ens
//                       sync_generation (optimistisk samtidighedsværn).
//   2. commitSyncRun  — RPC conversion_commit_sync_run: ÉN transaktion der
//                       validerer lease/generation/kontraktversion/baseline,
//                       skriver hele kohortebatchen (DB-triggeren afviser
//                       enhver ændring af frosne felter), afslutter kørslen
//                       som SUCCEEDED og opdaterer last_successful_sync_at —
//                       alt eller intet.
//   3. failSyncRun    — RPC conversion_fail_sync_run: afslutter kørslen som
//                       FAILED med en kategorisk fejlkode (ingen beskeder).
//
// Et crash mellem 1 og 2/3 efterlader kun en RUNNING-række uden
// kohortedata; den markeres ABANDONED når leasen udløber. Ingen Supabase-fejl
// ignoreres: hver metode returnerer en eksplicit fejlvariant.
//
// Alle læsninger er komplette eller fejler: trips og kohorten læses via
// paged-read.ts (eksakt total, fail-closed ved afkortning) — ingen
// URL-baseret `.in(...)` over deal keys.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBookingMatchKey } from "../analytics-bridge";
import { readAllRows, type PageRequest, type PageResponse } from "../paged-read";
import { EXCLUSION_REASONS } from "./types";
import type {
  ClassifiedDealResult,
  CohortState,
  EligibilityStatus,
  ExclusionReason,
  ExposureGroup,
  MeasurementState,
  OutcomeStatus,
  SyncRunErrorCode,
  TravelPlanIndex,
} from "./types";

export type PersistenceFailure = { ok: false; code: SyncRunErrorCode };

export type CommitCounts = { observed: number; enrolled: number; excluded: number; booked: number; conflicts: number };

export type CommitRequest = {
  runId: string;
  syncGeneration: number;
  contractVersion: number;
  observedAt: Date;
  isBaseline: boolean;
  rows: ClassifiedDealResult[];
};

export type ConversionPersistence = {
  loadMeasurementState: () => Promise<{ ok: true; state: MeasurementState | null } | PersistenceFailure>;
  loadTravelPlanIndex: (bookingMatchSecret: string) => Promise<{ ok: true; index: TravelPlanIndex } | PersistenceFailure>;
  loadAllCohortStates: () => Promise<{ ok: true; states: Map<string, CohortState> } | PersistenceFailure>;
  beginSyncRun: (input: {
    contractVersion: number;
    leaseSeconds: number;
  }) => Promise<{ ok: true; runId: string; syncGeneration: number } | PersistenceFailure>;
  commitSyncRun: (req: CommitRequest) => Promise<{ ok: true; counts: CommitCounts } | PersistenceFailure>;
  failSyncRun: (input: { runId: string; errorCode: SyncRunErrorCode }) => Promise<{ ok: true } | PersistenceFailure>;
};

// ----------------------------------------------------------------------------
// Delt validering — spejler 1:1 CHECK-constraints, frys-triggeren og
// commit-RPC'ens batch-regler i migration 013. In-memory-fake'en bruger den,
// og den lokale Postgres-verifikation beviser at SQL'en håndhæver det samme.
// ----------------------------------------------------------------------------

function sameTime(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/** Række-invarianter (CHECK-constraints). Returnerer en kategorisk overtrædelse eller null. */
export function cohortRowViolation(r: CohortState): string | null {
  if ((r.exposureGroup === null) !== (r.exposureFrozenAt === null)) return "exposure_pair";
  if (r.exposureFrozenAt !== null && !sameTime(r.exposureFrozenAt, r.firstQualifiedObservationAt)) return "exposure_frozen_at";
  if (r.exposureGroup !== null && r.eligibilityStatus !== "ENROLLED") return "exposure_requires_enrolled";
  if (r.eligibilityStatus === "ENROLLED") {
    if (r.exposureGroup === null || r.firstQualifiedObservationAt === null || r.bookingMatchKey === null) return "enrolled_fields";
  }
  if ((r.eligibilityStatus === "EXCLUDED") !== (r.exclusionReason !== null)) return "exclusion_reason";
  if (r.eligibilityStatus === "ELIGIBLE_PENDING" || r.eligibilityStatus === "PRE_START_EXISTING") {
    if (r.firstQualifiedObservationAt !== null || r.bookingMatchKey !== null) return "pending_prestart_fields";
  }
  if (r.exclusionReason === "CLOSED_BEFORE_QUALIFIED_OBSERVATION") {
    if (r.firstQualifiedObservationAt !== null || r.bookingMatchKey !== null) return "closed_before_fields";
  }
  if (r.exclusionReason === "MISSING_BOOKING_NO" || r.exclusionReason === "INVALID_BOOKING_NO_FORMAT") {
    if (r.firstQualifiedObservationAt === null || r.bookingMatchKey !== null) return "booking_problem_fields";
  }
  if (r.exclusionReason === "BOOKED_BEFORE_QUALIFIED_OBSERVATION") {
    if (
      r.firstQualifiedObservationAt === null ||
      r.bookingMatchKey !== null ||
      r.firstBookedAt === null ||
      r.firstBookedAt.getTime() >= r.firstQualifiedObservationAt.getTime()
    ) {
      return "booked_before_fields";
    }
  }
  if (
    r.eligibilityStatus === "ENROLLED" &&
    r.firstBookedAt !== null &&
    r.firstQualifiedObservationAt !== null &&
    r.firstBookedAt.getTime() < r.firstQualifiedObservationAt.getTime()
  ) {
    return "enrolled_booked_before_cohort_start";
  }
  if (r.exclusionReason === "SHARED_BOOKING_REFERENCE") {
    if (r.firstQualifiedObservationAt === null || r.bookingMatchKey === null) return "shared_fields";
  }
  if (r.bookingConflictDetectedAt !== null && r.eligibilityStatus !== "ENROLLED") return "conflict_requires_enrolled";
  if ((r.postEnrollmentExclusionReason === null) !== (r.postEnrollmentExcludedAt === null)) return "post_enrollment_pair";
  if (r.postEnrollmentExclusionReason !== null && r.eligibilityStatus !== "ENROLLED") return "post_enrollment_requires_enrolled";
  if ((r.outcomeStatus === "BOOKED") !== (r.firstBookedAt !== null)) return "booked_pair";
  return null;
}

/** Overgangsregler (frys-triggeren). */
export function cohortTransitionViolation(old: CohortState, next: CohortState): string | null {
  if (!sameTime(old.firstSeenAt, next.firstSeenAt)) return "first_seen_at_frozen";
  const terminal = old.eligibilityStatus !== "ELIGIBLE_PENDING";
  if (terminal) {
    if (
      old.eligibilityStatus !== next.eligibilityStatus ||
      old.exclusionReason !== next.exclusionReason ||
      !sameTime(old.firstQualifiedObservationAt, next.firstQualifiedObservationAt) ||
      old.exposureGroup !== next.exposureGroup ||
      !sameTime(old.exposureFrozenAt, next.exposureFrozenAt) ||
      old.bookingMatchKey !== next.bookingMatchKey
    ) {
      return "terminal_frozen";
    }
  }
  if (old.bookingConflictDetectedAt !== null && !sameTime(old.bookingConflictDetectedAt, next.bookingConflictDetectedAt)) {
    return "conflict_frozen";
  }
  if (
    old.postEnrollmentExclusionReason !== null &&
    (old.postEnrollmentExclusionReason !== next.postEnrollmentExclusionReason || !sameTime(old.postEnrollmentExcludedAt, next.postEnrollmentExcludedAt))
  ) {
    return "post_enrollment_frozen";
  }
  if (old.outcomeStatus === "BOOKED" && (next.outcomeStatus !== "BOOKED" || !sameTime(old.firstBookedAt, next.firstBookedAt))) {
    return "booked_frozen";
  }
  if (old.lostObservedAt !== null && !sameTime(old.lostObservedAt, next.lostObservedAt)) return "lost_frozen";
  if (old.outcomeConflictObservedAt !== null && !sameTime(old.outcomeConflictObservedAt, next.outcomeConflictObservedAt)) {
    return "outcome_conflict_frozen";
  }
  if (next.lastObservedAt.getTime() < old.lastObservedAt.getTime()) return "last_observed_backwards";
  return null;
}

/** Batch-regler i commit-RPC'en. */
export function commitBatchViolation(
  req: CommitRequest,
  existing: ReadonlyMap<string, CohortState>,
): string | null {
  if (req.rows.length === 0) return "empty_batch";
  const seen = new Set<string>();
  for (const r of req.rows) {
    if (seen.has(r.dealKey)) return "duplicate_deal_key";
    seen.add(r.dealKey);
    if (r.contractVersion !== req.contractVersion) return "row_contract_version";
    const rowViolation = cohortRowViolation(r);
    if (rowViolation) return rowViolation;
    const old = existing.get(r.dealKey) ?? null;
    if (req.isBaseline) {
      if (r.eligibilityStatus !== "ELIGIBLE_PENDING" && r.eligibilityStatus !== "PRE_START_EXISTING") return "baseline_status";
      if (!sameTime(r.lastObservedAt, req.observedAt)) return "baseline_observed_at";
    }
    if (old === null || old.eligibilityStatus === "ELIGIBLE_PENDING") {
      if (!req.isBaseline && r.eligibilityStatus === "PRE_START_EXISTING") return "pre_start_after_baseline";
      if (r.firstQualifiedObservationAt !== null && !sameTime(r.firstQualifiedObservationAt, req.observedAt)) {
        return "cohort_start_not_observed_at";
      }
    }
    if (old !== null) {
      const t = cohortTransitionViolation(old, r);
      if (t) return t;
    }
  }
  if (req.isBaseline && existing.size > 0) return "baseline_requires_empty_cohort";
  return null;
}

// ----------------------------------------------------------------------------
// Supabase-implementering
// ----------------------------------------------------------------------------

const COHORT_COLUMNS =
  "deal_key, booking_match_key, first_seen_at, last_observed_at, first_qualified_observation_at, exposure_group, exposure_frozen_at, eligibility_status, exclusion_reason, booking_conflict_detected_at, outcome_status, first_booked_at, lost_observed_at, outcome_conflict_observed_at, contract_version";

type CohortRawRow = {
  deal_key: string;
  booking_match_key: string | null;
  first_seen_at: string;
  last_observed_at: string;
  first_qualified_observation_at: string | null;
  exposure_group: string | null;
  exposure_frozen_at: string | null;
  eligibility_status: string;
  exclusion_reason: string | null;
  booking_conflict_detected_at: string | null;
  outcome_status: string;
  first_booked_at: string | null;
  lost_observed_at: string | null;
  outcome_conflict_observed_at: string | null;
  contract_version: number;
};

const ELIGIBILITY: readonly EligibilityStatus[] = ["PRE_START_EXISTING", "ELIGIBLE_PENDING", "ENROLLED", "EXCLUDED"];

function parseDate(v: string | null): Date | null | "invalid" {
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/** Streng parser: en uventet værdi i DB er en fejl, aldrig en stille default. */
export function parseCohortRow(raw: CohortRawRow): { dealKey: string; state: CohortState } | null {
  const dates = {
    firstSeenAt: parseDate(raw.first_seen_at),
    lastObservedAt: parseDate(raw.last_observed_at),
    firstQualifiedObservationAt: parseDate(raw.first_qualified_observation_at),
    exposureFrozenAt: parseDate(raw.exposure_frozen_at),
    bookingConflictDetectedAt: parseDate(raw.booking_conflict_detected_at),
    firstBookedAt: parseDate(raw.first_booked_at),
    lostObservedAt: parseDate(raw.lost_observed_at),
    outcomeConflictObservedAt: parseDate(raw.outcome_conflict_observed_at),
  };
  if (Object.values(dates).some((d) => d === "invalid")) return null;
  if (dates.firstSeenAt === null || dates.lastObservedAt === null) return null;
  if (typeof raw.deal_key !== "string" || raw.deal_key.length === 0) return null;
  if (!ELIGIBILITY.includes(raw.eligibility_status as EligibilityStatus)) return null;
  if (raw.exclusion_reason !== null && !EXCLUSION_REASONS.includes(raw.exclusion_reason as ExclusionReason)) return null;
  if (raw.exposure_group !== null && raw.exposure_group !== "ONLINE" && raw.exposure_group !== "PDF_ONLY") return null;
  if (raw.outcome_status !== "BOOKED" && raw.outcome_status !== "NOT_BOOKED") return null;
  if (!Number.isInteger(raw.contract_version)) return null;
  return {
    dealKey: raw.deal_key,
    state: {
      firstSeenAt: dates.firstSeenAt as Date,
      lastObservedAt: dates.lastObservedAt as Date,
      firstQualifiedObservationAt: dates.firstQualifiedObservationAt as Date | null,
      exposureFrozenAt: dates.exposureFrozenAt as Date | null,
      bookingConflictDetectedAt: dates.bookingConflictDetectedAt as Date | null,
      // Migration 013 har ingen kolonner til efterfølgende udelukkelse (kommer med migration 014).
      postEnrollmentExclusionReason: null,
      postEnrollmentExcludedAt: null,
      firstBookedAt: dates.firstBookedAt as Date | null,
      lostObservedAt: dates.lostObservedAt as Date | null,
      outcomeConflictObservedAt: dates.outcomeConflictObservedAt as Date | null,
      eligibilityStatus: raw.eligibility_status as EligibilityStatus,
      exclusionReason: raw.exclusion_reason as ExclusionReason | null,
      exposureGroup: raw.exposure_group as ExposureGroup | null,
      bookingMatchKey: raw.booking_match_key,
      outcomeStatus: raw.outcome_status as OutcomeStatus,
      contractVersion: raw.contract_version,
    },
  };
}

/** Bygger rejseplan-indekset fra fuldt læste trips-rækker. Tidligste created_at vinder pr. nøgle. */
export function buildTravelPlanIndex(
  rows: { booking_no: string | null; created_at: string }[],
  bookingMatchSecret: string,
): TravelPlanIndex | null {
  const index = new Map<string, { createdAt: Date }>();
  for (const row of rows) {
    if (row.booking_no == null || row.booking_no.trim() === "") continue;
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) return null;
    const key = computeBookingMatchKey(row.booking_no, bookingMatchSecret);
    const prev = index.get(key);
    if (!prev || createdAt.getTime() < prev.createdAt.getTime()) index.set(key, { createdAt });
  }
  return index;
}

/** Kategoriserer en RPC-fejl ud fra den faste, kodede exception-tekst i migration 013. */
function rpcErrorCode(message: string | null | undefined): SyncRunErrorCode {
  const m = message ?? "";
  if (m.includes("CONVERSION_SYNC_ALREADY_RUNNING")) return "SYNC_ALREADY_RUNNING";
  if (m.includes("CONVERSION_NOT_ACTIVE")) return "NOT_ACTIVE";
  if (m.includes("CONVERSION_CONTRACT_VERSION_MISMATCH")) return "CONTRACT_VERSION_MISMATCH";
  return "UNKNOWN";
}

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function serializeCohortRow(r: ClassifiedDealResult) {
  return {
    deal_key: r.dealKey,
    booking_match_key: r.bookingMatchKey,
    first_seen_at: r.firstSeenAt.toISOString(),
    last_observed_at: r.lastObservedAt.toISOString(),
    first_qualified_observation_at: toIso(r.firstQualifiedObservationAt),
    exposure_group: r.exposureGroup,
    exposure_frozen_at: toIso(r.exposureFrozenAt),
    eligibility_status: r.eligibilityStatus,
    exclusion_reason: r.exclusionReason,
    booking_conflict_detected_at: toIso(r.bookingConflictDetectedAt),
    outcome_status: r.outcomeStatus,
    first_booked_at: toIso(r.firstBookedAt),
    lost_observed_at: toIso(r.lostObservedAt),
    outcome_conflict_observed_at: toIso(r.outcomeConflictObservedAt),
    contract_version: r.contractVersion,
  };
}

export function supabaseConversionPersistence(
  supabase: SupabaseClient,
  options: { pageSize?: number } = {},
): ConversionPersistence {
  const pageSize = options.pageSize;
  return {
    async loadMeasurementState() {
      const { data, error } = await supabase
        .from("conversion_measurement_state")
        .select("status, contract_version, measurement_started_at, last_successful_sync_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) return { ok: false, code: "SOURCE_READ_FAILED" };
      if (!data) return { ok: true, state: null };
      if (data.status !== "NOT_STARTED" && data.status !== "ACTIVE" && data.status !== "PAUSED") {
        return { ok: false, code: "SOURCE_READ_FAILED" };
      }
      const started = parseDate(data.measurement_started_at);
      const last = parseDate(data.last_successful_sync_at);
      if (started === "invalid" || last === "invalid") return { ok: false, code: "SOURCE_READ_FAILED" };
      return {
        ok: true,
        state: {
          status: data.status,
          contractVersion: data.contract_version,
          measurementStartedAt: started,
          lastSuccessfulSyncAt: last,
        },
      };
    },

    async loadTravelPlanIndex(bookingMatchSecret) {
      type TripRow = { id: string; booking_no: string | null; created_at: string };
      const page = (req: PageRequest) =>
        supabase
          .from("trips")
          .select("id, booking_no, created_at", req.withCount ? { count: "exact" } : undefined)
          .order("id", { ascending: true })
          .range(req.from, req.to) as unknown as PromiseLike<PageResponse<TripRow>>;
      const result = await readAllRows<TripRow>(page, { pageSize });
      if (!result.ok) return { ok: false, code: "SOURCE_READ_FAILED" };
      const ids = new Set(result.rows.map((r) => r.id));
      if (ids.size !== result.rows.length) return { ok: false, code: "SOURCE_READ_FAILED" };
      const index = buildTravelPlanIndex(result.rows, bookingMatchSecret);
      if (!index) return { ok: false, code: "SOURCE_READ_FAILED" };
      return { ok: true, index };
    },

    async loadAllCohortStates() {
      const page = (req: PageRequest) =>
        supabase
          .from("conversion_deal_cohort")
          .select(COHORT_COLUMNS, req.withCount ? { count: "exact" } : undefined)
          .order("deal_key", { ascending: true })
          .range(req.from, req.to) as unknown as PromiseLike<PageResponse<CohortRawRow>>;
      const result = await readAllRows<CohortRawRow>(page, { pageSize });
      if (!result.ok) return { ok: false, code: "SOURCE_READ_FAILED" };
      const states = new Map<string, CohortState>();
      for (const raw of result.rows) {
        const parsed = parseCohortRow(raw);
        if (!parsed || states.has(parsed.dealKey)) return { ok: false, code: "SOURCE_READ_FAILED" };
        states.set(parsed.dealKey, parsed.state);
      }
      return { ok: true, states };
    },

    async beginSyncRun({ contractVersion, leaseSeconds }) {
      const { data, error } = await supabase.rpc("conversion_begin_sync_run", {
        p_contract_version: contractVersion,
        p_lease_seconds: leaseSeconds,
      });
      if (error) return { ok: false, code: rpcErrorCode(error.message) };
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.run_id !== "string" || !Number.isFinite(Number(row.sync_generation))) {
        return { ok: false, code: "UNKNOWN" };
      }
      return { ok: true, runId: row.run_id, syncGeneration: Number(row.sync_generation) };
    },

    async commitSyncRun(req) {
      // Fail-closed indtil migration 014: en markering kan ikke persisteres i 013-skemaet,
      // så en commit, der ville bære den, afvises FØR noget sendes til databasen.
      if (req.rows.some((r) => r.postEnrollmentExclusionReason !== null || r.postEnrollmentExcludedAt !== null)) {
        return { ok: false, code: "COMMIT_REJECTED" };
      }
      const { data, error } = await supabase.rpc("conversion_commit_sync_run", {
        p_run_id: req.runId,
        p_sync_generation: req.syncGeneration,
        p_contract_version: req.contractVersion,
        p_observed_at: req.observedAt.toISOString(),
        p_is_baseline: req.isBaseline,
        p_rows: req.rows.map(serializeCohortRow),
      });
      if (error) return { ok: false, code: "COMMIT_REJECTED" };
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { ok: false, code: "COMMIT_REJECTED" };
      return {
        ok: true,
        counts: {
          observed: Number(row.observed_count),
          enrolled: Number(row.enrolled_count),
          excluded: Number(row.excluded_count),
          booked: Number(row.booked_count),
          conflicts: Number(row.conflict_count),
        },
      };
    },

    async failSyncRun({ runId, errorCode }) {
      const { error } = await supabase.rpc("conversion_fail_sync_run", { p_run_id: runId, p_error_code: errorCode });
      if (error) return { ok: false, code: "UNKNOWN" };
      return { ok: true };
    },
  };
}

// ----------------------------------------------------------------------------
// In-memory fake — spejler RPC-semantikken (lease, generation, frys-regler,
// alt-eller-intet) til al testdækning uden live DB.
// ----------------------------------------------------------------------------

export type FakeSyncRun = {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  contractVersion: number;
  errorCode: SyncRunErrorCode | null;
  leaseExpiresAt: Date;
  counts: CommitCounts | null;
};

export type FakeFaults = Partial<
  Record<"loadMeasurementState" | "loadTravelPlanIndex" | "loadAllCohortStates" | "beginSyncRun" | "commitSyncRun" | "failSyncRun", boolean>
>;

export function createInMemoryConversionPersistence(seed?: {
  measurementState?: MeasurementState | null;
  travelPlanIndex?: TravelPlanIndex;
  cohortRows?: Map<string, CohortState>;
  clock?: () => Date;
}): ConversionPersistence & {
  getCohortRow: (dealKey: string) => CohortState | null;
  getAllCohortRows: () => Map<string, CohortState>;
  getSyncRuns: () => FakeSyncRun[];
  getMeasurementState: () => MeasurementState | null;
  setMeasurementState: (state: MeasurementState) => void;
  faults: FakeFaults;
  lastCommitViolation: () => string | null;
} {
  let measurementState: MeasurementState | null = seed?.measurementState ?? null;
  let syncGeneration = 0;
  const travelPlanIndex: TravelPlanIndex = seed?.travelPlanIndex ?? new Map();
  const cohort = new Map<string, CohortState>(seed?.cohortRows ?? []);
  const runs: FakeSyncRun[] = [];
  const clock = seed?.clock ?? (() => new Date());
  const faults: FakeFaults = {};
  let violation: string | null = null;
  let nextId = 1;

  const snapshot = (): Map<string, CohortState> => new Map(Array.from(cohort, ([k, v]) => [k, { ...v }]));

  return {
    faults,
    lastCommitViolation: () => violation,
    async loadMeasurementState() {
      if (faults.loadMeasurementState) return { ok: false, code: "SOURCE_READ_FAILED" };
      return { ok: true, state: measurementState };
    },
    async loadTravelPlanIndex() {
      if (faults.loadTravelPlanIndex) return { ok: false, code: "SOURCE_READ_FAILED" };
      return { ok: true, index: travelPlanIndex };
    },
    async loadAllCohortStates() {
      if (faults.loadAllCohortStates) return { ok: false, code: "SOURCE_READ_FAILED" };
      return { ok: true, states: snapshot() };
    },
    async beginSyncRun({ contractVersion, leaseSeconds }) {
      if (faults.beginSyncRun) return { ok: false, code: "UNKNOWN" };
      if (!measurementState || measurementState.status !== "ACTIVE") return { ok: false, code: "NOT_ACTIVE" };
      if (measurementState.contractVersion !== contractVersion) return { ok: false, code: "CONTRACT_VERSION_MISMATCH" };
      const now = clock();
      for (const r of runs) {
        if (r.status === "RUNNING" && r.leaseExpiresAt.getTime() < now.getTime()) {
          r.status = "FAILED";
          r.errorCode = "ABANDONED";
        }
      }
      if (runs.some((r) => r.status === "RUNNING")) return { ok: false, code: "SYNC_ALREADY_RUNNING" };
      const id = `run-${nextId++}`;
      runs.push({
        id,
        status: "RUNNING",
        contractVersion,
        errorCode: null,
        leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
        counts: null,
      });
      return { ok: true, runId: id, syncGeneration };
    },
    async commitSyncRun(req) {
      violation = null;
      if (faults.commitSyncRun) return { ok: false, code: "COMMIT_REJECTED" };
      const reject = (why: string) => {
        violation = why;
        return { ok: false as const, code: "COMMIT_REJECTED" as const };
      };
      const run = runs.find((r) => r.id === req.runId);
      if (!run || run.status !== "RUNNING") return reject("run_not_running");
      if (run.leaseExpiresAt.getTime() < clock().getTime()) return reject("lease_expired");
      if (!measurementState || measurementState.status !== "ACTIVE") return reject("not_active");
      if (measurementState.contractVersion !== req.contractVersion) return reject("contract_version");
      if (req.syncGeneration !== syncGeneration) return reject("stale_generation");
      if (req.isBaseline !== (measurementState.measurementStartedAt === null)) return reject("baseline_mismatch");
      if (measurementState.lastSuccessfulSyncAt && req.observedAt.getTime() <= measurementState.lastSuccessfulSyncAt.getTime()) {
        return reject("observed_at_not_after_last_sync");
      }
      const batchViolation = commitBatchViolation(req, cohort);
      if (batchViolation) return reject(batchViolation);

      // Alt valideret ⇒ anvend hele batchen (alt eller intet).
      for (const r of req.rows) {
        const { dealKey, ...state } = r;
        cohort.set(dealKey, { ...state });
      }
      const counts: CommitCounts = {
        observed: req.rows.filter((r) => r.lastObservedAt.getTime() === req.observedAt.getTime()).length,
        enrolled: req.rows.filter((r) => r.eligibilityStatus === "ENROLLED").length,
        excluded: req.rows.filter((r) => r.eligibilityStatus === "EXCLUDED").length,
        booked: req.rows.filter((r) => r.outcomeStatus === "BOOKED").length,
        conflicts: req.rows.filter((r) => r.bookingConflictDetectedAt !== null).length,
      };
      run.status = "SUCCEEDED";
      run.counts = counts;
      measurementState = {
        ...measurementState,
        measurementStartedAt: measurementState.measurementStartedAt ?? req.observedAt,
        lastSuccessfulSyncAt: req.observedAt,
      };
      syncGeneration += 1;
      return { ok: true, counts };
    },
    async failSyncRun({ runId, errorCode }) {
      if (faults.failSyncRun) return { ok: false, code: "UNKNOWN" };
      const run = runs.find((r) => r.id === runId);
      if (!run || run.status !== "RUNNING") return { ok: false, code: "UNKNOWN" };
      run.status = "FAILED";
      run.errorCode = errorCode;
      return { ok: true };
    },
    getCohortRow: (dealKey) => (cohort.has(dealKey) ? { ...cohort.get(dealKey)! } : null),
    getAllCohortRows: () => snapshot(),
    getSyncRuns: () => runs.map((r) => ({ ...r })),
    getMeasurementState: () => measurementState,
    setMeasurementState: (state) => {
      measurementState = state;
    },
  };
}
