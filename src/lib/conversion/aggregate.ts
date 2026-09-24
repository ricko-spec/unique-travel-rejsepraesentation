// Vision 3.0 Fase 5, Gate B (Issue #80) — ren aggregeringsfunktion til
// adminvisningen. Tager KUN allerede-pseudonymiserede kohorterækker (ingen
// deal-id'er, ingen bookingnumre) og bygger et privacy-sikkert DTO.
//
// PRIVACY-MODEL (PR #81 review-runde 1, fund 3 — se ADR §Privacy):
//
//  1. Udfaldsceller (tilbud n, booket b) publiceres kun når n, b OG
//     komplementet n−b alle er ≥ SMALL_CELL_THRESHOLD. Ellers skjules
//     tæller, nævner og procent SAMMEN.
//  2. Modning sker pr. KOHORTEMÅNED (UTC): en måned indgår i vindue w først
//     når hele måneden er mindst w dage gammel. Dens tal er derefter faste.
//  3. Modne måneder samles i rækkefølge til BLOKKE, der hver for sig opfylder
//     regel 1. Vinduestal = summen af lukkede blokke; trenden viser netop
//     blokkene. Dermed er (a) trendrækkerne præcis de tilvækster vinduestallet
//     vokser med, (b) enhver differens mellem to publicerede tal en hel blok
//     ≥ tærsklen, og (c) en umoden/lille rest-periode tilbageholdes helt.
//  4. Tælletal uden udfald (gruppetotaler, datakvalitet) small-cell-
//     undertrykkes (1–9), og en sekundær undertrykkelse sikrer at ingen
//     skjult celle kan udledes som totalen minus de synlige celler.
//  5. Rækker med en senere opdaget bookingkonflikt indgår aldrig i
//     publicerbare konverteringstal — kun i datakvalitet.
//
// INGEN database-/HubSpot-imports her — ren funktion af rækker + "as of".

import { MATURITY_WINDOWS_DAYS, SMALL_CELL_THRESHOLD, STALE_AFTER_HOURS, type MaturityWindowDays } from "./contract";
import { EXCLUSION_REASONS } from "./types";
import type { EligibilityStatus, ExclusionReason, ExposureGroup, MeasurementState, OutcomeStatus } from "./types";

export type CohortAggregateRow = {
  eligibilityStatus: EligibilityStatus;
  exclusionReason: ExclusionReason | null;
  firstQualifiedObservationAt: Date | null;
  exposureGroup: ExposureGroup | null;
  bookingConflictDetectedAt: Date | null;
  outcomeStatus: OutcomeStatus;
  firstBookedAt: Date | null;
  lostObservedAt: Date | null;
  outcomeConflictObservedAt: Date | null;
};

export type WindowCell = {
  denominator: number | null;
  numerator: number | null;
  ratePercent: number | null;
  suppressed: boolean;
};

/** Én publiceret trend-periode (én eller flere sammenhængende kohortemåneder), 30-dages-udfald. */
export type TrendPeriod = {
  fromMonth: string; // "YYYY-MM"
  toMonth: string; // "YYYY-MM"
  enrolled: number;
  booked: number;
  ratePercent: number;
};

export type GroupStats = {
  /** Antal publicerbare ENROLLED deals i gruppen (inkl. umodne) — null hvis undertrykt. */
  totalEnrolled: number | null;
  windows: Record<MaturityWindowDays, WindowCell>;
  /** Trend pr. kohorteperiode for 30-dages-udfaldet — kun lukkede, publicerbare blokke. */
  trend30: TrendPeriod[];
};

export type DataQuality = {
  totalObserved: number | null;
  eligiblePending: number | null;
  preStartExisting: number | null;
  bookingConflicts: number | null;
  excludedByReason: Record<ExclusionReason, number | null>;
  /** Tabt/afvist observeret og ikke booket — kun datakvalitet, aldrig i konverteringsprocenten. */
  lostObserved: number | null;
  /** Modstrid mellem UT-status og HubSpots lukke-flag — kun datakvalitet. */
  outcomeConflicts: number | null;
};

export type Freshness = "NO_SYNC" | "FRESH" | "STALE";

