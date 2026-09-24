// Vision 3.0 Fase 5, Gate B (Issue #80) — ren aggregeringsfunktion til
// adminvisningen. Tager KUN allerede-pseudonymiserede kohorterækker (ingen
// deal-id'er, ingen bookingnumre) og bygger et privacy-sikkert DTO: celler
// under SMALL_CELL_THRESHOLD undertrykkes, og KOMPLEMENTÆR undertrykkelse
// forhindrer at man kan udlede en lille skjult celle fra de andre synlige
// tal (fx tæller skjult, men nævner og "de andre" antal afslører den alligevel).
//
// INGEN database-/HubSpot-imports her — ren funktion af et array rækker +
// et "as of"-tidspunkt, fuldt unit-testbar.

import { MATURITY_WINDOWS_DAYS, SMALL_CELL_THRESHOLD, type MaturityWindowDays } from "./contract";
import type { ExposureGroup, MeasurementState, OutcomeStatus } from "./types";

export type CohortAggregateRow = {
  eligibilityStatus: "PRE_START_EXISTING" | "ELIGIBLE_PENDING" | "ENROLLED" | "EXCLUDED";
  exclusionReason: "MISSING_BOOKING_NO" | "INVALID_BOOKING_NO_FORMAT" | "SHARED_BOOKING_REFERENCE" | "CONTRACT_DRIFT" | null;
  firstQualifiedObservationAt: Date | null;
  exposureGroup: ExposureGroup | null;
  outcomeStatus: OutcomeStatus;
  firstBookedAt: Date | null;
  lostObservedAt: Date | null;
};

export type WindowCell = {
  denominator: number | null;
  numerator: number | null;
  ratePercent: number | null;
  suppressed: boolean;
};

export type GroupStats = {
  /** Totalt antal ENROLLED deals i gruppen — null hvis under tærsklen (small-cell). */
  totalEnrolled: number | null;
  windows: Record<MaturityWindowDays, WindowCell>;
};

export type MonthlyTrendPoint = {
  month: string; // "YYYY-MM", kohortemåned (baseret på first_qualified_observation_at)
  online: { enrolled: number | null; booked: number | null };
  pdfOnly: { enrolled: number | null; booked: number | null };
};

export type DataQuality = {
  totalObserved: number;
  excludedByReason: Record<"MISSING_BOOKING_NO" | "INVALID_BOOKING_NO_FORMAT" | "SHARED_BOOKING_REFERENCE" | "CONTRACT_DRIFT", number>;
  preStartExistingCount: number;
  eligiblePendingCount: number;
  lostObservedCount: number;
};

export type ConversionAggregate = {
  measurement: MeasurementState;
  hasPublishableComparison: boolean;
  groups: { ONLINE: GroupStats; PDF_ONLY: GroupStats };
  differencePercentPoints: Record<MaturityWindowDays, number | null>;
  monthlyTrend: MonthlyTrendPoint[];
  dataQuality: DataQuality;
};

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000);
}

function isMature(cohortStart: Date, asOf: Date, windowDays: number): boolean {
  return daysBetween(cohortStart, asOf) >= windowDays;
}

function bookedWithinWindow(cohortStart: Date, firstBookedAt: Date | null, windowDays: number): boolean {
  if (!firstBookedAt) return false;
  return daysBetween(cohortStart, firstBookedAt) <= windowDays;
}

/**
 * Anvender small-cell + KOMPLEMENTÆR undertrykkelse på én (tæller, nævner)-
 * celle. Komplementær: hvis enten tælleren ELLER dens komplement (nævner −
 * tæller) er under tærsklen, skjules BÅDE tæller, nævner og procent — ellers
 * kunne den skjulte lille celle udledes fra den synlige nævner minus den
 * synlige komplement-tæller.
 */
function suppressCell(numerator: number, denominator: number): WindowCell {
  if (denominator === 0) {
    return { denominator: null, numerator: null, ratePercent: null, suppressed: true };
  }
  const complement = denominator - numerator;
  if (numerator < SMALL_CELL_THRESHOLD || complement < SMALL_CELL_THRESHOLD) {
    return { denominator: null, numerator: null, ratePercent: null, suppressed: true };
  }
  return {
    denominator,
    numerator,
    ratePercent: (numerator / denominator) * 100,
    suppressed: false,
  };
}

