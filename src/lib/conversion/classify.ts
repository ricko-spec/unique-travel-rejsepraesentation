// Vision 3.0 Fase 5, Gate B (Issue #80) — ren, testbar klassifikations-
// motor. INGEN imports fra next/*, Supabase eller HubSpot-klienter her —
// hele beslutningslogikken kan unit-testes med almindelige objekter/Maps,
// samme princip som trip-visit.ts/section-engagement.ts.
//
// Dette er en REDUCER: given den forrige persisterede tilstand (eller
// `null` hvis dealen aldrig er set før) og en ny observation, beregnes den
// NÆSTE tilstand. Terminale tilstande (ENROLLED, EXCLUDED,
// PRE_START_EXISTING) ændrer ALDRIG eligibility/eksponering/kohortestart
// igen — kun outcome (booket/lost) kan opdateres videre. Det er selve
// mekanismen bag "eksisterende frossen gruppe kan aldrig ændres gennem
// normal sync" og "en deal optages præcis én gang".

import { BOOKED_DEAL_STATUS_VALUES } from "./contract";
import { validateBookingNumber, type BookingNumberValidation } from "./dealKey";
import type {
  ClassifiedDealResult,
  ExclusionReason,
  ExistingCohortState,
  ExposureGroup,
  HubSpotDealObservation,
  OutcomeStatus,
  TravelPlanIndex,
} from "./types";

export type ReduceDealCohortInput = {
  measurementStartedAt: Date;
  observedAt: Date;
  observation: HubSpotDealObservation;
  existing: ExistingCohortState;
  computeDealKey: (rawDealId: string) => string;
  computeBookingMatchKey: (normalizedBookingNo: string) => string;
  travelPlanIndex: TravelPlanIndex;
  /**
   * booking_match_key-værdier der allerede er "brugt" af en ANDEN deal —
   * enten en dublet inden for samme sync-batch, eller allerede persisteret
   * på en anden deal_key. Beregnes af syncEngine.ts FØR klassifikationen af
   * de enkelte deals, fordi det kræver kendskab til hele batchen/den
   * eksisterende tabel, ikke kun denne ene deal.
   */
  sharedBookingMatchKeys: ReadonlySet<string>;
  contractVersion: number;
};

function isBookedStatus(dealStatusRaw: string | null): boolean {
  if (dealStatusRaw == null) return false;
  return BOOKED_DEAL_STATUS_VALUES.includes(dealStatusRaw);
}

/**
 * Outcome-reducer, uafhængig af eligibility-tilstanden — booket/lost kan
 * observeres og opdateres for enhver deal, uanset om den er ENROLLED,
 * ELIGIBLE_PENDING eller PRE_START_EXISTING. Aldrig baglæns: en allerede
 * BOOKED-markeret deal kan ikke blive NOT_BOOKED igen, og et allerede sat
 * lostObservedAt ryddes aldrig.
 */
function reduceOutcome(
  observation: HubSpotDealObservation,
  observedAt: Date,
  existing: ExistingCohortState,
): { outcomeStatus: OutcomeStatus; firstBookedAt: Date | null; lostObservedAt: Date | null } {
  let outcomeStatus: OutcomeStatus = existing?.outcomeStatus ?? "NOT_BOOKED";
  let firstBookedAt = existing?.firstBookedAt ?? null;
  let lostObservedAt = existing?.lostObservedAt ?? null;

  const nowBooked = isBookedStatus(observation.dealStatusRaw);
  if (outcomeStatus === "NOT_BOOKED" && nowBooked) {
    outcomeStatus = "BOOKED";
    firstBookedAt = observation.closedAtRaw ?? observedAt;
  }

  if (
    lostObservedAt === null &&
    outcomeStatus !== "BOOKED" &&
    observation.hubspotClosed &&
    !observation.hubspotClosedWon
  ) {
    lostObservedAt = observedAt;
  }

  return { outcomeStatus, firstBookedAt, lostObservedAt };
}

function resolveExposure(
  bookingMatchKey: string,
  asOf: Date,
  travelPlanIndex: TravelPlanIndex,
): ExposureGroup {
  const entry = travelPlanIndex.get(bookingMatchKey);
  if (entry && entry.createdAt.getTime() <= asOf.getTime()) return "ONLINE";
  return "PDF_ONLY";
}

/**
 * Forsøger at optage en NYT kvalificeret deal (existing var null eller
 * ELIGIBLE_PENDING). Returnerer enten en ENROLLED-tilstand (med frosset
 * eksponering) eller en EXCLUDED-tilstand med en eksplicit årsagskode —
 * ALDRIG en stiltiende PDF_ONLY ved manglende/ugyldigt/delt bookingnummer.
 */
