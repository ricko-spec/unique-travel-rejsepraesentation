// Vision 3.0 Fase 5, Gate B (Issue #80) — sync-motoren. Orkestrerer
// HubSpot-adapteren (read-only), klassifikationen (classify.ts, ren) og
// persistence (transaktionel RPC), med disse BINDENDE garantier:
//
//   0. Secrets valideres FØR enhver læsning eller skrivning (tomme, for
//      korte eller ens HMAC-secrets ⇒ CONFIG_INVALID, intet røres).
//   1. Målingen skal være ACTIVE, og state'ens kontraktversion skal være
//      lig runtime CONTRACT_VERSION.
//   2. En lease tages (højst én samtidig kørsel). Alt herefter afsluttes
//      ENTEN med én atomisk commit (kohorte + SUCCEEDED + friskhed) ELLER med
//      et FAILED-run med kategorisk fejlkode. En fejl returnerer aldrig ok.
//   3. Stage-kontrakten verificeres mod live pipeline-metadata; hele kilden
//      læses fail-closed (total, dubletter, tomme sider, HTTP-fejl); trips og
//      eksisterende kohorte læses komplet eller slet ikke.
//   4. Klassifikationen kører først når ALT er læst.
//
// `dryRun: true` gennemløber læsning + klassifikation uden nogen skrivning
// (heller ingen sync-run) — til Gate C's forbindelses-/kontrakttjek.

import { CONTRACT_VERSION, PIPELINE_STAGE_CONTRACT, SYNC_LEASE_SECONDS, type PipelineStageContract } from "./contract";
import {
  computeSharedBookingMatchKeys,
  markUnobservedConflicts,
  reduceDealCohort,
  validateObservation,
  verifyStageContract,
  type ValidatedObservation,
} from "./classify";
import { computeBookingKeyForConversion, computeDealKey, secretsAreUsable, validateBookingNumber } from "./dealKey";
import type { AdapterFailureReason, HubSpotReadAdapter } from "./hubspotAdapter";
import type { CommitCounts, ConversionPersistence } from "./persistence";
import { EXCLUSION_REASONS } from "./types";
import type { ClassifiedDealResult, EligibilityStatus, ExclusionReason, HubSpotDealObservation, SyncRunErrorCode } from "./types";

/** Rene aggregater fra en dry-run (Gate C1) — ingen id'er, nøgler eller rækker. */
export type DryRunSummary = {
  byEligibility: Record<EligibilityStatus, number>;
  byExclusionReason: Record<ExclusionReason, number>;
  lostObserved: number;
  outcomeConflicts: number;
};

export type SyncRunOutcome =
  | { ok: true; dryRun: boolean; isBaseline: boolean; counts: CommitCounts; dryRunSummary?: DryRunSummary }
  | {
      ok: false;
      errorCode: SyncRunErrorCode;
      /** false hvis FAILED-revisionsrækken IKKE kunne skrives (eller kørslen blev afvist før en lease). */
      auditRecorded: boolean;
    };

const MAX_PAGES = 2000;

function mapAdapterFailure(reason: AdapterFailureReason): SyncRunErrorCode {
  switch (reason) {
    case "http-401":
      return "HTTP_401";
    case "http-403":
      return "HTTP_403";
    case "http-429":
      return "HTTP_429";
    case "http-5xx":
      return "HTTP_5XX";
    case "page-inconsistent":
      return "PAGE_INCONSISTENT";
    case "total-mismatch":
      return "TOTAL_MISMATCH";
    default:
      return "NETWORK_ERROR";
  }
}

type Failure = { ok: false; code: SyncRunErrorCode };

