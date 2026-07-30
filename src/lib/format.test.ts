import { describe, it, expect } from "vitest";
import {
  formatAlternativePriceLine,
  formatMediumDateDK,
  displayRoomLabel,
  splitRoomAllocation,
} from "./format";

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

describe("displayRoomLabel", () => {
  // Alle tre varianter findes i production-data (juli 2026).
  it("erstatter 'sub-hoteller' med 'hoteller undervejs' i alle kendte varianter", () => {
    expect(displayRoomLabel("Se sub-hoteller")).toBe("Se hoteller undervejs");
    expect(displayRoomLabel("Varierer — se sub-hoteller")).toBe(
      "Varierer — se hoteller undervejs",
    );
    expect(displayRoomLabel("Diverse Deluxe værelser – se sub-hoteller")).toBe(
      "Diverse Deluxe værelser – se hoteller undervejs",
    );
  });

  it("rører ikke almindelige værelsesnavne", () => {
    expect(displayRoomLabel("Deluxe Room m. havudsigt")).toBe("Deluxe Room m. havudsigt");
    expect(displayRoomLabel("")).toBe("");
  });
});

describe("splitRoomAllocation", () => {
  // Fixture-strengene er de faktiske roomAllocations fra booking 35518
  // (production, juli 2026) — gruppe-rejse med 5 + 3 værelser.
  it("splitter 'Værelse N: ...' i label og rest", () => {
    expect(splitRoomAllocation("Værelse 1: 2 voksne (Garden Bungalow)")).toEqual({
      label: "Værelse 1",
      rest: "2 voksne (Garden Bungalow)",
    });
    expect(
      splitRoomAllocation(
        "Værelse 3: 3 børn (1, 5 og 6 år) – 1 barn sover i seng (Standard, Building 2, connecting)",
      ),
    ).toEqual({
      label: "Værelse 3",
      rest: "3 børn (1, 5 og 6 år) – 1 barn sover i seng (Standard, Building 2, connecting)",
    });
    expect(
      splitRoomAllocation("Værelse 2: 2 voksne + 3 børn (1, 5 og 6 år) (Beach Family værelse)"),
    ).toEqual({
      label: "Værelse 2",
      rest: "2 voksne + 3 børn (1, 5 og 6 år) (Beach Family værelse)",
    });
  });

  it("streng uden kolon vises uændret som rest (ingen kunstig label)", () => {
    expect(splitRoomAllocation("2 voksne i Garden Bungalow")).toEqual({
      label: "",
      rest: "2 voksne i Garden Bungalow",
    });
  });

  it("kolon dybt inde i fritekst behandles ikke som label", () => {
    expect(
      splitRoomAllocation("Fordeling af værelserne aftales ved ankomst: spørg i receptionen"),
    ).toEqual({
      label: "",
      rest: "Fordeling af værelserne aftales ved ankomst: spørg i receptionen",
    });
  });

  it("kolon som første tegn giver ingen label", () => {
    expect(splitRoomAllocation(": 2 voksne")).toEqual({ label: "", rest: ": 2 voksne" });
  });

  it("whitespace trimmes på begge sider af kolon", () => {
    expect(splitRoomAllocation("  Værelse 4 :  2 voksne  ")).toEqual({
      label: "Værelse 4",
      rest: "2 voksne",
    });
  });
});
