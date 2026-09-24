import { describe, expect, it } from "vitest";
import { buildConversionAggregate, suppressPartition, type CohortAggregateRow, type ConversionAggregate } from "./aggregate";
import { CONTRACT_VERSION, MATURITY_WINDOWS_DAYS } from "./contract";
import type { MeasurementState } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const ASOF = new Date("2027-03-01T12:00:00Z");
const MEASUREMENT: MeasurementState = {
  status: "ACTIVE",
  contractVersion: CONTRACT_VERSION,
  measurementStartedAt: new Date("2026-10-01T00:00:00Z"),
  lastSuccessfulSyncAt: new Date("2027-03-01T03:00:00Z"),
};

function row(overrides: Partial<CohortAggregateRow> = {}): CohortAggregateRow {
  return {
    eligibilityStatus: "ENROLLED",
    exclusionReason: null,
    firstQualifiedObservationAt: new Date("2026-10-10T03:00:00Z"),
    exposureGroup: "ONLINE",
    bookingConflictDetectedAt: null,
    outcomeStatus: "NOT_BOOKED",
    firstBookedAt: null,
    lostObservedAt: null,
    outcomeConflictObservedAt: null,
    ...overrides,
  };
}

/** n tilbud i kohortemåneden `month` (YYYY-MM, dag 10), heraf `booked` booket 5 dage efter kohortestart. */
function month(group: "ONLINE" | "PDF_ONLY", monthStr: string, n: number, booked: number): CohortAggregateRow[] {
  const start = new Date(`${monthStr}-10T03:00:00Z`);
  return Array.from({ length: n }, (_, i) =>
    row({
      exposureGroup: group,
      firstQualifiedObservationAt: start,
      outcomeStatus: i < booked ? "BOOKED" : "NOT_BOOKED",
      firstBookedAt: i < booked ? new Date(start.getTime() + 5 * DAY) : null,
    }),
  );
}

const agg = (rows: CohortAggregateRow[], asOf = ASOF) => buildConversionAggregate(rows, MEASUREMENT, asOf);

/** Alle publicerede udfaldstal i DTO'en: (tilbud, booket)-par. */
function publishedOutcomePairs(a: ConversionAggregate): [number, number][] {
  const out: [number, number][] = [];
  for (const g of [a.groups.ONLINE, a.groups.PDF_ONLY]) {
    for (const w of MATURITY_WINDOWS_DAYS) {
      const c = g.windows[w];
      if (!c.suppressed) out.push([c.denominator!, c.numerator!]);
    }
    for (const t of g.trend30) out.push([t.enrolled, t.booked]);
  }
  return out;
}

describe("udfaldsceller — small-cell + komplement (fund 3)", () => {
  it.each([
    ["30 tilbud / 25 booket (komplement 5)", 30, 25, false],
    ["30 tilbud / 5 booket", 30, 5, false],
    ["20 tilbud / 10 booket (præcis på grænsen)", 20, 10, true],
    ["30 tilbud / 0 booket", 30, 0, false],
    ["9 tilbud / 0 booket", 9, 0, false],
  ])("%s", (_n, n, b, visible) => {
    const a = agg(month("ONLINE", "2026-10", n, b));
    const cell = a.groups.ONLINE.windows[30];
    if (visible) {
      expect(cell).toEqual({ denominator: n, numerator: b, ratePercent: (b / n) * 100, suppressed: false });
      expect(a.groups.ONLINE.trend30).toEqual([{ fromMonth: "2026-10", toMonth: "2026-10", enrolled: n, booked: b, ratePercent: (b / n) * 100 }]);
    } else {
      // Tæller, nævner og procent skjules SAMMEN — og måneden optræder ikke i trenden.
      expect(cell).toEqual({ denominator: null, numerator: null, ratePercent: null, suppressed: true });
      expect(a.groups.ONLINE.trend30).toEqual([]);
    }
    for (const [tn, tb] of publishedOutcomePairs(a)) {
      expect(tb).toBeGreaterThanOrEqual(10);
      expect(tn - tb).toBeGreaterThanOrEqual(10);
    }
  });

  it("tomt grundlag giver null, aldrig 0 %, og ingen publicerbar sammenligning", () => {
    const a = agg([]);
    expect(a.hasPublishableComparison).toBe(false);
    for (const w of MATURITY_WINDOWS_DAYS) expect(a.groups.ONLINE.windows[w].ratePercent).toBeNull();
    expect(a.groups.ONLINE.trend30).toEqual([]);
    expect(a.differencePercentPoints).toEqual({ 30: null, 60: null, 90: null });
    expect(a.groups.ONLINE.totalEnrolled).toBe(0);
    expect(a.dataQuality.totalObserved).toBe(0);
  });
});

