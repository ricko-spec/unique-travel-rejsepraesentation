// Vision 3.0 Fase 5, Gate C1 (Issue #84) — operatørstyret, write-free dry-run.
//
// Kører runConversionSync(..., { dryRun: true }) med to uafhængige værn mod
// skrivning:
//   1. selve motoren skriver aldrig i dry-run (ingen lease, ingen commit/fail);
//   2. persistence pakkes her i et read-only-værn, hvor beginSyncRun,
//      commitSyncRun og failSyncRun kaster og tælles som skriveforsøg.
// Derudover tælles rækker i de tre konverteringstabeller før og efter; enhver
// forskel, ethvert skriveforsøg eller en fejl giver verdict FAIL.
//
// Output er KUN aggregater. `formatOperatorReport` small-cell-undertrykker
// alle tal 1–9 (og booket, hvis komplementet er 1–9), så resultatet kan
// dokumenteres offentligt. Ingen id'er, nøgler, bookingnumre eller payloads.

import { SMALL_CELL_THRESHOLD } from "./contract";
import type { HubSpotReadAdapter } from "./hubspotAdapter";
import type { ConversionPersistence } from "./persistence";
import { runConversionSync, type DryRunSummary } from "./syncEngine";
import type { SyncRunErrorCode } from "./types";

export type RowCounts = { state: number; cohort: number; runs: number };

export type OperatorDryRunReport = {
  verdict: "PASS" | "FAIL";
  errorCode: SyncRunErrorCode | "PRECHECK_FAILED" | "POSTCHECK_FAILED" | "WRITE_ATTEMPTED" | "ROWS_CHANGED" | null;
  stageContract: "MATCH" | "CONTRACT_DRIFT" | "CONTRACT_INCOMPLETE" | "NOT_REACHED";
  isBaseline: boolean | null;
  observed: number | null;
  enrolled: number | null;
  excluded: number | null;
  booked: number | null;
  conflicts: number | null;
  summary: DryRunSummary | null;
  writeAttempts: number;
  pre: RowCounts | null;
  post: RowCounts | null;
  rowsUnchanged: boolean;
};

/** Read-only-værn: skrivemetoderne kaster og tælles — de må aldrig nås i en dry-run. */
export function readOnlyPersistence(inner: ConversionPersistence): ConversionPersistence & { writeAttempts: () => number } {
  let attempts = 0;
  const forbidden = async (): Promise<never> => {
    attempts += 1;
    throw new Error("DRY_RUN_WRITE_FORBIDDEN");
  };
  return {
    loadMeasurementState: () => inner.loadMeasurementState(),
    loadTravelPlanIndex: (secret) => inner.loadTravelPlanIndex(secret),
    loadAllCohortStates: () => inner.loadAllCohortStates(),
    beginSyncRun: forbidden,
    commitSyncRun: forbidden,
    failSyncRun: forbidden,
    writeAttempts: () => attempts,
  };
}

export async function runOperatorDryRun(deps: {
  adapter: HubSpotReadAdapter;
  persistence: ConversionPersistence;
  countRows: () => Promise<RowCounts | null>;
  dealKeySecret: string;
  bookingMatchSecret: string;
  now?: Date;
  /** Kun til tests (regressionsværn). Produktion bruger altid runConversionSync. */
  engine?: typeof runConversionSync;
}): Promise<OperatorDryRunReport> {
  const guarded = readOnlyPersistence(deps.persistence);
  const base: OperatorDryRunReport = {
    verdict: "FAIL",
    errorCode: null,
    stageContract: "NOT_REACHED",
    isBaseline: null,
    observed: null,
    enrolled: null,
    excluded: null,
    booked: null,
    conflicts: null,
    summary: null,
    writeAttempts: 0,
    pre: null,
    post: null,
    rowsUnchanged: false,
  };

  const pre = await safeCount(deps.countRows);
  if (!pre) return { ...base, errorCode: "PRECHECK_FAILED" };

  let outcome;
  try {
    outcome = await (deps.engine ?? runConversionSync)(deps.adapter, guarded, {
      dealKeySecret: deps.dealKeySecret,
      bookingMatchSecret: deps.bookingMatchSecret,
      now: deps.now,
      dryRun: true,
    });
  } catch {
    outcome = { ok: false as const, errorCode: "UNKNOWN" as const, auditRecorded: false };
  }

  const post = await safeCount(deps.countRows);
  const writeAttempts = guarded.writeAttempts();
  const rowsUnchanged = post !== null && pre.state === post.state && pre.cohort === post.cohort && pre.runs === post.runs;
  const report: OperatorDryRunReport = { ...base, pre, post, writeAttempts, rowsUnchanged };

  if (outcome.ok) {
    Object.assign(report, {
      stageContract: "MATCH",
      isBaseline: outcome.isBaseline,
      observed: outcome.counts.observed,
      enrolled: outcome.counts.enrolled,
      excluded: outcome.counts.excluded,
      booked: outcome.counts.booked,
      conflicts: outcome.counts.conflicts,
      summary: outcome.dryRunSummary ?? null,
    });
  } else {
    report.errorCode = outcome.errorCode;
    if (outcome.errorCode === "CONTRACT_DRIFT" || outcome.errorCode === "CONTRACT_INCOMPLETE") {
      report.stageContract = outcome.errorCode;
    }
  }

  if (writeAttempts > 0) return { ...report, verdict: "FAIL", errorCode: "WRITE_ATTEMPTED" };
  if (post === null) return { ...report, verdict: "FAIL", errorCode: "POSTCHECK_FAILED" };
  if (!rowsUnchanged) return { ...report, verdict: "FAIL", errorCode: "ROWS_CHANGED" };
  if (!outcome.ok || !outcome.dryRun) return { ...report, verdict: "FAIL" };
  return { ...report, verdict: "PASS", errorCode: null };
}

