import { describe, it, expect } from "vitest";
import { tripSchema, normalizeTrip, type Trip } from "./types";

// Byg en gyldig Trip fra en delvis struktur (schema udfylder resten med defaults).
function makeTrip(partial: Record<string, unknown>): Trip {
  return tripSchema.parse({
    bookingNo: "12345",
    destination: "Sri Lanka",
    ...partial,
  });
}

const programItem = {
  type: "activity",
  typeLabel: "RUNDREJSE · DAG 1-8",
  title: "Sri Lanka Rundrejse",
  expandKind: "program",
  expand: {
    days: [{ label: "Dag 1", text: "Ankomst" }],
    included: ["Jeepsafari", "Sigiriya", "Togtur Nanu Oya–Ella"],
  },
};

const packageHotel = {
  name: "Sri Lanka Rundrejse",
  isPackage: true,
  nights: 7,
  room: "Se sub-hoteller",
  meals: "Morgenmad dagligt",
  subHotels: [{ name: "Cloud Nine", location: "Wilpattu", nights: 2 }],
  included: ["Jeepsafari", "Sigiriya", "Togtur Nanu Oya–Ella", "Temple of the Tooth"],
  notIncluded: ["Frokost"],
  notes: ["Er et hotel udsolgt, bookes tilsvarende hotel."],
};

describe("normalizeTrip — rundrejse-program dobbeltvisning", () => {
  it("fjerner pakke-hotellets included/notIncluded når programmet ligger i rejseplanen", () => {
    const trip = makeTrip({ itinerary: [programItem], hotels: [packageHotel] });
    const result = normalizeTrip(trip);
    const h = result.hotels[0];
    expect(h.isPackage).toBe(true);
    expect(h.included).toEqual([]);
    expect(h.notIncluded).toEqual([]);
    // Hotel-info bevares.
    expect(h.subHotels).toHaveLength(1);
    expect(h.notes).toContain("Er et hotel udsolgt, bookes tilsvarende hotel.");
    expect(h.name).toBe("Sri Lanka Rundrejse");
    // Programmet er stadig i rejseplanen.
    expect(result.itinerary[0].expandKind).toBe("program");
    expect(result.itinerary[0].expand?.included).toContain("Jeepsafari");
  });

  it("bevarer pakke-hotellets included når rejseplanen IKKE har et program (intet tabes)", () => {
    const trip = makeTrip({
      itinerary: [{ type: "transfer", title: "Transfer", typeLabel: "TRANSFER" }],
      hotels: [packageHotel],
    });
    const result = normalizeTrip(trip);
    const h = result.hotels[0];
    expect(h.included).toEqual([
      "Jeepsafari",
      "Sigiriya",
      "Togtur Nanu Oya–Ella",
      "Temple of the Tooth",
    ]);
    expect(h.notIncluded).toEqual(["Frokost"]);
  });

  it("rører ikke almindelige (ikke-pakke) hotellers included, selv når et program findes", () => {
    const normalHotel = {
      name: "Terrace Green Hotel & Spa",
      isPackage: false,
      nights: 2,
      included: ["Early check-in"],
      notes: ["Ønske om Twin beds"],
    };
    const trip = makeTrip({ itinerary: [programItem], hotels: [normalHotel, packageHotel] });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].included).toEqual(["Early check-in"]);
    expect(result.hotels[0].notes).toContain("Ønske om Twin beds");
    // Pakke-hotellet får stadig ryddet sin liste.
    expect(result.hotels[1].included).toEqual([]);
  });

  it("påvirker ikke en almindelig badeferie uden pakke-hotel", () => {
    const trip = makeTrip({
      destination: "Thailand",
      itinerary: [{ type: "hotel", title: "Strandhotel", typeLabel: "HOTEL" }],
      hotels: [
        { name: "Beach Resort", isPackage: false, nights: 7, included: ["All inclusive"] },
      ],
    });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].included).toEqual(["All inclusive"]);
  });

  it("bevarer almindelige hotelnoter (måltider/bagage/transfer) uændret", () => {
    const trip = makeTrip({
      itinerary: [programItem],
      hotels: [
        {
          name: "Reethi Faru Resort",
          isPackage: false,
          nights: 5,
          notes: [
            "Bemærk at der er begrænsninger på bagage ved vandflyver.",
            "Måltiderne for all inclusive spises i hovedrestauranten.",
          ],
        },
      ],
    });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].notes).toEqual([
      "Bemærk at der er begrænsninger på bagage ved vandflyver.",
      "Måltiderne for all inclusive spises i hovedrestauranten.",
    ]);
  });
});