function attemptEnrollment(input: {
  qualifiedAt: Date;
  bookingNumberRaw: string | null;
  computeBookingMatchKey: (normalized: string) => string;
  travelPlanIndex: TravelPlanIndex;
  sharedBookingMatchKeys: ReadonlySet<string>;
}): {
  eligibilityStatus: "ENROLLED" | "EXCLUDED";
  exclusionReason: ExclusionReason | null;
  exposureGroup: ExposureGroup | null;
  exposureFrozenAt: Date | null;
  bookingMatchKey: string | null;
} {
  const validation: BookingNumberValidation = validateBookingNumber(input.bookingNumberRaw);

  if (validation.kind === "missing") {
    return {
      eligibilityStatus: "EXCLUDED",
      exclusionReason: "MISSING_BOOKING_NO",
      exposureGroup: null,
      exposureFrozenAt: null,
      bookingMatchKey: null,
    };
  }
  if (validation.kind === "invalid-format") {
    return {
      eligibilityStatus: "EXCLUDED",
      exclusionReason: "INVALID_BOOKING_NO_FORMAT",
      exposureGroup: null,
      exposureFrozenAt: null,
      bookingMatchKey: null,
    };
  }

  const bookingMatchKey = input.computeBookingMatchKey(validation.normalized);

  if (input.sharedBookingMatchKeys.has(bookingMatchKey)) {
    return {
      eligibilityStatus: "EXCLUDED",
      exclusionReason: "SHARED_BOOKING_REFERENCE",
      exposureGroup: null,
      exposureFrozenAt: null,
      // Bevidst IKKE gemt: en delt reference er per definition tvetydig, og
      // vi vil ikke risikere senere at "arve" en forkert nøgle til denne deal.
      bookingMatchKey: null,
    };
  }

  const exposureGroup = resolveExposure(bookingMatchKey, input.qualifiedAt, input.travelPlanIndex);
  return {
    eligibilityStatus: "ENROLLED",
    exclusionReason: null,
    exposureGroup,
    exposureFrozenAt: input.qualifiedAt,
    bookingMatchKey,
  };
}

/**
 * Den fulde reducer for én deal. Deterministisk og sideeffektfri: samme
 * input giver altid samme output, uanset hvor mange gange den kaldes
 * (genkørsels-sikkerhed er derfor en egenskab af selve funktionen, ikke
 * kun af persistence-lagets idempotente upsert).
 */
export function reduceDealCohort(input: ReduceDealCohortInput): ClassifiedDealResult {
  const dealKey = input.computeDealKey(input.observation.rawDealId);
  const outcome = reduceOutcome(input.observation, input.observedAt, input.existing);

  // Terminale eligibility-tilstande: eksponering/kohortestart/årsag
  // ændres ALDRIG igen, uanset ny observation. Kun outcome opdateres.
  if (
    input.existing &&
    (input.existing.eligibilityStatus === "ENROLLED" ||
      input.existing.eligibilityStatus === "EXCLUDED" ||
      input.existing.eligibilityStatus === "PRE_START_EXISTING")
  ) {
    return {
      dealKey,
      bookingMatchKey: input.existing.bookingMatchKey,
      firstSeenAt: input.existing.firstSeenAt,
      firstQualifiedObservationAt: input.existing.firstQualifiedObservationAt,
      exposureGroup: input.existing.exposureGroup,
      exposureFrozenAt: input.existing.firstQualifiedObservationAt,
      eligibilityStatus: input.existing.eligibilityStatus,
      exclusionReason: input.existing.exclusionReason,
      outcomeStatus: outcome.outcomeStatus,
      firstBookedAt: outcome.firstBookedAt,
      lostObservedAt: outcome.lostObservedAt,
      contractVersion: input.contractVersion,
    };
  }

  const everQualifiedAt = input.observation.everQualifiedAt;

  // Aldrig set før, og aldrig kvalificeret endnu (eller stadig ikke
  // kvalificeret, for en tidligere ELIGIBLE_PENDING-deal) => forbliver
  // ELIGIBLE_PENDING. Kan optages på en senere sync.
  if (everQualifiedAt === null) {
    return {
      dealKey,
      bookingMatchKey: null,
      firstSeenAt: input.existing?.firstSeenAt ?? input.observedAt,
      firstQualifiedObservationAt: null,
      exposureGroup: null,
      exposureFrozenAt: null,
      eligibilityStatus: "ELIGIBLE_PENDING",
      exclusionReason: null,
      outcomeStatus: outcome.outcomeStatus,
      firstBookedAt: outcome.firstBookedAt,
      lostObservedAt: outcome.lostObservedAt,
      contractVersion: input.contractVersion,
    };
  }

  // Kvalificeret FØR målingens nulpunkt => permanent udelukket fra selve
  // konverteringsmålingen (forhindrer skjult historisk backfill), men
  // rækken bevares til audit/datakvalitet.
  if (everQualifiedAt.getTime() < input.measurementStartedAt.getTime()) {
    return {
      dealKey,
      bookingMatchKey: null,
      firstSeenAt: input.existing?.firstSeenAt ?? input.observedAt,
      firstQualifiedObservationAt: everQualifiedAt,
      exposureGroup: null,
      exposureFrozenAt: null,
      eligibilityStatus: "PRE_START_EXISTING",
      exclusionReason: null,
      outcomeStatus: outcome.outcomeStatus,
      firstBookedAt: outcome.firstBookedAt,
      lostObservedAt: outcome.lostObservedAt,
      contractVersion: input.contractVersion,
    };
  }

  // Kvalificeret PÅ ELLER EFTER målingens nulpunkt => forsøg optagelse
  // præcis nu, ÉN gang. Fryser eksponeringen for altid.
  const enrollment = attemptEnrollment({
    qualifiedAt: everQualifiedAt,
    bookingNumberRaw: input.observation.bookingNumberRaw,
    computeBookingMatchKey: input.computeBookingMatchKey,
    travelPlanIndex: input.travelPlanIndex,
    sharedBookingMatchKeys: input.sharedBookingMatchKeys,
  });

  return {
    dealKey,
    bookingMatchKey: enrollment.bookingMatchKey,
    firstSeenAt: input.existing?.firstSeenAt ?? input.observedAt,
    firstQualifiedObservationAt: everQualifiedAt,
    exposureGroup: enrollment.exposureGroup,
    exposureFrozenAt: enrollment.exposureFrozenAt,
    eligibilityStatus: enrollment.eligibilityStatus,
    exclusionReason: enrollment.exclusionReason,
    outcomeStatus: outcome.outcomeStatus,
    firstBookedAt: outcome.firstBookedAt,
    lostObservedAt: outcome.lostObservedAt,
    contractVersion: input.contractVersion,
  };
}
