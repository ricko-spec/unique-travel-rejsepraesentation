import { describe, it, expect, vi } from "vitest";
import {
  handleContactIntent,
  type ContactIntentDeps,
  type ContactIntentInput,
  type ContactIntentTripRow,
} from "./contact-intent-endpoint";

// Security-orchestration-tests for POST /[bookingId]/intent.
//
// route.ts er en tynd adapter over handleContactIntent() (samme funktion, ingen
// parallel kopi af rækkefølgen) — så disse tests kører den FAKTISKE
// beslutningskæde route.ts bruger: strict body → trip + adgang →
// production/host/bot/admin-gate → server-side eligibility → skrivning.
// Skrivningen (recordIntent) er en spion: hver test asserter præcist hvornår
// den kaldes, og med hvad.

const SLUG = "abc123";
const BOOKING_NO = "1234567";
const TRIP_ID = "11111111-2222-3333-4444-555555555555"; // SERVER-afledt id

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";

// Rejseplan i tripSchema-formatet (som ligger i trips.data). Med advisorEmail
// → både email og phone er eligible.
const TRIP_WITH_EMAIL = {
  bookingNo: BOOKING_NO,
  destination: "Bali",
  advisorEmail: "raadgiver@uniquetravel.dk",
};

function tripRow(data: unknown = TRIP_WITH_EMAIL): ContactIntentTripRow {
  return { id: TRIP_ID, booking_no: BOOKING_NO, data };
}

