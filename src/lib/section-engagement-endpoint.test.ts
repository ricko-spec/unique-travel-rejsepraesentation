import { describe, it, expect, vi } from "vitest";
import {
  handleSectionEngagement,
  type EngagementDeps,
  type EngagementInput,
  type EngagementTripRow,
} from "./section-engagement-endpoint";
import { computeEligibleSectionsForTrip } from "./section-engagement";

// Security-orchestration-tests for POST /[bookingId]/engagement.
//
// route.ts er en tynd adapter over handleSectionEngagement() (samme funktion,
// ingen parallel kopi af rækkefølgen) — så disse tests kører den FAKTISKE
// beslutningskæde route.ts bruger: body → trip + adgang → production/host/bot/
// admin-gate → server-side eligibility → skrivning. Skrivningen (recordSection)
// er en spion: hver test asserter præcist hvornår den kaldes, og med hvad.

const SLUG = "abc123";
const BOOKING_NO = "1234567";
const TRIP_ID = "11111111-2222-3333-4444-555555555555"; // SERVER-afledt id

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";

// Rejseplan med indhold i alle sektioner (i tripSchema-formatet, som ligger i
// trips.data): rejseplan, hotel og rådgiver-mail. Galleri kommer fra deps.
const FULL_TRIP_DATA = {
  bookingNo: BOOKING_NO,
  destination: "Bali",
  advisorEmail: "raadgiver@uniquetravel.dk",
  itinerary: [{ type: "activity", typeLabel: "AKTIVITET", title: "Tempeltur" }],
  hotels: [{ name: "Hotel Test" }],
};

function tripRow(data: unknown = FULL_TRIP_DATA): EngagementTripRow {
  return { id: TRIP_ID, booking_no: BOOKING_NO, destination: "Bali", data };
}

