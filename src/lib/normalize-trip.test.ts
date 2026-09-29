import { describe, it, expect } from "vitest";
import { tripSchema, normalizeTrip, type Trip } from "./types";
import { SYSTEM_PROMPT } from "./claude";

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

describe("normalizeTrip — hotel website (Issue #47)", () => {
  it("bevarer en gyldig https-URL", () => {
    const trip = makeTrip({
      hotels: [{ name: "Beach Resort", website: "https://www.beach-resort.example" }],
    });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].website).toBe("https://www.beach-resort.example/");
  });

  it("gammel trip uden website-felt normaliserer til tom streng, ikke fejl", () => {
    const trip = makeTrip({ hotels: [{ name: "Gammelt Hotel", nights: 3 }] });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].website).toBe("");
  });

  it("saniterer en javascript:-URL til tom streng i stedet for at vise et link", () => {
    const trip = makeTrip({
      hotels: [{ name: "Ondsindet Hotel", website: "javascript:alert(1)" }],
    });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].website).toBe("");
  });

  it("saniterer en malformed URL (intet http(s)-præfiks) til tom streng", () => {
    const trip = makeTrip({ hotels: [{ name: "Hotel", website: "beach-resort.example" }] });
    const result = normalizeTrip(trip);
    expect(result.hotels[0].website).toBe("");
  });
});

// Issue #94 — anonymiseret fixture: en éndagsudflugt på dag 3 efterfulgt af en
// flerdages safari (dag 4–7) med underhoteller. Ingen kundedata.
const dayExcursion = {
  type: "activity",
  typeLabel: "UDFLUGT · DAG 3",
  dateLabel: "ONS 3. MAR",
  title: "Kulturudflugt",
  expandKind: "program",
  expand: { days: [{ label: "Dag 3", text: "Byvandring og markedsbesøg" }], included: ["Guide"] },
};

const safariProgram = {
  type: "activity",
  typeLabel: "SAFARI · 4 DAGE / 3 NÆTTER · DAG 4–7",
  dateLabel: "TOR 4. – SUN 7. MAR",
  title: "Safari",
  expandKind: "program",
  expand: {
    days: [
      { label: "Dag 4", text: "Kørsel til første lejr" },
      { label: "Dag 5", text: "Heldags game drive" },
    ],
    included: ["Game drives", "Parkgebyrer"],
  },
};

const safariHotel = {
  name: "Safari",
  isPackage: true,
  nights: 3,
  subHotels: [
    { name: "Lejr Nord", location: "Nordparken", nights: 1 },
    { name: "Lejr Syd", location: "Sydkrateret", nights: 2 },
  ],
  included: ["Game drives", "Parkgebyrer"],
  notIncluded: ["Drikkepenge"],
};

