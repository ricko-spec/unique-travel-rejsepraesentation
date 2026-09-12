import { describe, it, expect } from "vitest";
import { splitTravellers } from "./travellers";

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
