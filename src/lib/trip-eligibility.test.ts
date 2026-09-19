import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseNormalizedTrip, resolveEligibleSections } from "./trip-eligibility";
import { resolveContactChannels } from "./contact-intent-trip";
import {
  SECTION_IDS,
  buildSectionEngagementDisplay,
  computeEligibleSectionsForTrip,
  type SectionId,
} from "./section-engagement";
import {
  handleSectionEngagement,
  type EngagementDeps,
} from "./section-engagement-endpoint";
import { tripSchema, normalizeTrip } from "./types";

// Fase 4 (Issue #76): ÉN runtime-valideret sektions-eligibility for admin-detalje,
// salgsoversigt og Fase 2-endpointet (Fase 2's admin læste tidligere rå JSONB).

const GALLERY = ["https://example.test/a.jpg"];

const FULL = {
  bookingNo: "1234567",
  destination: "Bali",
  advisorEmail: "raadgiver@uniquetravel.dk",
  itinerary: [{ type: "activity", typeLabel: "AKTIVITET", title: "Tempeltur" }],
  hotels: [{ name: "Hotel Test" }],
};

const MALFORMED: [string, unknown][] = [
  ["null", null],
  ["undefined", undefined],
  ["en streng", "ikke et objekt"],
  ["et tal", 42],
  ["et array", []],
  ["itinerary er ikke et array", { itinerary: "ikke et array" }],
  ["hotels er ikke et array", { hotels: 7 }],
  ["ukendt itinerary-type", { itinerary: [{ type: "bogus", typeLabel: "x", title: "y" }] }],
  ["ikke-streng advisorEmail", { advisorEmail: 123 }],
];

describe("A. parseNormalizedTrip", () => {
  it("gyldig data => normaliseret Trip", () => {
    const trip = parseNormalizedTrip(FULL);
    expect(trip).not.toBeNull();
    expect(trip?.itinerary).toHaveLength(1);
  });

  it.each(MALFORMED)("malformed (%s) => null", (_l, data) => {
    expect(parseNormalizedTrip(data)).toBeNull();
  });

  it("kaster aldrig", () => {
    for (const d of [null, undefined, {}, [], "x", 1, { itinerary: 5 }, Symbol.iterator]) {
      expect(() => parseNormalizedTrip(d)).not.toThrow();
    }
  });
});

describe("B. resolveEligibleSections", () => {
  it("fuld rejseplan med galleri => alle fem, i SECTION_IDS' rækkefølge", () => {
    expect(resolveEligibleSections(FULL, GALLERY)).toEqual([...SECTION_IDS]);
  });

  it("tom rejseplan uden galleri => kun price", () => {
    expect(resolveEligibleSections({ bookingNo: "1", destination: "Bali" }, [])).toEqual(["price"]);
  });

  it("gallery tæller EFTER filterGalleryImages (tomme URL'er tæller ikke)", () => {
    expect(resolveEligibleSections(FULL, ["", ""])).not.toContain("gallery");
    expect(resolveEligibleSections(FULL, ["", "https://x/a.jpg"])).toContain("gallery");
  });

  it("contact kun med advisorEmail; itinerary/hotels kun med indhold", () => {
    const r = resolveEligibleSections({ advisorEmail: "", itinerary: [], hotels: [] }, []);
    expect(r).toEqual(["price"]);
  });

  it.each(MALFORMED)("malformed (%s) => null — ALDRIG en tom liste", (_l, data) => {
    expect(resolveEligibleSections(data, GALLERY)).toBeNull();
  });

  it("samme resultat som kundesidens egen beregning på gyldig data (ingen adfærdsændring)", () => {
    for (const data of [FULL, { ...FULL, advisorEmail: null }, { destination: "x" }]) {
      const customerPage = computeEligibleSectionsForTrip(
        normalizeTrip(tripSchema.parse(data)),
        GALLERY,
      );
      expect(resolveEligibleSections(data, GALLERY)).toEqual(customerPage);
    }
  });
});

