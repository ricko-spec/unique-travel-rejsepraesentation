import { describe, expect, it } from "vitest";
import { buildConversionAggregate, type CohortAggregateRow } from "./aggregate";
import type { MeasurementState } from "./types";

const ASOF = new Date("2026-12-31T00:00:00Z");
const MEASUREMENT: MeasurementState = {
  status: "ACTIVE",
  contractVersion: 1,
  measurementStartedAt: new Date("2026-10-01T00:00:00Z"),
  lastSuccessfulSyncAt: new Date("2026-12-30T00:00:00Z"),
};

function enrolledRow(overrides: Partial<CohortAggregateRow> = {}): CohortAggregateRow {
  return {
    eligibilityStatus: "ENROLLED",
    exclusionReason: null,
    firstQualifiedObservationAt: new Date("2026-10-01T00:00:00Z"),
    exposureGroup: "ONLINE",
    outcomeStatus: "NOT_BOOKED",
    firstBookedAt: null,
    lostObservedAt: null,
    ...overrides,
  };
}

/** Bygger N ENROLLED-rækker i en gruppe, mature ift. `windowDays`, med `bookedCount` booket inden for vinduet. */
function matureGroup(
  group: "ONLINE" | "PDF_ONLY",
  count: number,
  bookedCount: number,
  windowDays: number,
): CohortAggregateRow[] {
  const qualifiedAt = new Date(ASOF.getTime() - (windowDays + 5) * 24 * 60 * 60 * 1000);
  return Array.from({ length: count }, (_, i) =>
    enrolledRow({
      exposureGroup: group,
      firstQualifiedObservationAt: qualifiedAt,
      outcomeStatus: i < bookedCount ? "BOOKED" : "NOT_BOOKED",
      firstBookedAt: i < bookedCount ? new Date(qualifiedAt.getTime() + 5 * 24 * 60 * 60 * 1000) : null,
    }),
  );
}

describe("buildConversionAggregate — tomt grundlag", () => {
  it("tomt datasæt giver null-celler, aldrig 0%, og ingen publicerbar sammenligning", () => {
    const agg = buildConversionAggregate([], MEASUREMENT, ASOF);
    expect(agg.hasPublishableComparison).toBe(false);
    expect(agg.groups.ONLINE.totalEnrolled).toBeNull();
    expect(agg.groups.ONLINE.windows[30]).toEqual({
      denominator: null,
      numerator: null,
      ratePercent: null,
      suppressed: true,
    });
  });
});

describe("buildConversionAggregate — small-cell-undertrykkelse", () => {
  it("under 10 modne deals i et vindue => cellen undertrykkes", () => {
    const rows = matureGroup("ONLINE", 9, 5, 30);
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.groups.ONLINE.windows[30].suppressed).toBe(true);
    expect(agg.groups.ONLINE.windows[30].ratePercent).toBeNull();
  });

  it("totalEnrolled under 10 undertrykkes, selvom vinduerne evt. ikke er det", () => {
    const rows = matureGroup("ONLINE", 8, 0, 30);
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.groups.ONLINE.totalEnrolled).toBeNull();
  });

  it("mindst 10 modne, tæller og komplement begge >=10 => rate vises", () => {
    const rows = matureGroup("ONLINE", 20, 12, 30); // tæller=12, komplement=8 -> stadig under! juster
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    // komplement = 20-12 = 8 < 10 => SKAL undertrykkes. Denne test bekræfter komplementær undertrykkelse.
    expect(agg.groups.ONLINE.windows[30].suppressed).toBe(true);
  });

  it("mindst 10 modne, tæller og komplement begge rigeligt over 10 => rate vises korrekt", () => {
    const rows = matureGroup("ONLINE", 30, 15, 30); // tæller=15, komplement=15
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    const cell = agg.groups.ONLINE.windows[30];
    expect(cell.suppressed).toBe(false);
    expect(cell.numerator).toBe(15);
    expect(cell.denominator).toBe(30);
    expect(cell.ratePercent).toBeCloseTo(50, 5);
  });
});

describe("buildConversionAggregate — komplementær undertrykkelse", () => {
  it("tæller under 10 => hele cellen (inkl. nævner) undertrykkes", () => {
    const rows = matureGroup("ONLINE", 25, 3, 30); // tæller=3 (<10)
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    const cell = agg.groups.ONLINE.windows[30];
    expect(cell.suppressed).toBe(true);
    expect(cell.numerator).toBeNull();
    expect(cell.denominator).toBeNull();
  });

  it("komplement (nævner-tæller) under 10 => hele cellen undertrykkes, selvom tælleren selv er stor", () => {
    const rows = matureGroup("ONLINE", 25, 20, 30); // tæller=20, komplement=5 (<10)
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    const cell = agg.groups.ONLINE.windows[30];
    expect(cell.suppressed).toBe(true);
  });
});

