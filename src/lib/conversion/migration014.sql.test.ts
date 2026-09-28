// Gate C2 (Issue #86) — migration 014 kørt mod RIGTIG Postgres (pglite,
// in-memory, ingen netværk, ingen production-adgang) oven på migration 013.
//
// Beviser at databasen SELV håndhæver Rickos to beslutninger (docs/DECISIONS.md
// 2026-09-25): efterfølgende udelukkelse kun på ENROLLED, kan ikke fjernes/
// ændres, kohortestart/eksponering kan ikke omskrives, markeret række kan ikke
// slettes, og markerede deals indgår aldrig i publicerede tal — også når
// rækkerne læses tilbage gennem den rigtige læsevej (COHORT_COLUMNS →
// parseCohortRow → buildConversionAggregate).
//
// MIGRATION_014_PATH kan pege på en muteret kopi (SQL-mutationstest, se
// docs/TESTING.md): enhver fjernet sikkerhedsgren skal fælde mindst én test.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { buildConversionAggregate } from "./aggregate";
import { CONTRACT_VERSION } from "./contract";
import { COHORT_COLUMNS, parseCohortRow, type CohortRawRow } from "./persistence";
import { POST_ENROLLMENT_EXCLUSION_REASONS, type CohortState } from "./types";

const ROOT = process.cwd();
const SQL_013 = readFileSync(join(ROOT, "supabase", "013_conversion_measurement.sql"), "utf8");
const SQL_014 = readFileSync(process.env.MIGRATION_014_PATH ?? join(ROOT, "supabase", "014_conversion_post_enrollment_v3.sql"), "utf8");

// Supabase-lignende roller + default ACL (Supabase giver automatisk ALL til de
// tre API-roller på nye objekter i public) — så migrationens revokes testes reelt.
const SUPABASE_ROLES = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const TABLES = ["conversion_measurement_state", "conversion_deal_cohort", "conversion_sync_runs"];
const TIMEOUT = 120_000;
const DAY = 86_400_000;
const NOW = Date.now();
const T0 = new Date(NOW - 4 * DAY);
const T1 = new Date(NOW - 3 * DAY);
const T2 = new Date(NOW - 2 * DAY);
const T3 = new Date(NOW - 1 * DAY);
const T4 = new Date(NOW - 60_000);

const key = (n: number) => n.toString(16).padStart(64, "0");
const bkey = (n: number) => (n + 0x1000).toString(16).padStart(64, "0");

type Row = Record<string, string | number | null>;

function pendingRow(n: number, at: Date, version = 3): Row {
  return {
    deal_key: key(n),
    booking_match_key: null,
    first_seen_at: at.toISOString(),
    last_observed_at: at.toISOString(),
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
    contract_version: version,
  };
}

function enrolledRow(n: number, firstSeen: Date, start: Date, lastObserved: Date, extra: Row = {}, version = 3): Row {
  return {
    ...pendingRow(n, firstSeen, version),
    last_observed_at: lastObserved.toISOString(),
    booking_match_key: bkey(n),
    first_qualified_observation_at: start.toISOString(),
    exposure_group: "ONLINE",
    exposure_frozen_at: start.toISOString(),
    eligibility_status: "ENROLLED",
    ...extra,
  };
}

const mark = (reason: string | null, at: Date | null): Row => ({
  post_enrollment_exclusion_reason: reason,
  post_enrollment_excluded_at: at ? at.toISOString() : null,
});

