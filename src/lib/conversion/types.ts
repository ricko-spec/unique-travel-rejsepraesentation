// Vision 3.0 Fase 5, Gate B (Issue #80) — delte typer for konverterings-
// målingen. Rene typer/kontrakter, ingen runtime-imports her (samme princip
// som sales-overview-types.ts), så både sync-motor, persistence og admin-UI
// kan dele dem uden at trække tunge afhængigheder ind hvor de ikke skal.

export type EligibilityStatus = "PRE_START_EXISTING" | "ELIGIBLE_PENDING" | "ENROLLED" | "EXCLUDED";

export type ExclusionReason =
  | "MISSING_BOOKING_NO"
  | "INVALID_BOOKING_NO_FORMAT"
  | "SHARED_BOOKING_REFERENCE"
  | "CONTRACT_DRIFT";

export type ExposureGroup = "ONLINE" | "PDF_ONLY";

export type OutcomeStatus = "NOT_BOOKED" | "BOOKED";

/**
 * Én deals observerede tilstand ved denne sync, fra den read-only HubSpot-
 * adapter. `everQualifiedAt` er den TIDLIGSTE kendte overgang til stage
 * STAGE_QUOTE_SENT ELLER STAGE_UPDATED_QUOTE (aldrig den seneste) — det er
 * netop det der garanterer at "Opdateret tilbud" aldrig kan nulstille
 * kohortestarten: minimum, ikke maksimum, over hele den kendte historik.
 * `null` betyder dealen aldrig har passeret denne tærskel (Screened eller
 * tidligere).
 */
export type HubSpotDealObservation = {
  rawDealId: string;
  everQualifiedAt: Date | null;
  bookingNumberRaw: string | null;
  dealStatusRaw: string | null;
  hubspotClosed: boolean;
  hubspotClosedWon: boolean;
  /** HubSpots `closedate`, hvis sat — bruges som det bedste kendte "booket"-tidspunkt. */
  closedAtRaw: Date | null;
};

/** Den persisterede tilstand for én deal, som den så ud FØR denne sync. `null` = aldrig set før. */
export type ExistingCohortState = {
  firstSeenAt: Date;
  eligibilityStatus: EligibilityStatus;
  exclusionReason: ExclusionReason | null;
  firstQualifiedObservationAt: Date | null;
  exposureGroup: ExposureGroup | null;
  bookingMatchKey: string | null;
  outcomeStatus: OutcomeStatus;
  firstBookedAt: Date | null;
  lostObservedAt: Date | null;
} | null;

/** Resultatet af klassifikationen for én deal — det der (idempotent) upsertes. */
export type ClassifiedDealResult = {
  dealKey: string;
  bookingMatchKey: string | null;
  firstSeenAt: Date;
  firstQualifiedObservationAt: Date | null;
  exposureGroup: ExposureGroup | null;
  exposureFrozenAt: Date | null;
  eligibilityStatus: EligibilityStatus;
  exclusionReason: ExclusionReason | null;
  outcomeStatus: OutcomeStatus;
  firstBookedAt: Date | null;
  lostObservedAt: Date | null;
  contractVersion: number;
};

/** Rå indeks over eksisterende online rejseplaner, kun de felter der er nødvendige (ingen kundedata). */
export type TravelPlanIndexEntry = { createdAt: Date };
export type TravelPlanIndex = ReadonlyMap<string, TravelPlanIndexEntry>;

export type MeasurementStatus = "NOT_STARTED" | "ACTIVE" | "PAUSED";

export type MeasurementState = {
  status: MeasurementStatus;
  contractVersion: number;
  measurementStartedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
};

export type SyncRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export type SyncRunErrorCode =
  | "CONTRACT_DRIFT"
  | "HTTP_401"
  | "HTTP_403"
  | "HTTP_429"
  | "HTTP_5XX"
  | "NETWORK_ERROR"
  | "PAGE_INCONSISTENT"
  | "TOTAL_MISMATCH"
  | "UNKNOWN";

export type SyncRunResult =
  | {
      ok: true;
      dealsObserved: number;
      dealsEnrolled: number;
      dealsExcluded: number;
      dealsBooked: number;
    }
  | { ok: false; errorCode: SyncRunErrorCode; message: string };
