import { describe, it, expect } from "vitest";
import {
  pickDestinationMatch,
  destinationCandidates,
  type DestinationRecord,
} from "./destination-match";

const DESTS: DestinationRecord[] = [
  { name: "Sri Lanka", hero_url: "https://img/srilanka.webp", gallery: ["a", "b", "c"] },
  { name: "Maldiverne", hero_url: "https://img/maldiverne.webp", gallery: ["m1"] },
  { name: "Bali", hero_url: "https://img/bali.webp", gallery: [] },
  { name: "Thailand", hero_url: "https://img/thailand.webp", gallery: ["t"] },
  { name: "Vietnam", hero_url: null, gallery: null },
];

describe("destinationCandidates", () => {
  it("giver hele navnet først, dernæst segmenter i rute-rækkefølge", () => {
    expect(destinationCandidates("Sri Lanka & Maldiverne")).toEqual([
      "sri lanka & maldiverne",
      "sri lanka",
      "maldiverne",
    ]);
  });
  it("deduplikerer og normaliserer enkelt-destination", () => {
    expect(destinationCandidates("Thailand")).toEqual(["thailand"]);
  });
});

describe("pickDestinationMatch", () => {
  it("matcher eksakt enkelt-destination", () => {
    expect(pickDestinationMatch(DESTS, "Thailand")?.heroUrl).toBe("https://img/thailand.webp");
  });

  it("kombi-destination bruger FØRSTE segment (Sri Lanka & Maldiverne → Sri Lanka)", () => {
    const m = pickDestinationMatch(DESTS, "Sri Lanka & Maldiverne");
    expect(m?.heroUrl).toBe("https://img/srilanka.webp");
    expect(m?.gallery).toEqual(["a", "b", "c"]);
  });

  it("springer et segment uden record over og tager næste (Singapore & Bali → Bali)", () => {
    expect(pickDestinationMatch(DESTS, "Singapore & Bali")?.heroUrl).toBe("https://img/bali.webp");
  });

  it("tåler afvigende case og mellemrum", () => {
    expect(pickDestinationMatch(DESTS, "  sri  lanka  ")?.heroUrl).toBe("https://img/srilanka.webp");
    expect(pickDestinationMatch(DESTS, "SRI LANKA & maldiverne")?.heroUrl).toBe(
      "https://img/srilanka.webp",
    );
  });

  it("returnerer null når intet segment matcher (fallback bevares)", () => {
    expect(pickDestinationMatch(DESTS, "Grønland")).toBeNull();
    expect(pickDestinationMatch(DESTS, "Singapore & Hong Kong")).toBeNull();
  });

  it("håndterer manglende hero_url og ikke-array gallery", () => {
    const m = pickDestinationMatch(DESTS, "Vietnam");
    expect(m).not.toBeNull();
    expect(m?.heroUrl).toBeNull();
    expect(m?.gallery).toEqual([]);
  });

  it("returnerer null for tomt navn eller tom tabel", () => {
    expect(pickDestinationMatch(DESTS, "")).toBeNull();
    expect(pickDestinationMatch([], "Thailand")).toBeNull();
  });
});
