// Vision 3.0 Fase 5, Gate B (Issue #80) — ren, testbar klassifikations-
// motor. INGEN imports fra next/*, Supabase eller HubSpot-klienter her —
// hele beslutningslogikken kan unit-testes med almindelige objekter/Maps,
// samme princip som trip-visit.ts/section-engagement.ts.
//
// PROSPEKTIV MODEL (PR #81 review-runde 1, fund 1): kvalifikation afgøres
// udelukkende af dealens AKTUELLE stage, klassificeret af den versionerede
// PIPELINE_STAGE_CONTRACT. Der bruges ingen dealstage-historik og ingen
// HubSpot-tidsstempler som facit:
//
//   · Baseline-sync (measurement_started_at endnu ikke sat): aktuelt
//     kvalificerede/lukkede deals ⇒ PRE_START_EXISTING; aktuelt åbne
//     PRE_QUOTE-deals ⇒ ELIGIBLE_PENDING.
//   · Efter baseline: en ny eller ELIGIBLE_PENDING deal, der NU observeres i
//     en QUOTE_OR_LATER-stage, optages præcis én gang med kohortestart =
//     denne syncs `observedAt`. Eksponeringen fryses samtidig.
//   · Terminale tilstande (ENROLLED, EXCLUDED, PRE_START_EXISTING) ændrer
//     ALDRIG eligibility/eksponering/kohortestart igen — "Opdateret tilbud"
//     eller andre senere stages kan derfor intet nulstille. Kun udfald og
//     (for ENROLLED) en senere opdaget bookingkonflikt kan tilføjes.

import {
  PIPELINE_STAGE_CONTRACT,
  classifyOutcomeSignal,
  type PipelineStageContract,
  type StageClass,
} from "./contract";
import type { BookingNumberValidation } from "./dealKey";
import type {
  ClassifiedDealResult,
  CohortState,
  ExistingCohortState,
  ExposureGroup,
  HubSpotDealObservation,
  OutcomeStatus,
  TravelPlanIndex,
} from "./types";

export type ValidatedObservation = {
  stageClass: StageClass;
  outcome: { booked: boolean; lostObserved: boolean; conflict: boolean };
};

/**
 * Validerer én observation mod den versionerede kontrakt. Enhver afvigelse
 * (forkert pipeline, ukendt stage, lukke-flag der modsiger stage-klassen,
 * umulig flag-kombination) er KONTRAKTDRIFT — sync-motoren afbryder da HELE
 * kørslen fail-closed; en enkelt deal "gættes" aldrig på plads.
 */
export function validateObservation(
  obs: HubSpotDealObservation,
  contract: PipelineStageContract = PIPELINE_STAGE_CONTRACT,
): { ok: true; value: ValidatedObservation } | { ok: false } {
  if (obs.pipelineId !== contract.pipelineId) return { ok: false };
  const stageClass = Object.prototype.hasOwnProperty.call(contract.stages, obs.dealStageId)
    ? contract.stages[obs.dealStageId]
    : undefined;
  if (!stageClass) return { ok: false };
  if (stageClass === "PRE_QUOTE" && obs.hubspotClosed) return { ok: false };
  if (stageClass === "CLOSED_AMBIGUOUS" && !obs.hubspotClosed) return { ok: false };
  const signal = classifyOutcomeSignal(obs);
  if (signal.kind === "contract-drift") return { ok: false };
  return {
    ok: true,
    value: {
      stageClass,
      outcome: { booked: signal.booked, lostObserved: signal.lostObserved, conflict: signal.conflict },
    },
  };
}

/**
 * Verificerer kontrakten mod pipelinens LIVE stage-liste (fra adapterens
 * confirmStageContract). Hver live-stage skal være klassificeret, og hver
 * klassificeret stage skal findes live — ellers er "Tilbud sendt eller
 * senere" ikke entydigt, og kørslen skal fejle lukket.
 */
