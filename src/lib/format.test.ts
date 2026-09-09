import { describe, it, expect } from "vitest";
import {
  formatAlternativePriceLine,
  formatMediumDateDK,
  displayRoomLabel,
  formatCustomerPreview,
  splitRoomAllocation,
  isMultiDayProgram,
  timelineToggleLabel,
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

describe("isMultiDayProgram", () => {
  // Alle strenge er faktiske typeLabels fra production (sep. 2026).
  it("dagsinterval betyder flere dage", () => {
    expect(isMultiDayProgram("AKTIVITET · DAG 7–8")).toBe(true);
    expect(isMultiDayProgram("RUNDREJSE · 9 DAGE / 8 NÆTTER · DAG 4–12")).toBe(true);
    expect(isMultiDayProgram("TURPROGRAM · 3N · DAG 8–11")).toBe(true);
    // "1 DAG" i etiketten, men intervallet afslører at den spænder over to
    expect(isMultiDayProgram("TURPROGRAM · 1 DAG · DAG 8–9")).toBe(true);
  });

  it("antal døgn betyder flere dage", () => {
    expect(isMultiDayProgram("SAFARI · 4 DAGE / 3 NÆTTER · DAG 5–8")).toBe(true);
    expect(isMultiDayProgram("UDFLUGT · 2 DAGE · DAG 20–21")).toBe(true);
    expect(isMultiDayProgram("KRYDSTOGT · 2 DAGE / 1 NAT · DAG 3–4")).toBe(true);
  });

  it("enkelt dagsnummer er én dag", () => {
    expect(isMultiDayProgram("UDFLUGT · DAG 3")).toBe(false);
    expect(isMultiDayProgram("AKTIVITET · DAG 10")).toBe(false);
    expect(isMultiDayProgram("TILKØB · DAG 6")).toBe(false);
    expect(isMultiDayProgram("SIGHTSEEING TRANSFER · DAG 6")).toBe(false);
    expect(isMultiDayProgram("UDFLUGT · DAG 27")).toBe(false);
  });

  it("tom eller manglende etiket er ikke flerdags", () => {
    expect(isMultiDayProgram("")).toBe(false);
    expect(isMultiDayProgram(null)).toBe(false);
    expect(isMultiDayProgram(undefined)).toBe(false);
  });
});

describe("timelineToggleLabel", () => {
  // Optalt i production: 218 program-items = 81 flerdagsforløb (SAFARI 31,
  // TURPROGRAM 19, RUNDREJSE 12, KRYDSTOGT 4, TREKKING/CRUISE m.fl.) og
  // 137 endagsture (UDFLUGT, AKTIVITET, TILKØB, SIGHTSEEING TRANSFER).
  it("flerdagsforløb kaldes program, ikke udflugt", () => {
    expect(timelineToggleLabel("program", "SAFARI · 4 DAGE / 3 NÆTTER · DAG 5–8", 0)).toBe(
      "Læs om programmet",
    );
    expect(timelineToggleLabel("program", "RUNDREJSE · 14 DAGE / 13 NÆTTER · DAG 3–16", 0)).toBe(
      "Læs om programmet",
    );
    // Hedder "UDFLUGT", men er reelt to dage med overnatning
    expect(timelineToggleLabel("program", "UDFLUGT · 2 DAGE / 1 NAT · DAG 7–8", 0)).toBe(
      "Læs om programmet",
    );
  });

  it("ægte endagsudflugt beholder sin etiket", () => {
    expect(timelineToggleLabel("program", "UDFLUGT · DAG 3", 0)).toBe("Læs om udflugten");
    expect(timelineToggleLabel("program", "AKTIVITET · DAG 10", 0)).toBe("Læs om udflugten");
    expect(timelineToggleLabel("program", "TILKØB · DAG 6", 0)).toBe("Læs om udflugten");
  });

  it("én valgfri aktivitet er én udflugt; flere er muligheder at vælge i", () => {
    expect(timelineToggleLabel("activities", "UDFLUGTER · DAG 9", 1)).toBe("Læs om udflugten");
    expect(timelineToggleLabel("activities", "UDFLUGTER · DAG 3", 2)).toBe(
      "Se udflugtsmuligheder",
    );
    expect(timelineToggleLabel("activities", "UDFLUGTER · DAG 3", 0)).toBe(
      "Se udflugtsmuligheder",
    );
  });

  it("activities påvirkes ikke af dagsinterval i etiketten", () => {
    expect(timelineToggleLabel("activities", "UDFLUGTER · DAG 3–5", 3)).toBe(
      "Se udflugtsmuligheder",
    );
  });

  it("fly er uændret", () => {
    expect(timelineToggleLabel("flight", "FLY · DAG 1", 0)).toBe("Se flydetaljer");
  });

  it("ukendt eller manglende expandKind giver ingen knap", () => {
    expect(timelineToggleLabel(null, "HOTEL · 3 NÆTTER · DAG 2–5", 0)).toBeNull();
    expect(timelineToggleLabel(undefined, "UDFLUGT · DAG 3", 2)).toBeNull();
    expect(timelineToggleLabel("noget-nyt", "UDFLUGT · DAG 3", 2)).toBeNull();
  });
});
