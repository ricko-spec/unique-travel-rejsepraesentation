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

// Booking 35917 (Mauritius, sep. 2026): TravelWire skrev det andet alternativ som
// en label-note i stedet for et 'alternative'-objekt, så det havnede under
// hotelkortet som almindelig kursiv note i stedet for i en alternativ-boks.
const LA_PIROGUE =
  "Alternativt hotel: La Pirogue — Deluxe Beach Family Pavilion værelse, 10 nætter, inkl. Halvpension. Merpris i alt for 10 nætter: ca. 30.200 kr.";

describe("parseAlternativeNote — 'Alternativt hotel:'-varianten", () => {
  it("løfter den faktiske 35917-note til et struktureret alternativ", () => {
    const out = parseAlternativeNote(LA_PIROGUE);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      name: "La Pirogue",
      description: "Deluxe Beach Family Pavilion værelse, 10 nætter, inkl. Halvpension",
      nights: 10,
      meals: "Halvpension",
      savings: "Merpris i alt for 10 nætter: ca. 30.200 kr.",
    });
  });

  it("beholder hele beløbet i savings — 'ca.' og 'inkl.' må ikke spænde ben", () => {
    const { savings, description } = parseAlternativeNote(LA_PIROGUE)[0];
    expect(savings).toContain("30.200");
    expect(description).not.toContain("30.200");
  });

  it("generelle bemærkninger om alternativer forbliver noter", () => {
    // Faktiske noter fra booking 35634 og 35811 (Bali). Flertal og intet kolon
    // — de navngiver ingen alternativer og må ikke blive til bokse.
    expect(
      parseAlternativeNote("Alternative hoteller på Gili Air vil være væsentlig dyrere."),
    ).toEqual([]);
    expect(
      parseAlternativeNote(
        "Alternative hoteller på Gili Air vil være væsentlig dyrere. Hotellet er ikke reserveret i tilbudsfasen og bookes først efter bekræftelse af køb af rejsen.",
      ),
    ).toEqual([]);
  });

  it("kræver en tankestreg mellem navn og beskrivelse", () => {
    // Uden tankestreg er der intet sikkert skel — noten skal bevares
    expect(parseAlternativeNote("Alternativt hotel: La Pirogue er også en mulighed")).toEqual([]);
  });

  it("accepterer 'Alternativ resort' og kort tankestreg", () => {
    const out = parseAlternativeNote(
      "Alternativ resort: Long Beach - Superior værelse, 7 nætter, inkl. Morgenmad. Besparelse: ca. 4.000 kr.",
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Long Beach");
    expect(out[0].savings).toBe("Besparelse: ca. 4.000 kr.");
  });

  it("afviser urimeligt langt navn", () => {
    const langt = "A".repeat(61);
    expect(parseAlternativeNote(`Alternativt hotel: ${langt} — 7 nætter. Merpris: 1 kr.`)).toEqual([]);
  });
});

describe("collectAlternatives — 35917-casen", () => {
  it("viser både Tamassa og La Pirogue som alternativer, uden dublet-note", () => {
    const tamassa = {
      name: "Tamassa",
      description: "Family Suite værelse, 10 nætter, inkl. Halvpension.",
      nights: 10,
      meals: "Halvpension (All Inclusive muligt)",
      savings: "",
    };
    const turistskat =
      "På hotellet kan der blive opkrævet 3 EUR per person over 12 år per nat ved indtjekning.";
    const res = collectAlternatives({
      alternative: tamassa,
      alternatives: [tamassa],
      notes: [turistskat, LA_PIROGUE],
    });
    expect(res.alternatives.map((a) => a.name)).toEqual(["Tamassa", "La Pirogue"]);
    // Tamassa må ikke dubleres af at ligge i både 'alternative' og 'alternatives'
    expect(res.alternatives).toHaveLength(2);
    // Den almindelige note bevares; alternativ-noten er væk
    expect(res.notes).toEqual([turistskat]);
  });

  it("hotel uden alternativer er uberørt", () => {
    const notes = ["Early Check-In inkluderet", "Late Check-Out mandag 27. juli."];
    const res = collectAlternatives({ notes });
    expect(res.alternatives).toEqual([]);
    expect(res.notes).toEqual(notes);
  });
});
