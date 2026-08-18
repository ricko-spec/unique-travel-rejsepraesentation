import { describe, it, expect } from "vitest";
import { collectAlternatives, parseAlternativeNote } from "./hotel-alternatives";
import { normalizeTrip, tripSchema } from "./types";

// Data-form som parseren producerede på booking 35493 (Maldiverne):
// ét struktureret alternativ + nr. 2 som rå note-tekst.
const OLHUVELI = {
  name: "Sun Siyam Olhuveli Maldives",
  description: "Grand Beach Villa With Pool · Transfer med speedbåd · 10 nætter inkl. All Inclusive",
  nights: 10,
  meals: "All Inclusive",
  savings: "Besparelse i alt for 10 nætter: ca. 2.800 kr.",
};
const LUX_NOTE =
  "Andre hoteller der også kunne være noget for jer: LUX* South Ari Atoll, Maldives · Beach Pavilion · Transfer med speedbåd · 10 nætter inkl. All Inclusive · Merpris i alt for 10 nætter: ca. 1.300 kr.";
const PLAIN_NOTES = [
  "Måltiderne for halvpension, helpension og all inclusive spises i hotellets hovedrestaurant.",
  "Bemærk at der er begrænsninger på bagage ved transfer med vandflyver.",
];

describe("parseAlternativeNote", () => {
  it("løfter LUX* fra note-tekst uden at stjernen i navnet ødelægger noget", () => {
    const [alt] = parseAlternativeNote(LUX_NOTE);
    expect(alt).toEqual({
      name: "LUX* South Ari Atoll, Maldives",
      description: "Beach Pavilion · Transfer med speedbåd",
      nights: 10,
      meals: "All Inclusive",
      savings: "Merpris i alt for 10 nætter: ca. 1.300 kr.",
    });
  });

  it("håndterer flere hoteller i én note (linjeskift + ledende '*')", () => {
    const note = [
      "Andre hoteller der også kunne være noget for jer:",
      "*Sun Siyam Olhuveli Maldives",
      "Grand Beach Villa With Pool",
      "Transfer med speedbåd",
      "10 nætter inkl. All Inclusive",
      "Besparelse i alt for 10 nætter: ca. 2.800 kr.",
      "*LUX* South Ari Atoll, Maldives",
      "Beach Pavilion",
      "Transfer med speedbåd",
      "10 nætter inkl. All Inclusive",
      "Merpris i alt for 10 nætter: ca. 1.300 kr.",
    ].join("\n");
    const alts = parseAlternativeNote(note);
    expect(alts.map((a) => a.name)).toEqual([
      "Sun Siyam Olhuveli Maldives",
      "LUX* South Ari Atoll, Maldives",
    ]);
    expect(alts[0].savings).toMatch(/^Besparelse/);
    expect(alts[1].savings).toMatch(/^Merpris/);
  });

  it("rører ikke almindelige noter (ingen opfundne alternativer)", () => {
    for (const n of PLAIN_NOTES) expect(parseAlternativeNote(n)).toEqual([]);
    expect(parseAlternativeNote("Halvpension · 7 nætter · Sea View Villa")).toEqual([]);
    expect(parseAlternativeNote("Besparelse ved tidlig booking: 500 kr.")).toEqual([]);
  });
});

describe("collectAlternatives", () => {
  it("booking 35493: begge alternativer som cards, rå tekst væk fra noterne", () => {
    const { alternatives, notes } = collectAlternatives({
      alternative: OLHUVELI,
      notes: [...PLAIN_NOTES, LUX_NOTE],
    });
    expect(alternatives.map((a) => a.name)).toEqual([
      "Sun Siyam Olhuveli Maldives",
      "LUX* South Ari Atoll, Maldives",
    ]);
    expect(notes).toEqual(PLAIN_NOTES);
  });

  it("ét alternativ (eksisterende rejser) er uændret", () => {
    const { alternatives, notes } = collectAlternatives({ alternative: OLHUVELI, notes: PLAIN_NOTES });
    expect(alternatives).toEqual([OLHUVELI]);
    expect(notes).toEqual(PLAIN_NOTES);
  });

  it("ingen alternativer → tom liste, noter uændret", () => {
    const { alternatives, notes } = collectAlternatives({ alternative: null, notes: PLAIN_NOTES });
    expect(alternatives).toEqual([]);
    expect(notes).toEqual(PLAIN_NOTES);
  });

  it("dublet: samme hotel både struktureret og som note → vises kun én gang", () => {
    const dupNote =
      "Dette resort kunne måske også være noget for jer: Sun Siyam Olhuveli Maldives · Grand Beach Villa With Pool · 10 nætter inkl. All Inclusive · Besparelse i alt for 10 nætter: ca. 2.800 kr.";
    const { alternatives, notes } = collectAlternatives({ alternative: OLHUVELI, notes: [dupNote] });
    expect(alternatives).toHaveLength(1);
    expect(notes).toEqual([]);
  });
});

describe("normalizeTrip → hotels[].alternatives", () => {
  it("udfylder alternatives på kundesiden ud fra gemt trip-data", () => {
    const parsed = tripSchema.parse({
      bookingNo: "35493",
      destination: "Maldiverne",
      hotels: [
        { name: "Sun Siyam Iru Fushi Maldives", nights: 10, alternative: OLHUVELI, notes: [...PLAIN_NOTES, LUX_NOTE] },
        { name: "Hotel uden alternativer", nights: 3, notes: ["Bemærk: tidlig check-in ikke garanteret."] },
      ],
    });
    const trip = normalizeTrip(parsed);
    expect(trip.hotels[0].alternatives.map((a) => a.name)).toEqual([
      "Sun Siyam Olhuveli Maldives",
      "LUX* South Ari Atoll, Maldives",
    ]);
    expect(trip.hotels[0].notes).toEqual(PLAIN_NOTES);
    expect(trip.hotels[1].alternatives).toEqual([]);
    expect(trip.hotels[1].notes).toEqual(["Bemærk: tidlig check-in ikke garanteret."]);
  });
});