async function freshDb(opts: { with013?: boolean; defaultAcl?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(opts.defaultAcl === false ? SUPABASE_ROLES.split("alter default privileges")[0] : SUPABASE_ROLES);
  if (opts.with013 !== false) await db.exec(SQL_013);
  return db;
}

async function asRole<T>(db: PGlite, role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function seedActive(db: PGlite, contractVersion?: number) {
  await db.exec("insert into public.conversion_measurement_state (id) values (1)");
  if (contractVersion !== undefined) await db.exec(`update public.conversion_measurement_state set contract_version = ${contractVersion}`);
  await db.exec("update public.conversion_measurement_state set status = 'ACTIVE'");
}

/** begin → commit som service_role. En afvist commit markeres FAILED (som motoren gør) og kaster videre. */
async function sync(
  db: PGlite,
  observedAt: Date,
  rows: Row[],
  opts: { version?: number; baseline?: boolean; fn?: string; commitVersion?: number } = {},
) {
  const version = opts.version ?? 3;
  return asRole(db, "service_role", async () => {
    const begin = await db.query<{ run_id: string; sync_generation: number }>(
      "select * from public.conversion_begin_sync_run($1, 600)",
      [version],
    );
    const { run_id, sync_generation } = begin.rows[0];
    try {
      const res = await db.query<Record<string, number>>(
        `select * from public.${opts.fn ?? "conversion_commit_sync_run_v3"}($1, $2, $3, $4, $5, $6::jsonb)`,
        [run_id, sync_generation, opts.commitVersion ?? version, observedAt.toISOString(), opts.baseline ?? false, JSON.stringify(rows)],
      );
      return res.rows[0];
    } catch (e) {
      await db.query("select public.conversion_fail_sync_run($1, 'COMMIT_REJECTED')", [run_id]);
      throw e;
    }
  });
}

/** Rækkerne læst tilbage præcis som app'en læser dem (COHORT_COLUMNS, service_role). */
async function readCohortAsApp(db: PGlite): Promise<CohortState[]> {
  const res = await asRole(db, "service_role", () =>
    db.query<Record<string, unknown>>(`select ${COHORT_COLUMNS} from public.conversion_deal_cohort order by deal_key`),
  );
  return res.rows.map((r) => {
    const raw = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])) as CohortRawRow;
    const parsed = parseCohortRow(raw);
    if (!parsed) throw new Error("parseCohortRow afviste en DB-række");
    return parsed.state;
  });
}

async function cohortDump(db: PGlite): Promise<string> {
  const res = await db.query("select * from public.conversion_deal_cohort order by deal_key");
  return JSON.stringify(res.rows);
}

async function stateRow(db: PGlite) {
  const res = await db.query<{ contract_version: number; status: string; sync_generation: number }>(
    "select contract_version, status, sync_generation from public.conversion_measurement_state",
  );
  return res.rows;
}

async function grantsSnapshot(db: PGlite) {
  const tables = await db.query<{ grantee: string; table_name: string; privilege_type: string }>(
    `select grantee, table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = any($1) and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      order by 1, 2, 3`,
    [TABLES],
  );
  const rls = await db.query<{ relname: string; relrowsecurity: boolean; policies: number }>(
    `select c.relname, c.relrowsecurity, (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any($1) order by 1`,
    [TABLES],
  );
  return { tables: tables.rows, rls: rls.rows };
}

async function canExecute(db: PGlite, role: string, signature: string): Promise<boolean> {
  const res = await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, signature]);
  return res.rows[0].ok;
}

const COMMIT_V3 = "public.conversion_commit_sync_run_v3(uuid, bigint, integer, timestamptz, boolean, jsonb)";
const COMMIT_013 = "public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb)";

// Kohorte: 1..20 normale · 21..32 senere Dubletter/Test (12) · 33..43 senere
// "Solgt (andet booking nr.)" (11) + 45 optaget med statussen (1) = 12 · 44 normal.
const NORMAL = Array.from({ length: 20 }, (_, i) => i + 1);
const INVALIDATED = Array.from({ length: 12 }, (_, i) => i + 21);
const UNRESOLVED = Array.from({ length: 11 }, (_, i) => i + 33);
const BASELINE_KEYS = [...NORMAL, ...INVALIDATED, ...UNRESOLVED, 44];

