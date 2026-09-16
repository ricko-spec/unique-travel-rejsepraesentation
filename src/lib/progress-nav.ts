// Desktop progress-nav (Issue #40, ≥1180px). Ren logik udskilt fra
// komponenten så listen af synlige sektioner kan unit-testes uden en
// browser. Rækkefølge og labels følger issuens facit-liste;
// synlighedsbetingelserne SPEJLER de faktiske komponenters egne
// render-betingelser 1:1 (se kommentarerne pr. sektion), så nav'en aldrig
// kan pege på et anker der ikke findes i DOM'en.

export type NavSectionId = "intro" | "rejseplan" | "billeder" | "hoteller" | "pris" | "kontakt";

export type NavSection = {
  id: NavSectionId;
  label: string;
};

const ALL_SECTIONS: NavSection[] = [
  { id: "intro", label: "Intro" },
  { id: "rejseplan", label: "Rejseplan" },
  { id: "billeder", label: "Billeder" },
  { id: "hoteller", label: "Hoteller" },
  { id: "pris", label: "Pris" },
  { id: "kontakt", label: "Kontakt" },
];

export type VisibleNavSectionsInput = {
  // Hero (id="intro") har ingen tom-tilstand — kicker/titel vises altid.
  hasItinerary: boolean; // Timeline (id="rejseplan")
  galleryImageCount: number; // DestinationGallery (id="billeder") — samme filter som komponenten
  hasHotels: boolean; // Hotels (id="hoteller")
  // PriceAndNote (id="pris") har ingen tom-tilstand — viser enten prisen
  // eller "Prisen fremsendes separat".
  hasContact: boolean; // ContactCTA (id="kontakt") — samme betingelse som komponenten og ActionBar
};

export function visibleNavSections(input: VisibleNavSectionsInput): NavSection[] {
  return ALL_SECTIONS.filter((section) => {
    switch (section.id) {
      case "intro":
        return true;
      case "rejseplan":
        return input.hasItinerary;
      case "billeder":
        return input.galleryImageCount > 0;
      case "hoteller":
        return input.hasHotels;
      case "pris":
        return true;
      case "kontakt":
        return input.hasContact;
    }
  });
}

// Samme filter som DestinationGallery bruger til selve renderingen — delt
// herfra så "har billeder"-betingelsen i nav'en aldrig kan komme ud af trit
// med hvad galleriet faktisk viser.
export function filterGalleryImages(images: string[]): string[] {
  return images.filter((u) => typeof u === "string" && u.length > 0).slice(0, 3);
}

// Reviewfund: IntersectionObserver'ens trigger-bånd (se ProgressNav.tsx)
// ligger midt i viewporten, så den sidste sektion (typisk KONTAKT) aldrig
// kan nå at krydse båndet, hvis siden løber tør for scroll-plads før den
// gør — kort indhold efter den sidste sektion (Footer) er nok til at gøre
// det umuligt at scrolle sektionens top helt op i båndet. Løsningen er en
// separat, ren "er brugeren ved bunden af siden"-kontrol, der tvinger den
// sidste synlige sektion aktiv uafhængigt af observer-båndet. Udskilt som
// ren funktion (kun tal ind, boolean ud) så grænsetilfældet kan
// unit-testes uden en browser.
export const BOTTOM_THRESHOLD_PX = 4;

export function isScrolledToBottom(input: {
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
  thresholdPx?: number;
}): boolean {
  const threshold = input.thresholdPx ?? BOTTOM_THRESHOLD_PX;
  return input.scrollY + input.viewportHeight >= input.documentHeight - threshold;
}