export type ConversionAggregate = {
  measurement: MeasurementState;
  freshness: Freshness;
  hasPublishableComparison: boolean;
  groups: { ONLINE: GroupStats; PDF_ONLY: GroupStats };
  differencePercentPoints: Record<MaturityWindowDays, number | null>;
  dataQuality: DataQuality;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const T = SMALL_CELL_THRESHOLD;

function isSmall(n: number): boolean {
  return n > 0 && n < T;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)); // første instant i næste måned
}

function bookedWithin(row: CohortAggregateRow, windowDays: number): boolean {
  if (row.outcomeStatus !== "BOOKED" || !row.firstBookedAt || !row.firstQualifiedObservationAt) return false;
  return row.firstBookedAt.getTime() - row.firstQualifiedObservationAt.getTime() <= windowDays * DAY_MS;
}

function publishable(row: CohortAggregateRow): boolean {
  return (
    row.eligibilityStatus === "ENROLLED" &&
    row.bookingConflictDetectedAt === null &&
    row.exposureGroup !== null &&
    row.firstQualifiedObservationAt !== null
  );
}

type Block = { fromMonth: string; toMonth: string; n: number; b: number };

/** Lukkede, publicerbare blokke af modne kohortemåneder for ét vindue (regel 2+3). */
function closedBlocks(rows: CohortAggregateRow[], asOf: Date, windowDays: number): Block[] {
  const byMonth = new Map<string, CohortAggregateRow[]>();
  for (const r of rows) {
    const k = monthKey(r.firstQualifiedObservationAt!);
    const list = byMonth.get(k);
    if (list) list.push(r);
    else byMonth.set(k, [r]);
  }
  const months = Array.from(byMonth.keys()).sort();
  const blocks: Block[] = [];
  let fromMonth: string | null = null;
  let n = 0;
  let b = 0;
  for (const m of months) {
    if (monthEnd(m).getTime() + windowDays * DAY_MS > asOf.getTime()) break; // umoden ⇒ også alle senere
    const list = byMonth.get(m)!;
    if (fromMonth === null) fromMonth = m;
    n += list.length;
    b += list.filter((r) => bookedWithin(r, windowDays)).length;
    if (n >= T && b >= T && n - b >= T) {
      blocks.push({ fromMonth, toMonth: m, n, b });
      fromMonth = null;
      n = 0;
      b = 0;
    }
  }
  // En åben rest-blok (under tærsklen) tilbageholdes helt.
  return blocks;
}

const SUPPRESSED: WindowCell = { denominator: null, numerator: null, ratePercent: null, suppressed: true };

function windowCell(blocks: Block[]): WindowCell {
  const n = blocks.reduce((a, x) => a + x.n, 0);
  const b = blocks.reduce((a, x) => a + x.b, 0);
  if (n < T || b < T || n - b < T) return SUPPRESSED;
  return { denominator: n, numerator: b, ratePercent: (b / n) * 100, suppressed: false };
}

/**
 * Small-cell + sekundær undertrykkelse af en partition af `total` (regel 4).
 * Primært skjules 1–9. Er de skjulte cellers sum derefter under tærsklen
 * (hvilket altid gælder for én enkelt skjult celle), kunne summen udledes
 * som totalen minus de synlige — så skjules yderligere den mindste synlige
 * ikke-nul-celle, indtil summen er ≥ tærsklen. Kan det ikke opnås, skjules
 * totalen også.
 */
export function suppressPartition(cells: number[], total: number): { cells: (number | null)[]; total: number | null } {
  const hidden = cells.map(isSmall);
  const needsMore = () => {
    const idx = hidden.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) return false;
    return idx.reduce((a, i) => a + cells[i], 0) < T;
  };
  while (needsMore()) {
    let pick = -1;
    for (let i = 0; i < cells.length; i++) {
      if (!hidden[i] && cells[i] > 0 && (pick === -1 || cells[i] < cells[pick])) pick = i;
    }
    if (pick === -1) break;
    hidden[pick] = true;
  }
  const totalHidden = isSmall(total) || needsMore();
  return { cells: cells.map((c, i) => (hidden[i] ? null : c)), total: totalHidden ? null : total };
}

