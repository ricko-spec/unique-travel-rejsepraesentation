import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatOperatorReport, readOnlyPersistence, runOperatorDryRun, safeCount10, type RowCounts } from "./operatorDryRun";
import { createFixtureHubSpotAdapter, fixtureObservation } from "./hubspotAdapter";
import { createInMemoryConversionPersistence, type ConversionPersistence } from "./persistence";
import { CONTRACT_VERSION } from "./contract";

const SECRETS = { dealKeySecret: "d".repeat(64), bookingMatchSecret: "b".repeat(64) };

function deals(n: number) {
  return Array.from({ length: n }, (_, i) =>
    // Rigtige v3-stage-id'er: hver tredje er "Lead (Aktive)" (PRE_QUOTE), resten "Tilbud sendt".
    fixtureObservation({ rawDealId: String(i + 1), dealStageId: i % 3 === 0 ? "1098732865" : "1098732868", bookingNumberRaw: String(70000 + i) }),
  );
}

function spied(p: ConversionPersistence) {
  const calls: string[] = [];
  const out = {} as ConversionPersistence;
  for (const k of Object.keys(p) as (keyof ConversionPersistence)[]) {
    const fn = p[k] as (...a: unknown[]) => unknown;
    (out as Record<string, unknown>)[k] = (...a: unknown[]) => {
      calls.push(k);
      return fn(...a);
    };
  }
  return { p: out, calls };
}

// runOperatorDryRun bruger altid repo-kontrakten (PIPELINE_STAGE_CONTRACT).
const counts = (c: RowCounts) => async () => ({ ok: true as const, counts: c });

describe("readOnlyPersistence — skrivemetoder kan ikke nås", () => {
  it("begin/commit/fail kaster og tælles; læsemetoder går igennem", async () => {
    const guarded = readOnlyPersistence(createInMemoryConversionPersistence({ measurementState: null }));
    await expect(guarded.beginSyncRun({ contractVersion: CONTRACT_VERSION, leaseSeconds: 1800 })).rejects.toThrow("DRY_RUN_WRITE_FORBIDDEN");
    await expect(
      guarded.commitSyncRun({ runId: "r", syncGeneration: 0, contractVersion: 3, observedAt: new Date(), isBaseline: true, rows: [] }),
    ).rejects.toThrow("DRY_RUN_WRITE_FORBIDDEN");
    await expect(guarded.failSyncRun({ runId: "r", errorCode: "UNKNOWN" })).rejects.toThrow("DRY_RUN_WRITE_FORBIDDEN");
    expect(guarded.writeAttempts()).toBe(3);
    expect(await guarded.loadMeasurementState()).toEqual({ ok: true, state: null });
  });
});