/** 013 → state løftet af 014 → baseline → optagelse → efterfølgende markering. */
async function buildMainScenario() {
  const db = await freshDb();
  await db.exec("insert into public.conversion_measurement_state (id) values (1)"); // NOT_STARTED, v2
  const before = await grantsSnapshot(db);
  await db.exec(SQL_014);
  await db.exec("update public.conversion_measurement_state set status = 'ACTIVE'");

  await sync(db, T0, BASELINE_KEYS.map((n) => pendingRow(n, T0)), { baseline: true });
  await sync(db, T1, [
    ...[...NORMAL, ...INVALIDATED, ...UNRESOLVED, 44].map((n) => enrolledRow(n, T0, T1, T1)),
    enrolledRow(45, T1, T1, T1, mark("BOOKED_OTHER_REFERENCE_UNRESOLVED", T1)),
  ]);
  const booked = (at: Date) => ({ outcome_status: "BOOKED", first_booked_at: at.toISOString() });
  await sync(db, T2, [
    ...NORMAL.slice(0, 5).map((n) => enrolledRow(n, T0, T1, T2, booked(T2))),
    ...INVALIDATED.map((n, i) => enrolledRow(n, T0, T1, T2, { ...mark("INVALIDATED_DUPLICATE_OR_TEST", T2), ...(i < 6 ? booked(T2) : {}) })),
    ...UNRESOLVED.map((n) => enrolledRow(n, T0, T1, T2, mark("BOOKED_OTHER_REFERENCE_UNRESOLVED", T2))),
  ]);
  return { db, grantsBefore013Only: before };
}

describe("migration 014 — anvendelse, idempotens og kontraktløft", () => {
  it("afviser tydeligt uden migration 013", { timeout: TIMEOUT }, async () => {
    const db = await freshDb({ with013: false });
    await expect(db.exec(SQL_014)).rejects.toThrow(/CONVERSION_014_REQUIRES_013/);
  });

  it("ingen singleton-række ⇒ opretter ingen; default bliver 3 = CONTRACT_VERSION", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await db.exec(SQL_014);
    expect(await stateRow(db)).toEqual([]);
    const def = await db.query<{ column_default: string }>(
      `select column_default from information_schema.columns
        where table_name = 'conversion_measurement_state' and column_name = 'contract_version'`,
    );
    expect(def.rows[0].column_default).toBe(String(CONTRACT_VERSION));
    expect(CONTRACT_VERSION).toBe(3);
    // Genkørsel er en no-op.
    await db.exec(SQL_014);
    expect(await stateRow(db)).toEqual([]);
  });

  it("NOT_STARTED-række på v2 løftes til 3 (og kun den); status røres ikke", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await db.exec("insert into public.conversion_measurement_state (id) values (1)");
    expect(await stateRow(db)).toEqual([{ contract_version: 2, status: "NOT_STARTED", sync_generation: 0 }]);
    await db.exec(SQL_014);
    expect(await stateRow(db)).toEqual([{ contract_version: 3, status: "NOT_STARTED", sync_generation: 0 }]);
  });

  it("v3-skrivevejen afviser kontrakt < 3, også hvis state manuelt er sat tilbage til 2", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await db.exec(SQL_014);
    await seedActive(db, 2);
    await expect(sync(db, T0, [pendingRow(1, T0, 2)], { version: 2, baseline: true })).rejects.toThrow(/CONVERSION_CONTRACT_VERSION_MISMATCH/);
    expect((await db.query("select 1 from public.conversion_deal_cohort")).rows).toHaveLength(0);
  });

  it("startet måling under v2 ⇒ fejler tydeligt, og INTET ændres (heller ikke kolonner)", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await seedActive(db);
    await sync(db, T0, [pendingRow(1, T0, 2)], { version: 2, baseline: true, fn: "conversion_commit_sync_run" });
    await sync(db, T1, [enrolledRow(1, T0, T1, T1, {}, 2)], { version: 2, fn: "conversion_commit_sync_run" });
    const dump = await cohortDump(db);
    await expect(db.exec(SQL_014)).rejects.toThrow(/CONVERSION_014_REQUIRES_NOT_STARTED/);
    const cols = await db.query(
      "select 1 from information_schema.columns where table_name = 'conversion_deal_cohort' and column_name like 'post_enrollment%'",
    );
    expect(cols.rows).toHaveLength(0);
    expect(await cohortDump(db)).toBe(dump);
    expect((await stateRow(db))[0].contract_version).toBe(2);
  });

  it("eksisterende gyldige 013-rækker forbliver gyldige og uændrede (tabellerne antages ikke tomme)", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await seedActive(db);
    await sync(db, T0, [pendingRow(1, T0, 2), pendingRow(2, T0, 2), pendingRow(3, T0, 2)], { version: 2, baseline: true, fn: "conversion_commit_sync_run" });
    await sync(db, T1, [enrolledRow(1, T0, T1, T1, { outcome_status: "BOOKED", first_booked_at: T1.toISOString() }, 2), enrolledRow(2, T0, T1, T1, {}, 2)], {
      version: 2,
      fn: "conversion_commit_sync_run",
    });
    // Hypotetisk: versionen er allerede løftet af en operatør ⇒ 014 må køre; 013-rækkerne skal stadig være gyldige.
    await db.exec("update public.conversion_measurement_state set contract_version = 3");
    const before = await db.query("select * from public.conversion_deal_cohort order by deal_key");
    await db.exec(SQL_014);
    const after = await db.query<Record<string, unknown>>("select * from public.conversion_deal_cohort order by deal_key");
    expect(after.rows).toHaveLength(3);
    for (const [i, row] of after.rows.entries()) {
      const { post_enrollment_exclusion_reason, post_enrollment_excluded_at, ...rest } = row;
      expect(post_enrollment_exclusion_reason).toBeNull();
      expect(post_enrollment_excluded_at).toBeNull();
      expect(rest).toEqual(before.rows[i]);
    }
    // Alle CHECKs er VALIDATED mod de eksisterende rækker (ingen NOT VALID).
    const notValid = await db.query("select conname from pg_constraint where conrelid = 'public.conversion_deal_cohort'::regclass and not convalidated");
    expect(notValid.rows).toEqual([]);
    // Og de kan læses gennem den rigtige læsevej.
    expect((await readCohortAsApp(db)).map((r) => r.postEnrollmentExclusionReason)).toEqual([null, null, null]);
  });
});

