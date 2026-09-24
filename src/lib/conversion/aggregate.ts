// Vision 3.0 Fase 5, Gate B (Issue #80) — ren aggregeringsfunktion til
// adminvisningen. Tager KUN allerede-pseudonymiserede kohorterækker (ingen
// deal-id'er, ingen bookingnumre) og bygger et privacy-sikkert DTO.
//
// MÅLEDEFINITION (Issue #80, uændret): modning pr. DEAL — en deal indgår i
// vindue w, når der er gået mindst w dage siden dens kohortestart, og tæller
// som booket i w, hvis 0 ≤ (first_booked_at − kohortestart) ≤ w dage. En
// booking før kohortestart tæller aldrig (review-runde 2, fund 1).
//
// PRIVACY LIGGER I PUBLICERINGSLAGET (review-runde 2, fund 2 + designfund):
//
//  1. Udfaldsceller publiceres kun når n, b OG n−b alle er ≥ SMALL_CELL_THRESHOLD;
//     ellers skjules tæller, nævner og procent SAMMEN.
//  2. Modne deals (sorteret efter kohortestart; deals med samme kohortestart —
//     samme sync — holdes altid samlet) grupperes i publiceringsblokke:
//       · 30-blokke lukker, når n, b30 og n−b30 alle ≥ 10;
//       · 60-blokke er sammenhængende 30-blokke, der lukker når b60 og n−b60
//         ≥ 10 OG inkrementet b60−b30 er 0 eller ≥ 10;
//       · 90-blokke er sammenhængende 60-blokke, der lukker når b90 og n−b90
//         ≥ 10 OG inkrementet b90−b60 er 0 eller ≥ 10.
//     Vindue w publiceres som summen af lukkede w-blokke; en rest tilbageholdes.
//  3. Dermed er enhver differens, der kan dannes mellem publicerede tal — mellem
//     30/60/90 for samme population, mellem trendperioder og vinduer, og dag for
//     dag — en sum af hele blokinkrementer, som hver er 0 eller ≥ tærsklen.
//  4. Tælletal uden udfald (gruppetotaler, datakvalitet) small-cell-
//     undertrykkes (1–9) med sekundær undertrykkelse.
//  5. Rækker med bookingkonflikt eller booking før kohortestart indgår aldrig
//     i publicerbare konverteringstal.
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

function bookedWithin(row: CohortAggregateRow, windowDays: number): boolean {
  if (row.outcomeStatus !== "BOOKED" || !row.firstBookedAt || !row.firstQualifiedObservationAt) return false;
  const delta = row.firstBookedAt.getTime() - row.firstQualifiedObservationAt.getTime();
  return delta >= 0 && delta <= windowDays * DAY_MS;
}

function publishable(row: CohortAggregateRow): boolean {
  return (
    row.eligibilityStatus === "ENROLLED" &&
    row.bookingConflictDetectedAt === null &&
    row.exposureGroup !== null &&
    row.firstQualifiedObservationAt !== null &&
    // Fail-closed: en booking før kohortestart er en datafejl (DB-CHECK
    // forhindrer den) — sådan en række indgår aldrig i nogen publiceret celle.
    (row.firstBookedAt === null || row.firstBookedAt.getTime() >= row.firstQualifiedObservationAt.getTime())
  );
}

const incrementOk = (x: number) => x === 0 || x >= T;

type Tally = { n: number; b30: number; b60: number; b90: number };
type Block = Tally & { firstT: number; lastT: number };

function addTally(a: Tally, b: Tally): Tally {
  return { n: a.n + b.n, b30: a.b30 + b.b30, b60: a.b60 + b.b60, b90: a.b90 + b.b90 };
}

/** Grupperer sammenhængende elementer grådigt; en åben rest (ikke lukket) returneres ikke. */
function closeGreedy(items: Block[], closes: (t: Tally) => boolean): Block[] {
  const out: Block[] = [];
  let acc: Block | null = null;
  for (const it of items) {
    acc = acc ? { ...addTally(acc, it), firstT: acc.firstT, lastT: it.lastT } : { ...it };
    if (closes(acc)) {
      out.push(acc);
      acc = null;
    }
  }
  return out;
}

/** Hierarkiske publiceringsblokke for én gruppe (regel 2). Modning pr. deal. */
function publicationBlocks(rows: CohortAggregateRow[], asOf: Date): { b30: Block[]; b60: Block[]; b90: Block[] } {
  const byT = new Map<number, CohortAggregateRow[]>();
  for (const r of rows) {
    const t = r.firstQualifiedObservationAt!.getTime();
    const list = byT.get(t);
    if (list) list.push(r);
    else byT.set(t, [r]);
  }
  const mature = (t: number, w: number) => asOf.getTime() - t >= w * DAY_MS;
  const groups: Block[] = Array.from(byT.keys())
    .sort((a, b) => a - b)
    .filter((t) => mature(t, 30))
    .map((t) => {
      const list = byT.get(t)!;
      const count = (w: number) => (mature(t, w) ? list.filter((r) => bookedWithin(r, w)).length : 0);
      return { n: list.length, b30: count(30), b60: count(60), b90: count(90), firstT: t, lastT: t };
    });
  const b30 = closeGreedy(groups, (x) => x.n >= T && x.b30 >= T && x.n - x.b30 >= T);
  const b60 = closeGreedy(
    b30.filter((blk) => mature(blk.lastT, 60)),
    (x) => x.b60 >= T && x.n - x.b60 >= T && incrementOk(x.b60 - x.b30),
  );
  const b90 = closeGreedy(
    b60.filter((blk) => mature(blk.lastT, 90)),
    (x) => x.b90 >= T && x.n - x.b90 >= T && incrementOk(x.b90 - x.b60),
  );
  return { b30, b60, b90 };
}

const SUPPRESSED: WindowCell = { denominator: null, numerator: null, ratePercent: null, suppressed: true };

function windowCell(blocks: Block[], w: MaturityWindowDays): WindowCell {
  const n = blocks.reduce((a, x) => a + x.n, 0);
  const b = blocks.reduce((a, x) => a + (w === 30 ? x.b30 : w === 60 ? x.b60 : x.b90), 0);
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
    const blocks = publicationBlocks(list, asOf);
    const windows = {
      30: windowCell(blocks.b30, 30),
      60: windowCell(blocks.b60, 60),
      90: windowCell(blocks.b90, 90),
    } as Record<MaturityWindowDays, WindowCell>;
    const trend30 = blocks.b30.map((blk) => ({
      fromMonth: monthKey(new Date(blk.firstT)),
      toMonth: monthKey(new Date(blk.lastT)),
      enrolled: blk.n,
      booked: blk.b30,
      ratePercent: (blk.b30 / blk.n) * 100,
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