async function readAllDeals(adapter: HubSpotReadAdapter): Promise<{ ok: true; observations: HubSpotDealObservation[] } | Failure> {
  const observations: HubSpotDealObservation[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let total: number | null = null;

  for (let pages = 0; pages < MAX_PAGES; pages++) {
    let page;
    try {
      page = await adapter.readDealsPage(cursor);
    } catch {
      return { ok: false, code: "NETWORK_ERROR" };
    }
    if (!page.ok) return { ok: false, code: mapAdapterFailure(page.reason) };
    if (!Number.isInteger(page.total) || page.total < 0) return { ok: false, code: "TOTAL_MISMATCH" };
    if (total === null) total = page.total;
    else if (page.total !== total) return { ok: false, code: "TOTAL_MISMATCH" };

    for (const obs of page.observations) {
      const id = typeof obs.rawDealId === "string" ? obs.rawDealId.trim() : "";
      if (id === "") return { ok: false, code: "PAGE_INCONSISTENT" };
      // Samme deal på to sider (fx ved ustabil sortering) ⇒ kilden er ikke konsistent.
      if (seenIds.has(id)) return { ok: false, code: "DUPLICATE_DEAL" };
      seenIds.add(id);
      observations.push(obs);
    }
    if (observations.length > total) return { ok: false, code: "TOTAL_MISMATCH" };
    if (!page.hasMore) {
      if (observations.length !== total) return { ok: false, code: "TOTAL_MISMATCH" };
      return { ok: true, observations };
    }
    if (page.nextCursor === null || page.observations.length === 0) return { ok: false, code: "PAGE_INCONSISTENT" };
    cursor = page.nextCursor;
  }
  return { ok: false, code: "PAGE_INCONSISTENT" };
}

export type RunConversionSyncOptions = {
  dealKeySecret: string;
  bookingMatchSecret: string;
  now?: Date;
  dryRun?: boolean;
  /** Kun til tests — produktion bruger altid PIPELINE_STAGE_CONTRACT. */
  stageContract?: PipelineStageContract;
};

export async function runConversionSync(
  hubspot: HubSpotReadAdapter,
  persistence: ConversionPersistence,
  options: RunConversionSyncOptions,
): Promise<SyncRunOutcome> {
  // 0. Konfiguration — før ALT andet.
  if (!secretsAreUsable(options?.dealKeySecret, options?.bookingMatchSecret)) {
    return { ok: false, errorCode: "CONFIG_INVALID", auditRecorded: false };
  }
  const dryRun = options.dryRun === true;
  const now = options.now ?? new Date();
  const contract = options.stageContract ?? PIPELINE_STAGE_CONTRACT;

  // 1. Målingstilstand og kontraktversion.
  const stateRes = await persistence.loadMeasurementState();
  if (!stateRes.ok) return { ok: false, errorCode: stateRes.code, auditRecorded: false };
  const state = stateRes.state;
  if (!dryRun) {
    if (!state || state.status !== "ACTIVE") return { ok: false, errorCode: "NOT_ACTIVE", auditRecorded: false };
    if (state.contractVersion !== CONTRACT_VERSION) {
      return { ok: false, errorCode: "CONTRACT_VERSION_MISMATCH", auditRecorded: false };
    }
  }
  const isBaseline = !state?.measurementStartedAt;

  // 2. Lease (ikke i dry-run).
  let runId: string | null = null;
  let syncGeneration = 0;
  if (!dryRun) {
    const begin = await persistence.beginSyncRun({ contractVersion: CONTRACT_VERSION, leaseSeconds: SYNC_LEASE_SECONDS });
    if (!begin.ok) return { ok: false, errorCode: begin.code, auditRecorded: false };
    runId = begin.runId;
    syncGeneration = begin.syncGeneration;
  }

  const fail = async (code: SyncRunErrorCode): Promise<SyncRunOutcome> => {
    if (runId === null) return { ok: false, errorCode: code, auditRecorded: false };
    let recorded = false;
    try {
      recorded = (await persistence.failSyncRun({ runId, errorCode: code })).ok;
    } catch {
      recorded = false;
    }
    return { ok: false, errorCode: code, auditRecorded: recorded };
  };

  try {
    const result = await classifyAll(hubspot, persistence, {
      dealKeySecret: options.dealKeySecret,
      bookingMatchSecret: options.bookingMatchSecret,
      now,
      isBaseline,
      contract,
    });
    if (!result.ok) return await fail(result.code);

    if (dryRun || runId === null) {
      return { ok: true, dryRun: true, isBaseline, counts: countRows(result.rows, now), dryRunSummary: summarize(result.rows) };
    }

    const commit = await persistence.commitSyncRun({
      runId,
      syncGeneration,
      contractVersion: CONTRACT_VERSION,
      observedAt: now,
      isBaseline,
      rows: result.rows,
    });
    if (!commit.ok) return await fail(commit.code);
    return { ok: true, dryRun: false, isBaseline, counts: commit.counts };
  } catch {
    // En uventet exception må aldrig blive til succes eller efterlade en
    // halv tilstand: commit er atomisk, så kohorten er urørt.
    return await fail("UNKNOWN");
  }
}

function summarize(rows: ClassifiedDealResult[]): DryRunSummary {
  const byEligibility: Record<EligibilityStatus, number> = {
    PRE_START_EXISTING: 0,
    ELIGIBLE_PENDING: 0,
    ENROLLED: 0,
    EXCLUDED: 0,
  };
  const byExclusionReason = Object.fromEntries(EXCLUSION_REASONS.map((r) => [r, 0])) as Record<ExclusionReason, number>;
  for (const r of rows) {
    byEligibility[r.eligibilityStatus] += 1;
    if (r.exclusionReason) byExclusionReason[r.exclusionReason] += 1;
  }
  return {
    byEligibility,
    byExclusionReason,
    lostObserved: rows.filter((r) => r.lostObservedAt !== null && r.outcomeStatus === "NOT_BOOKED").length,
    outcomeConflicts: rows.filter((r) => r.outcomeConflictObservedAt !== null).length,
  };
}

function countRows(rows: ClassifiedDealResult[], observedAt: Date): CommitCounts {
  return {
    observed: rows.filter((r) => r.lastObservedAt.getTime() === observedAt.getTime()).length,
    enrolled: rows.filter((r) => r.eligibilityStatus === "ENROLLED").length,
    excluded: rows.filter((r) => r.eligibilityStatus === "EXCLUDED").length,
    booked: rows.filter((r) => r.outcomeStatus === "BOOKED").length,
    conflicts: rows.filter((r) => r.bookingConflictDetectedAt !== null).length,
  };
}

async function classifyAll(
  hubspot: HubSpotReadAdapter,
  persistence: ConversionPersistence,
  ctx: {
    dealKeySecret: string;
    bookingMatchSecret: string;
    now: Date;
    isBaseline: boolean;
    contract: PipelineStageContract;
  },
): Promise<{ ok: true; rows: ClassifiedDealResult[] } | Failure> {
  let live;
  try {
    live = await hubspot.confirmStageContract();
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
  if (!live.ok) return { ok: false, code: mapAdapterFailure(live.reason) };
  const verified = verifyStageContract({ pipelineId: live.pipelineId, stages: live.stages }, ctx.contract);
  if (!verified.ok) return { ok: false, code: verified.code };

  const read = await readAllDeals(hubspot);
  if (!read.ok) return read;
  if (read.observations.length === 0) return { ok: false, code: "EMPTY_SOURCE" };

  const trips = await persistence.loadTravelPlanIndex(ctx.bookingMatchSecret);
  if (!trips.ok) return { ok: false, code: trips.code };
  const persisted = await persistence.loadAllCohortStates();
  if (!persisted.ok) return { ok: false, code: persisted.code };
  if (ctx.isBaseline && persisted.states.size > 0) return { ok: false, code: "COMMIT_REJECTED" };

  // Pas 1: validér hver observation mod kontrakten og beregn nøgler.
  type Prepared = {
    dealKey: string;
    validated: ValidatedObservation;
    booking: ReturnType<typeof validateBookingNumber>;
    currentKey: string | null;
  };
  const prepared: Prepared[] = [];
  const dealKeys = new Set<string>();
  for (const obs of read.observations) {
    const v = validateObservation(obs, ctx.contract);
    if (!v.ok) return { ok: false, code: "CONTRACT_DRIFT" };
    const dealKey = computeDealKey(obs.rawDealId, ctx.dealKeySecret);
    if (dealKeys.has(dealKey)) return { ok: false, code: "DUPLICATE_DEAL" };
    dealKeys.add(dealKey);
    const booking = validateBookingNumber(obs.bookingNumberRaw);
    const currentKey = booking.kind === "valid" ? computeBookingKeyForConversion(booking.normalized, ctx.bookingMatchSecret) : null;
    prepared.push({ dealKey, validated: v.value, booking, currentKey });
  }

  // Pas 2: delte referencer på tværs af HELE kilden + alle persisterede
  // frosne nøgler — uafhængigt af observationsrækkefølge.
  const pairs: { dealKey: string; bookingMatchKey: string }[] = [];
  for (const [dealKey, s] of persisted.states) {
    if (s.bookingMatchKey) pairs.push({ dealKey, bookingMatchKey: s.bookingMatchKey });
  }
  for (const p of prepared) if (p.currentKey) pairs.push({ dealKey: p.dealKey, bookingMatchKey: p.currentKey });
  const shared = computeSharedBookingMatchKeys(pairs);

  // Pas 3: klassifikation.
  const rows: ClassifiedDealResult[] = prepared.map((p) =>
    reduceDealCohort({
      dealKey: p.dealKey,
      observedAt: ctx.now,
      isBaseline: ctx.isBaseline,
      validated: p.validated,
      booking: p.booking,
      currentBookingMatchKey: p.currentKey,
      existing: persisted.states.get(p.dealKey) ?? null,
      travelPlanIndex: trips.index,
      sharedBookingMatchKeys: shared,
      contractVersion: CONTRACT_VERSION,
    }),
  );
  rows.push(
    ...markUnobservedConflicts({
      persisted: persisted.states,
      observedDealKeys: dealKeys,
      sharedBookingMatchKeys: shared,
      observedAt: ctx.now,
      contractVersion: CONTRACT_VERSION,
    }),
  );
  return { ok: true, rows };
}