describe("migration 014 — invarianter håndhævet af databasen", () => {
  it("begge årsager kan sættes på ENROLLED (ved optagelse og senere), og genkørsel ændrer intet", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    const counts = await db.query<{ reason: string | null; n: number }>(
      "select post_enrollment_exclusion_reason as reason, count(*)::int as n from public.conversion_deal_cohort group by 1 order by 1 nulls first",
    );
    expect(counts.rows).toEqual([
      { reason: null, n: 21 },
      { reason: "BOOKED_OTHER_REFERENCE_UNRESOLVED", n: 12 },
      { reason: "INVALIDATED_DUPLICATE_OR_TEST", n: 12 },
    ]);
    const k45 = await db.query<{ post_enrollment_excluded_at: Date; first_qualified_observation_at: Date }>(
      "select post_enrollment_excluded_at, first_qualified_observation_at from public.conversion_deal_cohort where deal_key = $1",
      [key(45)],
    );
    expect(k45.rows[0].post_enrollment_excluded_at.toISOString()).toBe(T1.toISOString());

    const dump = await cohortDump(db);
    const state = await stateRow(db);
    await db.exec(SQL_014);
    expect(await cohortDump(db)).toBe(dump);
    expect(await stateRow(db)).toEqual(state);
  });

  it("afvisninger: ikke-ENROLLED, historisk tidspunkt, fjernelse, ændring, omskrivning — alt-eller-intet", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    const dump = await cohortDump(db);
    const a = INVALIDATED[INVALIDATED.length - 1]; // markeret, ikke booket

    // Markering på en ikke-optaget deal.
    await expect(sync(db, T3, [{ ...pendingRow(99, T3), ...mark("INVALIDATED_DUPLICATE_OR_TEST", T3) }])).rejects.toThrow(
      /post_enrollment_requires_enrolled_check/,
    );
    // Ny markering med historisk tidspunkt (kohortestart i stedet for kørslen).
    await expect(sync(db, T3, [enrolledRow(6, T0, T1, T3, mark("INVALIDATED_DUPLICATE_OR_TEST", T2))])).rejects.toThrow(
      /CONVERSION_POST_ENROLLMENT_AT_INVALID/,
    );
    // Fjernelse, ændret årsag, flyttet tidspunkt.
    await expect(sync(db, T3, [enrolledRow(a, T0, T1, T3, mark(null, null))])).rejects.toThrow(/CONVERSION_COHORT_POST_ENROLLMENT_FROZEN/);
    await expect(sync(db, T3, [enrolledRow(a, T0, T1, T3, mark("BOOKED_OTHER_REFERENCE_UNRESOLVED", T2))])).rejects.toThrow(
      /CONVERSION_COHORT_POST_ENROLLMENT_FROZEN/,
    );
    await expect(sync(db, T3, [enrolledRow(a, T0, T1, T3, mark("INVALIDATED_DUPLICATE_OR_TEST", T3))])).rejects.toThrow(
      /CONVERSION_COHORT_POST_ENROLLMENT_FROZEN/,
    );
    // Eksponering og kohortestart kan ikke omskrives på en markeret deal.
    await expect(
      sync(db, T3, [enrolledRow(a, T0, T1, T3, { ...mark("INVALIDATED_DUPLICATE_OR_TEST", T2), exposure_group: "PDF_ONLY" })]),
    ).rejects.toThrow(/CONVERSION_COHORT_TERMINAL_FROZEN/);
    await expect(
      sync(db, T3, [
        enrolledRow(a, T0, T1, T3, {
          ...mark("INVALIDATED_DUPLICATE_OR_TEST", T2),
          first_qualified_observation_at: T0.toISOString(),
          exposure_frozen_at: T0.toISOString(),
        }),
      ]),
    ).rejects.toThrow(/CONVERSION_COHORT_TERMINAL_FROZEN/);
    // Alt-eller-intet: én gyldig ny markering + én ulovlig fjernelse ⇒ intet skrives.
    await expect(
      sync(db, T3, [enrolledRow(6, T0, T1, T3, mark("INVALIDATED_DUPLICATE_OR_TEST", T3)), enrolledRow(a, T0, T1, T3, mark(null, null))]),
    ).rejects.toThrow(/CONVERSION_COHORT_POST_ENROLLMENT_FROZEN/);
    // v3-skrivevejen kræver kontrakt ≥ 3.
    await expect(sync(db, T3, [enrolledRow(6, T0, T1, T3)], { commitVersion: 2 })).rejects.toThrow(/CONVERSION_CONTRACT_VERSION_MISMATCH/);

    expect(await cohortDump(db)).toBe(dump);
    // En markering, der gentages uændret i en senere kørsel, er gyldig.
    await sync(db, T3, [enrolledRow(a, T0, T1, T3, mark("INVALIDATED_DUPLICATE_OR_TEST", T2))]);
  });

  it("CHECKs direkte (også for ejeren inde i en kørsel): par, gyldig årsag, rækkefølge, kontrakt ≥ 3", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    const attempt = (setSql: string) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('conversion.active_run', 'test', true)");
        await tx.query(`update public.conversion_deal_cohort set ${setSql} where deal_key = $1`, [key(6)]);
      });
    await expect(attempt(`post_enrollment_exclusion_reason = 'INVALIDATED_DUPLICATE_OR_TEST'`)).rejects.toThrow(/post_enrollment_pair_check/);
    await expect(attempt(`post_enrollment_exclusion_reason = 'NOGET_ANDET', post_enrollment_excluded_at = '${T1.toISOString()}'`)).rejects.toThrow(
      /post_enrollment_reason_check/,
    );
    await expect(
      attempt(`post_enrollment_exclusion_reason = 'INVALIDATED_DUPLICATE_OR_TEST', post_enrollment_excluded_at = '${T0.toISOString()}'`),
    ).rejects.toThrow(/post_enrollment_order_check/);
    await expect(
      attempt(`post_enrollment_exclusion_reason = 'INVALIDATED_DUPLICATE_OR_TEST', post_enrollment_excluded_at = '${T4.toISOString()}'`),
    ).rejects.toThrow(/post_enrollment_order_check/);
    await expect(
      attempt(`post_enrollment_exclusion_reason = 'INVALIDATED_DUPLICATE_OR_TEST', post_enrollment_excluded_at = '${T1.toISOString()}', contract_version = 2`),
    ).rejects.toThrow(/post_enrollment_contract_check/);
  });

  it("revisionsspor: markeret række kan hverken slettes eller trunkeres (heller ikke af ejeren)", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    await expect(db.query("delete from public.conversion_deal_cohort where deal_key = $1", [key(INVALIDATED[0])])).rejects.toThrow(
      /CONVERSION_COHORT_POST_ENROLLMENT_DELETE_FORBIDDEN/,
    );
    await expect(db.exec("truncate public.conversion_deal_cohort")).rejects.toThrow(/CONVERSION_COHORT_POST_ENROLLMENT_DELETE_FORBIDDEN/);
    await expect(
      asRole(db, "service_role", () => db.query("delete from public.conversion_deal_cohort where deal_key = $1", [key(1)])),
    ).rejects.toThrow(/permission denied/);
    const n = await db.query<{ n: number }>("select count(*)::int as n from public.conversion_deal_cohort");
    expect(n.rows[0].n).toBe(45);
  });

  it("skrivning uden for commit-RPC'en afvises fortsat (013-værnet)", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    await expect(
      asRole(db, "service_role", () =>
        db.query("update public.conversion_deal_cohort set post_enrollment_exclusion_reason = null, post_enrollment_excluded_at = null where deal_key = $1", [
          key(INVALIDATED[0]),
        ]),
      ),
    ).rejects.toThrow(/CONVERSION_COHORT_WRITE_OUTSIDE_SYNC/);
  });
});