function makeInput(overrides: Partial<EngagementInput> = {}): EngagementInput {
  return {
    slug: SLUG,
    body: { section: "itinerary" },
    accessCookieValue: BOOKING_NO,
    gate: {
      vercelEnv: "production",
      host: "rejseplaner.uniquetravel.dk",
      userAgent: BROWSER_UA,
      cookieNames: [`trip_access_${SLUG}`],
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<EngagementDeps> = {}) {
  const recordSection = vi.fn<EngagementDeps["recordSection"]>(async () => ({ kind: "ok" }));
  const loadTrip = vi.fn<EngagementDeps["loadTrip"]>(async () => tripRow());
  const loadGalleryImages = vi.fn<EngagementDeps["loadGalleryImages"]>(async () => [
    "https://example.test/a.jpg",
  ]);
  const deps: EngagementDeps = { loadTrip, loadGalleryImages, recordSection, ...overrides };
  return { deps, recordSection, loadTrip, loadGalleryImages };
}

// ============================================================================
// A–E. Ingen skrivning: manglende trip, adgang, preview, admin, bot
// ============================================================================
describe("A. manglende/inaktiv trip => ingen skrivning", () => {
  it("404 og recordSection kaldes ikke", async () => {
    const { deps, recordSection } = makeDeps({ loadTrip: async () => null });
    const result = await handleSectionEngagement(makeInput(), deps);
    expect(result).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordSection).not.toHaveBeenCalled();
  });
});

describe("B. ugyldig/manglende kundeadgang => ingen skrivning", () => {
  it("manglende access-cookie => 404, ingen skrivning", async () => {
    const { deps, recordSection } = makeDeps();
    const result = await handleSectionEngagement(makeInput({ accessCookieValue: undefined }), deps);
    expect(result).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("forkert access-cookie => 404, ingen skrivning", async () => {
    const { deps, recordSection } = makeDeps();
    const result = await handleSectionEngagement(makeInput({ accessCookieValue: "9999999" }), deps);
    expect(result).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("missing trip og forkert adgang giver IDENTISK svar (ingen slug-/adgangs-oracle)", async () => {
    const missing = await handleSectionEngagement(
      makeInput(),
      makeDeps({ loadTrip: async () => null }).deps,
    );
    const wrongCookie = await handleSectionEngagement(
      makeInput({ accessCookieValue: "nope" }),
      makeDeps().deps,
    );
    expect(missing).toEqual(wrongCookie);
  });
});

describe("C. preview => ingen skrivning", () => {
  it.each(["preview", "development", undefined])("VERCEL_ENV=%s => 204 no-op", async (env) => {
    const { deps, recordSection } = makeDeps();
    const input = makeInput();
    const result = await handleSectionEngagement(
      { ...input, gate: { ...input.gate, vercelEnv: env } },
      deps,
    );
    expect(result).toEqual({ status: 204, reason: "gated" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("production-env men ikke-kanonisk host (Vercel branch-alias) => ingen skrivning", async () => {
    const { deps, recordSection } = makeDeps();
    const input = makeInput();
    const result = await handleSectionEngagement(
      {
        ...input,
        gate: {
          ...input.gate,
          host: "unique-travel-rejsepraesentation-git-main-unique-travel.vercel.app",
        },
      },
      deps,
    );
    expect(result).toEqual({ status: 204, reason: "gated" });
    expect(recordSection).not.toHaveBeenCalled();
  });
});

describe("D. admin auth-cookie => ingen skrivning", () => {
  it("gyldig kundeadgang + Supabase-auth-cookie => 204 no-op", async () => {
    const { deps, recordSection } = makeDeps();
    const input = makeInput();
    const result = await handleSectionEngagement(
      {
        ...input,
        gate: {
          ...input.gate,
          cookieNames: [`trip_access_${SLUG}`, "sb-iunixfpthdftmkgpugex-auth-token"],
        },
      },
      deps,
    );
    expect(result).toEqual({ status: 204, reason: "gated" });
    expect(recordSection).not.toHaveBeenCalled();
  });
});

describe("E. bot => ingen skrivning", () => {
  it.each(["Googlebot/2.1", "curl/8.4.0", "", null])("UA=%j => 204 no-op", async (ua) => {
    const { deps, recordSection } = makeDeps();
    const input = makeInput();
    const result = await handleSectionEngagement(
      { ...input, gate: { ...input.gate, userAgent: ua } },
      deps,
    );
    expect(result).toEqual({ status: 204, reason: "gated" });
    expect(recordSection).not.toHaveBeenCalled();
  });
});

// ============================================================================
// F. Gyldig adgang + gyldig enum MEN ineligible sektion => ingen skrivning
// ============================================================================
describe("F. server-side eligibility: ineligible sektion => 204 no-op, ingen skrivning", () => {
  it("contact på en rejseplan uden advisorEmail", async () => {
    const { deps, recordSection } = makeDeps({
      loadTrip: async () => tripRow({ ...FULL_TRIP_DATA, advisorEmail: null }),
    });
    const result = await handleSectionEngagement(makeInput({ body: { section: "contact" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("contact med tom advisorEmail (samme falsy-betingelse som ContactCTA)", async () => {
    const { deps, recordSection } = makeDeps({
      loadTrip: async () => tripRow({ ...FULL_TRIP_DATA, advisorEmail: "" }),
    });
    await handleSectionEngagement(makeInput({ body: { section: "contact" } }), deps);
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("itinerary på en rejseplan uden programpunkter", async () => {
    const { deps, recordSection } = makeDeps({
      loadTrip: async () => tripRow({ ...FULL_TRIP_DATA, itinerary: [] }),
    });
    const result = await handleSectionEngagement(makeInput({ body: { section: "itinerary" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("hotels på en rejseplan uden hoteller", async () => {
    const { deps, recordSection } = makeDeps({
      loadTrip: async () => tripRow({ ...FULL_TRIP_DATA, hotels: [] }),
    });
    const result = await handleSectionEngagement(makeInput({ body: { section: "hotels" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("gallery når destinationens galleri er tomt", async () => {
    const { deps, recordSection } = makeDeps({ loadGalleryImages: async () => [] });
    const result = await handleSectionEngagement(makeInput({ body: { section: "gallery" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("gallery når galleriet kun har tomme/ugyldige URL'er (efter filterGalleryImages)", async () => {
    const { deps, recordSection } = makeDeps({ loadGalleryImages: async () => ["", ""] });
    const result = await handleSectionEngagement(makeInput({ body: { section: "gallery" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("trip-data der ikke kan parses (kundesiden viser fejlside) => ineligible for alle sektioner", async () => {
    const { deps, recordSection } = makeDeps({
      loadTrip: async () => tripRow({ itinerary: "ikke et array" }),
    });
    const result = await handleSectionEngagement(makeInput({ body: { section: "price" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("ineligible giver SAMME svar (204) som et vellykket write og en gate-afvisning", async () => {
    const written = await handleSectionEngagement(makeInput(), makeDeps().deps);
    const ineligible = await handleSectionEngagement(
      makeInput({ body: { section: "contact" } }),
      makeDeps({ loadTrip: async () => tripRow({ ...FULL_TRIP_DATA, advisorEmail: null }) }).deps,
    );
    expect(ineligible.status).toBe(written.status);
  });

  it("gate-afvisning sker FØR galleri-opslaget (ingen unødigt DB-opslag for preview/bot)", async () => {
    const { deps, loadGalleryImages } = makeDeps();
    const input = makeInput();
    await handleSectionEngagement({ ...input, gate: { ...input.gate, vercelEnv: "preview" } }, deps);
    expect(loadGalleryImages).not.toHaveBeenCalled();
  });
});

// ============================================================================
// G. Gyldig adgang + eligible sektion + kanonisk production => præcis ét write
// ============================================================================
describe("G. gyldigt kald => præcis ét write med SERVER-afledt trip.id + valideret section", () => {
  it("itinerary", async () => {
    const { deps, recordSection } = makeDeps();
    const result = await handleSectionEngagement(makeInput({ body: { section: "itinerary" } }), deps);
    expect(result).toEqual({ status: 204, reason: "recorded" });
    expect(recordSection).toHaveBeenCalledTimes(1);
    expect(recordSection).toHaveBeenCalledWith(TRIP_ID, "itinerary");
  });

  it.each(["itinerary", "gallery", "hotels", "price", "contact"] as const)(
    "%s (eligible på en fuld rejseplan)",
    async (section) => {
      const { deps, recordSection } = makeDeps();
      const result = await handleSectionEngagement(makeInput({ body: { section } }), deps);
      expect(result.status).toBe(204);
      expect(recordSection).toHaveBeenCalledTimes(1);
      expect(recordSection).toHaveBeenCalledWith(TRIP_ID, section);
    },
  );

  it("price er ALTID eligible, også på en tom rejseplan uden galleri og rådgiver", async () => {
    const { deps, recordSection } = makeDeps({
      loadTrip: async () => tripRow({ bookingNo: BOOKING_NO, destination: "Bali" }),
      loadGalleryImages: async () => [],
    });
    const result = await handleSectionEngagement(makeInput({ body: { section: "price" } }), deps);
    expect(result).toEqual({ status: 204, reason: "recorded" });
    expect(recordSection).toHaveBeenCalledWith(TRIP_ID, "price");
  });

  it("trip-opslaget sker med slug'en fra URL'en, og galleriet slås op på TRIPPENS destination", async () => {
    const { deps, loadTrip, loadGalleryImages } = makeDeps();
    await handleSectionEngagement(makeInput(), deps);
    expect(loadTrip).toHaveBeenCalledWith(SLUG);
    expect(loadGalleryImages).toHaveBeenCalledWith("Bali");
  });

  it("klienten kan ikke override tripId: et ekstra trip_id i body afvises (400) og intet skrives", async () => {
    const { deps, recordSection, loadTrip } = makeDeps();
    const result = await handleSectionEngagement(
      makeInput({ body: { section: "itinerary", trip_id: "99999999-9999-9999-9999-999999999999" } }),
      deps,
    );
    expect(result).toEqual({ status: 400, reason: "bad-body" });
    expect(recordSection).not.toHaveBeenCalled();
    expect(loadTrip).not.toHaveBeenCalled();
  });

  it.each([
    ["ukendt section", { section: "intro" }],
    ["ikke-objekt", "itinerary"],
    ["null (body kunne ikke parses)", null],
    ["tomt objekt", {}],
  ])("ugyldig body (%s) => 400, ingen skrivning", async (_label, body) => {
    const { deps, recordSection } = makeDeps();
    const result = await handleSectionEngagement(makeInput({ body }), deps);
    expect(result).toEqual({ status: 400, reason: "bad-body" });
    expect(recordSection).not.toHaveBeenCalled();
  });

  it("DB-skrivningen fejler => 500 (kun synligt server-side), stadig præcis ét forsøg", async () => {
    const failingWrite = vi.fn<EngagementDeps["recordSection"]>(async () => ({
      kind: "rpc-error",
    }));
    const { deps } = makeDeps({ recordSection: failingWrite });
    const result = await handleSectionEngagement(makeInput(), deps);
    expect(result).toEqual({ status: 500, reason: "write-failed" });
    expect(failingWrite).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Server-eligibility = samme sandhed som kundesiden (computeEligibleSectionsForTrip)
// ============================================================================
describe("computeEligibleSectionsForTrip", () => {
  const base = { itinerary: [], hotels: [], advisorEmail: null } as never;

  it("kun price på en helt tom rejseplan uden galleri", () => {
    expect(computeEligibleSectionsForTrip(base, [])).toEqual(["price"]);
  });

  it("alle fem når alt findes; rækkefølge følger SECTION_IDS", () => {
    const full = {
      itinerary: [{}],
      hotels: [{}],
      advisorEmail: "a@b.dk",
    } as never;
    expect(computeEligibleSectionsForTrip(full, ["https://x/a.jpg"])).toEqual([
      "itinerary",
      "gallery",
      "hotels",
      "price",
      "contact",
    ]);
  });

  it("gallery tæller EFTER filterGalleryImages (tomme strenge tæller ikke)", () => {
    expect(computeEligibleSectionsForTrip(base, ["", ""])).toEqual(["price"]);
    expect(computeEligibleSectionsForTrip(base, ["", "https://x/a.jpg"])).toEqual([
      "gallery",
      "price",
    ]);
  });
});
