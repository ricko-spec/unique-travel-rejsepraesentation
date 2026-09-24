import { describe, expect, it } from "vitest";
import { reduceDealCohort, type ReduceDealCohortInput } from "./classify";
import { computeBookingKeyForConversion, computeDealKey } from "./dealKey";
import type { ClassifiedDealResult, ExistingCohortState, HubSpotDealObservation, TravelPlanIndex } from "./types";

const DEAL_KEY_SECRET = "test-deal-key-secret";
const BOOKING_SECRET = "test-booking-secret";
const MEASUREMENT_STARTED_AT = new Date("2026-10-01T00:00:00Z");

function obs(overrides: Partial<HubSpotDealObservation> = {}): HubSpotDealObservation {
  return {
    rawDealId: "deal-1",
    everQualifiedAt: null,
    bookingNumberRaw: null,
    dealStatusRaw: null,
    hubspotClosed: false,
    hubspotClosedWon: false,
    closedAtRaw: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ReduceDealCohortInput> = {}): ReduceDealCohortInput {
  return {
    measurementStartedAt: MEASUREMENT_STARTED_AT,
    observedAt: new Date("2026-10-05T00:00:00Z"),
    observation: obs(),
    existing: null,
    computeDealKey: (raw) => computeDealKey(raw, DEAL_KEY_SECRET),
    computeBookingMatchKey: (n) => computeBookingKeyForConversion(n, BOOKING_SECRET),
    travelPlanIndex: new Map(),
    sharedBookingMatchKeys: new Set(),
    contractVersion: 1,
    ...overrides,
  };
}

/** Konverterer et klassifikationsresultat til den persisterede form, til brug som `existing` i en efterfølgende sync. */
function toExisting(r: ClassifiedDealResult): ExistingCohortState {
  return {
    firstSeenAt: r.firstSeenAt,
    eligibilityStatus: r.eligibilityStatus,
    exclusionReason: r.exclusionReason,
    firstQualifiedObservationAt: r.firstQualifiedObservationAt,
    exposureGroup: r.exposureGroup,
    bookingMatchKey: r.bookingMatchKey,
    outcomeStatus: r.outcomeStatus,
    firstBookedAt: r.firstBookedAt,
    lostObservedAt: r.lostObservedAt,
  };
}

describe("reduceDealCohort — kvalifikation og baseline", () => {
  it("aldrig kvalificeret (Screened eller tidligere) => ELIGIBLE_PENDING", () => {
    const r = reduceDealCohort(baseInput({ observation: obs({ everQualifiedAt: null }) }));
    expect(r.eligibilityStatus).toBe("ELIGIBLE_PENDING");
    expect(r.exposureGroup).toBeNull();
    expect(r.firstQualifiedObservationAt).toBeNull();
  });

  it("kvalificeret FØR målingens nulpunkt => PRE_START_EXISTING, udelukket fra kohorten", () => {
    const beforeStart = new Date("2026-09-15T00:00:00Z");
    const r = reduceDealCohort(baseInput({ observation: obs({ everQualifiedAt: beforeStart, bookingNumberRaw: "1000" }) }));
    expect(r.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(r.exposureGroup).toBeNull();
    expect(r.bookingMatchKey).toBeNull();
    expect(r.firstQualifiedObservationAt).toEqual(beforeStart);
  });

  it("kvalificeret PRÆCIS på målingens nulpunkt tæller som EFTER (inklusiv grænse) => forsøg optagelse", () => {
    const r = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: MEASUREMENT_STARTED_AT, bookingNumberRaw: "1000" }) }),
    );
    expect(r.eligibilityStatus).toBe("ENROLLED");
  });

  it("kvalificeret EFTER nulpunkt, gyldigt unikt bookingnummer, ingen matchende plan => ENROLLED/PDF_ONLY", () => {
    const qualifiedAt = new Date("2026-10-10T00:00:00Z");
    const r = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: qualifiedAt, bookingNumberRaw: "35930" }) }),
    );
    expect(r.eligibilityStatus).toBe("ENROLLED");
    expect(r.exposureGroup).toBe("PDF_ONLY");
    expect(r.exposureFrozenAt).toEqual(qualifiedAt);
    expect(r.bookingMatchKey).not.toBeNull();
  });

  it("matchende online rejseplan oprettet FØR/PÅ kvalifikationstidspunktet => ENROLLED/ONLINE", () => {
    const qualifiedAt = new Date("2026-10-10T00:00:00Z");
    const bookingMatchKey = computeBookingKeyForConversion("35930", BOOKING_SECRET);
    const travelPlanIndex: TravelPlanIndex = new Map([[bookingMatchKey, { createdAt: new Date("2026-10-09T00:00:00Z") }]]);
    const r = reduceDealCohort(
      baseInput({
        observation: obs({ everQualifiedAt: qualifiedAt, bookingNumberRaw: "35930" }),
        travelPlanIndex,
      }),
    );
    expect(r.eligibilityStatus).toBe("ENROLLED");
    expect(r.exposureGroup).toBe("ONLINE");
  });

  it("matchende online rejseplan oprettet EFTER kvalifikationstidspunktet => forbliver PDF_ONLY (fryses ikke bagudrettet)", () => {
    const qualifiedAt = new Date("2026-10-10T00:00:00Z");
    const bookingMatchKey = computeBookingKeyForConversion("35930", BOOKING_SECRET);
    const travelPlanIndex: TravelPlanIndex = new Map([[bookingMatchKey, { createdAt: new Date("2026-10-11T00:00:00Z") }]]);
    const r = reduceDealCohort(
      baseInput({
        observation: obs({ everQualifiedAt: qualifiedAt, bookingNumberRaw: "35930" }),
        travelPlanIndex,
      }),
    );
    expect(r.exposureGroup).toBe("PDF_ONLY");
  });

  it("manglende bookingnummer => EXCLUDED/MISSING_BOOKING_NO, ALDRIG PDF_ONLY", () => {
    const r = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: null }) }),
    );
    expect(r.eligibilityStatus).toBe("EXCLUDED");
    expect(r.exclusionReason).toBe("MISSING_BOOKING_NO");
    expect(r.exposureGroup).toBeNull();
  });

  it("ugyldigt bookingnummer-format => EXCLUDED/INVALID_BOOKING_NO_FORMAT, ALDRIG PDF_ONLY", () => {
    const r = reduceDealCohort(
      baseInput({
        observation: obs({ everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: "BK-35930" }),
      }),
    );
    expect(r.eligibilityStatus).toBe("EXCLUDED");
    expect(r.exclusionReason).toBe("INVALID_BOOKING_NO_FORMAT");
    expect(r.exposureGroup).toBeNull();
  });

  it("delt bookingreference => EXCLUDED/SHARED_BOOKING_REFERENCE, ALDRIG PDF_ONLY", () => {
    const bookingMatchKey = computeBookingKeyForConversion("35930", BOOKING_SECRET);
    const r = reduceDealCohort(
      baseInput({
        observation: obs({ everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: "35930" }),
        sharedBookingMatchKeys: new Set([bookingMatchKey]),
      }),
    );
    expect(r.eligibilityStatus).toBe("EXCLUDED");
    expect(r.exclusionReason).toBe("SHARED_BOOKING_REFERENCE");
    expect(r.exposureGroup).toBeNull();
    expect(r.bookingMatchKey).toBeNull();
  });
});