describe("migration 014 — publicering og app-kontrakt", () => {
  it("markerede deals indgår aldrig i publicerede tællere/nævnere — læst gennem den rigtige læsevej", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    const rows = await readCohortAsApp(db);
    expect(rows).toHaveLength(45);
    const measurement = { status: "ACTIVE" as const, contractVersion: 3, measurementStartedAt: T0, lastSuccessfulSyncAt: T2 };
    const asOf = new Date(NOW + 120 * DAY);
    const a = buildConversionAggregate(rows, measurement, asOf);
    expect(a.groups.ONLINE.totalEnrolled).toBe(21);
    expect(a.groups.PDF_ONLY.totalEnrolled ?? 0).toBe(0);
    expect(a.dataQuality.postEnrollmentExcluded).toEqual({ BOOKED_OTHER_REFERENCE_UNRESOLVED: 12, INVALIDATED_DUPLICATE_OR_TEST: 12 });

    // Kontrafaktisk: læst UDEN markeringen (som et 013-læsested ville) ville 24 ekstra deals —
    // heraf 6 bookede dubletter/test — være publiceret. Derfor deler admin og motor COHORT_COLUMNS.
    const stripped = rows.map((r) => ({ ...r, postEnrollmentExclusionReason: null, postEnrollmentExcludedAt: null }));
    expect(buildConversionAggregate(stripped, measurement, asOf).groups.ONLINE.totalEnrolled).toBe(45);
  });

  it("app-kontrakten matcher DB-kontrakten: kolonner, årsager og version", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await db.exec(SQL_014);
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'conversion_deal_cohort'",
    );
    const dbCols = new Set(cols.rows.map((r) => r.column_name));
    for (const c of COHORT_COLUMNS.split(",").map((s) => s.trim())) expect(dbCols.has(c)).toBe(true);
    const check = await db.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'conversion_deal_cohort_post_enrollment_reason_check'",
    );
    for (const reason of POST_ENROLLMENT_EXCLUSION_REASONS) expect(check.rows[0].def).toContain(`'${reason}'`);
    expect((check.rows[0].def.match(/'[A-Z_]+'/g) ?? []).length).toBe(POST_ENROLLMENT_EXCLUSION_REASONS.length);
  });
});