describe("krydstabel-inferens: måned, gruppe og total (fund 3)", () => {
  it("en lille måned kan ikke udledes som vinduestal minus synlige måneder — den slås sammen med næste måned", () => {
    const rows = [
      ...month("ONLINE", "2026-10", 40, 20),
      ...month("ONLINE", "2026-11", 5, 2), // lille
      ...month("ONLINE", "2026-12", 30, 15),
    ];
    const a = agg(rows);
    expect(a.groups.ONLINE.trend30.map((t) => [t.fromMonth, t.toMonth, t.enrolled, t.booked])).toEqual([
      ["2026-10", "2026-10", 40, 20],
      ["2026-11", "2026-12", 35, 17],
    ]);
    const w = a.groups.ONLINE.windows[30];
    expect([w.denominator, w.numerator]).toEqual([75, 37]);
    // Vinduet er PRÆCIS summen af de synlige perioder — ingen rest at differencere.
    const sum = a.groups.ONLINE.trend30.reduce((s, t) => [s[0] + t.enrolled, s[1] + t.booked], [0, 0]);
    expect(sum).toEqual([w.denominator, w.numerator]);
  });

  it("en lille sidste måned tilbageholdes helt (ikke i vindue, ikke i trend)", () => {
    const a = agg([...month("ONLINE", "2026-10", 40, 20), ...month("ONLINE", "2026-11", 5, 2)]);
    expect(a.groups.ONLINE.windows[30].denominator).toBe(40);
    expect(a.groups.ONLINE.trend30).toHaveLength(1);
  });

  it("umodne måneder indgår hverken i nævner eller trend", () => {
    const a = agg([...month("ONLINE", "2026-10", 40, 20), ...month("ONLINE", "2027-02", 40, 20)]);
    expect(a.groups.ONLINE.windows[30].denominator).toBe(40);
    expect(a.groups.ONLINE.totalEnrolled).toBe(80);
  });

  it("booket efter vinduets grænse tæller ikke i det vindue", () => {
    const start = new Date("2026-10-10T03:00:00Z");
    const rows = [
      ...Array.from({ length: 12 }, () => row({ firstQualifiedObservationAt: start, outcomeStatus: "BOOKED", firstBookedAt: new Date(start.getTime() + 20 * DAY) })),
      ...Array.from({ length: 10 }, () => row({ firstQualifiedObservationAt: start, outcomeStatus: "BOOKED", firstBookedAt: new Date(start.getTime() + 45 * DAY) })),
      ...Array.from({ length: 15 }, () => row({ firstQualifiedObservationAt: start })),
    ];
    const a = agg(rows);
    expect(a.groups.ONLINE.windows[30].numerator).toBe(12);
    expect(a.groups.ONLINE.windows[60].numerator).toBe(22);
  });

  it("egenskab: over 150 dages daglig visning ændres et publiceret udfaldstal kun i spring, der selv opfylder tærsklerne", () => {
    // Pseudo-tilfældige, men deterministiske måneder med små og store celler.
    let seed = 7;
    const rnd = (m: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % m;
    };
    const rows: CohortAggregateRow[] = [];
    for (const m of ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]) {
      for (const g of ["ONLINE", "PDF_ONLY"] as const) {
        const n = rnd(40);
        const start = new Date(`${m}-${String(1 + rnd(27)).padStart(2, "0")}T03:00:00Z`);
        for (let i = 0; i < n; i++) {
          const booked = rnd(3) === 0;
          rows.push(row({ exposureGroup: g, firstQualifiedObservationAt: start, outcomeStatus: booked ? "BOOKED" : "NOT_BOOKED", firstBookedAt: booked ? new Date(start.getTime() + rnd(80) * DAY) : null }));
        }
      }
    }
    let prev: ConversionAggregate | null = null;
    for (let d = 0; d < 150; d++) {
      const a = agg(rows, new Date(Date.UTC(2026, 10, 1) + d * DAY));
      for (const [n, b] of publishedOutcomePairs(a)) {
        expect(b).toBeGreaterThanOrEqual(10);
        expect(n - b).toBeGreaterThanOrEqual(10);
      }
      if (prev) {
        for (const g of ["ONLINE", "PDF_ONLY"] as const) {
          for (const w of MATURITY_WINDOWS_DAYS) {
            const x = prev.groups[g].windows[w];
            const y = a.groups[g].windows[w];
            if (!x.suppressed && !y.suppressed && (x.denominator !== y.denominator || x.numerator !== y.numerator)) {
              const dn = y.denominator! - x.denominator!;
              const db = y.numerator! - x.numerator!;
              expect(dn).toBeGreaterThanOrEqual(10);
              expect(db).toBeGreaterThanOrEqual(10);
              expect(dn - db).toBeGreaterThanOrEqual(10);
            }
          }
        }
      }
      prev = a;
    }
  });
});

