import { describe, it, expect } from "vitest";
import { evaluateRateLimit } from "./rate-limit";

const NOW = new Date("2026-09-17T10:00:00.000Z");
const RESET_IN_5_MIN = new Date(NOW.getTime() + 5 * 60 * 1000).toISOString();

describe("evaluateRateLimit", () => {
  it("tillader forsøg under grænsen", () => {
    const result = evaluateRateLimit({ count: 3, reset_at: RESET_IN_5_MIN }, NOW, 20);
    expect(result).toEqual({ allowed: true, remaining: 17, attempts: 3 });
  });

  it("tillader forsøg PRÆCIS på grænsen (count === maxAttempts)", () => {
    const result = evaluateRateLimit({ count: 20, reset_at: RESET_IN_5_MIN }, NOW, 20);
    expect(result).toEqual({ allowed: true, remaining: 0, attempts: 20 });
  });

  it("afviser forsøg lige over grænsen (count === maxAttempts + 1)", () => {
    const result = evaluateRateLimit({ count: 21, reset_at: RESET_IN_5_MIN }, NOW, 20);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.attempts).toBe(21);
      expect(result.retryAfterSeconds).toBe(300);
    }
  });

  it("afviser langt over grænsen med korrekt retryAfterSeconds", () => {
    const result = evaluateRateLimit({ count: 999, reset_at: RESET_IN_5_MIN }, NOW, 20);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBe(300);
  });

  it("retryAfterSeconds bunder i 0 hvis reset_at allerede er passeret (ingen negativ ventetid)", () => {
    const alreadyPast = new Date(NOW.getTime() - 1000).toISOString();
    const result = evaluateRateLimit({ count: 999, reset_at: alreadyPast }, NOW, 20);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBe(0);
  });

  it("vindue-reset: en lav count med en NY reset_at (RPC'ens egen resetlogik) behandles som et frisk vindue", () => {
    // increment_rate_limit() i Postgres nulstiller count til 1 og sætter en ny
    // reset_at når det gamle vindue er udløbet — evaluateRateLimit skal blot
    // regne korrekt ud fra den række den får, uanset om det er "samme vindue,
    // steget count" eller "nyt vindue, count=1".
    const freshWindow = new Date(NOW.getTime() + 15 * 60 * 1000).toISOString();
    const result = evaluateRateLimit({ count: 1, reset_at: freshWindow }, NOW, 20);
    expect(result).toEqual({ allowed: true, remaining: 19, attempts: 1 });
  });

  it("respekterer et lavere maxAttempts uden at ændre default-brugen andre steder", () => {
    // Parse-endpointet (Issue #54) bruger fx maxAttempts=20/windowMs=10min,
    // login/unlock bruger fortsat default 10 — evaluateRateLimit skal ikke
    // hardcode nogen af de to, kun regne ud fra det den får ind.
    expect(evaluateRateLimit({ count: 5, reset_at: RESET_IN_5_MIN }, NOW, 5).allowed).toBe(true);
    expect(evaluateRateLimit({ count: 6, reset_at: RESET_IN_5_MIN }, NOW, 5).allowed).toBe(false);
  });
});