/** Katalog-fingeraftryk for konverteringsobjekterne (kolonner, constraints, triggere, funktioner, ACL'er, kommentarer). */
async function catalog(db: PGlite) {
  const q = async (sql: string) => JSON.stringify((await db.query(sql)).rows);
  return {
    columns: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
                       where table_schema = 'public' and table_name like 'conversion%' order by 1, 2`),
    constraints: await q(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint
                           where connamespace = 'public'::regnamespace and conrelid::regclass::text like '%conversion%' order by 1, 2`),
    triggers: await q(`select tgrelid::regclass::text as t, tgname, pg_get_triggerdef(oid) as def from pg_trigger
                        where not tgisinternal and tgrelid::regclass::text like '%conversion%' order by 1, 2`),
    functions: await q(`select p.oid::regprocedure::text as sig, p.proacl::text as acl, md5(p.prosrc) as src from pg_proc p
                         where p.pronamespace = 'public'::regnamespace and p.proname like 'conversion%' order by 1`),
    tableAcl: await q(`select relname, relacl::text from pg_class where relnamespace = 'public'::regnamespace and relname like 'conversion%' order by 1`),
    comments: await q(`select c.relname, d.objsubid, d.description from pg_description d join pg_class c on c.oid = d.objoid
                        where c.relnamespace = 'public'::regnamespace and c.relname like 'conversion%' order by 1, 2`),
  };
}

