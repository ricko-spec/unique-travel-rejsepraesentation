import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTravelPlanIndex,
  cohortRowViolation,
  cohortTransitionViolation,
  commitBatchViolation,
  serializeCohortRow,
  supabaseConversionPersistence,
  type CommitRequest,
} from "./persistence";
import { computeBookingKeyForConversion } from "./dealKey";
import { CONTRACT_VERSION } from "./contract";
import type { ClassifiedDealResult, CohortState } from "./types";

const SECRET = "s".repeat(40);
const T0 = new Date("2026-10-01T03:00:00Z");
const T1 = new Date("2026-10-02T03:00:00Z");
const hex = (c: string) => c.repeat(64);

type Page = { data: unknown[] | null; error: { message: string } | null; count: number | null };

/**
 * Minimal PostgREST-fake. `pageFor(table, from, to, withCount)` bestemmer hver
 * side; alle metodekald logges, så tests kan bevise at der aldrig bruges
 * en URL-baseret `.in(...)`.
 */
function fakeSupabase(opts: {
  pageFor?: (table: string, from: number, to: number, withCount: boolean) => Page;
  rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };
}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      let withCount = false;
      const q: Record<string, unknown> = {
        select(_c: string, sel?: { count?: string }) {
          calls.push(`${table}.select`);
          withCount = sel?.count === "exact";
          return q;
        },
        order() {
          calls.push(`${table}.order`);
          return q;
        },
        in() {
          calls.push(`${table}.in`);
          return q;
        },
        range(from: number, to: number) {
          calls.push(`${table}.range`);
          return Promise.resolve(opts.pageFor!(table, from, to, withCount));
        },
      };
      return q;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push(`rpc.${fn}`);
      return Promise.resolve(opts.rpc!(fn, args));
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function tripsPages(rows: { id: string; booking_no: string | null; created_at: string }[], serverMax = 1000) {
  return (table: string, from: number, to: number, withCount: boolean): Page => {
    if (table !== "trips") throw new Error("uventet tabel");
    const slice = rows.slice(from, Math.min(to + 1, from + serverMax));
    return { data: slice, error: null, count: withCount ? rows.length : null };
  };
}

