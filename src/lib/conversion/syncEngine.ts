// Vision 3.0 Fase 5, Gate B (Issue #80) — sync-motoren. Orkestrerer
// HubSpot-adapteren (read-only), klassifikationen (classify.ts, ren) og
// persistence (idempotent), med disse BINDENDE garantier:
//
//   1. Stage-/pipelinekontrakten bekræftes LIVE FØRST — kontraktdrift
//      giver et FAILED-run uden nogen deal-læsning.
//   2. ALLE sider læses fail-closed (samme princip som paged-read.ts): en
//      fejl, en uventet side eller et inkonsistent antal midtvejs afbryder
//      HELE kørslen uden at skrive noget som helst til
//      conversion_deal_cohort — "fuld kilde eller ingen commit af kørslen".
//   3. Klassifikationen (ren, se classify.ts) kører KUN når hele kilden er
//      læst succesfuldt.
//   4. Skrivningen sker i ÉT atomart upsert-kald (persistence.ts).
//   5. Målingen skal være ACTIVE (measurement_started_at sat) for at en
//      sync overhovedet klassificerer noget — Gate B1 kører ALDRIG denne
//      vej med en rigtig HubSpot-adapter; kun fixtures i tests.

import { CONTRACT_VERSION } from "./contract";
import { reduceDealCohort } from "./classify";
import { computeBookingKeyForConversion, computeDealKey, validateBookingNumber } from "./dealKey";
import type { HubSpotReadAdapter } from "./hubspotAdapter";
import type { ConversionPersistence } from "./persistence";
import type { ClassifiedDealResult, HubSpotDealObservation, SyncRunErrorCode } from "./types";

export type SyncRunOutcome =
  | { ok: true; observed: number; enrolled: number; excluded: number; booked: number }
  | { ok: false; errorCode: SyncRunErrorCode; message: string };

const MAX_PAGES = 2000;

async function readAllDeals(
  adapter: HubSpotReadAdapter,
): Promise<{ ok: true; observations: HubSpotDealObservation[] } | { ok: false; errorCode: SyncRunErrorCode; message: string }> {
  const observations: HubSpotDealObservation[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES) {
    pages += 1;
    let page;
    try {
      page = await adapter.readDealsPage(cursor);
    } catch (e) {
      return { ok: false, errorCode: "NETWORK_ERROR", message: e instanceof Error ? e.message : "unknown" };
    }
    if (!page.ok) {
      const errorCode: SyncRunErrorCode =
        page.reason === "http-401"
          ? "HTTP_401"
          : page.reason === "http-403"
            ? "HTTP_403"
            : page.reason === "http-429"
              ? "HTTP_429"
              : page.reason === "http-5xx"
                ? "HTTP_5XX"
                : page.reason === "page-inconsistent"
                  ? "PAGE_INCONSISTENT"
                  : page.reason === "total-mismatch"
                    ? "TOTAL_MISMATCH"
                    : "NETWORK_ERROR";
      return { ok: false, errorCode, message: page.message };
    }
    observations.push(...page.observations);
    if (!page.hasMore) return { ok: true, observations };
    if (page.nextCursor === null) {
      // hasMore=true men ingen cursor er selvmodsigende — fail-closed, aldrig en gættet fortsættelse.
      return { ok: false, errorCode: "PAGE_INCONSISTENT", message: "hasMore uden nextCursor" };
    }
    cursor = page.nextCursor;
  }
  return { ok: false, errorCode: "PAGE_INCONSISTENT", message: `over ${MAX_PAGES} sider` };
}

/**
 * Beregner hvilke booking_match_key'er der er "delte" — enten dublerede
 * inden for DENNE batch, eller allerede brugt af en anden, allerede
 * persisteret deal_key. Beregnes FØR selve klassifikationen, fordi
 * afgørelsen kræver kendskab til hele batchen/tabellen, ikke én deal ad
 * gangen (classify.ts er bevidst uvidende om andre deals).
 */
function computeSharedBookingMatchKeys(
  candidateKeys: { dealKey: string; bookingMatchKey: string }[],
  alreadyUsedElsewhere: ReadonlySet<string>,
): Set<string> {
  const countInBatch = new Map<string, number>();
  for (const c of candidateKeys) {
    countInBatch.set(c.bookingMatchKey, (countInBatch.get(c.bookingMatchKey) ?? 0) + 1);
  }
  const shared = new Set<string>();
  for (const [key, count] of countInBatch) {
    if (count > 1) shared.add(key);
  }
  for (const key of alreadyUsedElsewhere) shared.add(key);
  return shared;
}