async function safeCount(fn: () => Promise<RowCounts | null>): Promise<RowCounts | null> {
  try {
    const c = await fn();
    if (!c || ![c.state, c.cohort, c.runs].every((n) => Number.isInteger(n) && n >= 0)) return null;
    return c;
  } catch {
    return null;
  }
}

/** Small-cell: 1–9 vises aldrig som tal. 0 og ≥ 10 vises. */
export function safeCount10(n: number | null): string {
  if (n === null) return "—";
  return n > 0 && n < SMALL_CELL_THRESHOLD ? "<10" : String(n);
}

/** Offentligt dokumenterbart output — kun aggregater, small-cell-undertrykt. */
export function formatOperatorReport(r: OperatorDryRunReport): string[] {
  const bookedShown =
    r.booked !== null && r.observed !== null && r.observed - r.booked > 0 && r.observed - r.booked < SMALL_CELL_THRESHOLD
      ? "<10 (komplement lille)"
      : safeCount10(r.booked);
  const lines = [
    `VERDICT: ${r.verdict}${r.errorCode ? ` (${r.errorCode})` : ""}`,
    `stage-kontrakt: ${r.stageContract}`,
    `side-/total-konsistens: ${r.stageContract === "MATCH" && r.observed !== null ? "PASS" : r.errorCode === "TOTAL_MISMATCH" || r.errorCode === "PAGE_INCONSISTENT" || r.errorCode === "DUPLICATE_DEAL" ? "FAIL" : "IKKE VURDERET"}`,
    `baseline-klassifikation: ${r.isBaseline === null ? "—" : r.isBaseline ? "ja" : "nej"}`,
    `observeret i alt: ${safeCount10(r.observed)}`,
    `enrolled: ${safeCount10(r.enrolled)} · excluded: ${safeCount10(r.excluded)} · booked: ${bookedShown} · conflicts: ${safeCount10(r.conflicts)}`,
  ];
  if (r.summary) {
    const e = r.summary.byEligibility;
    lines.push(
      `eligibility: PRE_START_EXISTING ${safeCount10(e.PRE_START_EXISTING)} · ELIGIBLE_PENDING ${safeCount10(e.ELIGIBLE_PENDING)} · ENROLLED ${safeCount10(e.ENROLLED)} · EXCLUDED ${safeCount10(e.EXCLUDED)}`,
      `eksklusionsårsager: ${Object.entries(r.summary.byExclusionReason).map(([k, v]) => `${k} ${safeCount10(v)}`).join(" · ")}`,
      `efterfølgende udelukket: ${Object.entries(r.summary.byPostEnrollmentExclusion ?? {}).map(([k, v]) => `${k} ${safeCount10(v)}`).join(" · ")}`,
      `tabt/afvist observeret: ${safeCount10(r.summary.lostObserved)} · outcome-konflikter: ${safeCount10(r.summary.outcomeConflicts)}`,
    );
  }
  lines.push(
    `skriveforsøg: ${r.writeAttempts}`,
    `rækker før  (state/cohort/runs): ${r.pre ? `${r.pre.state}/${r.pre.cohort}/${r.pre.runs}` : "—"}`,
    `rækker efter (state/cohort/runs): ${r.post ? `${r.post.state}/${r.post.cohort}/${r.post.runs}` : "—"}`,
    `rækker uændret: ${r.rowsUnchanged ? "JA" : "NEJ"}`,
  );
  return lines;
}