function buildGroupStats(rows: CohortAggregateRow[], asOf: Date): GroupStats {
  const enrolled = rows.filter((r) => r.eligibilityStatus === "ENROLLED");
  const totalEnrolledRaw = enrolled.length;

  const windows = {} as Record<MaturityWindowDays, WindowCell>;
  for (const windowDays of MATURITY_WINDOWS_DAYS) {
    const mature = enrolled.filter(
      (r) => r.firstQualifiedObservationAt && isMature(r.firstQualifiedObservationAt, asOf, windowDays),
    );
    const bookedWithin = mature.filter((r) =>
      bookedWithinWindow(r.firstQualifiedObservationAt!, r.firstBookedAt, windowDays),
    );
    windows[windowDays] = suppressCell(bookedWithin.length, mature.length);
  }

  return {
    totalEnrolled: totalEnrolledRaw < SMALL_CELL_THRESHOLD ? null : totalEnrolledRaw,
    windows,
  };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyTrend(rows: CohortAggregateRow[]): MonthlyTrendPoint[] {
  const enrolled = rows.filter((r) => r.eligibilityStatus === "ENROLLED" && r.firstQualifiedObservationAt);
  const months = new Set<string>();
  for (const r of enrolled) months.add(monthKey(r.firstQualifiedObservationAt!));

  const sortedMonths = Array.from(months).sort();
  return sortedMonths.map((month) => {
    const inMonth = enrolled.filter((r) => monthKey(r.firstQualifiedObservationAt!) === month);
    const online = inMonth.filter((r) => r.exposureGroup === "ONLINE");
    const pdfOnly = inMonth.filter((r) => r.exposureGroup === "PDF_ONLY");
    const smallCell = (n: number) => (n < SMALL_CELL_THRESHOLD ? null : n);
    return {
      month,
      online: {
        enrolled: smallCell(online.length),
        booked: smallCell(online.filter((r) => r.outcomeStatus === "BOOKED").length),
      },
      pdfOnly: {
        enrolled: smallCell(pdfOnly.length),
        booked: smallCell(pdfOnly.filter((r) => r.outcomeStatus === "BOOKED").length),
      },
    };
  });
}

function buildDataQuality(rows: CohortAggregateRow[]): DataQuality {
  const excludedByReason: DataQuality["excludedByReason"] = {
    MISSING_BOOKING_NO: 0,
    INVALID_BOOKING_NO_FORMAT: 0,
    SHARED_BOOKING_REFERENCE: 0,
    CONTRACT_DRIFT: 0,
  };
  let preStartExistingCount = 0;
  let eligiblePendingCount = 0;
  let lostObservedCount = 0;

  for (const r of rows) {
    if (r.eligibilityStatus === "EXCLUDED" && r.exclusionReason) {
      excludedByReason[r.exclusionReason] += 1;
    }
    if (r.eligibilityStatus === "PRE_START_EXISTING") preStartExistingCount += 1;
    if (r.eligibilityStatus === "ELIGIBLE_PENDING") eligiblePendingCount += 1;
    if (r.lostObservedAt) lostObservedCount += 1;
  }

  return {
    totalObserved: rows.length,
    excludedByReason,
    preStartExistingCount,
    eligiblePendingCount,
    lostObservedCount,
  };
}

/**
 * Publicerbar KUN når begge grupper har mindst ét ikke-undertrykt
 * modningsvindue — ellers skal UI'et vise "Ikke nok data endnu" i stedet
 * for en sammenligning (Gate B's eksplicitte krav).
 */
function computeHasPublishableComparison(groups: { ONLINE: GroupStats; PDF_ONLY: GroupStats }): boolean {
  const onlineHasWindow = MATURITY_WINDOWS_DAYS.some((w) => !groups.ONLINE.windows[w].suppressed);
  const pdfOnlyHasWindow = MATURITY_WINDOWS_DAYS.some((w) => !groups.PDF_ONLY.windows[w].suppressed);
  return onlineHasWindow && pdfOnlyHasWindow;
}

export function buildConversionAggregate(
  rows: CohortAggregateRow[],
  measurement: MeasurementState,
  asOf: Date,
): ConversionAggregate {
  // exposure_group er, per klassifikationskontrakten (classify.ts), KUN
  // nogensinde sat på ENROLLED-rækker — så et filter på exposureGroup alene
  // er allerede ækvivalent med "ENROLLED i denne gruppe". buildGroupStats
  // filtrerer desuden selv på eligibilityStatus === "ENROLLED" som et
  // eksplicit, uafhængigt værn.
  const online = buildGroupStats(rows.filter((r) => r.exposureGroup === "ONLINE"), asOf);
  const pdfOnly = buildGroupStats(rows.filter((r) => r.exposureGroup === "PDF_ONLY"), asOf);

  const groups = { ONLINE: online, PDF_ONLY: pdfOnly };

  const differencePercentPoints = {} as Record<MaturityWindowDays, number | null>;
  for (const windowDays of MATURITY_WINDOWS_DAYS) {
    const a = groups.ONLINE.windows[windowDays];
    const b = groups.PDF_ONLY.windows[windowDays];
    differencePercentPoints[windowDays] =
      a.ratePercent !== null && b.ratePercent !== null ? a.ratePercent - b.ratePercent : null;
  }

  return {
    measurement,
    hasPublishableComparison: computeHasPublishableComparison(groups),
    groups,
    differencePercentPoints,
    monthlyTrend: buildMonthlyTrend(rows),
    dataQuality: buildDataQuality(rows),
  };
}
