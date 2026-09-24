// Vision 3.0 Fase 5, Gate B (Issue #80) — delte typer for konverterings-
// målingen. Rene typer/kontrakter, ingen runtime-imports her (samme princip
// som sales-overview-types.ts), så både sync-motor, persistence og admin-UI
// kan dele dem uden at trække tunge afhængigheder ind hvor de ikke skal.

export type EligibilityStatus = "PRE_START_EXISTING" | "ELIGIBLE_PENDING" | "ENROLLED" | "EXCLUDED";

export const EXCLUSION_REASONS = [
  "MISSING_BOOKING_NO",
  "INVALID_BOOKING_NO_FORMAT",
  "SHARED_BOOKING_REFERENCE",
  "CLOSED_BEFORE_QUALIFIED_OBSERVATION",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type ExposureGroup = "ONLINE" | "PDF_ONLY";

export type OutcomeStatus = "NOT_BOOKED" | "BOOKED";

/**
 * Én deals AKTUELLE tilstand ved denne sync, fra den read-only HubSpot-
 * adapter. Bevidst INGEN historik (ingen "ever qualified at", ingen
 * closedate): Gate A erklærede historisk rekonstruktion UNUSABLE, så
 * kvalifikation og booking afgøres alene af hvad den daglige sync observerer.
 */
export type HubSpotDealObservation = {
  rawDealId: string;
  pipelineId: string;
  dealStageId: string;
  bookingNumberRaw: string | null;
  dealStatusRaw: string | null;
  hubspotClosed: boolean;
  hubspotClosedWon: boolean;
};

/** Den persisterede tilstand for én deal (conversion_deal_cohort-rækken). */
export type CohortState = {
  firstSeenAt: Date;
  lastObservedAt: Date;
  eligibilityStatus: EligibilityStatus;
  exclusionReason: ExclusionReason | null;
  /** Kohortestart: `observedAt` for den FØRSTE prospektive kvalificerede observation. Aldrig historisk. */
  firstQualifiedObservationAt: Date | null;
  exposureGroup: ExposureGroup | null;
  exposureFrozenAt: Date | null;
  bookingMatchKey: string | null;
  /** Sat én gang, når en ENROLLED deals frosne bookingreference senere viser sig delt med en anden deal. */
  bookingConflictDetectedAt: Date | null;
  outcomeStatus: OutcomeStatus;
  firstBookedAt: Date | null;
  lostObservedAt: Date | null;
  outcomeConflictObservedAt: Date | null;
  contractVersion: number;
};

export type ExistingCohortState = CohortState | null;

/** Resultatet af klassifikationen for én deal — det der (idempotent, atomart) committes. */
export type ClassifiedDealResult = CohortState & { dealKey: string };

/** Indeks over eksisterende online rejseplaner: booking_match_key → tidligste trips.created_at. Ingen kundedata. */
export type TravelPlanIndexEntry = { createdAt: Date };
export type TravelPlanIndex = ReadonlyMap<string, TravelPlanIndexEntry>;

export type MeasurementStatus = "NOT_STARTED" | "ACTIVE" | "PAUSED";

export type MeasurementState = {
  status: MeasurementStatus;
  contractVersion: number;
  /** NULL med status ACTIVE = aktiveret, afventer den officielle baseline-sync (Gate D). */
  measurementStartedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
};

export type SyncRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export const SYNC_RUN_ERROR_CODES = [
  "CONFIG_INVALID",
  "NOT_ACTIVE",
  "CONTRACT_VERSION_MISMATCH",
  "CONTRACT_INCOMPLETE",
  "CONTRACT_DRIFT",
  "HTTP_401",
  "HTTP_403",
  "HTTP_429",
  "HTTP_5XX",
  "NETWORK_ERROR",
  "PAGE_INCONSISTENT",
  "TOTAL_MISMATCH",
  "DUPLICATE_DEAL",
  "EMPTY_SOURCE",
  "SOURCE_READ_FAILED",
  "SYNC_ALREADY_RUNNING",
  "COMMIT_REJECTED",
  "ABANDONED",
  "UNKNOWN",
] as const;
export type SyncRunErrorCode = (typeof SYNC_RUN_ERROR_CODES)[number];
