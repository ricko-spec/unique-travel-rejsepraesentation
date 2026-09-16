import { describe, it, expect } from "vitest";
import { filterGalleryImages, visibleNavSections } from "./progress-nav";

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
