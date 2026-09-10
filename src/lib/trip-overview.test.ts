import { describe, it, expect } from "vitest";
import {
  totalNights,
  destinationList,
  nightsLabel,
  destinationsLabel,
  splitTravellers,
} from "./trip-overview";

describe("totalNights", () => {
  it("summerer naetter paa tvaers af hoteller", () => {
    expect(totalNights([{ nights: 7 }, { nights: 3 }, { nights: 4 }])).toBe(14);
  });
  it("manglende eller ugyldige naetter taeller som 0", () => {
    expect(totalNights([{ nights: 5 }, {}, { nights: null }, { nights: NaN }])).toBe(5);
  });
  it("tom eller manglende hotelliste giver 0", () => {
    expect(totalNights([])).toBe(0);
    expect(totalNights(null)).toBe(0);
    expect(totalNights(undefined)).toBe(0);
  });
});

describe("destinationList", () => {
  it("bevarer raekkefoelge og fjerner dubletter", () => {
    expect(
      destinationList([{ location: "Khao Lak" }, { location: "Bangkok" }, { location: "Khao Lak" }]),
    ).toEqual(["Khao Lak", "Bangkok"]);
  });

  it("sammenligner uden hensyn til store bogstaver og ekstra mellemrum", () => {
    expect(destinationList([{ location: "Malé" }, { location: "  malé " }])).toEqual(["Malé"]);
  });

  it("rundrejsens sub-hoteller taeller med", () => {
    // Ellers ville booking 35528's rundrejse med fem stop taelle som én destination
    const out = destinationList([
      {
        location: "Sri Lanka",
        isPackage: true,
        subHotels: [{ location: "Wilpattu" }, { location: "Sigiriya" }, { location: "Kandy" }],
      },
      { location: "Malé" },
    ]);
    expect(out).toEqual(["Sri Lanka", "Wilpattu", "Sigiriya", "Kandy", "Malé"]);
  });

  it("tomme og manglende lokationer springes over", () => {
    expect(destinationList([{ location: "" }, { location: null }, {}, { location: "Bali" }])).toEqual(
      ["Bali"],
    );
    expect(destinationList(null)).toEqual([]);
  });
});

describe("nightsLabel", () => {
  it("boejer nat og naetter korrekt", () => {
    expect(nightsLabel(1)).toBe("1 nat");
    expect(nightsLabel(14)).toBe("14 nætter");
  });
  it("nul og ugyldigt giver tom streng, saa intet vises", () => {
    expect(nightsLabel(0)).toBe("");
    expect(nightsLabel(-3)).toBe("");
    expect(nightsLabel(NaN)).toBe("");
  });
});

describe("destinationsLabel", () => {
  it("boejer destination og destinationer korrekt", () => {
    expect(destinationsLabel(1)).toBe("1 destination");
    expect(destinationsLabel(3)).toBe("3 destinationer");
  });
  it("nul giver tom streng", () => {
    expect(destinationsLabel(0)).toBe("");
  });
});

describe("splitTravellers", () => {
  it("skiller navne fra parentes-opsummering", () => {
    expect(splitTravellers("Anna Hansen, Bo Hansen (2 voksne)")).toEqual({
      names: ["Anna Hansen", "Bo Hansen"],
      summary: "2 voksne",
    });
  });

  it("haandterer 'og' som adskiller", () => {
    expect(splitTravellers("Anna Hansen og Bo Hansen").names).toEqual([
      "Anna Hansen",
      "Bo Hansen",
    ]);
  });

  it("enkelt navn uden opsummering", () => {
    expect(splitTravellers("Anna Hansen")).toEqual({ names: ["Anna Hansen"], summary: "" });
  });

  it("mange rejsende bevares alle — ingen klipning i data", () => {
    const raw = "A An, B Bn, C Cn, D Dn, E En, F Fn, G Gn (4 voksne + 3 børn)";
    const { names, summary } = splitTravellers(raw);
    expect(names).toHaveLength(7);
    expect(summary).toBe("4 voksne + 3 børn");
  });

  it("aldersparentes paa sidste navn er IKKE en opsummering", () => {
    // Booking 34952 slutter med "Ida Theil Lundgaard (7 år)". En blind
    // sidste-parentes-regel rev alderen af navnet og viste "7 år" som
    // opsummering — fanget paa screenshot under fase 1.
    const { names, summary } = splitTravellers(
      "Jens Lundgaard, Tina Veje Isachsen, Ida Theil Lundgaard (7 år)",
    );
    expect(names).toEqual([
      "Jens Lundgaard",
      "Tina Veje Isachsen",
      "Ida Theil Lundgaard (7 år)",
    ]);
    expect(summary).toBe("");
  });

  it("aldre midt i listen bliver paa deres eget navn", () => {
    expect(
      splitTravellers("Sander Veje Flintegaard (16 år), Milo Veje Flintegaard (14 år)").names,
    ).toEqual(["Sander Veje Flintegaard (16 år)", "Milo Veje Flintegaard (14 år)"]);
  });

  it("komma inde i en parentes splitter ikke navnet", () => {
    expect(splitTravellers("Anna Hansen (12 år, allergi), Bo Hansen").names).toEqual([
      "Anna Hansen (12 år, allergi)",
      "Bo Hansen",
    ]);
  });

  it("tom og manglende vaerdi", () => {
    expect(splitTravellers("")).toEqual({ names: [], summary: "" });
    expect(splitTravellers(null)).toEqual({ names: [], summary: "" });
    expect(splitTravellers(undefined)).toEqual({ names: [], summary: "" });
  });
});