const SQL_ROLLBACK = readFileSync(join(ROOT, "supabase", "rollback", "014_conversion_post_enrollment_v3_rollback.sql"), "utf8");

describe("migration 014 — rollback", () => {
  it("014 + rollback-SQL ⇒ katalog identisk med ren 013 (også med eksisterende umarkerede rækker og NOT_STARTED v3-række)", { timeout: TIMEOUT }, async () => {
    const ref = await freshDb();
    await ref.exec("insert into public.conversion_measurement_state (id) values (1)");
    const expected = await catalog(ref);

    const db = await freshDb();
    await db.exec("insert into public.conversion_measurement_state (id) values (1)");
    await db.exec(SQL_014);
    expect(await catalog(db)).not.toEqual(expected);
    await db.exec(SQL_ROLLBACK);
    expect(await catalog(db)).toEqual(expected);
    expect(await stateRow(db)).toEqual([{ contract_version: 2, status: "NOT_STARTED", sync_generation: 0 }]);
    // Idempotent / genanvendelig: 014 kan køres igen efter rollback.
    await db.exec(SQL_014);
    expect((await stateRow(db))[0].contract_version).toBe(3);
  });

  it("rollback afbrydes (intet ændres) når en markering findes — revisionssporet slettes aldrig stiltiende", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    const before = await catalog(db);
    await expect(db.exec(SQL_ROLLBACK)).rejects.toThrow(/CONVERSION_014_ROLLBACK_WOULD_DROP_AUDIT_TRAIL/);
    await db.exec("rollback");
    expect(await catalog(db)).toEqual(before);
  });

  it("rollback afbrydes når målingen er startet under v3, selv uden markeringer", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await db.exec("insert into public.conversion_measurement_state (id) values (1)");
    await db.exec(SQL_014);
    await db.exec("update public.conversion_measurement_state set status = 'ACTIVE'");
    await sync(db, T0, [pendingRow(1, T0)], { baseline: true });
    await expect(db.exec(SQL_ROLLBACK)).rejects.toThrow(/CONVERSION_014_ROLLBACK_REQUIRES_NOT_STARTED/);
    await db.exec("rollback");
    expect((await stateRow(db))[0].contract_version).toBe(3);
  });
});