describe("runOperatorDryRun", () => {
  it("kalder aldrig beginSyncRun/commitSyncRun/failSyncRun — heller ikke ved fejl i kilden", async () => {
    for (const adapter of [
      createFixtureHubSpotAdapter({ deals: deals(30) }),
      createFixtureHubSpotAdapter({ deals: deals(30), failOnPageIndex: 0, failReason: "http-5xx" }),
    ]) {
      const { p, calls } = spied(createInMemoryConversionPersistence({ measurementState: null }));
      const r = await runOperatorDryRun({ adapter, persistence: p, countRows: counts({ state: 0, cohort: 0, runs: 0 }), ...SECRETS });
      expect(calls.filter((c) => c === "beginSyncRun" || c === "commitSyncRun" || c === "failSyncRun")).toEqual([]);
      expect(r.writeAttempts).toBe(0);
    }
  });

  it("uden singleton-række og med DB-default v2 (kode v3) gennemføres dry-run (PASS) — versionen blokerer kun non-dry-run", async () => {
    for (const state of [null, { status: "NOT_STARTED" as const, contractVersion: 2, measurementStartedAt: null, lastSuccessfulSyncAt: null }]) {
      const r = await runOperatorDryRun({
        adapter: createFixtureHubSpotAdapter({ deals: deals(3) }),
        persistence: createInMemoryConversionPersistence({ measurementState: state }),
        countRows: counts({ state: state ? 1 : 0, cohort: 0, runs: 0 }),
        ...SECRETS,
      });
      expect(r).toMatchObject({ verdict: "PASS", errorCode: null, stageContract: "MATCH", writeAttempts: 0, rowsUnchanged: true, observed: 3 });
    }
  });

  it("ændrede rækkeantal ⇒ FAIL ROWS_CHANGED; manglende før/efter-tælling ⇒ PRECHECK/POSTCHECK_FAILED", async () => {
    let n = 0;
    const changing = async () => ({ ok: true as const, counts: { state: 0, cohort: 0, runs: n++ } });
    const base = { adapter: createFixtureHubSpotAdapter({ deals: deals(3) }), persistence: createInMemoryConversionPersistence({ measurementState: null }), ...SECRETS };
    expect(await runOperatorDryRun({ ...base, countRows: changing })).toMatchObject({ verdict: "FAIL", errorCode: "ROWS_CHANGED", rowsUnchanged: false });
    expect(await runOperatorDryRun({ ...base, countRows: async () => null as never })).toMatchObject({ verdict: "FAIL", errorCode: "PRECHECK_FAILED", precheckFailures: [] });
    // Ugyldige tal i et "ok"-svar er stadig fail-closed.
    expect(await runOperatorDryRun({ ...base, countRows: async () => ({ ok: true, counts: { state: -1, cohort: 0, runs: 0 } }) })).toMatchObject({ verdict: "FAIL", errorCode: "PRECHECK_FAILED" });
    // Ukendte tabeller/kategorier (fx rå tekst) filtreres væk fra rapporten.
    const junk = await runOperatorDryRun({ ...base, countRows: async () => ({ ok: false, failures: [{ table: "x?select=*" as never, category: "permission denied" as never }] }) });
    expect(junk).toMatchObject({ verdict: "FAIL", errorCode: "PRECHECK_FAILED", precheckFailures: [] });
    let first = true;
    const postFails = async () => {
      if (first) {
        first = false;
        return { ok: true as const, counts: { state: 0, cohort: 0, runs: 0 } };
      }
      throw new Error("db nede");
    };
    expect(await runOperatorDryRun({ ...base, countRows: postFails })).toMatchObject({ verdict: "FAIL", errorCode: "POSTCHECK_FAILED" });
  });

  it("et skriveforsøg (fx en fremtidig motor-regression) giver altid FAIL WRITE_ATTEMPTED og når aldrig persistence", async () => {
    const { p, calls } = spied(createInMemoryConversionPersistence({ measurementState: null }));
    const r = await runOperatorDryRun({
      adapter: createFixtureHubSpotAdapter({ deals: deals(3) }),
      persistence: p,
      countRows: counts({ state: 0, cohort: 0, runs: 0 }),
      ...SECRETS,
      engine: async (_a, persistence) => {
        await persistence.beginSyncRun({ contractVersion: CONTRACT_VERSION, leaseSeconds: 1800 }).catch(() => undefined);
        return { ok: true, dryRun: true, isBaseline: true, counts: { observed: 3, enrolled: 0, excluded: 0, booked: 0, conflicts: 0 } };
      },
    });
    expect(r).toMatchObject({ verdict: "FAIL", errorCode: "WRITE_ATTEMPTED", writeAttempts: 1 });
    expect(calls).not.toContain("beginSyncRun");
  });

  it("en PASS kræver ok dry-run, 0 skriveforsøg og uændrede rækker", async () => {
    const r = await runOperatorDryRun({
      adapter: createFixtureHubSpotAdapter({ deals: deals(3) }),
      persistence: createInMemoryConversionPersistence({ measurementState: null }),
      countRows: counts({ state: 0, cohort: 0, runs: 0 }),
      ...SECRETS,
      engine: async () => ({ ok: true, dryRun: true, isBaseline: true, counts: { observed: 3, enrolled: 0, excluded: 0, booked: 0, conflicts: 0 } }),
    });
    expect(r).toMatchObject({ verdict: "PASS", errorCode: null, stageContract: "MATCH", rowsUnchanged: true, writeAttempts: 0 });
  });

  it("en live stage-liste, der ikke matcher kontrakt v3, rapporteres som CONTRACT_DRIFT", async () => {
    const r = await runOperatorDryRun({
      adapter: createFixtureHubSpotAdapter({ deals: deals(3), stages: [
          { id: "1098732868", closed: false, label: "Tilbud sendt", displayOrder: 6, archived: false },
          { id: "ukendt", closed: false, label: "ukendt", displayOrder: 99, archived: false },
        ] }),
      persistence: createInMemoryConversionPersistence({ measurementState: null }),
      countRows: counts({ state: 0, cohort: 0, runs: 0 }),
      ...SECRETS,
    });
    expect(r).toMatchObject({ verdict: "FAIL", stageContract: "CONTRACT_DRIFT", writeAttempts: 0, rowsUnchanged: true });
  });
});

