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
  stageContractViolation,
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
  PostEnrollmentExclusionReason,
  TravelPlanIndex,
} from "./types";

export type ValidatedObservation = {
  stageClass: StageClass;
  /** Stagen ugyldiggør en allerede optaget deal (Dubletter/Test Leads). */
  invalidatesEnrollment?: boolean;
  outcome: { booked: boolean; lostObserved: boolean; conflict: boolean; otherReferenceUnresolved?: boolean };
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
  const entry = Object.prototype.hasOwnProperty.call(contract.stages, obs.dealStageId)
    ? contract.stages[obs.dealStageId]
    : undefined;
  if (!entry) return { ok: false };
  // v3: dealens hs_is_closed skal matche stagens lukke-flag fra live-metadata.
  if (obs.hubspotClosed !== entry.closed) return { ok: false };
  const stageClass = entry.class;
  const signal = classifyOutcomeSignal(obs);
  if (signal.kind === "contract-drift") return { ok: false };
  return {
    ok: true,
    value: {
      stageClass,
      invalidatesEnrollment: entry.invalidatesEnrollment === true,
      outcome: {
        booked: signal.booked,
        lostObserved: signal.lostObserved,
        conflict: signal.conflict,
        otherReferenceUnresolved: signal.otherReferenceUnresolved,
      },
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
  live: { pipelineId: string; stages: readonly { id: string; closed: boolean }[] },
  contract: PipelineStageContract = PIPELINE_STAGE_CONTRACT,
): { ok: true } | { ok: false; code: "CONTRACT_DRIFT" | "CONTRACT_INCOMPLETE" } {
  if (live.pipelineId !== contract.pipelineId) return { ok: false, code: "CONTRACT_DRIFT" };
  if (stageContractViolation(contract)) return { ok: false, code: "CONTRACT_DRIFT" };
  const liveIds = live.stages.map((s) => s.id);
  const liveSet = new Set(liveIds);
  if (liveSet.size !== liveIds.length) return { ok: false, code: "CONTRACT_DRIFT" };
  for (const id of Object.keys(contract.stages)) {
    if (!liveSet.has(id)) return { ok: false, code: "CONTRACT_DRIFT" };
  }
  for (const s of live.stages) {
    if (!Object.prototype.hasOwnProperty.call(contract.stages, s.id)) {
      return { ok: false, code: contract.complete ? "CONTRACT_DRIFT" : "CONTRACT_INCOMPLETE" };
    }
    // v3: et ændret lukke-flag på en kendt stage er kontraktdrift.
    if (contract.stages[s.id].closed !== s.closed) return { ok: false, code: "CONTRACT_DRIFT" };
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

/** Efterfølgende udelukkelse for en ALLEREDE optaget deal (ugyldiggørelse går forud for uafklaret booking). */
function postEnrollmentReasonFor(v: ValidatedObservation): PostEnrollmentExclusionReason | null {
  if (v.invalidatesEnrollment) return "INVALIDATED_DUPLICATE_OR_TEST";
  if (v.outcome.otherReferenceUnresolved) return "BOOKED_OTHER_REFERENCE_UNRESOLVED";
  return null;
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
    const postReason = existing.eligibilityStatus === "ENROLLED" ? postEnrollmentReasonFor(input.validated) : null;
    return {
      ...existing,
      dealKey: input.dealKey,
      lastObservedAt: observedAt,
      bookingConflictDetectedAt: existing.bookingConflictDetectedAt ?? (conflictNow ? observedAt : null),
      // Første efterfølgende udelukkelse vinder og fjernes aldrig; den oprindelige observation røres ikke.
      postEnrollmentExclusionReason: existing.postEnrollmentExclusionReason ?? postReason,
      postEnrollmentExcludedAt: existing.postEnrollmentExcludedAt ?? (postReason ? observedAt : null),
      ...outcome,
      contractVersion: input.contractVersion,
    };
  }

  const base = {
    dealKey: input.dealKey,
    firstSeenAt: existing?.firstSeenAt ?? observedAt,
    lastObservedAt: observedAt,
    bookingConflictDetectedAt: null,
    postEnrollmentExclusionReason: null,
    postEnrollmentExcludedAt: null,
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
    // (CLOSED_NO_QUOTE er lukket ⇒ også PRE_START ved baseline.)
    return { ...base, ...none, eligibilityStatus: stage === "PRE_QUOTE" ? "ELIGIBLE_PENDING" : "PRE_START_EXISTING" };
  }

  // Ingen tilbud sendt (åben PRE_QUOTE eller lukket uden tilbud: Screenet,
  // Dubletter, Test Leads) ⇒ forbliver pending; optages aldrig på denne stage.
  if (stage === "PRE_QUOTE" || stage === "CLOSED_NO_QUOTE") return { ...base, ...none, eligibilityStatus: "ELIGIBLE_PENDING" };

  if (stage === "OUTCOME_WITHOUT_QUOTE_EVIDENCE") {
    // Første observation er en senere fase/et udfald (åben eller lukket), der
    // ikke beviser et observeret "Tilbud sendt" ⇒ eksplicit udelukket. (Årsags-
    // koden er DB-bundet fra migration 013 og dækker også åbne post-salg-stages.)
    return {
      ...base,
      ...none,
      eligibilityStatus: "EXCLUDED",
      exclusionReason: "CLOSED_BEFORE_QUALIFIED_OBSERVATION",
    };
  }

  // QUOTE_OR_LATER: første prospektive kvalificerede observation — nu.
  const qualified = { ...base, ...none, firstQualifiedObservationAt: observedAt };
  if (outcome.firstBookedAt !== null && outcome.firstBookedAt.getTime() < observedAt.getTime()) {
    // Bookingen blev observeret FØR tilbuddet (fx UT-solgt-status på en
    // PRE_QUOTE-deal). Den kan aldrig være en konvertering fra tilbuddet ⇒
    // eksplicit udelukket (review-runde 2, fund 1). Samme sync = interval 0
    // og er IKKE "før".
    return { ...qualified, eligibilityStatus: "EXCLUDED", exclusionReason: "BOOKED_BEFORE_QUALIFIED_OBSERVATION" };
  }
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
  // Optages med "Solgt (andet booking nr.)" allerede sat ⇒ markeres i samme observation.
  const enrollReason = input.validated.outcome.otherReferenceUnresolved ? ("BOOKED_OTHER_REFERENCE_UNRESOLVED" as const) : null;
  return {
    ...qualified,
    postEnrollmentExclusionReason: enrollReason,
    postEnrollmentExcludedAt: enrollReason ? observedAt : null,
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
