import { describe, expect, it } from "vitest";
import { runConversionSync } from "./syncEngine";
import { createFixtureHubSpotAdapter, fixtureObservation } from "./hubspotAdapter";
import { createInMemoryConversionPersistence } from "./persistence";
import { computeBookingKeyForConversion, computeDealKey } from "./dealKey";
import type { MeasurementState } from "./types";

const DEAL_KEY_SECRET = "sync-deal-key-secret";
const BOOKING_SECRET = "sync-booking-secret";
const OPTIONS = { dealKeySecret: DEAL_KEY_SECRET, bookingMatchSecret: BOOKING_SECRET };

const ACTIVE_STATE: MeasurementState = {
  status: "ACTIVE",
  contractVersion: 1,
  measurementStartedAt: new Date("2026-10-01T00:00:00Z"),
  lastSuccessfulSyncAt: null,
};

const NOT_STARTED_STATE: MeasurementState = {
  status: "NOT_STARTED",
  contractVersion: 1,
  measurementStartedAt: null,
  lastSuccessfulSyncAt: null,
};

function deal(overrides: Partial<Parameters<typeof fixtureObservation>[0]> = {}) {
  return fixtureObservation({
    rawDealId: "deal-1",
    everQualifiedAt: null,
    bookingNumberRaw: null,
    dealStatusRaw: null,
    hubspotClosed: false,
    hubspotClosedWon: false,
    closedAtRaw: null,
    ...overrides,
  });
}

describe("runConversionSync — fail-closed grænser", () => {
  it("nægter at synkronisere når målingen er NOT_STARTED, skriver INGEN kohorte-rækker", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: NOT_STARTED_STATE });
    const adapter = createFixtureHubSpotAdapter({ deals: [deal({ everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: "1000" })] });

    const result = await runConversionSync(adapter, persistence, OPTIONS);

    expect(result.ok).toBe(false);
    expect(persistence.getCohortRow(computeDealKey("deal-1", DEAL_KEY_SECRET))).toBeNull();
    expect(persistence.getSyncRuns()).toHaveLength(1);
    expect(persistence.getSyncRuns()[0].status).toBe("FAILED");
  });

  it("kontraktdrift => FAILED run, ingen deal-læsning, ingen kohorte-skrivning", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: ACTIVE_STATE });
    const adapter = createFixtureHubSpotAdapter({
      deals: [deal({ everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: "1000" })],
      contractOk: false,
    });

    const result = await runConversionSync(adapter, persistence, OPTIONS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("CONTRACT_DRIFT");
    expect(persistence.getSyncRuns()).toEqual([
      expect.objectContaining({ status: "FAILED", errorCode: "CONTRACT_DRIFT" }),
    ]);
  });

  it("en fejl midtvejs i pagineringen giver FAILED run og INGEN kohorte-rækker overhovedet — fuld kilde eller intet", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: ACTIVE_STATE });
    const deals = Array.from({ length: 25 }, (_, i) =>
      deal({ rawDealId: `d${i}`, everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: String(1000 + i) }),
    );
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 10, failOnPageIndex: 1, failReason: "http-5xx" });

    const result = await runConversionSync(adapter, persistence, OPTIONS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("HTTP_5XX");
    // Ingen af de 10 deals fra side 0 må være skrevet, selvom den side blev læst succesfuldt.
    for (const d of deals.slice(0, 10)) {
      const key = computeDealKey(d.rawDealId, DEAL_KEY_SECRET);
      expect(persistence.getCohortRow(key)).toBeNull();
    }
  });
});

