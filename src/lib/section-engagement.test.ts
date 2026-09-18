import { describe, it, expect } from "vitest";
import {
  SECTION_IDS,
  SECTION_DOM_ID,
  SECTION_DWELL_MS,
  isSectionId,
  sectionEngagementBodySchema,
  computeEligibleSections,
  shouldRecordSectionEngagement,
  dwellReducer,
  shouldSendSection,
  buildSectionEngagementDisplay,
  type SectionId,
} from "./section-engagement";

// ============================================================================
// A. Section enum — kun 5 gyldige values
// ============================================================================
describe("A. section enum", () => {
  it("SECTION_IDS har præcis de fem forventede værdier, i denne rækkefølge", () => {
    expect(SECTION_IDS).toEqual(["itinerary", "gallery", "hotels", "price", "contact"]);
  });

  it("isSectionId accepterer kun de fem kendte værdier", () => {
    for (const id of SECTION_IDS) expect(isSectionId(id)).toBe(true);
  });

  it("isSectionId afviser alt andet, inkl. 'intro' og ikke-strenge", () => {
    expect(isSectionId("intro")).toBe(false);
    expect(isSectionId("Itinerary")).toBe(false); // case-sensitiv
    expect(isSectionId("")).toBe(false);
    expect(isSectionId(null)).toBe(false);
    expect(isSectionId(undefined)).toBe(false);
    expect(isSectionId(123)).toBe(false);
    expect(isSectionId({ section: "price" })).toBe(false);
  });

  it("SECTION_DOM_ID dækker alle fem, og udelukker 'intro'", () => {
    for (const id of SECTION_IDS) expect(typeof SECTION_DOM_ID[id]).toBe("string");
    expect(Object.keys(SECTION_DOM_ID)).toHaveLength(5);
    expect(SECTION_DOM_ID).toEqual({
      itinerary: "rejseplan",
      gallery: "billeder",
      hotels: "hoteller",
      price: "pris",
      contact: "kontakt",
    });
  });

  describe("sectionEngagementBodySchema (delt med endpointet)", () => {
    it("accepterer hver af de fem gyldige sections", () => {
      for (const section of SECTION_IDS) {
        expect(sectionEngagementBodySchema.safeParse({ section }).success).toBe(true);
      }
    });

    it("afviser en ukendt section-værdi", () => {
      expect(sectionEngagementBodySchema.safeParse({ section: "intro" }).success).toBe(false);
      expect(sectionEngagementBodySchema.safeParse({ section: "admin_panel" }).success).toBe(
        false,
      );
      expect(sectionEngagementBodySchema.safeParse({ section: "" }).success).toBe(false);
    });

    it("afviser manglende/malformed body", () => {
      expect(sectionEngagementBodySchema.safeParse(null).success).toBe(false);
      expect(sectionEngagementBodySchema.safeParse({}).success).toBe(false);
      expect(sectionEngagementBodySchema.safeParse("price").success).toBe(false);
    });

    it("afviser en ukendt ekstra nøgle — fx et forsøgt trip_id (.strict())", () => {
      const result = sectionEngagementBodySchema.safeParse({
        section: "price",
        trip_id: "11111111-1111-1111-1111-111111111111",
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// B. Eligibility
// ============================================================================
describe("B. eligibility (computeEligibleSections)", () => {
  it("itinerary tom => ikke eligible", () => {
    const sections = computeEligibleSections({
      hasItinerary: false,
      galleryImageCount: 3,
      hasHotels: true,
      hasContact: true,
    });
    expect(sections).not.toContain("itinerary");
  });

  it("gallery tom => ikke eligible", () => {
    const sections = computeEligibleSections({
      hasItinerary: true,
      galleryImageCount: 0,
      hasHotels: true,
      hasContact: true,
    });
    expect(sections).not.toContain("gallery");
  });

  it("hotels tom => ikke eligible", () => {
    const sections = computeEligibleSections({
      hasItinerary: true,
      galleryImageCount: 3,
      hasHotels: false,
      hasContact: true,
    });
    expect(sections).not.toContain("hotels");
  });

  it("price => altid eligible, uanset øvrige felter", () => {
    const sections = computeEligibleSections({
      hasItinerary: false,
      galleryImageCount: 0,
      hasHotels: false,
      hasContact: false,
    });
    expect(sections).toContain("price");
  });

  it("contact uden rådgiver-email (hasContact=false) => ikke eligible", () => {
    const sections = computeEligibleSections({
      hasItinerary: true,
      galleryImageCount: 3,
      hasHotels: true,
      hasContact: false,
    });
    expect(sections).not.toContain("contact");
  });

  it("alle fem eligible => rækkefølgen matcher altid SECTION_IDS", () => {
    const sections = computeEligibleSections({
      hasItinerary: true,
      galleryImageCount: 1,
      hasHotels: true,
      hasContact: true,
    });
    expect(sections).toEqual(["itinerary", "gallery", "hotels", "price", "contact"]);
  });

  it("ingen eligible undtagen price (den minimale rejseplan)", () => {
    const sections = computeEligibleSections({
      hasItinerary: false,
      galleryImageCount: 0,
      hasHotels: false,
      hasContact: false,
    });
    expect(sections).toEqual(["price"]);
  });
});

// ============================================================================
// H. Gate (production/host/bot/admin — samme princip som Fase 1B)
// ============================================================================
describe("H. shouldRecordSectionEngagement (gate)", () => {
  const validInput = () => ({
    vercelEnv: "production",
    host: "rejseplaner.uniquetravel.dk",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
    cookieNames: ["trip_access_abc123"],
  });

  it("canonical production + kundeadgang => allowed", () => {
    expect(shouldRecordSectionEngagement(validInput())).toBe(true);
  });

  it("preview (VERCEL_ENV !== production) => no write", () => {
    expect(shouldRecordSectionEngagement({ ...validInput(), vercelEnv: "preview" })).toBe(false);
    expect(shouldRecordSectionEngagement({ ...validInput(), vercelEnv: "development" })).toBe(
      false,
    );
    expect(shouldRecordSectionEngagement({ ...validInput(), vercelEnv: undefined })).toBe(false);
  });

  it("ikke-kanonisk host (fx Vercel branch-alias) => no write", () => {
    expect(
      shouldRecordSectionEngagement({
        ...validInput(),
        host: "unique-travel-rejsepraesentation-git-main-unique-travel.vercel.app",
      }),
    ).toBe(false);
  });

  it("bot UA => no write", () => {
    expect(shouldRecordSectionEngagement({ ...validInput(), userAgent: "Googlebot/2.1" })).toBe(
      false,
    );
    expect(shouldRecordSectionEngagement({ ...validInput(), userAgent: "" })).toBe(false);
    expect(shouldRecordSectionEngagement({ ...validInput(), userAgent: null })).toBe(false);
  });

  it("admin auth-cookie til stede => no write", () => {
    expect(
      shouldRecordSectionEngagement({
        ...validInput(),
        cookieNames: ["trip_access_abc123", "sb-iunixfpthdftmkgpugex-auth-token"],
      }),
    ).toBe(false);
  });
});

// ============================================================================
// C. Dwell state machine
// ============================================================================
describe("C. dwellReducer", () => {
  it("entering + dwell-timeout => qualify", () => {
    let s = dwellReducer("idle", "enter");
    expect(s).toEqual({ state: "pending", effect: "start-timer" });
    s = dwellReducer(s.state, "timeout");
    expect(s).toEqual({ state: "qualified", effect: "qualify" });
  });

  it("leaves før dwell => cancel (tilbage til idle)", () => {
    let s = dwellReducer("idle", "enter");
    expect(s.state).toBe("pending");
    s = dwellReducer(s.state, "leave");
    expect(s).toEqual({ state: "idle", effect: "cancel-timer" });
  });

  it("re-enters efter en cancelled leave => kan kvalificere senere", () => {
    let s = dwellReducer("idle", "enter");
    s = dwellReducer(s.state, "leave"); // cancel
    expect(s.state).toBe("idle");
    s = dwellReducer(s.state, "enter"); // re-enter
    expect(s).toEqual({ state: "pending", effect: "start-timer" });
    s = dwellReducer(s.state, "timeout");
    expect(s).toEqual({ state: "qualified", effect: "qualify" });
  });

  it("en forsinket 'timeout' der ankommer EFTER en leave (state allerede idle) kvalificerer IKKE", () => {
    let s = dwellReducer("idle", "enter");
    s = dwellReducer(s.state, "leave"); // idle igen, timer burde være clearTimeout'et af kalderen
    // men selvom en forsinket timeout alligevel når frem til reduceren:
    s = dwellReducer(s.state, "timeout");
    expect(s).toEqual({ state: "idle", effect: "none" });
  });

  it("en duplikeret 'enter' mens allerede pending er en no-op (starter ikke en ny timer)", () => {
    let s = dwellReducer("idle", "enter");
    expect(s.state).toBe("pending");
    s = dwellReducer(s.state, "enter");
    expect(s).toEqual({ state: "pending", effect: "none" });
  });

  it("'qualified' er et slutstadie — yderligere actions er no-ops", () => {
    const qualified: ReturnType<typeof dwellReducer> = { state: "qualified", effect: "none" };
    expect(dwellReducer(qualified.state, "enter")).toEqual({ state: "qualified", effect: "none" });
    expect(dwellReducer(qualified.state, "leave")).toEqual({ state: "qualified", effect: "none" });
    expect(dwellReducer(qualified.state, "timeout")).toEqual({
      state: "qualified",
      effect: "none",
    });
  });

  it("en 'leave' mens idle (aldrig entered) er en no-op", () => {
    expect(dwellReducer("idle", "leave")).toEqual({ state: "idle", effect: "none" });
  });

  it("SECTION_DWELL_MS er 750", () => {
    expect(SECTION_DWELL_MS).toBe(750);
  });
});

// ============================================================================
// D. Dedup
// ============================================================================
describe("D. shouldSendSection (dedup)", () => {
  it("samme section sendes højst én gang pr. page load", () => {
    const sent = new Set<SectionId>(["price"]);
    expect(shouldSendSection(sent, "price")).toBe(false);
  });

  it("en ny section kan sendes, selv med andre sections allerede i sent", () => {
    const sent = new Set<SectionId>(["price"]);
    expect(shouldSendSection(sent, "gallery")).toBe(true);
  });

  it("fem forskellige sections kan alle sendes", () => {
    const sent = new Set<SectionId>();
    for (const section of SECTION_IDS) {
      expect(shouldSendSection(sent, section)).toBe(true);
      sent.add(section);
    }
    expect(sent.size).toBe(5);
  });

  it("loftet håndhæves eksplicit selv i et hypotetisk over-fem-scenarie", () => {
    const sent = new Set<SectionId>(SECTION_IDS); // alle fem allerede sendt
    expect(shouldSendSection(sent, "price")).toBe(false); // allerede sendt
  });
});

// ============================================================================
// I. Admin detail (buildSectionEngagementDisplay)
// ============================================================================
describe("I. buildSectionEngagementDisplay (admin 'Set i rejseplanen')", () => {
  it("seen sections korrekt — eligible + række findes => seen med lastSeenAt", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["itinerary", "price"],
      rows: [
        { section: "itinerary", last_seen_at: "2026-09-20T10:00:00Z" },
        { section: "price", last_seen_at: "2026-09-20T10:05:00Z" },
      ],
      readFailed: false,
    });
    expect(display).toEqual({
      kind: "available",
      sections: [
        { section: "itinerary", seen: true, lastSeenAt: "2026-09-20T10:00:00Z" },
        { section: "price", seen: true, lastSeenAt: "2026-09-20T10:05:00Z" },
      ],
    });
  });

  it("eligible, men ingen matchende række => seen:false, lastSeenAt:null", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["hotels"],
      rows: [],
      readFailed: false,
    });
    expect(display).toEqual({
      kind: "available",
      sections: [{ section: "hotels", seen: false, lastSeenAt: null }],
    });
  });

  it("ineligible sections udelades — optræder aldrig i resultatet, uanset rows", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["price"], // kun price er eligible for denne trip
      rows: [{ section: "gallery", last_seen_at: "2026-09-20T10:00:00Z" }], // stråleraden ignoreres
      readFailed: false,
    });
    expect(display.kind).toBe("available");
    if (display.kind === "available") {
      expect(display.sections).toHaveLength(1);
      expect(display.sections[0].section).toBe("price");
    }
  });

  it("read failure => unavailable, ALDRIG et falsk minus", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["itinerary", "gallery", "hotels", "price", "contact"],
      rows: null,
      readFailed: true,
    });
    expect(display).toEqual({ kind: "unavailable" });
  });

  it("read failure trumfer selv tilstedeværende, gyldige rows", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["price"],
      rows: [{ section: "price", last_seen_at: "2026-09-20T10:00:00Z" }],
      readFailed: true,
    });
    expect(display).toEqual({ kind: "unavailable" });
  });

  it("malformed/ukendt section i en række ignoreres uden at kaste eller gøre alt unavailable", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["price"],
      rows: [{ section: "not-a-real-section", last_seen_at: "2026-09-20T10:00:00Z" }],
      readFailed: false,
    });
    expect(display).toEqual({
      kind: "available",
      sections: [{ section: "price", seen: false, lastSeenAt: null }],
    });
  });

  it("ugyldigt last_seen_at på en ellers gyldig række => seen:true, men lastSeenAt:null (aldrig en falsk 'ikke set')", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: ["price"],
      rows: [{ section: "price", last_seen_at: "ikke-en-dato" }],
      readFailed: false,
    });
    expect(display).toEqual({
      kind: "available",
      sections: [{ section: "price", seen: true, lastSeenAt: null }],
    });
  });

  it("ingen eligible sections => tom liste, ikke unavailable", () => {
    const display = buildSectionEngagementDisplay({
      eligibleSections: [],
      rows: [],
      readFailed: false,
    });
    expect(display).toEqual({ kind: "available", sections: [] });
  });
});
