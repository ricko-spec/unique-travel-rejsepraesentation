import { describe, it, expect } from "vitest";
import {
  formatAlternativePriceLine,
  formatMediumDateDK,
  displayRoomLabel,
  formatCustomerPreview,
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

  it("streng der selv indeholder 'Besparelse' vises uændret (booking 35493, Olhuveli)", () => {
    expect(formatAlternativePriceLine("Besparelse i alt for 10 nætter: ca. 2.800 kr.")).toBe(
      "Besparelse i alt for 10 nætter: ca. 2.800 kr.",
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

describe("formatCustomerPreview", () => {
  it("gruppeliste forkortes til to navne + antal øvrige", () => {
    expect(
      formatCustomerPreview(
        "Karina Hyldmar Henriksen, Bo Danner Henriksen, Anna Henriksen, Emil Henriksen, Ida Henriksen, Lise Henriksen, Mads Henriksen",
      ),
    ).toBe("Karina Hyldmar Henriksen, Bo Danner Henriksen + 5 rejsende");
  });

  it("tre navne forkortes til to + 1 rejsende", () => {
    expect(formatCustomerPreview("Anna Jensen, Bo Jensen, Carl Jensen")).toBe(
      "Anna Jensen, Bo Jensen + 1 rejsende",
    );
  });

  it("to eller færre navne vises uændret", () => {
    expect(formatCustomerPreview("Susanne og Finn Bastegaard")).toBe(
      "Susanne og Finn Bastegaard",
    );
    expect(formatCustomerPreview("Anna Jensen, Bo Jensen")).toBe("Anna Jensen, Bo Jensen");
  });

  it("tomme segmenter (dobbelt-komma, trailing komma) tæller ikke med", () => {
    expect(formatCustomerPreview("Anna Jensen, Bo Jensen,")).toBe("Anna Jensen, Bo Jensen,");
    expect(formatCustomerPreview("Anna Jensen,, Bo Jensen, Carl Jensen")).toBe(
      "Anna Jensen, Bo Jensen + 1 rejsende",
    );
  });
});

describe("splitRoomAllocation", () => {
  // Fixture-strengene er faktiske roomAllocations fra production (sep. 2026).
  // Booking 35518 er gruppe-casen: to hoteller med tre værelser hver.
  it("splitter 'Værelse N: ...' i label og rest", () => {
    expect(splitRoomAllocation("Værelse 1: 2 voksne (Ocean Front værelse)")).toEqual({
      label: "Værelse 1",
      rest: "2 voksne (Ocean Front værelse)",
    });
    expect(
      splitRoomAllocation(
        "Værelse 2: 2 voksne + 3 børn (1, 5 og 6 år) (Beach Family værelse) · Inkl. 1 babyseng",
      ),
    ).toEqual({
      label: "Værelse 2",
      rest: "2 voksne + 3 børn (1, 5 og 6 år) (Beach Family værelse) · Inkl. 1 babyseng",
    });
    expect(
      splitRoomAllocation("Værelse 3: Family Room · Inkl. 1 x yngste sover i forældrenes seng"),
    ).toEqual({
      label: "Værelse 3",
      rest: "Family Room · Inkl. 1 x yngste sover i forældrenes seng",
    });
  });

  it("label med værelsestype i parentes fremhæves også (lang, men stadig en værelse-label)", () => {
    // Findes i production på bookingerne 35617 og 35780; præfikset er 27-44 tegn,
    // så en ren længdegrænse ville tabe dem.
    expect(splitRoomAllocation("Værelse 4 (Flora 2 Bedroom): 4 rejsende")).toEqual({
      label: "Værelse 4 (Flora 2 Bedroom)",
      rest: "4 rejsende",
    });
    expect(
      splitRoomAllocation("Værelse 1 (Deluxe Triple, Family Wing): 2 rejsende"),
    ).toEqual({
      label: "Værelse 1 (Deluxe Triple, Family Wing)",
      rest: "2 rejsende",
    });
  });

  it("label uden nummer fremhæves (fx 'Værelse til 4 personer')", () => {
    expect(splitRoomAllocation("Værelse til 4 personer: 2 voksne + 2 børn")).toEqual({
      label: "Værelse til 4 personer",
      rest: "2 voksne + 2 børn",
    });
  });

  it("streng uden kolon vises uændret som rest (ingen kunstig label)", () => {
    // Alle fire findes i production (34566, 35559, 35528, 35545).
    expect(splitRoomAllocation("Ønske om værelser ved siden af hinanden")).toEqual({
      label: "",
      rest: "Ønske om værelser ved siden af hinanden",
    });
    expect(splitRoomAllocation("3 x Deluxe værelse")).toEqual({
      label: "",
      rest: "3 x Deluxe værelse",
    });
    expect(splitRoomAllocation("Twin seng + 1 ekstra opredning")).toEqual({
      label: "",
      rest: "Twin seng + 1 ekstra opredning",
    });
  });

  it("kolon i fritekst bliver ikke til en label", () => {
    // Præfikset her er 42 tegn — kortere end de lange ægte labels ovenfor, så
    // det er begyndelsesordet og ikke længden der skiller dem ad.
    expect(
      splitRoomAllocation("Fordeling af værelserne aftales ved ankomst: spørg i receptionen"),
    ).toEqual({
      label: "",
      rest: "Fordeling af værelserne aftales ved ankomst: spørg i receptionen",
    });
    expect(splitRoomAllocation("Bemærk: morgenmad er ikke inkluderet")).toEqual({
      label: "",
      rest: "Bemærk: morgenmad er ikke inkluderet",
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

  it("tom streng giver hverken label eller rest", () => {
    expect(splitRoomAllocation("")).toEqual({ label: "", rest: "" });
  });
});