export async function runConversionSync(
  hubspot: HubSpotReadAdapter,
  persistence: ConversionPersistence,
  options: { dealKeySecret: string; bookingMatchSecret: string; now?: Date } = {
    dealKeySecret: "",
    bookingMatchSecret: "",
  },
): Promise<SyncRunOutcome> {
  const now = options.now ?? new Date();

  const measurement = await persistence.loadMeasurementState();
  if (!measurement || measurement.status !== "ACTIVE" || !measurement.measurementStartedAt) {
    // Gate B1's tilstand: målingen er ikke startet. Sync-motoren skal ALDRIG
    // klassificere noget uden et frosset, godkendt nulpunkt — det ville
    // netop være den skjulte historiske backfill Gate A forbød.
    const outcome: SyncRunOutcome = {
      ok: false,
      errorCode: "CONTRACT_DRIFT",
      message: "målingen er ikke ACTIVE (measurement_started_at mangler) — sync afvist",
    };
    await persistence.recordSyncRun({
      status: "FAILED",
      contractVersion: measurement?.contractVersion ?? CONTRACT_VERSION,
      errorCode: outcome.errorCode,
      message: outcome.message,
    });
    return outcome;
  }

  const contract = await hubspot.confirmStageContract();
  if (!contract.ok) {
    await persistence.recordSyncRun({
      status: "FAILED",
      contractVersion: measurement.contractVersion,
      errorCode: "CONTRACT_DRIFT",
      message: contract.reason,
    });
    return { ok: false, errorCode: "CONTRACT_DRIFT", message: contract.reason };
  }

  const readResult = await readAllDeals(hubspot);
  if (!readResult.ok) {
    await persistence.recordSyncRun({
      status: "FAILED",
      contractVersion: measurement.contractVersion,
      errorCode: readResult.errorCode,
      message: readResult.message,
    });
    return { ok: false, errorCode: readResult.errorCode, message: readResult.message };
  }

  const dealKeyFn = (rawId: string) => computeDealKey(rawId, options.dealKeySecret);
  // Genbruger Analytics Bridge-kontrakten direkte (Issue #45) — samme HMAC-
  // opskrift. dealKey.ts's validateBookingNumber har allerede normaliseret,
  // så `computeBookingKeyForConversion` her tager et allerede-normaliseret
  // tal-streng-input, ligesom `normalizeBookingNo` selv er et no-op på den.
  const bookingMatchKeyFn = (normalized: string) =>
    computeBookingKeyForConversion(normalized, options.bookingMatchSecret);

  const travelPlanIndex = await persistence.loadTravelPlanIndex();
  const dealKeys = readResult.observations.map((o) => dealKeyFn(o.rawDealId));
  const existingStates = await persistence.loadExistingCohortStates(dealKeys);
  const alreadyUsedKeys = await persistence.loadUsedBookingMatchKeys();

  // Første pas: find kandidat-booking_match_key'er for deals der ville
  // kvalificere sig til optagelse i DENNE kørsel (dvs. ikke allerede
  // terminale), så delte referencer inden for batchen kan opdages FØR
  // klassifikationen af den enkelte deal.
  const candidateKeys: { dealKey: string; bookingMatchKey: string }[] = [];
  readResult.observations.forEach((obs, i) => {
    const dealKey = dealKeys[i];
    const existing = existingStates.get(dealKey) ?? null;
    const isTerminal =
      existing &&
      (existing.eligibilityStatus === "ENROLLED" ||
        existing.eligibilityStatus === "EXCLUDED" ||
        existing.eligibilityStatus === "PRE_START_EXISTING");
    if (isTerminal) return;
    if (obs.everQualifiedAt === null) return;
    if (obs.everQualifiedAt.getTime() < measurement.measurementStartedAt!.getTime()) return;
    const validation = validateBookingNumber(obs.bookingNumberRaw);
    if (validation.kind !== "valid") return;
    candidateKeys.push({ dealKey, bookingMatchKey: bookingMatchKeyFn(validation.normalized) });
  });
  const sharedBookingMatchKeys = computeSharedBookingMatchKeys(candidateKeys, alreadyUsedKeys);

  const classified: ClassifiedDealResult[] = readResult.observations.map((obs, i) => {
    const dealKey = dealKeys[i];
    return reduceDealCohort({
      measurementStartedAt: measurement.measurementStartedAt!,
      observedAt: now,
      observation: obs,
      existing: existingStates.get(dealKey) ?? null,
      computeDealKey: dealKeyFn,
      computeBookingMatchKey: bookingMatchKeyFn,
      travelPlanIndex,
      sharedBookingMatchKeys,
      contractVersion: measurement.contractVersion,
    });
  });

  const writeResult = await persistence.upsertCohortRows(classified);
  if (!writeResult.ok) {
    await persistence.recordSyncRun({
      status: "FAILED",
      contractVersion: measurement.contractVersion,
      errorCode: "UNKNOWN",
      message: writeResult.message,
    });
    return { ok: false, errorCode: "UNKNOWN", message: writeResult.message };
  }

  const enrolled = classified.filter((r) => r.eligibilityStatus === "ENROLLED").length;
  const excluded = classified.filter((r) => r.eligibilityStatus === "EXCLUDED").length;
  const booked = classified.filter((r) => r.outcomeStatus === "BOOKED").length;

  await persistence.recordSyncRun({
    status: "SUCCEEDED",
    contractVersion: measurement.contractVersion,
    deals: { observed: classified.length, enrolled, excluded, booked },
  });

  return { ok: true, observed: classified.length, enrolled, excluded, booked };
}