/** Binær opdeling af en population (fx tabt vs. ikke tabt): skjul hvis tælleren eller komplementet er 1–9. */
function suppressBinary(count: number, population: number): number | null {
  return isSmall(count) || isSmall(population - count) ? null : count;
}

function freshnessOf(state: MeasurementState, asOf: Date): Freshness {
  if (!state.lastSuccessfulSyncAt) return "NO_SYNC";
  return asOf.getTime() - state.lastSuccessfulSyncAt.getTime() > STALE_AFTER_HOURS * 60 * 60 * 1000 ? "STALE" : "FRESH";
}

export function buildConversionAggregate(
  rows: CohortAggregateRow[],
  measurement: MeasurementState,
  asOf: Date,
): ConversionAggregate {
  const pub = rows.filter(publishable);
  const perGroup = {
    ONLINE: pub.filter((r) => r.exposureGroup === "ONLINE"),
    PDF_ONLY: pub.filter((r) => r.exposureGroup === "PDF_ONLY"),
  };

  const count = (pred: (r: CohortAggregateRow) => boolean) => rows.filter(pred).length;
  const reasonCounts = EXCLUSION_REASONS.map((reason) =>
    count((r) => r.eligibilityStatus === "EXCLUDED" && r.exclusionReason === reason),
  );
  const partition = suppressPartition(
    [
      perGroup.ONLINE.length,
      perGroup.PDF_ONLY.length,
      count((r) => r.eligibilityStatus === "ENROLLED" && r.bookingConflictDetectedAt !== null),
      count((r) => r.eligibilityStatus === "ELIGIBLE_PENDING"),
      count((r) => r.eligibilityStatus === "PRE_START_EXISTING"),
      ...reasonCounts,
    ],
    rows.length,
  );
  const [onlineTotal, pdfTotal, conflicts, pending, preStart, ...reasons] = partition.cells;

  const buildGroup = (list: CohortAggregateRow[], total: number | null): GroupStats => {
    const windows = {} as Record<MaturityWindowDays, WindowCell>;
    for (const w of MATURITY_WINDOWS_DAYS) windows[w] = windowCell(closedBlocks(list, asOf, w));
    const trend30 = closedBlocks(list, asOf, 30).map((blk) => ({
      fromMonth: blk.fromMonth,
      toMonth: blk.toMonth,
      enrolled: blk.n,
      booked: blk.b,
      ratePercent: (blk.b / blk.n) * 100,
    }));
    return { totalEnrolled: total, windows, trend30 };
  };
  const groups = { ONLINE: buildGroup(perGroup.ONLINE, onlineTotal), PDF_ONLY: buildGroup(perGroup.PDF_ONLY, pdfTotal) };

  const differencePercentPoints = {} as Record<MaturityWindowDays, number | null>;
  for (const w of MATURITY_WINDOWS_DAYS) {
    const a = groups.ONLINE.windows[w].ratePercent;
    const b = groups.PDF_ONLY.windows[w].ratePercent;
    differencePercentPoints[w] = a !== null && b !== null ? a - b : null;
  }

  const excludedByReason = {} as Record<ExclusionReason, number | null>;
  EXCLUSION_REASONS.forEach((reason, i) => {
    excludedByReason[reason] = reasons[i];
  });

  const hasWindow = (g: GroupStats) => MATURITY_WINDOWS_DAYS.some((w) => !g.windows[w].suppressed);

  return {
    measurement,
    freshness: freshnessOf(measurement, asOf),
    hasPublishableComparison: hasWindow(groups.ONLINE) && hasWindow(groups.PDF_ONLY),
    groups,
    differencePercentPoints,
    dataQuality: {
      totalObserved: partition.total,
      eligiblePending: pending,
      preStartExisting: preStart,
      bookingConflicts: conflicts,
      excludedByReason,
      lostObserved: suppressBinary(count((r) => r.lostObservedAt !== null && r.outcomeStatus === "NOT_BOOKED"), rows.length),
      outcomeConflicts: suppressBinary(count((r) => r.outcomeConflictObservedAt !== null), rows.length),
    },
  };
}
