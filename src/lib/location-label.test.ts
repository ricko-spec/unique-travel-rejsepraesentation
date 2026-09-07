import { describe, it, expect } from "vitest";
import { normalizeLocationLabel } from "./location-label";
import { tripSchema, normalizeTrip } from "./types";

// Fixture-strengene nedenfor er de faktiske Jimbaran/Kuta-varianter fra
// production-databasen (september 2026), så testen dækker alle kendte former.
describe("normalizeLocationLabel — Jimbaran/Kuta", () => {
  it("fjerner TravelWires kode-parentes", () => {
    expect(normalizeLocationLabel("Serangan pier → Hotel i Jimbaran (Kuta)")).toBe(
      "Serangan pier → Hotel i Jimbaran",
    );
  });

  it("fjerner Kuta efter skråstreg, med og uden mellemrum", () => {
    expect(normalizeLocationLabel("Jimbaran / Kuta, Bali")).toBe("Jimbaran, Bali");
    expect(normalizeLocationLabel("Jimbaran/Kuta, Bali")).toBe("Jimbaran, Bali");
  });

  it("fjerner Kuta når den står først i skråstreg-parret", () => {
    expect(normalizeLocationLabel("Kuta/Jimbaran, Bali")).toBe("Jimbaran, Bali");
    expect(normalizeLocationLabel("Serangan pier → Kuta/Jimbaran hotel")).toBe(
      "Serangan pier → Jimbaran hotel",
    );
  });

  it("fjerner Kuta efter komma i hotel-titler", () => {
    expect(normalizeLocationLabel("The Open House Bali Jimbaran, Kuta")).toBe(
      "The Open House Bali Jimbaran",
    );
  });

  it("bevarer resten af strengen når Kuta står midt i en liste", () => {
    expect(normalizeLocationLabel("Jimbaran, Kuta, Bali")).toBe("Jimbaran, Bali");
  });

  it("rører ikke Kuta alene — en rejse til Kuta vises stadig som Kuta", () => {
    expect(normalizeLocationLabel("Kuta, Bali")).toBe("Kuta, Bali");
    expect(normalizeLocationLabel("Bali Garden Beach Resort, Kuta")).toBe(
      "Bali Garden Beach Resort, Kuta",
    );
    expect(normalizeLocationLabel("Lovina → Kuta")).toBe("Lovina → Kuta");
    expect(normalizeLocationLabel("Kuta")).toBe("Kuta");
  });

  it("rører ikke sammensatte stednavne der begynder med Kuta", () => {
    expect(normalizeLocationLabel("Jimbaran / Kuta Beach")).toBe("Jimbaran / Kuta Beach");
    expect(normalizeLocationLabel("Jimbaran, Kuta Selatan")).toBe("Jimbaran, Kuta Selatan");
  });

  it("rører ikke fritekst hvor Kuta er en reel oplysning", () => {
    const intro = "rejsen rundes af i den solfyldte kystby Jimbaran nær Kuta.";
    expect(normalizeLocationLabel(intro)).toBe(intro);
  });

  it("rører ikke Jimbaran alene eller andre Bali-områder", () => {
    expect(normalizeLocationLabel("Jimbaran, Bali")).toBe("Jimbaran, Bali");
    expect(normalizeLocationLabel("Jimbaran → Denpasar Lufthavn")).toBe(
      "Jimbaran → Denpasar Lufthavn",
    );
    expect(normalizeLocationLabel("Ubud, Bali")).toBe("Ubud, Bali");
    expect(normalizeLocationLabel("Sidemen")).toBe("Sidemen");
    expect(normalizeLocationLabel("")).toBe("");
  });
});

// Eksisterende rejser ligger gemt med "Jimbaran (Kuta)" i data-jsonb. De skal
// vises korrekt uden re-upload — derfor renses de i normalizeTrip ved render.
describe("normalizeTrip — gemte rejser renses ved render", () => {
  it("renser hotel, sub-hotel, rejseplan og undertitel", () => {
    const trip = tripSchema.parse({
      bookingNo: "12345",
      destination: "Bali",
      subtitle: "6N. Ubud, 5N. Jimbaran (Kuta)",
      departure: "2027-03-01",
      itinerary: [
        {
          type: "transfer",
          typeLabel: "DAG 12",
          title: "Serangan pier → Hotel i Jimbaran (Kuta)",
          details: "Transfer til Kuta/Jimbaran hotel",
          chips: ["Jimbaran/Kuta"],
        },
      ],
      hotels: [
        {
          name: "The Open House Bali Jimbaran, Kuta",
          location: "Jimbaran / Kuta, Bali",
          isPackage: true,
          subHotels: [{ name: "La Joya Balangan Resort, Jimbaran", location: "Kuta/Jimbaran" }],
        },
      ],
    });

    const out = normalizeTrip(trip);
    expect(out.subtitle).toBe("6N. Ubud, 5N. Jimbaran");
    expect(out.itinerary[0].title).toBe("Serangan pier → Hotel i Jimbaran");
    expect(out.itinerary[0].details).toBe("Transfer til Jimbaran hotel");
    expect(out.itinerary[0].chips).toEqual(["Jimbaran"]);
    expect(out.hotels[0].name).toBe("The Open House Bali Jimbaran");
    expect(out.hotels[0].location).toBe("Jimbaran, Bali");
    expect(out.hotels[0].subHotels[0].location).toBe("Jimbaran");
    expect(out.hotels[0].subHotels[0].name).toBe("La Joya Balangan Resort, Jimbaran");
  });

  it("lader en ægte Kuta-rejse være urørt", () => {
    const trip = tripSchema.parse({
      bookingNo: "12346",
      destination: "Bali",
      subtitle: "5N. Ubud, 5N. Lovina, 4N. Kuta",
      departure: "2027-03-01",
      itinerary: [
        { type: "transfer", typeLabel: "DAG 11", title: "Lovina → Kuta", chips: ["Kuta"] },
      ],
      hotels: [{ name: "Bali Garden Beach Resort", location: "Kuta, Bali" }],
    });

    const out = normalizeTrip(trip);
    expect(out.subtitle).toBe("5N. Ubud, 5N. Lovina, 4N. Kuta");
    expect(out.itinerary[0].title).toBe("Lovina → Kuta");
    expect(out.itinerary[0].chips).toEqual(["Kuta"]);
    expect(out.hotels[0].location).toBe("Kuta, Bali");
  });
});
