import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeBookingKeyForConversion, computeDealKey, validateBookingNumber } from "./dealKey";

describe("computeDealKey", () => {
  it("er deterministisk for samme input+secret", () => {
    expect(computeDealKey("12345", "s1")).toBe(computeDealKey("12345", "s1"));
  });

  it("giver forskellig nøgle for forskellig secret (domæneadskillelse)", () => {
    expect(computeDealKey("12345", "s1")).not.toBe(computeDealKey("12345", "s2"));
  });

  it("giver forskellig nøgle for forskelligt deal-id", () => {
    expect(computeDealKey("111", "s1")).not.toBe(computeDealKey("222", "s1"));
  });

  it("trimmer input", () => {
    expect(computeDealKey(" 12345 ", "s1")).toBe(computeDealKey("12345", "s1"));
  });

  it("er en 64-tegns lowercase hex-streng (sha256-digest)", () => {
    const key = computeDealKey("12345", "s1");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deal-key-domænet krydser aldrig booking-match-key-domænet, selv med samme secret", () => {
    // Samme secret, samme rå streng — men deal-key har et domænepræfiks
    // booking-match-key ikke har, så de to nøglerum aldrig kan kollidere.
    expect(computeDealKey("12345", "shared-secret")).not.toBe(
      computeBookingKeyForConversion("12345", "shared-secret"),
    );
  });
});

describe("computeBookingKeyForConversion", () => {
  it("matcher Analytics Bridge-kontraktens HMAC 1:1 for samme input", () => {
    // Egen, uafhængig reimplementering af samme opskrift, for at bevise
    // genbruget er reelt og ikke en tilfældig ligende værdi.
    const expected = createHmac("sha256", "secret").update("35930", "utf8").digest("hex");
    expect(computeBookingKeyForConversion("35930", "secret")).toBe(expected);
  });
});

describe("validateBookingNumber", () => {
  it("afviser null/undefined/tom streng som missing", () => {
    expect(validateBookingNumber(null)).toEqual({ kind: "missing" });
    expect(validateBookingNumber(undefined)).toEqual({ kind: "missing" });
    expect(validateBookingNumber("")).toEqual({ kind: "missing" });
    expect(validateBookingNumber("   ")).toEqual({ kind: "missing" });
  });

  it("accepterer en ren cifre-streng", () => {
    expect(validateBookingNumber("35930")).toEqual({ kind: "valid", normalized: "35930" });
  });

  it("trimmer whitespace før validering", () => {
    expect(validateBookingNumber("  35930  ")).toEqual({ kind: "valid", normalized: "35930" });
  });

  it("afviser bogstaver, skilletegn og præfikser som invalid-format", () => {
    expect(validateBookingNumber("BK-35930")).toEqual({ kind: "invalid-format", normalized: "BK-35930" });
    expect(validateBookingNumber("35930a")).toEqual({ kind: "invalid-format", normalized: "35930a" });
    expect(validateBookingNumber("359 30")).toEqual({ kind: "invalid-format", normalized: "359 30" });
  });

  it("afviser ikke ud fra en opfundet længdegrænse — vilkårligt langt tal er gyldigt format", () => {
    expect(validateBookingNumber("123456789012345")).toEqual({
      kind: "valid",
      normalized: "123456789012345",
    });
  });
});