function makeInput(overrides: Partial<ContactIntentInput> = {}): ContactIntentInput {
  return {
    slug: SLUG,
    body: { channel: "phone" },
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

function makeDeps(overrides: Partial<ContactIntentDeps> = {}) {
  const recordIntent = vi.fn<ContactIntentDeps["recordIntent"]>(async () => ({ kind: "ok" }));
  const loadTrip = vi.fn<ContactIntentDeps["loadTrip"]>(async () => tripRow());
  const deps: ContactIntentDeps = { loadTrip, recordIntent, ...overrides };
  return { deps, recordIntent, loadTrip };
}

// ============================================================================
// A–E. Ingen skrivning: manglende trip, adgang, preview, admin, bot
// ============================================================================
describe("A. manglende/inaktiv trip => ingen skrivning", () => {
  it("404 og recordIntent kaldes ikke", async () => {
    const { deps, recordIntent } = makeDeps({ loadTrip: async () => null });
    const result = await handleContactIntent(makeInput(), deps);
    expect(result).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordIntent).not.toHaveBeenCalled();
  });
});

describe("B. ugyldig/manglende kundeadgang => ingen skrivning", () => {
  it("manglende access-cookie => 404, ingen skrivning", async () => {
    const { deps, recordIntent } = makeDeps();
    const result = await handleContactIntent(makeInput({ accessCookieValue: undefined }), deps);
    expect(result).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it("forkert access-cookie => 404, ingen skrivning", async () => {
    const { deps, recordIntent } = makeDeps();
    const result = await handleContactIntent(makeInput({ accessCookieValue: "9999999" }), deps);
    expect(result).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it("missing trip og forkert adgang giver IDENTISK svar (ingen slug-/adgangs-oracle)", async () => {
    const missing = await handleContactIntent(
      makeInput(),
      makeDeps({ loadTrip: async () => null }).deps,
    );
    const wrongCookie = await handleContactIntent(
      makeInput({ accessCookieValue: "nope" }),
      makeDeps().deps,
    );
    expect(missing).toEqual(wrongCookie);
  });

  it("en gyldig cookie til slug A kan ikke skrive for slug B (trip slås op på URL-slug'en)", async () => {
    // Slug A og B har hver deres trip og booking_no; A's cookie-værdi = A's booking_no.
    const trips: Record<string, ContactIntentTripRow> = {
      "slug-a": { id: "aaaaaaaa-0000-0000-0000-000000000000", booking_no: "1111111", data: TRIP_WITH_EMAIL },
      "slug-b": { id: "bbbbbbbb-0000-0000-0000-000000000000", booking_no: "2222222", data: TRIP_WITH_EMAIL },
    };
    const { deps, recordIntent } = makeDeps({ loadTrip: async (slug) => trips[slug] ?? null });

    // Cookie hører til slug A, men requesten rammer slug B's endpoint.
    const crossSlug = await handleContactIntent(
      makeInput({ slug: "slug-b", accessCookieValue: "1111111" }),
      deps,
    );
    expect(crossSlug).toEqual({ status: 404, reason: "no-trip-or-access" });
    expect(recordIntent).not.toHaveBeenCalled();

    // Sanity: samme cookie mod slug A skriver — for A's egen trip.id.
    const own = await handleContactIntent(
      makeInput({ slug: "slug-a", accessCookieValue: "1111111" }),
      deps,
    );
    expect(own.status).toBe(204);
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(recordIntent).toHaveBeenCalledWith("aaaaaaaa-0000-0000-0000-000000000000", "phone");
  });
});

describe("C. preview => ingen skrivning", () => {
  it.each(["preview", "development", undefined])("VERCEL_ENV=%s => 204 no-op", async (env) => {
    const { deps, recordIntent } = makeDeps();
    const input = makeInput();
    const result = await handleContactIntent(
      { ...input, gate: { ...input.gate, vercelEnv: env } },
      deps,
    );
    expect(result).toEqual({ status: 204, reason: "gated" });
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it("production-env men ikke-kanonisk host (Vercel branch-alias) => ingen skrivning", async () => {
    const { deps, recordIntent } = makeDeps();
    const input = makeInput();
    const result = await handleContactIntent(
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
    expect(recordIntent).not.toHaveBeenCalled();
  });
});

describe("D. admin auth-cookie => ingen skrivning", () => {
  it("gyldig kundeadgang + Supabase-auth-cookie => 204 no-op", async () => {
    const { deps, recordIntent } = makeDeps();
    const input = makeInput();
    const result = await handleContactIntent(
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
    expect(recordIntent).not.toHaveBeenCalled();
  });
});

describe("E. bot => ingen skrivning", () => {
  it.each(["Googlebot/2.1", "curl/8.4.0", "", null])("UA=%j => 204 no-op", async (ua) => {
    const { deps, recordIntent } = makeDeps();
    const input = makeInput();
    const result = await handleContactIntent(
      { ...input, gate: { ...input.gate, userAgent: ua } },
      deps,
    );
    expect(result).toEqual({ status: 204, reason: "gated" });
    expect(recordIntent).not.toHaveBeenCalled();
  });
});

// ============================================================================
// F. Email uden advisorEmail => 204, ingen skrivning
// ============================================================================
describe("F. server-side eligibility: email uden advisorEmail => 204 no-op, ingen skrivning", () => {
  it.each([
    ["advisorEmail = null", { ...TRIP_WITH_EMAIL, advisorEmail: null }],
    ["advisorEmail = tom streng", { ...TRIP_WITH_EMAIL, advisorEmail: "" }],
    ["advisorEmail mangler helt", { bookingNo: BOOKING_NO, destination: "Bali" }],
  ])("%s", async (_label, data) => {
    const { deps, recordIntent } = makeDeps({ loadTrip: async () => tripRow(data) });
    const result = await handleContactIntent(makeInput({ body: { channel: "email" } }), deps);
    expect(result).toEqual({ status: 204, reason: "ineligible" });
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it("trip-data der ikke kan parses (kundesiden viser fejlside) => ineligible for ALLE kanaler", async () => {
    for (const channel of ["email", "phone"] as const) {
      const { deps, recordIntent } = makeDeps({
        loadTrip: async () => tripRow({ itinerary: "ikke et array" }),
      });
      const result = await handleContactIntent(makeInput({ body: { channel } }), deps);
      expect(result).toEqual({ status: 204, reason: "ineligible" });
      expect(recordIntent).not.toHaveBeenCalled();
    }
  });

  it("ineligible giver SAMME svar (204) som et vellykket write og en gate-afvisning", async () => {
    const written = await handleContactIntent(makeInput(), makeDeps().deps);
    const ineligible = await handleContactIntent(
      makeInput({ body: { channel: "email" } }),
      makeDeps({ loadTrip: async () => tripRow({ ...TRIP_WITH_EMAIL, advisorEmail: null }) }).deps,
    );
    expect(ineligible.status).toBe(written.status);
  });
});

// ============================================================================
// G–H. Gyldigt kald => præcis ét write med server-afledt trip.id
// ============================================================================
describe("G. phone på valid, oplåst trip => præcis ét write", () => {
  it("server-derived trip.id + channel=phone", async () => {
    const { deps, recordIntent } = makeDeps();
    const result = await handleContactIntent(makeInput({ body: { channel: "phone" } }), deps);
    expect(result).toEqual({ status: 204, reason: "recorded" });
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(recordIntent).toHaveBeenCalledWith(TRIP_ID, "phone");
  });

  it("phone er eligible selv uden advisorEmail (ActionBar 'Ring' findes altid)", async () => {
    const { deps, recordIntent } = makeDeps({
      loadTrip: async () => tripRow({ bookingNo: BOOKING_NO, destination: "Bali" }),
    });
    const result = await handleContactIntent(makeInput({ body: { channel: "phone" } }), deps);
    expect(result).toEqual({ status: 204, reason: "recorded" });
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(recordIntent).toHaveBeenCalledWith(TRIP_ID, "phone");
  });
});

describe("H. email på eligible trip => præcis ét write", () => {
  it("server-derived trip.id + channel=email", async () => {
    const { deps, recordIntent } = makeDeps();
    const result = await handleContactIntent(makeInput({ body: { channel: "email" } }), deps);
    expect(result).toEqual({ status: 204, reason: "recorded" });
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(recordIntent).toHaveBeenCalledWith(TRIP_ID, "email");
  });

  it("trip-opslaget sker med slug'en fra URL'en", async () => {
    const { deps, loadTrip } = makeDeps();
    await handleContactIntent(makeInput({ body: { channel: "email" } }), deps);
    expect(loadTrip).toHaveBeenCalledWith(SLUG);
  });
});

// ============================================================================
// I. Klienten kan ikke vælge trip_id / ugyldig body
// ============================================================================
describe("I. client-supplied trip_id / ugyldig body => 400, intet trip-opslag, ingen skrivning", () => {
  it("ekstra trip_id i body => 400", async () => {
    const { deps, recordIntent, loadTrip } = makeDeps();
    const result = await handleContactIntent(
      makeInput({
        body: { channel: "phone", trip_id: "99999999-9999-9999-9999-999999999999" },
      }),
      deps,
    );
    expect(result).toEqual({ status: 400, reason: "bad-body" });
    expect(loadTrip).not.toHaveBeenCalled();
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it.each([
    ["ukendt channel (#kontakt-navigation er ikke intent)", { channel: "kontakt" }],
    ["sms", { channel: "sms" }],
    ["ikke-objekt", "phone"],
    ["null (body kunne ikke parses)", null],
    ["tomt objekt", {}],
  ])("ugyldig body (%s) => 400", async (_label, body) => {
    const { deps, recordIntent, loadTrip } = makeDeps();
    const result = await handleContactIntent(makeInput({ body }), deps);
    expect(result).toEqual({ status: 400, reason: "bad-body" });
    expect(loadTrip).not.toHaveBeenCalled();
    expect(recordIntent).not.toHaveBeenCalled();
  });
});

// ============================================================================
// J. Write failure => 500, ét forsøg
// ============================================================================
describe("J. DB-/RPC-skrivningen fejler => 500, præcis ét forsøg", () => {
  it.each(["rpc-error", "timeout"])("outcome=%s", async (kind) => {
    const failingWrite = vi.fn<ContactIntentDeps["recordIntent"]>(async () => ({ kind }));
    const { deps } = makeDeps({ recordIntent: failingWrite });
    const result = await handleContactIntent(makeInput(), deps);
    expect(result).toEqual({ status: 500, reason: "write-failed" });
    expect(failingWrite).toHaveBeenCalledTimes(1); // ingen retry
  });
});
