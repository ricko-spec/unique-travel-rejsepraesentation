import { describe, it, expect } from "vitest";
import {
  BOTTOM_THRESHOLD_PX,
  filterGalleryImages,
  isScrolledToBottom,
  visibleNavSections,
} from "./progress-nav";

const FULL_INPUT = {
  hasItinerary: true,
  galleryImageCount: 3,
  hasHotels: true,
  hasContact: true,
};

describe("visibleNavSections", () => {
  it("viser alle 6 sektioner i den faste rækkefølge når alt findes", () => {
    expect(visibleNavSections(FULL_INPUT).map((s) => s.id)).toEqual([
      "intro",
      "rejseplan",
      "billeder",
      "hoteller",
      "pris",
      "kontakt",
    ]);
  });

  it("intro og pris er altid med — de har ingen tom-tilstand", () => {
    const sections = visibleNavSections({
      hasItinerary: false,
      galleryImageCount: 0,
      hasHotels: false,
      hasContact: false,
    });
    expect(sections.map((s) => s.id)).toEqual(["intro", "pris"]);
  });

  it("udelader rejseplan når itineraryet er tomt", () => {
    const sections = visibleNavSections({ ...FULL_INPUT, hasItinerary: false });
    expect(sections.map((s) => s.id)).not.toContain("rejseplan");
  });

  it("udelader billeder når der ikke er nogen billeder (matcher DestinationGallery)", () => {
    const sections = visibleNavSections({ ...FULL_INPUT, galleryImageCount: 0 });
    expect(sections.map((s) => s.id)).not.toContain("billeder");
  });

  it("udelader hoteller når der ikke er nogen hoteller", () => {
    const sections = visibleNavSections({ ...FULL_INPUT, hasHotels: false });
    expect(sections.map((s) => s.id)).not.toContain("hoteller");
  });

  it("udelader kontakt uden advisorEmail — samme betingelse som ContactCTA/ActionBar (intet dødt #kontakt-anker)", () => {
    const sections = visibleNavSections({ ...FULL_INPUT, hasContact: false });
    expect(sections.map((s) => s.id)).not.toContain("kontakt");
  });

  it("giver kun intro + pris på en minimal rejseplan uden itinerary/billeder/hoteller/rådgiver-match", () => {
    const sections = visibleNavSections({
      hasItinerary: false,
      galleryImageCount: 0,
      hasHotels: false,
      hasContact: false,
    });
    expect(sections).toHaveLength(2);
  });

  it("hver synlig sektion har et ikke-tomt label", () => {
    for (const section of visibleNavSections(FULL_INPUT)) {
      expect(section.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("filterGalleryImages", () => {
  it("filtrerer tomme/ugyldige strenge fra og begrænser til 3", () => {
    const result = filterGalleryImages(["a.jpg", "", "b.jpg", "c.jpg", "d.jpg"]);
    expect(result).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("giver tom liste for en tom input", () => {
    expect(filterGalleryImages([])).toEqual([]);
  });
});

// Reviewfund: den sidste sektion (typisk KONTAKT) kan sidde for tæt på
// sidens bund til at IntersectionObserver-båndet nogensinde når den — der
// er ikke scroll-plads nok efter den til at få dens top ind i båndet. Denne
// grænseværdi afgør hvornår ProgressNav i stedet tvinger den sidste sektion
// aktiv, fordi brugeren reelt er ved bunden af siden.
describe("isScrolledToBottom", () => {
  it("er false midt på en lang side", () => {
    expect(
      isScrolledToBottom({ scrollY: 2000, viewportHeight: 900, documentHeight: 8000 }),
    ).toBe(false);
  });

  it("er true når scrollY + viewport rammer dokumenthøjden præcist", () => {
    expect(
      isScrolledToBottom({ scrollY: 7100, viewportHeight: 900, documentHeight: 8000 }),
    ).toBe(true);
  });

  it("er true inden for tærsklen, selvom man ikke rammer bunden helt præcist", () => {
    const documentHeight = 8000;
    const viewportHeight = 900;
    // Mangler præcis BOTTOM_THRESHOLD_PX i at nå bunden.
    const scrollY = documentHeight - viewportHeight - BOTTOM_THRESHOLD_PX;
    expect(isScrolledToBottom({ scrollY, viewportHeight, documentHeight })).toBe(true);
  });

  it("er false lige uden for tærsklen", () => {
    const documentHeight = 8000;
    const viewportHeight = 900;
    const scrollY = documentHeight - viewportHeight - BOTTOM_THRESHOLD_PX - 1;
    expect(isScrolledToBottom({ scrollY, viewportHeight, documentHeight })).toBe(false);
  });

  it("er true når viewport alene er større end hele dokumentet (ingen scroll mulig)", () => {
    expect(
      isScrolledToBottom({ scrollY: 0, viewportHeight: 1200, documentHeight: 900 }),
    ).toBe(true);
  });

  it("respekterer en tilpasset tærskel", () => {
    expect(
      isScrolledToBottom({
        scrollY: 6900,
        viewportHeight: 900,
        documentHeight: 8000,
        thresholdPx: 300,
      }),
    ).toBe(true);
    expect(
      isScrolledToBottom({
        scrollY: 6900,
        viewportHeight: 900,
        documentHeight: 8000,
        thresholdPx: 50,
      }),
    ).toBe(false);
  });
});