const trips = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${String(i).padStart(6, "0")}`, booking_no: String(50000 + i), created_at: "2026-09-01T00:00:00Z" }));

describe("loadTravelPlanIndex — komplet eller fejl (fund 4)", () => {
  it("læser over flere sider, også når serverens max_rows er LAVERE end sidestørrelsen", async () => {
    const { client, calls } = fakeSupabase({ pageFor: tripsPages(trips(2500), 700) });
    const res = await supabaseConversionPersistence(client, { pageSize: 1000 }).loadTravelPlanIndex(SECRET);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.index.size).toBe(2500);
      // Den sidste rejseplan — som en tavs afkortning ville have tabt — er med.
      expect(res.index.has(computeBookingKeyForConversion(String(50000 + 2499), SECRET))).toBe(true);
    }
    expect(calls.filter((c) => c === "trips.range").length).toBeGreaterThan(1);
    expect(calls).not.toContain("trips.in");
  });

  it("tavs afkortning (tom side før total) ⇒ SOURCE_READ_FAILED, aldrig et delvist indeks", async () => {
    const rows = trips(1500);
    const { client } = fakeSupabase({
      pageFor: (_t, from, to, withCount) => ({ data: from >= 1000 ? [] : rows.slice(from, to + 1), error: null, count: withCount ? rows.length : null }),
    });
    expect(await supabaseConversionPersistence(client).loadTravelPlanIndex(SECRET)).toEqual({ ok: false, code: "SOURCE_READ_FAILED" });
  });

  it("manglende eksakt total ⇒ SOURCE_READ_FAILED", async () => {
    const { client } = fakeSupabase({ pageFor: () => ({ data: trips(3), error: null, count: null }) });
    expect(await supabaseConversionPersistence(client).loadTravelPlanIndex(SECRET)).toEqual({ ok: false, code: "SOURCE_READ_FAILED" });
  });

  it("fejl på en senere side ⇒ SOURCE_READ_FAILED", async () => {
    const rows = trips(2500);
    const { client } = fakeSupabase({
      pageFor: (_t, from, to, withCount) =>
        from >= 2000 ? { data: null, error: { message: "timeout" }, count: null } : { data: rows.slice(from, to + 1), error: null, count: withCount ? rows.length : null },
    });
    expect(await supabaseConversionPersistence(client).loadTravelPlanIndex(SECRET)).toEqual({ ok: false, code: "SOURCE_READ_FAILED" });
  });

  it("samme trip to gange (ustabil paginering) ⇒ SOURCE_READ_FAILED", async () => {
    const rows = trips(3);
    const { client } = fakeSupabase({ pageFor: () => ({ data: [...rows, rows[0]], error: null, count: 4 }) });
    expect(await supabaseConversionPersistence(client).loadTravelPlanIndex(SECRET)).toEqual({ ok: false, code: "SOURCE_READ_FAILED" });
  });

  it("flere rejseplaner med samme bookingnummer: den TIDLIGSTE created_at afgør ONLINE", () => {
    const index = buildTravelPlanIndex(
      [
        { booking_no: "77", created_at: "2026-10-05T00:00:00Z" },
        { booking_no: " 77 ", created_at: "2026-09-01T00:00:00Z" },
        { booking_no: null, created_at: "2026-09-01T00:00:00Z" },
      ],
      SECRET,
    );
    expect(index?.get(computeBookingKeyForConversion("77", SECRET))?.createdAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(index?.size).toBe(1);
  });
});

function rawCohortRow(i: number) {
  return {
    deal_key: i.toString(16).padStart(64, "0"),
    booking_match_key: null,
    first_seen_at: T0.toISOString(),
    last_observed_at: T0.toISOString(),
    first_qualified_observation_at: null,
    exposure_group: null,
    exposure_frozen_at: null,
    eligibility_status: "ELIGIBLE_PENDING",
    exclusion_reason: null,
    booking_conflict_detected_at: null,
    outcome_status: "NOT_BOOKED",
    first_booked_at: null,
    lost_observed_at: null,
    outcome_conflict_observed_at: null,
    contract_version: CONTRACT_VERSION,
  };
}

describe("loadAllCohortStates — hele kohorten pagineret, ingen .in(...) over deal keys (fund 4)", () => {
  it("10.000 eksisterende rækker læses komplet uden URL-baseret filter", async () => {
    const rows = Array.from({ length: 10000 }, (_, i) => rawCohortRow(i + 1));
    const { client, calls } = fakeSupabase({
      pageFor: (_t, from, to, withCount) => ({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null, count: withCount ? rows.length : null }),
    });
    const res = await supabaseConversionPersistence(client).loadAllCohortStates();
    expect(res.ok && res.states.size).toBe(10000);
    expect(calls.some((c) => c.endsWith(".in"))).toBe(false);
  });

  it("total mismatch / afkortning ⇒ SOURCE_READ_FAILED", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => rawCohortRow(i + 1));
    const { client } = fakeSupabase({ pageFor: (_t, from) => ({ data: from === 0 ? rows : [], error: null, count: 6 }) });
    expect(await supabaseConversionPersistence(client).loadAllCohortStates()).toEqual({ ok: false, code: "SOURCE_READ_FAILED" });
  });

  it("ugyldig værdi eller dublet-deal_key i DB ⇒ SOURCE_READ_FAILED (aldrig en stille default)", async () => {
    for (const bad of [
      [{ ...rawCohortRow(1), eligibility_status: "HMM" }],
      [{ ...rawCohortRow(1), first_seen_at: "ikke en dato" }],
      [rawCohortRow(1), rawCohortRow(1)],
    ]) {
      const { client } = fakeSupabase({ pageFor: () => ({ data: bad, error: null, count: bad.length }) });
      expect(await supabaseConversionPersistence(client).loadAllCohortStates()).toEqual({ ok: false, code: "SOURCE_READ_FAILED" });
    }
  });
});

describe("RPC-fejl ignoreres aldrig (fund 2)", () => {
  it.each([
    ["CONVERSION_SYNC_ALREADY_RUNNING", "SYNC_ALREADY_RUNNING"],
    ["CONVERSION_NOT_ACTIVE", "NOT_ACTIVE"],
    ["CONVERSION_CONTRACT_VERSION_MISMATCH", "CONTRACT_VERSION_MISMATCH"],
    ["noget helt andet", "UNKNOWN"],
  ])("begin: %s ⇒ %s", async (message, code) => {
    const { client } = fakeSupabase({ rpc: () => ({ data: null, error: { message } }) });
    expect(await supabaseConversionPersistence(client).beginSyncRun({ contractVersion: 2, leaseSeconds: 1800 })).toEqual({ ok: false, code });
  });

  it("commit-fejl ⇒ COMMIT_REJECTED; fail-fejl ⇒ ok:false", async () => {
    const { client } = fakeSupabase({ rpc: () => ({ data: null, error: { message: "CONVERSION_COHORT_TERMINAL_FROZEN" } }) });
    const p = supabaseConversionPersistence(client);
    expect(
      await p.commitSyncRun({ runId: "r", syncGeneration: 0, contractVersion: 2, observedAt: T1, isBaseline: false, rows: [] }),
    ).toEqual({ ok: false, code: "COMMIT_REJECTED" });
    expect(await p.failSyncRun({ runId: "r", errorCode: "HTTP_5XX" })).toEqual({ ok: false, code: "UNKNOWN" });
  });

  it("commit sender hele batchen som ÉN RPC med ISO-strenge og kun pseudonymiserede nøgler", async () => {
    let captured: Record<string, unknown> | null = null;
    const { client, calls } = fakeSupabase({
      rpc: (_fn, args) => {
        captured = args;
        return { data: [{ observed_count: 1, enrolled_count: 1, excluded_count: 0, booked_count: 0, conflict_count: 0 }], error: null };
      },
    });
    const row = enrolledRow();
    const res = await supabaseConversionPersistence(client).commitSyncRun({
      runId: "r",
      syncGeneration: 3,
      contractVersion: CONTRACT_VERSION,
      observedAt: T1,
      isBaseline: false,
      rows: [row],
    });
    expect(res).toEqual({ ok: true, counts: { observed: 1, enrolled: 1, excluded: 0, booked: 0, conflicts: 0 } });
    expect(calls).toEqual(["rpc.conversion_commit_sync_run"]);
    expect(captured!.p_rows).toEqual([serializeCohortRow(row)]);
    expect(captured!.p_observed_at).toBe(T1.toISOString());
  });
});

function enrolledRow(overrides: Partial<ClassifiedDealResult> = {}): ClassifiedDealResult {
  return {
    dealKey: hex("1"),
    firstSeenAt: T1,
    lastObservedAt: T1,
    eligibilityStatus: "ENROLLED",
    exclusionReason: null,
    firstQualifiedObservationAt: T1,
    exposureGroup: "PDF_ONLY",
    exposureFrozenAt: T1,
    bookingMatchKey: hex("a"),
    bookingConflictDetectedAt: null,
    outcomeStatus: "NOT_BOOKED",
    firstBookedAt: null,
    lostObservedAt: null,
    outcomeConflictObservedAt: null,
    contractVersion: CONTRACT_VERSION,
    ...overrides,
  };
}

describe("frys-regler — spejler DB-triggeren og CHECK-constraints", () => {
  const { dealKey: _k, ...enrolledState } = enrolledRow();
  const state: CohortState = enrolledState;

  it("terminale felter kan ikke ændres", () => {
    expect(cohortTransitionViolation(state, { ...state, exposureGroup: "ONLINE" })).toBe("terminal_frozen");
    expect(cohortTransitionViolation(state, { ...state, firstQualifiedObservationAt: T0, exposureFrozenAt: T0 })).toBe("terminal_frozen");
    expect(cohortTransitionViolation(state, { ...state, eligibilityStatus: "EXCLUDED", exclusionReason: "SHARED_BOOKING_REFERENCE" })).toBe("terminal_frozen");
    expect(cohortTransitionViolation(state, { ...state, bookingMatchKey: hex("b") })).toBe("terminal_frozen");
  });

  it("booket, tabt og konflikter kan ikke fortrydes", () => {
    const booked = { ...state, outcomeStatus: "BOOKED" as const, firstBookedAt: T1 };
    expect(cohortTransitionViolation(booked, { ...booked, outcomeStatus: "NOT_BOOKED", firstBookedAt: null })).toBe("booked_frozen");
    expect(cohortTransitionViolation({ ...state, lostObservedAt: T1 }, state)).toBe("lost_frozen");
    expect(cohortTransitionViolation({ ...state, bookingConflictDetectedAt: T1 }, state)).toBe("conflict_frozen");
  });

  it("række-invarianter", () => {
    expect(cohortRowViolation({ ...state, bookingMatchKey: null })).toBe("enrolled_fields");
    expect(cohortRowViolation({ ...state, eligibilityStatus: "ELIGIBLE_PENDING", exposureGroup: null, exposureFrozenAt: null })).not.toBeNull();
    expect(cohortRowViolation({ ...state, outcomeStatus: "BOOKED" })).toBe("booked_pair");
  });

  it("batch: ny kohortestart skal være kørslens observedAt; ingen PRE_START efter baseline; ingen dubletter", () => {
    const req = (rows: ClassifiedDealResult[], isBaseline = false): CommitRequest => ({
      runId: "r",
      syncGeneration: 0,
      contractVersion: CONTRACT_VERSION,
      observedAt: T1,
      isBaseline,
      rows,
    });
    expect(commitBatchViolation(req([enrolledRow()]), new Map())).toBeNull();
    expect(
      commitBatchViolation(req([enrolledRow({ firstQualifiedObservationAt: T0, exposureFrozenAt: T0 })]), new Map()),
    ).toBe("cohort_start_not_observed_at");
    const pre = enrolledRow({
      eligibilityStatus: "PRE_START_EXISTING",
      firstQualifiedObservationAt: null,
      exposureGroup: null,
      exposureFrozenAt: null,
      bookingMatchKey: null,
    });
    expect(commitBatchViolation(req([pre]), new Map())).toBe("pre_start_after_baseline");
    expect(commitBatchViolation(req([enrolledRow(), enrolledRow()]), new Map())).toBe("duplicate_deal_key");
    expect(commitBatchViolation(req([enrolledRow()], true), new Map())).toBe("baseline_status");
  });
});
