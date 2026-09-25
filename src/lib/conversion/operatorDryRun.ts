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
//
// Før/efter-tællingen er kategorisk: ved fejl rapporteres KUN tabelnavn +
// kategori (AUTH/PERMISSION/TABLE_NOT_FOUND/NETWORK/INVALID_RESPONSE), udledt af
// HTTP-status og PostgREST/Postgres-fejlkode — aldrig af fejltekst. Rå
// fejlbeskeder, URL'er, headers og nøgler forlader aldrig klassifikationen.

import { SMALL_CELL_THRESHOLD } from "./contract";
import type { HubSpotReadAdapter } from "./hubspotAdapter";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversionPersistence } from "./persistence";
import { runConversionSync, type DryRunSummary } from "./syncEngine";
import type { SyncRunErrorCode } from "./types";

export type RowCounts = { state: number; cohort: number; runs: number };

/** De tre tabeller, der tælles før og efter — fast rækkefølge. */
export const COUNT_TABLES = ["conversion_measurement_state", "conversion_deal_cohort", "conversion_sync_runs"] as const;
export type CountTable = (typeof COUNT_TABLES)[number];
export type CountFailureCategory = "AUTH" | "PERMISSION" | "TABLE_NOT_FOUND" | "NETWORK" | "INVALID_RESPONSE";
export type CountFailure = { table: CountTable; category: CountFailureCategory };
export type RowCountResult = { ok: true; counts: RowCounts } | { ok: false; failures: CountFailure[] };
/** Den del af et postgrest-js-svar, klassifikationen må se (status, count, fejlkode). */
export type TableCountResponse = { status?: unknown; count?: unknown; error?: unknown };

const AUTH_CODES = new Set(["PGRST300", "PGRST301", "PGRST302", "PGRST303"]);
const PERMISSION_CODES = new Set(["42501"]);
const NOT_FOUND_CODES = new Set(["42P01", "PGRST205"]);

/**
 * Klassificerer ét HEAD-optællingssvar. Bemærk postgrest-js ved HEAD: der er
 * ingen body, så fejlkoden mangler typisk og kun HTTP-status bærer information;
 * en tom 404 omskrives af klienten til status 204 uden count og uden fejl, og en
 * fanget fetch-fejl giver status 0. Kun kode og status læses — aldrig tekst.
 */
export function classifyCountResponse(r: unknown): { ok: true; count: number } | { ok: false; category: CountFailureCategory } {
  if (typeof r !== "object" || r === null) return { ok: false, category: "INVALID_RESPONSE" };
  const { status, count, error } = r as TableCountResponse;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string") {
    if (PERMISSION_CODES.has(code)) return { ok: false, category: "PERMISSION" };
    if (NOT_FOUND_CODES.has(code)) return { ok: false, category: "TABLE_NOT_FOUND" };
    if (AUTH_CODES.has(code)) return { ok: false, category: "AUTH" };
  }
  if (status === 0) return { ok: false, category: "NETWORK" };
  if (status === 401) return { ok: false, category: "AUTH" };
  if (status === 403) return { ok: false, category: "PERMISSION" };
  if (status === 404 || (status === 204 && count == null && error == null)) return { ok: false, category: "TABLE_NOT_FOUND" };
  if (status === 200 && error == null && typeof count === "number" && Number.isInteger(count) && count >= 0) return { ok: true, count };
  return { ok: false, category: "INVALID_RESPONSE" };
}

/** Tæller de tre tabeller; ved fejl kun tabel + kategori (kastet exception ⇒ NETWORK). */
export async function countConversionTables(countOne: (table: CountTable) => Promise<unknown>): Promise<RowCountResult> {
  const results = await Promise.all(
    COUNT_TABLES.map(async (table) => {
      try {
        return { table, r: classifyCountResponse(await countOne(table)) };
      } catch {
        return { table, r: { ok: false as const, category: "NETWORK" as const } };
      }
    }),
  );
  const failures: CountFailure[] = [];
  const n: number[] = [];
  for (const { table, r } of results) {
    if (r.ok) n.push(r.count);
    else failures.push({ table, category: r.category });
  }
  if (failures.length) return { ok: false, failures };
  return { ok: true, counts: { state: n[0], cohort: n[1], runs: n[2] } };
}

