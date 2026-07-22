import { describe, it, expect } from "vitest";
import { formatAlternativePriceLine, formatMediumDateDK } from "./types";

// Fixture-strengene er de faktiske savings-varianter fra production-databasen
// (juli 2026), så testen dækker alle kendte former.
describe("formatAlternativePriceLine", () => {
  it("merpris med '+'-præfiks (booking 35385, Jawakara) får Merpris-etiket", () => {
    expect(formatAlternativePriceLine("+20.600 kr. i alt for 4 nætter")).toBe(
      "Merpris: +20.600 kr. i alt for 4 nætter",
    );
  });

  it("streng der selv indeholder 'Merpris' vises uændret — ingen dobbelt etiket", () => {
    expect(formatAlternativePriceLine("Merpris ca. 1.600 kr. i alt for 3 nætter")).toBe(
      "Merpris ca. 1.600 kr. i alt for 3 nætter",
    );
    expect(formatAlternativePriceLine("Merpris i alt for 4 nætter: ca. 1.300 kr.")).toBe(
      "Merpris i alt for 4 nætter: ca. 1.300 kr.",
    );
  });

  it("ren beløbs-streng får fortsat Besparelse-etiket", () => {
    expect(formatAlternativePriceLine("ca. 12.000 kr.")).toBe("Besparelse: ca. 12.000 kr.");
    expect(formatAlternativePriceLine("ca. 30.000 kr.")).toBe("Besparelse: ca. 30.000 kr.");
  });

  it("tom streng giver tom streng (kortet uden pris-linje er uændret)", () => {
    expect(formatAlternativePriceLine("")).toBe("");
    expect(formatAlternativePriceLine("   ")).toBe("");
  });
});

describe("formatMediumDateDK", () => {
  it("ISO-dato formateres dansk uden ugedag", () => {
    expect(formatMediumDateDK("2026-10-03")).toBe("3. oktober 2026");
    expect(formatMediumDateDK("2026-10-19")).toBe("19. oktober 2026");
  });

  it("allerede dansk dato-streng parses og genformateres stabilt", () => {
    expect(formatMediumDateDK("3. oktober 2026")).toBe("3. oktober 2026");
    expect(formatMediumDateDK("lørdag 3. oktober 2026")).toBe("3. oktober 2026");
  });

  it("uparsbar streng falder tilbage til original", () => {
    expect(formatMediumDateDK("oktober 2026")).toBe("oktober 2026");
  });

  it("tom/null input giver tom streng", () => {
    expect(formatMediumDateDK("")).toBe("");
    expect(formatMediumDateDK(null)).toBe("");
    expect(formatMediumDateDK(undefined)).toBe("");
  });
});