describe("reduceDealCohort — én optagelse, frosset gruppe, aldrig nulstillet", () => {
  it("en tidligere ELIGIBLE_PENDING-deal der nu kvalificerer sig, optages på den KØRSEL den først kvalificerer", () => {
    const pending = reduceDealCohort(baseInput({ observation: obs({ everQualifiedAt: null }) }));
    expect(pending.eligibilityStatus).toBe("ELIGIBLE_PENDING");

    const qualifiedAt = new Date("2026-10-12T00:00:00Z");
    const next = reduceDealCohort(
      baseInput({
        existing: toExisting(pending),
        observation: obs({ everQualifiedAt: qualifiedAt, bookingNumberRaw: "35930" }),
        observedAt: new Date("2026-10-13T00:00:00Z"),
      }),
    );
    expect(next.eligibilityStatus).toBe("ENROLLED");
    expect(next.firstQualifiedObservationAt).toEqual(qualifiedAt);
  });

  it("'Opdateret tilbud' (en senere/større everQualifiedAt fra adapteren) ændrer ALDRIG en allerede ENROLLED deal", () => {
    const firstQualifiedAt = new Date("2026-10-10T00:00:00Z");
    const enrolled = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: firstQualifiedAt, bookingNumberRaw: "35930" }) }),
    );
    expect(enrolled.eligibilityStatus).toBe("ENROLLED");
    expect(enrolled.exposureGroup).toBe("PDF_ONLY");

    // Simulerer at en senere sync (fejlagtigt, eller pga. "Opdateret tilbud")
    // rapporterer et SENERE everQualifiedAt, OG at der nu findes en
    // matchende online rejseplan der ville have givet ONLINE, hvis dealen
    // blev revurderet.
    const laterQualifiedAt = new Date("2026-10-20T00:00:00Z");
    const bookingMatchKey = computeBookingKeyForConversion("35930", BOOKING_SECRET);
    const travelPlanIndex: TravelPlanIndex = new Map([[bookingMatchKey, { createdAt: new Date("2026-10-01T00:00:00Z") }]]);

    const again = reduceDealCohort(
      baseInput({
        existing: toExisting(enrolled),
        observation: obs({ everQualifiedAt: laterQualifiedAt, bookingNumberRaw: "35930" }),
        travelPlanIndex,
        observedAt: new Date("2026-10-21T00:00:00Z"),
      }),
    );

    expect(again.eligibilityStatus).toBe("ENROLLED");
    expect(again.firstQualifiedObservationAt).toEqual(firstQualifiedAt); // uændret
    expect(again.exposureGroup).toBe("PDF_ONLY"); // uændret, IKKE ONLINE
    expect(again.exposureFrozenAt).toEqual(firstQualifiedAt);
  });

  it("en EXCLUDED deal forbliver EXCLUDED med samme årsag, selv hvis bookingnummeret 'repareres' i en senere sync", () => {
    const excluded = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: null }) }),
    );
    expect(excluded.eligibilityStatus).toBe("EXCLUDED");

    const again = reduceDealCohort(
      baseInput({
        existing: toExisting(excluded),
        observation: obs({ everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: "35930" }),
        observedAt: new Date("2026-10-15T00:00:00Z"),
      }),
    );
    expect(again.eligibilityStatus).toBe("EXCLUDED");
    expect(again.exclusionReason).toBe("MISSING_BOOKING_NO");
    expect(again.exposureGroup).toBeNull();
  });

  it("en PRE_START_EXISTING deal forbliver permanent udelukket fra kohorten, uanset senere observationer", () => {
    const preStart = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: new Date("2026-09-01T00:00:00Z"), bookingNumberRaw: "35930" }) }),
    );
    expect(preStart.eligibilityStatus).toBe("PRE_START_EXISTING");

    const again = reduceDealCohort(
      baseInput({
        existing: toExisting(preStart),
        observation: obs({ everQualifiedAt: new Date("2026-09-01T00:00:00Z"), bookingNumberRaw: "35930" }),
        observedAt: new Date("2026-11-01T00:00:00Z"),
      }),
    );
    expect(again.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(again.exposureGroup).toBeNull();
  });

  it("er idempotent: samme input givet to gange giver identisk output", () => {
    const input = baseInput({ observation: obs({ everQualifiedAt: new Date("2026-10-10T00:00:00Z"), bookingNumberRaw: "35930" }) });
    const first = reduceDealCohort(input);
    const second = reduceDealCohort(input);
    expect(second).toEqual(first);
  });

  it("genkørsel (existing = forrige resultat) er deterministisk og uændrer en allerede-optaget deal", () => {
    const qualifiedAt = new Date("2026-10-10T00:00:00Z");
    const first = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: qualifiedAt, bookingNumberRaw: "35930" }) }),
    );
    const second = reduceDealCohort(
      baseInput({
        existing: toExisting(first),
        observation: obs({ everQualifiedAt: qualifiedAt, bookingNumberRaw: "35930" }),
        observedAt: new Date("2026-10-11T00:00:00Z"),
      }),
    );
    expect(second.eligibilityStatus).toBe(first.eligibilityStatus);
    expect(second.exposureGroup).toBe(first.exposureGroup);
    expect(second.firstQualifiedObservationAt).toEqual(first.firstQualifiedObservationAt);
  });
});