/**
 * Read-only HEAD-optælling (count=exact) — ingen rækker hentes. Ingen retry:
 * en fejl rapporteres kategorisk og dry-run'en fejler lukket.
 */
export function supabaseTableCounter(client: SupabaseClient): (table: CountTable) => Promise<unknown> {
  return async (table) => {
    const { status, count, error } = await client.from(table).select("*", { count: "exact", head: true }).retry(false);
    return { status, count, error };
  };
}

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
  /** Kun tabel + kategori; [] = tællingen fejlede uden kategori (fx exception). */
  precheckFailures: CountFailure[] | null;
  postcheckFailures: CountFailure[] | null;
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
  countRows: () => Promise<RowCountResult>;
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
    precheckFailures: null,
    postcheckFailures: null,
    rowsUnchanged: false,
  };

  const preResult = await safeCount(deps.countRows);
  if (!preResult.ok) return { ...base, errorCode: "PRECHECK_FAILED", precheckFailures: preResult.failures };
  const pre = preResult.counts;

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

  const postResult = await safeCount(deps.countRows);
  const post = postResult.ok ? postResult.counts : null;
  const writeAttempts = guarded.writeAttempts();
  const rowsUnchanged = post !== null && pre.state === post.state && pre.cohort === post.cohort && pre.runs === post.runs;
  const report: OperatorDryRunReport = {
    ...base,
    pre,
    post,
    postcheckFailures: postResult.ok ? null : postResult.failures,
    writeAttempts,
    rowsUnchanged,
  };

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

/** Fail-closed: exception, ugyldig form eller ugyldige tal ⇒ fejl (ukategoriseret = []). */
async function safeCount(fn: () => Promise<RowCountResult>): Promise<RowCountResult> {
  try {
    const r = await fn();
    if (r && r.ok === true) {
      const c = r.counts;
      if (c && [c.state, c.cohort, c.runs].every((n) => Number.isInteger(n) && n >= 0)) return { ok: true, counts: c };
      return { ok: false, failures: [] };
    }
    if (r && r.ok === false && Array.isArray(r.failures)) return { ok: false, failures: sanitizeFailures(r.failures) };
    return { ok: false, failures: [] };
  } catch {
    return { ok: false, failures: [] };
  }
}

const CATEGORIES: readonly CountFailureCategory[] = ["AUTH", "PERMISSION", "TABLE_NOT_FOUND", "NETWORK", "INVALID_RESPONSE"];
/** Kun kendte tabelnavne og kategorier slipper igennem til rapporten. */
function sanitizeFailures(fs: CountFailure[]): CountFailure[] {
  return fs
    .filter((f) => (COUNT_TABLES as readonly string[]).includes(f?.table) && CATEGORIES.includes(f?.category))
    .map((f) => ({ table: f.table, category: f.category }));
}

function formatFailures(label: string, fs: CountFailure[] | null): string[] {
  if (fs === null) return [];
  return [`${label}: ${fs.length ? fs.map((f) => `${f.table}=${f.category}`).join(" · ") : "IKKE KATEGORISERET"}`];
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
    ...formatFailures("precheck-fejl", r.precheckFailures),
    ...formatFailures("postcheck-fejl", r.postcheckFailures),
    `skriveforsøg: ${r.writeAttempts}`,
    `rækker før  (state/cohort/runs): ${r.pre ? `${r.pre.state}/${r.pre.cohort}/${r.pre.runs}` : "—"}`,
    `rækker efter (state/cohort/runs): ${r.post ? `${r.post.state}/${r.post.cohort}/${r.post.runs}` : "—"}`,
    `rækker uændret: ${r.rowsUnchanged ? "JA" : "NEJ"}`,
  );
  return lines;
}
