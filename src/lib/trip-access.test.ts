import { describe, it, expect } from "vitest";
import {
  hasValidTripAccess,
  tripAccessCookieName,
  tripAccessCookiePath,
  TRIP_ACCESS_COOKIE_OPTIONS,
  TRIP_ACCESS_COOKIE_MAX_AGE_SECONDS,
  TRIP_PAGE_ROBOTS,
} from "./trip-access";

// Fiktive test-booking-numre — ALDRIG rigtige kundedata, jf. Issue #56.
const TRIP_A_BOOKING_NO = "10001";
const TRIP_B_BOOKING_NO = "20002";

describe("hasValidTripAccess", () => {
  it("A: ingen cookie giver ikke adgang", () => {
    expect(hasValidTripAccess(undefined, TRIP_A_BOOKING_NO)).toBe(false);
  });

  it("B: forkert cookie-værdi giver ikke adgang", () => {
    expect(hasValidTripAccess("forkert-kode", TRIP_A_BOOKING_NO)).toBe(false);
  });

  it("B: tom streng som cookie-værdi giver ikke adgang (medmindre booking_no absurd nok også er tomt)", () => {
    expect(hasValidTripAccess("", TRIP_A_BOOKING_NO)).toBe(false);
  });

  it("C: korrekt cookie-værdi giver adgang", () => {
    expect(hasValidTripAccess(TRIP_A_BOOKING_NO, TRIP_A_BOOKING_NO)).toBe(true);
  });

  it("E: en cookie mintet for trip A's booking_no giver IKKE adgang til trip B", () => {
    // Dette er selve server-side-håndhævelsen bag "cookie for trip A må ikke
    // give adgang til trip B" — path-scoping (tripAccessCookiePath) er
    // browserens ekstra forsvarslinje, denne funktion er den der reelt
    // afgør adgang, uanset hvordan cookien blev sendt.
    expect(hasValidTripAccess(TRIP_A_BOOKING_NO, TRIP_B_BOOKING_NO)).toBe(false);
  });

  it("er en streng lighedssammenligning — ingen trimming der kunne udvide match", () => {
    expect(hasValidTripAccess(` ${TRIP_A_BOOKING_NO} `, TRIP_A_BOOKING_NO)).toBe(false);
    expect(hasValidTripAccess(`${TRIP_A_BOOKING_NO}0`, TRIP_A_BOOKING_NO)).toBe(false);
  });
});

describe("tripAccessCookieName / tripAccessCookiePath", () => {
  it("navngiver cookien pr. slug", () => {
    expect(tripAccessCookieName("abc123")).toBe("trip_access_abc123");
  });

  it("scoper cookiens path til PRÆCIS denne slug — browserens forsvarslinje mod krydsadgang", () => {
    expect(tripAccessCookiePath("abc123")).toBe("/abc123");
  });

  it("to forskellige slugs giver to forskellige navne/paths — ingen delt cookie muligt", () => {
    expect(tripAccessCookieName("trip-a")).not.toBe(tripAccessCookieName("trip-b"));
    expect(tripAccessCookiePath("trip-a")).not.toBe(tripAccessCookiePath("trip-b"));
  });
});

describe("TRIP_ACCESS_COOKIE_OPTIONS — D: låst kontrakt, ÆNDR IKKE uden Rickos godkendelse", () => {
  it("httpOnly er true", () => {
    expect(TRIP_ACCESS_COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it("secure er true", () => {
    expect(TRIP_ACCESS_COOKIE_OPTIONS.secure).toBe(true);
  });

  it("sameSite er 'lax'", () => {
    expect(TRIP_ACCESS_COOKIE_OPTIONS.sameSite).toBe("lax");
  });

  it("maxAge er præcis 30 dage i sekunder — denne opgave må IKKE ændre det", () => {
    expect(TRIP_ACCESS_COOKIE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(TRIP_ACCESS_COOKIE_OPTIONS.maxAge).toBe(2592000);
  });

  it("indeholder ikke et path-felt — path sættes eksplicit pr. slug af kaldestedet, aldrig et fast/globalt path", () => {
    expect(TRIP_ACCESS_COOKIE_OPTIONS).not.toHaveProperty("path");
  });
});

describe("TRIP_PAGE_ROBOTS — H: noindex/nofollow-kontrakten", () => {
  it("er noindex og nofollow", () => {
    expect(TRIP_PAGE_ROBOTS).toEqual({ index: false, follow: false });
  });
});