describe("C. PARITET: admin/liste-eligibility === Fase 2-endpoint-eligibility", () => {
  const SLUG = "abc123";
  const BOOKING_NO = "1234567";

  async function endpointWrites(
    data: unknown,
    section: SectionId,
    gallery: string[],
  ): Promise<boolean> {
    const recordSection = vi.fn<EngagementDeps["recordSection"]>(async () => ({ kind: "ok" }));
    await handleSectionEngagement(
      {
        slug: SLUG,
        body: { section },
        accessCookieValue: BOOKING_NO,
        gate: {
          vercelEnv: "production",
          host: "rejseplaner.uniquetravel.dk",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
          cookieNames: [`trip_access_${SLUG}`],
        },
      },
      {
        loadTrip: async () => ({ id: "id-1", booking_no: BOOKING_NO, destination: "Bali", data }),
        loadGalleryImages: async () => gallery,
        recordSection,
      },
    );
    return recordSection.mock.calls.length === 1;
  }

  const CASES: [string, unknown, string[]][] = [
    ["fuld + galleri", FULL, GALLERY],
    ["fuld uden galleri", FULL, []],
    ["uden advisorEmail", { ...FULL, advisorEmail: null }, GALLERY],
    ["tom rejseplan", { destination: "Bali" }, []],
    ["malformed: itinerary ikke array", { itinerary: "x" }, GALLERY],
    ["malformed: ugyldig advisorEmail", { advisorEmail: 123 }, GALLERY],
    ["malformed: null", null, GALLERY],
  ];

  it.each(CASES)("%s", async (_label, data, gallery) => {
    const resolved = resolveEligibleSections(data, gallery);
    for (const section of SECTION_IDS) {
      expect(await endpointWrites(data, section, gallery)).toBe(resolved?.includes(section) ?? false);
    }
  });
});

describe("D. sælgervisning: malformed trip-data => 'kunne ikke vurderes', aldrig falsk 'ikke set'", () => {
  it("eligibleSections null => unassessable (uanset rows)", () => {
    expect(
      buildSectionEngagementDisplay({
        eligibleSections: null,
        rows: [{ section: "price", last_seen_at: "2026-09-19T10:00:00Z" }],
        readFailed: false,
      }),
    ).toEqual({ kind: "unassessable" });
  });

  it("DB read failure har forrang: unavailable, også med ukendt eligibility", () => {
    expect(
      buildSectionEngagementDisplay({ eligibleSections: null, rows: null, readFailed: true }),
    ).toEqual({ kind: "unavailable" });
  });

  it("kendt eligibility: uændret adfærd (available med seen/ikke seen)", () => {
    const d = buildSectionEngagementDisplay({
      eligibleSections: ["itinerary", "price"],
      rows: [{ section: "price", last_seen_at: "2026-09-19T10:00:00Z" }],
      readFailed: false,
    });
    expect(d).toEqual({
      kind: "available",
      sections: [
        { section: "itinerary", seen: false, lastSeenAt: null },
        { section: "price", seen: true, lastSeenAt: "2026-09-19T10:00:00Z" },
      ],
    });
  });

  it("kanaler og sektioner deler samme parse: begge null for samme malformed data", () => {
    for (const [, data] of MALFORMED) {
      expect(resolveContactChannels(data)).toBeNull();
      expect(resolveEligibleSections(data, GALLERY)).toBeNull();
    }
  });
});

describe("E. statiske kontrakter for forbrugerne (ingen rå JSON-læsning)", () => {
  function code(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("admin-detaljen bruger resolveEligibleSections(row.data, …), ikke computeEligibleSections på rå felter", () => {
    const page = code("src/app/admin/trips/[id]/page.tsx");
    expect(page).toMatch(/resolveEligibleSections\(row\.data,/);
    expect(page).not.toMatch(/computeEligibleSections\b/);
    expect(page).not.toMatch(/row\.data\?\.(itinerary|hotels|advisorEmail)/);
  });

  it("Fase 2-endpointet bruger resolveEligibleSections og parser ikke selv", () => {
    const ep = code("src/lib/section-engagement-endpoint.ts");
    expect(ep).toMatch(/resolveEligibleSections\(trip\.data,/);
    expect(ep).not.toMatch(/tripSchema|normalizeTrip/);
  });

  it("kundesiden (uændret) parser med tripSchema + normalizeTrip — samme sandhed", () => {
    const page = code("src/app/[bookingId]/page.tsx");
    expect(page).toMatch(/tripSchema\.safeParse\(row\.data\)/);
    expect(page).toMatch(/normalizeTrip\(/);
  });
});