describe("tælletal og datakvalitet — sekundær undertrykkelse (fund 3)", () => {
  it("én lille celle i en partition kan ikke udledes som total minus de synlige", () => {
    const r = suppressPartition([100, 50, 3, 0], 153);
    const hidden = r.cells.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    expect(r.cells[3]).toBe(0); // nul afslører intet og vises
    if (r.total !== null) {
      const visibleSum = r.cells.reduce<number>((s, c) => s + (c ?? 0), 0);
      expect(r.total - visibleSum).toBeGreaterThanOrEqual(10);
    }
  });

  it("to små celler med samlet sum under 10 tvinger yderligere undertrykkelse", () => {
    const r = suppressPartition([100, 4, 3], 107);
    expect(r.cells).toEqual([null, null, null]);
    expect(r.total).toBe(107);
  });

  it("kan det ikke lade sig gøre, skjules totalen også", () => {
    expect(suppressPartition([4, 3], 7)).toEqual({ cells: [null, null], total: null });
  });

  it("datakvalitet: små tal og deres komplement skjules; gruppetotaler indgår i samme partition", () => {
    const rows = [
      ...month("ONLINE", "2026-10", 40, 20),
      ...month("PDF_ONLY", "2026-10", 60, 30),
      row({ eligibilityStatus: "EXCLUDED", exclusionReason: "MISSING_BOOKING_NO", exposureGroup: null }),
      row({ eligibilityStatus: "EXCLUDED", exclusionReason: "MISSING_BOOKING_NO", exposureGroup: null }),
      ...Array.from({ length: 30 }, () => row({ eligibilityStatus: "ELIGIBLE_PENDING", exposureGroup: null, firstQualifiedObservationAt: null })),
    ];
    const a = agg(rows);
    expect(a.dataQuality.excludedByReason.MISSING_BOOKING_NO).toBeNull();
    const visible = [
      a.groups.ONLINE.totalEnrolled,
      a.groups.PDF_ONLY.totalEnrolled,
      a.dataQuality.bookingConflicts,
      a.dataQuality.eligiblePending,
      a.dataQuality.preStartExisting,
      ...Object.values(a.dataQuality.excludedByReason),
    ];
    if (a.dataQuality.totalObserved !== null) {
      const remainder = a.dataQuality.totalObserved - visible.reduce<number>((s, c) => s + (c ?? 0), 0);
      expect(remainder === 0 || remainder >= 10).toBe(true);
    }
  });

  it("tabt/afvist og outcome-konflikter skjules ved 1–9 og ved lille komplement", () => {
    const rows = [...month("ONLINE", "2026-10", 40, 20), row({ lostObservedAt: new Date() }), row({ outcomeConflictObservedAt: new Date() })];
    const a = agg(rows);
    expect(a.dataQuality.lostObserved).toBeNull();
    expect(a.dataQuality.outcomeConflicts).toBeNull();
    const allLost = agg(Array.from({ length: 15 }, () => row({ lostObservedAt: new Date() })).concat(row()));
    expect(allLost.dataQuality.lostObserved).toBeNull(); // komplement = 1
  });
});

describe("konflikter, publicerbarhed og friskhed", () => {
  it("rækker med senere opdaget bookingkonflikt indgår aldrig i gruppetal eller rater", () => {
    const rows = [
      ...month("ONLINE", "2026-10", 20, 10),
      ...month("ONLINE", "2026-10", 12, 12).map((r) => ({ ...r, bookingConflictDetectedAt: new Date("2026-12-01T00:00:00Z") })),
    ];
    const a = agg(rows);
    expect(a.groups.ONLINE.windows[30]).toMatchObject({ denominator: 20, numerator: 10 });
    expect(a.groups.ONLINE.totalEnrolled).toBe(20);
    expect(a.dataQuality.bookingConflicts).toBe(12);
  });

  it("kun publicerbar når BEGGE grupper har et publiceret vindue; forskellen kræver begge rater", () => {
    const one = agg([...month("ONLINE", "2026-10", 30, 15), ...month("PDF_ONLY", "2026-10", 5, 1)]);
    expect(one.hasPublishableComparison).toBe(false);
    expect(one.differencePercentPoints[30]).toBeNull();
    const both = agg([...month("ONLINE", "2026-10", 30, 15), ...month("PDF_ONLY", "2026-10", 40, 10)]);
    expect(both.hasPublishableComparison).toBe(true);
    expect(both.differencePercentPoints[30]).toBeCloseTo(50 - 25, 6);
  });

  it("friskhed: ingen sync, frisk og forældet (>36 t)", () => {
    expect(buildConversionAggregate([], { ...MEASUREMENT, lastSuccessfulSyncAt: null }, ASOF).freshness).toBe("NO_SYNC");
    expect(agg([]).freshness).toBe("FRESH");
    expect(agg([], new Date(MEASUREMENT.lastSuccessfulSyncAt!.getTime() + 37 * 60 * 60 * 1000)).freshness).toBe("STALE");
  });
});