export function verifyStageContract(
  live: { pipelineId: string; stageIds: readonly string[] },
  contract: PipelineStageContract = PIPELINE_STAGE_CONTRACT,
): { ok: true } | { ok: false; code: "CONTRACT_DRIFT" | "CONTRACT_INCOMPLETE" } {
  if (live.pipelineId !== contract.pipelineId) return { ok: false, code: "CONTRACT_DRIFT" };
  const liveSet = new Set(live.stageIds);
  if (liveSet.size !== live.stageIds.length) return { ok: false, code: "CONTRACT_DRIFT" };
  for (const id of Object.keys(contract.stages)) {
    if (!liveSet.has(id)) return { ok: false, code: "CONTRACT_DRIFT" };
  }
  for (const id of live.stageIds) {
    if (!Object.prototype.hasOwnProperty.call(contract.stages, id)) {
      return { ok: false, code: contract.complete ? "CONTRACT_DRIFT" : "CONTRACT_INCOMPLETE" };
    }
  }
  if (!contract.complete) return { ok: false, code: "CONTRACT_INCOMPLETE" };
  return { ok: true };
}

export function isTerminal(state: ExistingCohortState): boolean {
  return (
    state !== null &&
    (state.eligibilityStatus === "ENROLLED" ||
      state.eligibilityStatus === "EXCLUDED" ||
      state.eligibilityStatus === "PRE_START_EXISTING")
  );
}

/**
 * Finder bookingreferencer der er knyttet til MERE END ÉN deal. Input er
 * (dealKey, bookingMatchKey)-par fra både de frosne nøgler på persisterede
 * rækker og de aktuelle, gyldige bookingnumre i hele den observerede batch.
 * En reference er tvetydig for ALLE berørte deals, uanset rækkefølge.
 */
export function computeSharedBookingMatchKeys(
  pairs: Iterable<{ dealKey: string; bookingMatchKey: string }>,
): Set<string> {
  const dealsPerKey = new Map<string, Set<string>>();
  for (const p of pairs) {
    let set = dealsPerKey.get(p.bookingMatchKey);
    if (!set) {
      set = new Set();
      dealsPerKey.set(p.bookingMatchKey, set);
    }
    set.add(p.dealKey);
  }
  const shared = new Set<string>();
  for (const [key, deals] of dealsPerKey) if (deals.size > 1) shared.add(key);
  return shared;
}

function reduceOutcome(
  existing: ExistingCohortState,
  signal: ValidatedObservation["outcome"],
  observedAt: Date,
): {
  outcomeStatus: OutcomeStatus;
  firstBookedAt: Date | null;
  lostObservedAt: Date | null;
  outcomeConflictObservedAt: Date | null;
} {
  // Booket kan gå fra falsk til sand, aldrig tilbage; alle tidsstempler er
  // "første observation" og ændres aldrig, når de først er sat.
  const alreadyBooked = existing?.outcomeStatus === "BOOKED";
  const booked = alreadyBooked || signal.booked;
  return {
    outcomeStatus: booked ? "BOOKED" : "NOT_BOOKED",
    firstBookedAt: existing?.firstBookedAt ?? (signal.booked ? observedAt : null),
    lostObservedAt: existing?.lostObservedAt ?? (!booked && signal.lostObserved ? observedAt : null),
    outcomeConflictObservedAt: existing?.outcomeConflictObservedAt ?? (signal.conflict ? observedAt : null),
  };
}

function resolveExposure(bookingMatchKey: string, asOf: Date, index: TravelPlanIndex): ExposureGroup {
  const entry = index.get(bookingMatchKey);
  if (entry && entry.createdAt.getTime() <= asOf.getTime()) return "ONLINE";
  return "PDF_ONLY";
}

export type ReduceDealCohortInput = {
  dealKey: string;
  observedAt: Date;
  /** Sand for den ene, officielle baseline-kørsel (measurement_started_at endnu ikke sat). */
  isBaseline: boolean;
  validated: ValidatedObservation;
  booking: BookingNumberValidation;
  /** HMAC-nøglen for det aktuelle bookingnummer — sat hvis og kun hvis `booking.kind === "valid"`. */
  currentBookingMatchKey: string | null;
  existing: ExistingCohortState;
  travelPlanIndex: TravelPlanIndex;
  sharedBookingMatchKeys: ReadonlySet<string>;
  contractVersion: number;
};

/**
 * Den fulde reducer for én OBSERVERET deal. Deterministisk og sideeffektfri:
 * samme input giver altid samme output (genkørsels-sikkerhed er en egenskab
 * af funktionen, ikke kun af persistence-laget).
 */
