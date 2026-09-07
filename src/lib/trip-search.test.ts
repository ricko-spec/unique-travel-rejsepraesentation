import { describe, it, expect } from "vitest";
import {
  filterTrips,
  hasSearchQuery,
  matchesTripSearch,
  type SearchableTrip,
} from "./trip-search";

// Formen svarer til TripListItem i AdminDashboard. Bookingnumre og destinationer
// er realistiske; kundenavnene er opdigtede (ingen ægte kundedata i repoet).
const TRIPS: SearchableTrip[] = [
  { booking_no: "35685", destination: "Vietnam & Malaysia & Bali", customer_name: "Anne Berg", slug: "5ef0e0a65f4f" },
  { booking_no: "35682", destination: "Bali", customer_name: "Bo Nielsen, Eva Nielsen", slug: "2529f9eadbd7" },
  { booking_no: "35479", destination: "Bali & Malaysia & Maldiverne", customer_name: null, slug: "0487680d7eda" },
  { booking_no: "35764", destination: "Sri Lanka & Maldiverne", customer_name: "Carl Dahl", slug: "2a0678d56b74" },
];

describe("filterTrips — bookingnummer", () => {
  it("finder på præcist bookingnummer", () => {
    expect(filterTrips(TRIPS, "35682").map((t) => t.booking_no)).toEqual(["35682"]);
  });

  it("finder på delvist bookingnummer", () => {
    expect(filterTrips(TRIPS, "3568").map((t) => t.booking_no)).toEqual(["35685", "35682"]);
  });

  it("ignorerer '#' så både 35685 og #35685 virker", () => {
    expect(filterTrips(TRIPS, "#35685").map((t) => t.booking_no)).toEqual(["35685"]);
  });

  it("finder en rejse der ligger langt nede i listen", () => {
    expect(filterTrips(TRIPS, "35764").map((t) => t.booking_no)).toEqual(["35764"]);
  });
});

describe("filterTrips — destination og kundenavn", () => {
  it("finder på destination uanset store/små bogstaver", () => {
    expect(filterTrips(TRIPS, "sri lanka").map((t) => t.booking_no)).toEqual(["35764"]);
    expect(filterTrips(TRIPS, "BALI").map((t) => t.booking_no)).toEqual(["35685", "35682", "35479"]);
  });

  it("finder på kundenavn", () => {
    expect(filterTrips(TRIPS, "berg").map((t) => t.booking_no)).toEqual(["35685"]);
  });

  it("finder på et navn midt i en gruppe-liste", () => {
    expect(filterTrips(TRIPS, "eva").map((t) => t.booking_no)).toEqual(["35682"]);
  });

  it("håndterer manglende kundenavn uden at fejle", () => {
    expect(filterTrips(TRIPS, "maldiverne").map((t) => t.booking_no)).toEqual(["35479", "35764"]);
  });

  it("finder på slug", () => {
    expect(filterTrips(TRIPS, "2a0678d56b74").map((t) => t.booking_no)).toEqual(["35764"]);
  });
});

describe("filterTrips — flere søgeord", () => {
  it("kræver at alle ord matcher", () => {
    expect(filterTrips(TRIPS, "bali 35682").map((t) => t.booking_no)).toEqual(["35682"]);
    expect(filterTrips(TRIPS, "bali 99999")).toEqual([]);
  });
});

describe("filterTrips — tom søgning og intet match", () => {
  it("returnerer listen uændret ved tom søgning", () => {
    expect(filterTrips(TRIPS, "")).toEqual(TRIPS);
    expect(filterTrips(TRIPS, "   ")).toEqual(TRIPS);
    expect(filterTrips(TRIPS, "#")).toEqual(TRIPS);
  });

  it("returnerer den samme array-reference ved tom søgning", () => {
    expect(filterTrips(TRIPS, "")).toBe(TRIPS);
  });

  it("returnerer tom liste når intet matcher", () => {
    expect(filterTrips(TRIPS, "grønland")).toEqual([]);
  });

  it("bevarer listens rækkefølge (nyeste først)", () => {
    expect(filterTrips(TRIPS, "3").map((t) => t.booking_no)).toEqual([
      "35685", "35682", "35479", "35764",
    ]);
  });
});

describe("hasSearchQuery — holder UI og filtrering enige", () => {
  it("er falsk for input der ikke filtrerer noget", () => {
    expect(hasSearchQuery("")).toBe(false);
    expect(hasSearchQuery("   ")).toBe(false);
    expect(hasSearchQuery("#")).toBe(false);
  });

  it("er sand så snart der er et rigtigt søgeord", () => {
    expect(hasSearchQuery("356")).toBe(true);
    expect(hasSearchQuery("#35685")).toBe(true);
    expect(hasSearchQuery("bali")).toBe(true);
  });
});

describe("matchesTripSearch", () => {
  it("matcher alt ved tom søgning", () => {
    expect(matchesTripSearch(TRIPS[0], "")).toBe(true);
  });

  it("matcher ikke på et ord der ikke findes", () => {
    expect(matchesTripSearch(TRIPS[0], "thailand")).toBe(false);
  });
});