describe("migration 014 — deny-by-default (RLS og grants)", () => {
  it("tabel-grants, RLS og policies er uændrede; kun service_role SELECT/INSERT/UPDATE", { timeout: TIMEOUT }, async () => {
    const { db, grantsBefore013Only } = await buildMainScenario();
    const after = await grantsSnapshot(db);
    expect(after).toEqual(grantsBefore013Only);
    const privs = new Set(after.tables.map((g) => `${g.grantee}:${g.privilege_type}`));
    expect([...privs].sort()).toEqual(["service_role:INSERT", "service_role:SELECT", "service_role:UPDATE"]);
    expect(after.rls.every((r) => r.relrowsecurity && r.policies === 1)).toBe(true);
  });

  it("EXECUTE: v3-skrivevej kun service_role; 013-skrivevej ingen API-rolle; anon/authenticated intet", { timeout: TIMEOUT }, async () => {
    const db = await freshDb();
    await db.exec(SQL_014);
    const fns = [
      COMMIT_V3,
      "public.conversion_parse_batch_v3(jsonb)",
      COMMIT_013,
      "public.conversion_parse_batch(jsonb)",
      "public.conversion_deal_cohort_post_enrollment_guard()",
      "public.conversion_deal_cohort_truncate_guard()",
      "public.conversion_begin_sync_run(integer, integer)",
      "public.conversion_fail_sync_run(uuid, text)",
    ];
    for (const fn of fns) {
      expect(await canExecute(db, "anon", fn)).toBe(false);
      expect(await canExecute(db, "authenticated", fn)).toBe(false);
    }
    expect(await canExecute(db, "service_role", COMMIT_V3)).toBe(true);
    expect(await canExecute(db, "service_role", "public.conversion_parse_batch_v3(jsonb)")).toBe(true);
    expect(await canExecute(db, "service_role", COMMIT_013)).toBe(false);
    expect(await canExecute(db, "service_role", "public.conversion_parse_batch(jsonb)")).toBe(false);
    expect(await canExecute(db, "service_role", "public.conversion_deal_cohort_post_enrollment_guard()")).toBe(false);

    const secdef = await db.query<{ proname: string }>(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'conversion%' and prosecdef`,
    );
    expect(secdef.rows).toEqual([]);
    const noPath = await db.query<{ proname: string }>(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'conversion%'
          and not coalesce(array_to_string(proconfig, ',') like '%search_path=public, pg_catalog%', false)`,
    );
    expect(noPath.rows).toEqual([]);
  });

  it("uden Supabases default-ACL: de eksplicitte grants alene giver service_role præcis v3-skrivevejen", { timeout: TIMEOUT }, async () => {
    const db = await freshDb({ defaultAcl: false });
    await db.exec(SQL_014);
    expect(await canExecute(db, "service_role", COMMIT_V3)).toBe(true);
    expect(await canExecute(db, "service_role", "public.conversion_parse_batch_v3(jsonb)")).toBe(true);
    expect(await canExecute(db, "service_role", COMMIT_013)).toBe(false);
    expect(await canExecute(db, "anon", COMMIT_V3)).toBe(false);
  });

  it("anon/authenticated kan hverken læse kohorten eller kalde v3-commit; service_role kan ikke bruge 013-commit", { timeout: TIMEOUT }, async () => {
    const { db } = await buildMainScenario();
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(db, role, () => db.query("select * from public.conversion_deal_cohort"))).rejects.toThrow(/permission denied/);
      await expect(
        asRole(db, role, () =>
          db.query("select * from public.conversion_commit_sync_run_v3(gen_random_uuid(), 0, 3, now(), false, '[]'::jsonb)"),
        ),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(sync(db, T3, [enrolledRow(6, T0, T1, T3)], { fn: "conversion_commit_sync_run" })).rejects.toThrow(/permission denied/);
  });
});