describe("formatOperatorReport — kun small-cell-sikre aggregater", () => {
  const report = {
    verdict: "PASS" as const,
    errorCode: null,
    stageContract: "MATCH" as const,
    isBaseline: true,
    observed: 2600,
    enrolled: 0,
    excluded: 0,
    booked: 2593,
    conflicts: 0,
    summary: {
      byEligibility: { PRE_START_EXISTING: 2000, ELIGIBLE_PENDING: 600, ENROLLED: 0, EXCLUDED: 0 },
      byExclusionReason: {
        MISSING_BOOKING_NO: 3,
        INVALID_BOOKING_NO_FORMAT: 0,
        SHARED_BOOKING_REFERENCE: 12,
        CLOSED_BEFORE_QUALIFIED_OBSERVATION: 0,
        BOOKED_BEFORE_QUALIFIED_OBSERVATION: 0,
      },
      byPostEnrollmentExclusion: { BOOKED_OTHER_REFERENCE_UNRESOLVED: 4, INVALIDATED_DUPLICATE_OR_TEST: 0 },
      lostObserved: 7,
      outcomeConflicts: 0,
    },
    writeAttempts: 0,
    pre: { state: 0, cohort: 0, runs: 0 },
    post: { state: 0, cohort: 0, runs: 0 },
    precheckFailures: null,
    postcheckFailures: null,
    rowsUnchanged: true,
  };

  it("1–9 vises aldrig; booket skjules når komplementet er lille; 0 og ≥ 10 vises", () => {
    const text = formatOperatorReport(report).join("\n");
    expect(text).toContain("MISSING_BOOKING_NO <10");
    expect(text).toContain("efterfølgende udelukket: BOOKED_OTHER_REFERENCE_UNRESOLVED <10 · INVALIDATED_DUPLICATE_OR_TEST 0");
    expect(text).toContain("SHARED_BOOKING_REFERENCE 12");
    expect(text).toContain("tabt/afvist observeret: <10");
    expect(text).toContain("booked: <10 (komplement lille)");
    expect(text).not.toContain("MISSING_BOOKING_NO 3");
    expect(text).not.toContain("observeret: 7");
    expect(text).not.toContain("2593");
    expect(safeCount10(0)).toBe("0");
    expect(safeCount10(9)).toBe("<10");
    expect(safeCount10(10)).toBe("10");
  });

  it("indeholder ingen id'er, nøgler eller secrets", () => {
    const text = formatOperatorReport(report).join("\n");
    expect(text).not.toMatch(/[0-9a-f]{32,}/);
    expect(text).not.toContain(SECRETS.dealKeySecret);
  });
});

describe("operatør-entrypoint — ikke en route, låst til production-projektet, genererer deal-key-secret i processen", () => {
  const root = process.cwd();
  it("entrypointet ligger uden for src/app og bruger ingen route-API", () => {
    const src = readFileSync(join(root, "scripts/operator/conversion-dry-run.ts"), "utf8");
    expect(src).toContain('const SUPABASE_URL = "https://iunixfpthdftmkgpugex.supabase.co"');
    expect(src).toContain("randomBytes(32)");
    // Ingen console.log må referere secret-variablerne (kategoriske strenge som "HubSpot-token" er ok).
    expect(src).not.toMatch(/console\.log\([^"'`)]*\b(token|bookingSecret|serviceKey|dealKeySecret)\b/);
    expect(src).not.toMatch(/\$\{(token|bookingSecret|serviceKey|dealKeySecret)\}/);
    expect(src).toContain("runOperatorDryRun");
    expect(src).not.toMatch(/beginSyncRun|commitSyncRun|failSyncRun/);
  });

  it("PowerShell-wrapperne bruger SecureString og rydder env/BSTR/clipboard i finally", () => {
    for (const f of ["scripts/operator/Invoke-ConversionDryRun.ps1", "scripts/operator/Get-ConversionStageMetadata.ps1"]) {
      const ps = readFileSync(join(root, f), "utf8");
      expect(ps).toContain("Read-Host -AsSecureString");
      expect(ps).toMatch(/finally\s*\{[\s\S]*ZeroFreeBSTR[\s\S]*Remove-Item[\s\S]*Set-Clipboard/);
      expect(ps).not.toMatch(/Write-Output[^\n]*\$env:(HUBSPOT|BOOKING|SUPABASE)/);
    }
  });
});