describe("normalizeTrip — flerdages safari vs. endagsudflugt (Issue #94)", () => {
  it("en endagsudflugt med program udløser IKKE fjernelsen af safari-pakkens inklusioner", () => {
    // Gammel adfærd: hasProgramInItinerary var sand pga. endagsudflugten, så
    // safariens included/notIncluded blev tømt uden at programmet lå i rejseplanen.
    const trip = makeTrip({ itinerary: [dayExcursion], hotels: [safariHotel] });
    const h = normalizeTrip(trip).hotels[0];
    expect(h.included).toEqual(["Game drives", "Parkgebyrer"]);
    expect(h.notIncluded).toEqual(["Drikkepenge"]);
    expect(h.subHotels).toHaveLength(2);
  });

  it("safariens program bevares i rejseplanen i kronologisk rækkefølge efter endagsudflugten, og underhotellerne bliver i hoteloversigten", () => {
    const trip = makeTrip({ itinerary: [dayExcursion, safariProgram], hotels: [safariHotel] });
    const result = normalizeTrip(trip);
    expect(result.itinerary.map((i) => i.title)).toEqual(["Kulturudflugt", "Safari"]);
    expect(result.itinerary[0].typeLabel).toBe("UDFLUGT · DAG 3");
    expect(result.itinerary[1].expand?.days).toHaveLength(2);
    // Endagsudflugten er uændret en selvstændig aktivitet.
    expect(result.itinerary[0].expand?.days).toHaveLength(1);
    const h = result.hotels[0];
    expect(h.isPackage).toBe(true);
    expect(h.subHotels.map((s) => s.name)).toEqual(["Lejr Nord", "Lejr Syd"]);
    // Programmet ligger i rejseplanen, så den lange liste vises ikke to gange.
    expect(h.included).toEqual([]);
    expect(h.notIncluded).toEqual([]);
  });

  it("intet program opfindes: safari uden dagsprogram bevarer sin inklusionsliste på pakke-kortet", () => {
    const safariNoProgram = { ...safariProgram, expandKind: null, expand: null };
    const trip = makeTrip({ itinerary: [dayExcursion, safariNoProgram], hotels: [safariHotel] });
    const result = normalizeTrip(trip);
    expect(result.itinerary[1].expandKind).toBeFalsy();
    expect(result.itinerary[1].expand?.days ?? []).toEqual([]);
    expect(result.hotels[0].included).toEqual(["Game drives", "Parkgebyrer"]);
  });

  it("ved flere pakker og kun ét flerdagsprogram fjernes kun den matchende pakkes liste", () => {
    const otherPackage = { ...safariHotel, name: "Rundrejse", included: ["Togtur"], notIncluded: [] };
    const trip = makeTrip({ itinerary: [safariProgram], hotels: [safariHotel, otherPackage] });
    const [safari, other] = normalizeTrip(trip).hotels;
    expect(safari.included).toEqual([]);
    expect(other.included).toEqual(["Togtur"]);
  });
});

describe("normalizeTrip — generisk programtitel med flere safaripakker (Issue #94, review)", () => {
  const safariNord = { ...safariHotel, name: "Safari Nord", included: ["Game drives nord"], notIncluded: ["Drikkepenge"] };
  const safariSyd = { ...safariHotel, name: "Safari Syd", included: ["Game drives syd"], notIncluded: ["Visum"] };

  it("titlen 'Safari' matcher ikke flere pakker: begge pakkers lister bevares", () => {
    const trip = makeTrip({ itinerary: [safariProgram], hotels: [safariNord, safariSyd] });
    const [nord, syd] = normalizeTrip(trip).hotels;
    expect(nord.included).toEqual(["Game drives nord"]);
    expect(nord.notIncluded).toEqual(["Drikkepenge"]);
    expect(syd.included).toEqual(["Game drives syd"]);
    expect(syd.notIncluded).toEqual(["Visum"]);
  });

  it("en generisk titel matcher heller ikke i omvendt retning (pakken hedder blot 'Safari', programmet 'Safari Nord')", () => {
    const trip = makeTrip({
      itinerary: [{ ...safariProgram, title: "Safari Nord" }],
      hotels: [{ ...safariHotel, name: "Safari" }, safariSyd],
    });
    const [generisk, syd] = normalizeTrip(trip).hotels;
    expect(generisk.included).toEqual(["Game drives", "Parkgebyrer"]);
    expect(syd.included).toEqual(["Game drives syd"]);
  });

  it("et entydigt, specifikt titelmatch fjerner stadig kun den matchende pakkes liste", () => {
    const trip = makeTrip({
      itinerary: [{ ...safariProgram, title: "Safari Nord" }],
      hotels: [safariNord, safariSyd],
    });
    const [nord, syd] = normalizeTrip(trip).hotels;
    expect(nord.included).toEqual([]);
    expect(syd.included).toEqual(["Game drives syd"]);
  });
});

describe("SYSTEM_PROMPT — pakke-rejse-kontrakten (Issue #94)", () => {
  it("beder ikke længere om at pakker KUN lægges i hotels[] 'i stedet for' rejseplanen", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/i stedet for itinerary/i);
  });

  it("kræver pakken både i hotels[] og som program i itinerary, uden opfundne dage, og adskilt fra endagsudflugter", () => {
    expect(SYSTEM_PROMPT).toMatch(/BÅDE i hotels\[\][\s\S]*OG i itinerary/);
    expect(SYSTEM_PROMPT).toMatch(/Opfind aldrig dage/);
    expect(SYSTEM_PROMPT).toMatch(/endagsudflugt[\s\S]*egen activity/);
  });
});