describe("reduceDealCohort — udfald (booket/tabt)", () => {
  it("ikke booket som udgangspunkt", () => {
    const r = reduceDealCohort(baseInput({ observation: obs() }));
    expect(r.outcomeStatus).toBe("NOT_BOOKED");
    expect(r.firstBookedAt).toBeNull();
  });

  it("UT-solgt status => BOOKED, first_booked_at sat", () => {
    const r = reduceDealCohort(baseInput({ observation: obs({ dealStatusRaw: "Solgt" }) }));
    expect(r.outcomeStatus).toBe("BOOKED");
    expect(r.firstBookedAt).not.toBeNull();
  });

  it("'Billetter sendt' tæller også som booket", () => {
    const r = reduceDealCohort(baseInput({ observation: obs({ dealStatusRaw: "Billetter sendt" }) }));
    expect(r.outcomeStatus).toBe("BOOKED");
  });

  it("bruger closedAtRaw som first_booked_at når den findes", () => {
    const closedAt = new Date("2026-10-08T00:00:00Z");
    const r = reduceDealCohort(baseInput({ observation: obs({ dealStatusRaw: "Solgt", closedAtRaw: closedAt }) }));
    expect(r.firstBookedAt).toEqual(closedAt);
  });

  it("falder tilbage til observedAt når closedAtRaw mangler", () => {
    const observedAt = new Date("2026-10-09T00:00:00Z");
    const r = reduceDealCohort(baseInput({ observation: obs({ dealStatusRaw: "Solgt", closedAtRaw: null }), observedAt }));
    expect(r.firstBookedAt).toEqual(observedAt);
  });

  it("en allerede BOOKED deal forbliver BOOKED selv hvis en senere kilde viser noget andet (kildedrift)", () => {
    const booked = reduceDealCohort(baseInput({ observation: obs({ dealStatusRaw: "Solgt" }) }));
    expect(booked.outcomeStatus).toBe("BOOKED");
    const firstBookedAt = booked.firstBookedAt;

    const again = reduceDealCohort(
      baseInput({
        existing: toExisting(booked),
        observation: obs({ dealStatusRaw: null }), // "forsvundet" status i en senere sync
        observedAt: new Date("2026-10-20T00:00:00Z"),
      }),
    );
    expect(again.outcomeStatus).toBe("BOOKED");
    expect(again.firstBookedAt).toEqual(firstBookedAt); // uændret, ikke overskrevet
  });

  it("hs_is_closed=true + hs_is_closed_won=false, ikke booket => lost_observed_at sættes (sekundært signal)", () => {
    const r = reduceDealCohort(
      baseInput({ observation: obs({ hubspotClosed: true, hubspotClosedWon: false }) }),
    );
    expect(r.outcomeStatus).toBe("NOT_BOOKED");
    expect(r.lostObservedAt).not.toBeNull();
  });

  it("lost_observed_at sættes ALDRIG for en deal der allerede er BOOKED", () => {
    const r = reduceDealCohort(
      baseInput({ observation: obs({ dealStatusRaw: "Solgt", hubspotClosed: true, hubspotClosedWon: false }) }),
    );
    expect(r.outcomeStatus).toBe("BOOKED");
    expect(r.lostObservedAt).toBeNull();
  });

  it("lost_observed_at ændres ikke, når den først er sat", () => {
    const first = reduceDealCohort(
      baseInput({ observation: obs({ hubspotClosed: true, hubspotClosedWon: false }), observedAt: new Date("2026-10-05T00:00:00Z") }),
    );
    const firstLostAt = first.lostObservedAt;
    const second = reduceDealCohort(
      baseInput({
        existing: toExisting(first),
        observation: obs({ hubspotClosed: false, hubspotClosedWon: false }),
        observedAt: new Date("2026-10-06T00:00:00Z"),
      }),
    );
    expect(second.lostObservedAt).toEqual(firstLostAt);
  });

  it("outcome kan opdateres for en PRE_START_EXISTING/EXCLUDED/ELIGIBLE_PENDING deal, uden at ændre eligibility", () => {
    const preStart = reduceDealCohort(
      baseInput({ observation: obs({ everQualifiedAt: new Date("2026-09-01T00:00:00Z") }) }),
    );
    const withOutcome = reduceDealCohort(
      baseInput({
        existing: toExisting(preStart),
        observation: obs({ everQualifiedAt: new Date("2026-09-01T00:00:00Z"), dealStatusRaw: "Solgt" }),
        observedAt: new Date("2026-10-10T00:00:00Z"),
      }),
    );
    expect(withOutcome.eligibilityStatus).toBe("PRE_START_EXISTING");
    expect(withOutcome.outcomeStatus).toBe("BOOKED");
  });
});

describe("reduceDealCohort — kontraktversion og deal-key", () => {
  it("stempler output med den givne kontraktversion", () => {
    const r = reduceDealCohort(baseInput({ contractVersion: 7 }));
    expect(r.contractVersion).toBe(7);
  });

  it("deal-key er den samme funktion som computeDealKey (ren pass-through)", () => {
    const r = reduceDealCohort(baseInput({ observation: obs({ rawDealId: "abc-123" }) }));
    expect(r.dealKey).toBe(computeDealKey("abc-123", DEAL_KEY_SECRET));
  });
});
