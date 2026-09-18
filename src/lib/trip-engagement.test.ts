import { describe, it, expect } from "vitest";
import {
  classifyTripEngagement,
  formatVisitTimestampShort,
  formatVisitTimestampLong,
  formatDateLongDK,
} from "./trip-engagement";
import { TRACKING_SINCE } from "./trip-visit";

// Fast "nu" for deterministiske tests: ca. 4 måneder efter TRACKING_SINCE
// (2026-09-18T12:20:18Z) — langt fra enhver 12-måneders-grænse, så de
// "almindelige" tests (A-E) ikke ved et uheld rammer grænsen.
const NOW = new Date("2027-01-15T10:00:00.000Z");

describe("classifyTripEngagement", () => {
  it("A. visit-row eksisterer → opened", () => {
    const result = classifyTripEngagement({
      visitRow: {
        first_opened_at: "2026-09-18T14:33:00Z",
        last_opened_at: "2026-09-18T14:34:00Z",
        visit_count: 1,
        open_count: 2,
      },
      readFailed: false,
      tripCreatedAt: "2026-09-01T00:00:00Z",
      now: NOW,
    });
    expect(result).toEqual({
      kind: "opened",
      firstOpenedAt: "2026-09-18T14:33:00.000Z",
      lastOpenedAt: "2026-09-18T14:34:00.000Z",
      visitCount: 1,
      openCount: 2,
    });
  });

  it("B. visitCount = 1", () => {
    const result = classifyTripEngagement({
      visitRow: {
        first_opened_at: "2026-09-18T14:33:00Z",
        last_opened_at: "2026-09-18T14:33:00Z",
        visit_count: 1,
        open_count: 1,
      },
      readFailed: false,
      tripCreatedAt: "2026-09-01T00:00:00Z",
      now: NOW,
    });
    expect(result.kind).toBe("opened");
    if (result.kind === "opened") expect(result.visitCount).toBe(1);
  });

  it("C. visitCount > 1", () => {
    const result = classifyTripEngagement({
      visitRow: {
        first_opened_at: "2026-09-18T14:33:00Z",
        last_opened_at: "2026-10-01T09:00:00Z",
        visit_count: 3,
        open_count: 7,
      },
      readFailed: false,
      tripCreatedAt: "2026-09-01T00:00:00Z",
      now: NOW,
    });
    expect(result.kind).toBe("opened");
    if (result.kind === "opened") {
      expect(result.visitCount).toBe(3);
      expect(result.openCount).toBe(7);
    }
  });

  it("D. ingen row + trip oprettet EFTER TRACKING_SINCE → not-opened", () => {
    const result = classifyTripEngagement({
      visitRow: null,
      readFailed: false,
      tripCreatedAt: "2026-12-01T00:00:00Z", // efter TRACKING_SINCE
      now: NOW,
    });
    expect(result).toEqual({ kind: "not-opened" });
  });

  it("E. trip oprettet FØR TRACKING_SINCE, men TRACKING_SINCE selv < 12 mdr. gammel → not-opened", () => {
    const result = classifyTripEngagement({
      visitRow: null,
      readFailed: false,
      tripCreatedAt: "2020-01-01T00:00:00Z", // langt før TRACKING_SINCE — cutoff bliver TRACKING_SINCE
      now: NOW,
    });
    expect(result).toEqual({ kind: "not-opened" });
  });

  it("F. ingen row + cutoff >= 12 måneder gammel → no-recent-data", () => {
    const now = new Date("2028-01-01T00:00:00Z"); // > 12 mdr. efter TRACKING_SINCE
    const result = classifyTripEngagement({
      visitRow: null,
      readFailed: false,
      tripCreatedAt: "2020-01-01T00:00:00Z",
      now,
    });
    expect(result).toEqual({ kind: "no-recent-data" });
  });

  describe("G. eksakt 12-måneders-grænse (operator: cutoff <= now - 12 måneder ⇒ no-recent-data)", () => {
    it("cutoff PRÆCIS 12 kalendermåneder gammel → no-recent-data", () => {
      const now = new Date("2027-09-18T12:20:18.000Z"); // TRACKING_SINCE + eksakt 12 måneder
      const result = classifyTripEngagement({
        visitRow: null,
        readFailed: false,
        tripCreatedAt: "2020-01-01T00:00:00Z", // cutoff = TRACKING_SINCE
        now,
      });
      expect(result).toEqual({ kind: "no-recent-data" });
    });

    it("cutoff ét millisekund YNGRE end 12 måneder → stadig not-opened", () => {
      // now sat 1ms FØR det præcise 12-måneders-punkt (2027-09-18T12:20:18.000Z)
      // ovenfor — cutoffs alder er derfor 12 måneder minus 1ms, ikke 12 måneder.
      const now = new Date("2027-09-18T12:20:17.999Z");
      const result = classifyTripEngagement({
        visitRow: null,
        readFailed: false,
        tripCreatedAt: "2020-01-01T00:00:00Z",
        now,
      });
      expect(result).toEqual({ kind: "not-opened" });
    });
  });

  it("H. analytics-opslag fejlede → unavailable, ALDRIG not-opened (uanset øvrige felter)", () => {
    const result = classifyTripEngagement({
      visitRow: null,
      readFailed: true,
      tripCreatedAt: "2026-12-01T00:00:00Z", // ville ellers give not-opened
      now: NOW,
    });
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("H2. read failure trumfer selv en tilstedeværende (og gyldig) visit-row", () => {
    const result = classifyTripEngagement({
      visitRow: {
        first_opened_at: "2026-09-18T14:33:00Z",
        last_opened_at: "2026-09-18T14:34:00Z",
        visit_count: 1,
        open_count: 1,
      },
      readFailed: true,
      tripCreatedAt: "2026-09-01T00:00:00Z",
      now: NOW,
    });
    expect(result).toEqual({ kind: "unavailable" });
  });

  describe("I. malformed data → unavailable (aldrig en falsk kundeadfærd-påstand)", () => {
    it("visit-row med ugyldig first_opened_at", () => {
      const result = classifyTripEngagement({
        visitRow: {
          first_opened_at: "ikke-en-dato",
          last_opened_at: "2026-09-18T14:34:00Z",
          visit_count: 1,
          open_count: 1,
        },
        readFailed: false,
        tripCreatedAt: "2026-09-01T00:00:00Z",
        now: NOW,
      });
      expect(result).toEqual({ kind: "unavailable" });
    });

    it("visit-row med manglende last_opened_at", () => {
      const result = classifyTripEngagement({
        visitRow: {
          first_opened_at: "2026-09-18T14:33:00Z",
          last_opened_at: null,
          visit_count: 1,
          open_count: 1,
        },
        readFailed: false,
        tripCreatedAt: "2026-09-01T00:00:00Z",
        now: NOW,
      });
      expect(result).toEqual({ kind: "unavailable" });
    });

    it("visit-row med negativt visit_count", () => {
      const result = classifyTripEngagement({
        visitRow: {
          first_opened_at: "2026-09-18T14:33:00Z",
          last_opened_at: "2026-09-18T14:34:00Z",
          visit_count: -1,
          open_count: 1,
        },
        readFailed: false,
        tripCreatedAt: "2026-09-01T00:00:00Z",
        now: NOW,
      });
      expect(result).toEqual({ kind: "unavailable" });
    });

    it("visit-row med ikke-heltal open_count", () => {
      const result = classifyTripEngagement({
        visitRow: {
          first_opened_at: "2026-09-18T14:33:00Z",
          last_opened_at: "2026-09-18T14:34:00Z",
          visit_count: 1,
          open_count: 1.5,
        },
        readFailed: false,
        tripCreatedAt: "2026-09-01T00:00:00Z",
        now: NOW,
      });
      expect(result).toEqual({ kind: "unavailable" });
    });

    it("ingen row + ugyldig trip.created_at → unavailable, ikke not-opened/no-recent-data", () => {
      const result = classifyTripEngagement({
        visitRow: null,
        readFailed: false,
        tripCreatedAt: "ikke-en-dato",
        now: NOW,
      });
      expect(result).toEqual({ kind: "unavailable" });
    });
  });

  it("J. TRACKING_SINCE er fortsat den faste production-værdi 2026-09-18T12:20:18Z", () => {
    expect(TRACKING_SINCE).toBe("2026-09-18T12:20:18Z");
  });

  it("trackingSince = null (kun muligt i tests) falder tilbage til trip.created_at alene", () => {
    const result = classifyTripEngagement({
      visitRow: null,
      readFailed: false,
      tripCreatedAt: "2026-12-01T00:00:00Z",
      now: NOW,
      trackingSince: null,
    });
    expect(result).toEqual({ kind: "not-opened" });
  });
});

describe("K. dansk formatering, eksplicit Europe/Copenhagen", () => {
  it("formatVisitTimestampShort: sommertid (CEST, UTC+2)", () => {
    // 18/09 12:33 UTC → 18/09 14:33 lokal tid om sommeren.
    expect(formatVisitTimestampShort("2026-09-18T12:33:00Z")).toBe("18/09 14:33");
  });

  it("formatVisitTimestampShort: vintertid (CET, UTC+1)", () => {
    expect(formatVisitTimestampShort("2026-01-18T12:33:00Z")).toBe("18/01 13:33");
  });

  it("formatVisitTimestampLong: sommertid, fuldt dansk format", () => {
    expect(formatVisitTimestampLong("2026-09-18T12:33:00Z")).toBe("18. september 2026 kl. 14:33");
  });

  it("formatVisitTimestampLong: vintertid", () => {
    expect(formatVisitTimestampLong("2026-01-18T12:33:00Z")).toBe("18. januar 2026 kl. 13:33");
  });

  it("ugyldig input giver tom streng, ikke 'Invalid Date' eller en exception", () => {
    expect(formatVisitTimestampShort("ikke-en-dato")).toBe("");
    expect(formatVisitTimestampLong("")).toBe("");
  });

  it("formatDateLongDK: kun dato, bruges bl.a. til 'Måling fra'-teksten (TRACKING_SINCE)", () => {
    expect(formatDateLongDK(TRACKING_SINCE!)).toBe("18. september 2026");
  });
});