describe("buildConversionAggregate — modning (30/60/90 dage)", () => {
  it("umodne deals (yngre end vinduet) indgår ikke i nævneren for det vindue", () => {
    // 25 modne (12 booket, komplement 13 — begge over small-cell-tærsklen,
    // så testen isolerer modenheds-filtreringen fra privacy-undertrykkelsen)
    // + 5 umodne (kun 10 dage gamle, under 30-dages-vinduet).
    const rows = [
      ...matureGroup("ONLINE", 25, 12, 30),
      ...Array.from({ length: 5 }, () =>
        enrolledRow({ exposureGroup: "ONLINE", firstQualifiedObservationAt: new Date(ASOF.getTime() - 10 * 24 * 60 * 60 * 1000) }),
      ),
    ];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.groups.ONLINE.windows[30].denominator).toBe(25); // ikke 30
  });

  it("booket EFTER vinduets grænse tæller ikke som konverteret i det vindue", () => {
    const qualifiedAt = new Date(ASOF.getTime() - 40 * 24 * 60 * 60 * 1000); // moden for 30d
    const rows = [
      // 12 booket INDEN for 30-dages-vinduet — skal tælle med.
      ...Array.from({ length: 12 }, () =>
        enrolledRow({
          exposureGroup: "ONLINE",
          firstQualifiedObservationAt: qualifiedAt,
          outcomeStatus: "BOOKED",
          firstBookedAt: new Date(qualifiedAt.getTime() + 20 * 24 * 60 * 60 * 1000),
        }),
      ),
      // 3 booket EFTER 30-dages-grænsen — må IKKE tælle med i 30-dages-raten.
      ...Array.from({ length: 3 }, () =>
        enrolledRow({
          exposureGroup: "ONLINE",
          firstQualifiedObservationAt: qualifiedAt,
          outcomeStatus: "BOOKED",
          firstBookedAt: new Date(qualifiedAt.getTime() + 35 * 24 * 60 * 60 * 1000),
        }),
      ),
      ...Array.from({ length: 15 }, () => enrolledRow({ exposureGroup: "ONLINE", firstQualifiedObservationAt: qualifiedAt })),
    ];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    // 30 modne i alt, kun de 12 INDEN for vinduet tæller — ikke 15.
    expect(agg.groups.ONLINE.windows[30].numerator).toBe(12);
  });

  it("de tre vinduer (30/60/90) beregnes uafhængigt af hinanden", () => {
    const rows = matureGroup("ONLINE", 30, 15, 90); // moden for alle tre vinduer
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.groups.ONLINE.windows[30]).toBeDefined();
    expect(agg.groups.ONLINE.windows[60]).toBeDefined();
    expect(agg.groups.ONLINE.windows[90]).toBeDefined();
  });
});

describe("buildConversionAggregate — publicerbarhed", () => {
  it("kun publicerbar når BEGGE grupper har mindst ét ikke-undertrykt vindue", () => {
    const rows = [...matureGroup("ONLINE", 30, 15, 30), ...matureGroup("PDF_ONLY", 3, 1, 30)]; // PDF_ONLY for lille
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.hasPublishableComparison).toBe(false);
  });

  it("publicerbar når begge grupper har mindst ét gyldigt vindue", () => {
    const rows = [...matureGroup("ONLINE", 30, 15, 30), ...matureGroup("PDF_ONLY", 30, 15, 30)];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.hasPublishableComparison).toBe(true);
  });

  it("forskellen i procentpoint er null, hvis nogen af de to rater er undertrykt", () => {
    const rows = [...matureGroup("ONLINE", 30, 15, 30), ...matureGroup("PDF_ONLY", 3, 1, 30)];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.differencePercentPoints[30]).toBeNull();
  });
});

describe("buildConversionAggregate — datakvalitet", () => {
  it("tæller udelukkelses-årsager, pending og pre-start korrekt", () => {
    const rows: CohortAggregateRow[] = [
      enrolledRow({ eligibilityStatus: "EXCLUDED", exclusionReason: "MISSING_BOOKING_NO", exposureGroup: null }),
      enrolledRow({ eligibilityStatus: "EXCLUDED", exclusionReason: "MISSING_BOOKING_NO", exposureGroup: null }),
      enrolledRow({ eligibilityStatus: "EXCLUDED", exclusionReason: "SHARED_BOOKING_REFERENCE", exposureGroup: null }),
      enrolledRow({ eligibilityStatus: "ELIGIBLE_PENDING", exposureGroup: null, firstQualifiedObservationAt: null }),
      enrolledRow({ eligibilityStatus: "PRE_START_EXISTING", exposureGroup: null }),
      enrolledRow({ lostObservedAt: new Date() }),
    ];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.dataQuality.totalObserved).toBe(6);
    expect(agg.dataQuality.excludedByReason.MISSING_BOOKING_NO).toBe(2);
    expect(agg.dataQuality.excludedByReason.SHARED_BOOKING_REFERENCE).toBe(1);
    expect(agg.dataQuality.eligiblePendingCount).toBe(1);
    expect(agg.dataQuality.preStartExistingCount).toBe(1);
    expect(agg.dataQuality.lostObservedCount).toBe(1);
  });
});

describe("buildConversionAggregate — månedlig trend", () => {
  it("grupperer ENROLLED-deals pr. kalendermåned (UTC) for kohortestart", () => {
    const rows = [
      enrolledRow({ firstQualifiedObservationAt: new Date("2026-10-15T00:00:00Z") }),
      enrolledRow({ firstQualifiedObservationAt: new Date("2026-10-20T00:00:00Z") }),
      enrolledRow({ firstQualifiedObservationAt: new Date("2026-11-01T00:00:00Z") }),
    ];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    const months = agg.monthlyTrend.map((m) => m.month);
    expect(months).toEqual(["2026-10", "2026-11"]);
  });

  it("undertrykker små måneds-celler under tærsklen", () => {
    const rows = [enrolledRow({ firstQualifiedObservationAt: new Date("2026-10-15T00:00:00Z") })];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.monthlyTrend[0].online.enrolled).toBeNull();
  });

  it("ikke-ENROLLED rækker (fx ELIGIBLE_PENDING) indgår ikke i den månedlige trend", () => {
    const rows = [
      enrolledRow({ eligibilityStatus: "ELIGIBLE_PENDING", exposureGroup: null, firstQualifiedObservationAt: null }),
    ];
    const agg = buildConversionAggregate(rows, MEASUREMENT, ASOF);
    expect(agg.monthlyTrend).toEqual([]);
  });
});