describe("runConversionSync — succesfuld kørsel", () => {
  it("klassificerer og skriver alle deals ved en ren, fuld kørsel", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: ACTIVE_STATE });
    const deals = [
      deal({ rawDealId: "d1", everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: "1000" }),
      deal({ rawDealId: "d2", everQualifiedAt: null }), // ELIGIBLE_PENDING
      deal({ rawDealId: "d3", everQualifiedAt: new Date("2026-09-01T00:00:00Z"), bookingNumberRaw: "1001" }), // PRE_START
      deal({ rawDealId: "d4", everQualifiedAt: new Date("2026-10-06T00:00:00Z"), bookingNumberRaw: null }), // EXCLUDED
      deal({ rawDealId: "d5", everQualifiedAt: new Date("2026-10-07T00:00:00Z"), bookingNumberRaw: "1002", dealStatusRaw: "Solgt" }), // ENROLLED + BOOKED
    ];
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 100 });

    const result = await runConversionSync(adapter, persistence, OPTIONS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.observed).toBe(5);
      expect(result.enrolled).toBe(2); // d1, d5
      expect(result.excluded).toBe(1); // d4
      expect(result.booked).toBe(1); // d5
    }
    expect(persistence.getSyncRuns()).toEqual([expect.objectContaining({ status: "SUCCEEDED" })]);
  });

  it("genkørsel med identiske observationer efterlader den persisterede tilstand uændret (idempotent)", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: ACTIVE_STATE });
    const deals = [deal({ rawDealId: "d1", everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: "1000" })];
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 100 });

    await runConversionSync(adapter, persistence, OPTIONS);
    const key = computeDealKey("d1", DEAL_KEY_SECRET);
    const afterFirst = persistence.getCohortRow(key);

    await runConversionSync(adapter, persistence, { ...OPTIONS, now: new Date("2026-11-01T00:00:00Z") });
    const afterSecond = persistence.getCohortRow(key);

    expect(afterSecond).toEqual(afterFirst);
  });

  it("to deals med samme bookingnummer i samme kørsel udelukkes begge som SHARED_BOOKING_REFERENCE", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: ACTIVE_STATE });
    const deals = [
      deal({ rawDealId: "d1", everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: "9999" }),
      deal({ rawDealId: "d2", everQualifiedAt: new Date("2026-10-06T00:00:00Z"), bookingNumberRaw: "9999" }),
    ];
    const adapter = createFixtureHubSpotAdapter({ deals, pageSize: 100 });

    const result = await runConversionSync(adapter, persistence, OPTIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.excluded).toBe(2);

    expect(persistence.getCohortRow(computeDealKey("d1", DEAL_KEY_SECRET))?.exclusionReason).toBe(
      "SHARED_BOOKING_REFERENCE",
    );
    expect(persistence.getCohortRow(computeDealKey("d2", DEAL_KEY_SECRET))?.exclusionReason).toBe(
      "SHARED_BOOKING_REFERENCE",
    );
  });

  it("en ny deal der genbruger et allerede-ENROLLET bookingnummer fra en tidligere kørsel udelukkes som delt", async () => {
    const persistence = createInMemoryConversionPersistence({ measurementState: ACTIVE_STATE });
    const first = createFixtureHubSpotAdapter({
      deals: [deal({ rawDealId: "d1", everQualifiedAt: new Date("2026-10-05T00:00:00Z"), bookingNumberRaw: "7777" })],
      pageSize: 100,
    });
    await runConversionSync(first, persistence, OPTIONS);

    const second = createFixtureHubSpotAdapter({
      deals: [deal({ rawDealId: "d2", everQualifiedAt: new Date("2026-10-08T00:00:00Z"), bookingNumberRaw: "7777" })],
      pageSize: 100,
    });
    const result = await runConversionSync(second, persistence, { ...OPTIONS, now: new Date("2026-10-09T00:00:00Z") });
    expect(result.ok).toBe(true);

    const d2 = persistence.getCohortRow(computeDealKey("d2", DEAL_KEY_SECRET));
    expect(d2?.eligibilityStatus).toBe("EXCLUDED");
    expect(d2?.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");

    // d1 (den oprindelige, gyldigt optagne) er urørt.
    const d1 = persistence.getCohortRow(computeDealKey("d1", DEAL_KEY_SECRET));
    expect(d1?.eligibilityStatus).toBe("ENROLLED");
  });

  it("matcher korrekt mod en online rejseplan via travelPlanIndex", async () => {
    const bookingMatchKey = computeBookingKeyForConversion("5555", BOOKING_SECRET);
    const persistence = createInMemoryConversionPersistence({
      measurementState: ACTIVE_STATE,
      travelPlanIndex: new Map([[bookingMatchKey, { createdAt: new Date("2026-10-01T00:00:00Z") }]]),
    });
    const adapter = createFixtureHubSpotAdapter({
      deals: [deal({ rawDealId: "d1", everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: "5555" })],
      pageSize: 100,
    });

    await runConversionSync(adapter, persistence, OPTIONS);

    expect(persistence.getCohortRow(computeDealKey("d1", DEAL_KEY_SECRET))?.exposureGroup).toBe("ONLINE");
  });
});