export function reduceDealCohort(input: ReduceDealCohortInput): ClassifiedDealResult {
  const { existing, observedAt } = input;
  const outcome = reduceOutcome(existing, input.validated.outcome, observedAt);

  if (existing !== null && isTerminal(existing)) {
    const conflictNow =
      existing.eligibilityStatus === "ENROLLED" &&
      existing.bookingMatchKey !== null &&
      input.sharedBookingMatchKeys.has(existing.bookingMatchKey);
    return {
      ...existing,
      dealKey: input.dealKey,
      lastObservedAt: observedAt,
      bookingConflictDetectedAt: existing.bookingConflictDetectedAt ?? (conflictNow ? observedAt : null),
      ...outcome,
      contractVersion: input.contractVersion,
    };
  }

  const base = {
    dealKey: input.dealKey,
    firstSeenAt: existing?.firstSeenAt ?? observedAt,
    lastObservedAt: observedAt,
    bookingConflictDetectedAt: null,
    ...outcome,
    contractVersion: input.contractVersion,
  };
  const none = {
    exclusionReason: null,
    firstQualifiedObservationAt: null,
    exposureGroup: null,
    exposureFrozenAt: null,
    bookingMatchKey: null,
  };
  const stage = input.validated.stageClass;

  if (input.isBaseline) {
    // Baseline: alt der ikke er en åben PRE_QUOTE-deal, var allerede i gang
    // (eller afsluttet) før målingsstart og udelukkes permanent — dette er
    // mekanismen der forhindrer skjult historisk backfill.
    return { ...base, ...none, eligibilityStatus: stage === "PRE_QUOTE" ? "ELIGIBLE_PENDING" : "PRE_START_EXISTING" };
  }

  if (stage === "PRE_QUOTE") return { ...base, ...none, eligibilityStatus: "ELIGIBLE_PENDING" };

  if (stage === "CLOSED_AMBIGUOUS") {
    // Første observation er en lukket stage, der kan være nået før ELLER
    // efter et tilbud. Kan ikke afgøres entydigt ⇒ eksplicit udelukket.
    return {
      ...base,
      ...none,
      eligibilityStatus: "EXCLUDED",
      exclusionReason: "CLOSED_BEFORE_QUALIFIED_OBSERVATION",
    };
  }

  // QUOTE_OR_LATER: første prospektive kvalificerede observation — nu.
  const qualified = { ...base, ...none, firstQualifiedObservationAt: observedAt };
  if (input.booking.kind === "missing") {
    return { ...qualified, eligibilityStatus: "EXCLUDED", exclusionReason: "MISSING_BOOKING_NO" };
  }
  if (input.booking.kind === "invalid-format" || input.currentBookingMatchKey === null) {
    return { ...qualified, eligibilityStatus: "EXCLUDED", exclusionReason: "INVALID_BOOKING_NO_FORMAT" };
  }
  const key = input.currentBookingMatchKey;
  if (input.sharedBookingMatchKeys.has(key)) {
    // Nøglen gemmes (pseudonymiseret), så en senere tredje deal med samme
    // reference også kan opdages som konflikt.
    return { ...qualified, eligibilityStatus: "EXCLUDED", exclusionReason: "SHARED_BOOKING_REFERENCE", bookingMatchKey: key };
  }
  return {
    ...qualified,
    eligibilityStatus: "ENROLLED",
    bookingMatchKey: key,
    exposureGroup: resolveExposure(key, observedAt, input.travelPlanIndex),
    exposureFrozenAt: observedAt,
  };
}

/**
 * ENROLLED-rækker, der IKKE blev observeret i denne sync (fx en deal flyttet
 * ud af pipelinen), men hvis frosne bookingreference nu er delt, skal også
 * markeres som konflikt — ellers ville de blive i de publicerbare tal.
 */
export function markUnobservedConflicts(input: {
  persisted: ReadonlyMap<string, CohortState>;
  observedDealKeys: ReadonlySet<string>;
  sharedBookingMatchKeys: ReadonlySet<string>;
  observedAt: Date;
  contractVersion: number;
}): ClassifiedDealResult[] {
  const out: ClassifiedDealResult[] = [];
  for (const [dealKey, state] of input.persisted) {
    if (input.observedDealKeys.has(dealKey)) continue;
    if (state.eligibilityStatus !== "ENROLLED" || state.bookingConflictDetectedAt !== null) continue;
    if (state.bookingMatchKey === null || !input.sharedBookingMatchKeys.has(state.bookingMatchKey)) continue;
    out.push({ ...state, dealKey, bookingConflictDetectedAt: input.observedAt, contractVersion: input.contractVersion });
  }
  return out;
}
