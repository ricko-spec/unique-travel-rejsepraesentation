import { describe, it, expect } from "vitest";
import {
  buildSalesOverview,
  latestTimestamp,
  type SalesTripRow,
  type SourceRows,
  type SalesVisitRow,
  type SalesSectionRow,
  type SalesContactRow,
  type SalesProfileRow,
} from "./sales-overview";
import type { DestinationRecord } from "./destination-match";

// Fase 4 (Issue #76): read model for salgsoversigten. Testene kontrollerer SEMANTIK
// og FEJLVEJE — at tilstandene "positiv / ingen registreret / før måling / kunne
// ikke vurderes / kunne ikke hentes" aldrig blandes, og at DTO'et er kompakt.

const NOW = new Date("2026-09-20T12:00:00Z");
const OK = <T,>(rows: T[]): SourceRows<T> => ({ ok: true, rows });
const FAIL = { ok: false } as const;

const VIEWER = "viewer-uuid";
const GALLERY_DEST: DestinationRecord = {
  name: "Bali",
  hero_url: null,
  gallery: ["https://example.test/a.jpg"],
};

// Gyldig rejseplan med alle fem afsnit (galleri kommer fra destinationen) og email.
const FULL_DATA = {
  bookingNo: "1",
  destination: "Bali",
  advisor: "Anna Hansen",
  advisorEmail: "anna@uniquetravel.dk",
  itinerary: [{ type: "activity", typeLabel: "AKTIVITET", title: "Tempeltur" }],
  hotels: [{ name: "Hotel Test" }],
};

function trip(over: Partial<SalesTripRow> & { id: string }): SalesTripRow {
  return {
    booking_no: "35001",
    slug: `slug-${over.id}`,
    destination: "Bali",
    customer_name: "Kunde",
    active: true,
    created_at: "2026-09-19T10:00:00Z", // EFTER målestart (2026-09-18T12:20:18Z)
    created_by: null,
    data: FULL_DATA,
    ...over,
  };
}

type Inputs = Partial<Parameters<typeof buildSalesOverview>[0]>;
function build(trips: SalesTripRow[], over: Inputs = {}) {
  return buildSalesOverview({
    trips,
    visits: OK<SalesVisitRow>([]),
    sections: OK<SalesSectionRow>([]),
    contact: OK<SalesContactRow>([]),
    destinations: OK<DestinationRecord>([GALLERY_DEST]),
    profiles: OK<SalesProfileRow>([]),
    viewerId: VIEWER,
    now: NOW,
    ...over,
  });
}
const rowOf = (trips: SalesTripRow[], over: Inputs = {}) => build(trips, over).trips[0];

// ============================================================================
// A. Åbnet
// ============================================================================
describe("A. Åbnet (trip_visits)", () => {
  it("række findes => opened med besøg og senest åbnet", () => {
    const r = rowOf([trip({ id: "t1" })], {
      visits: OK([
        {
          trip_id: "t1",
          first_opened_at: "2026-09-19T11:00:00Z",
          last_opened_at: "2026-09-20T08:00:00Z",
          visit_count: 3,
          open_count: 5,
        },
      ]),
    });
    expect(r.opened).toEqual({ kind: "opened", lastOpenedAt: "2026-09-20T08:00:00.000Z", visitCount: 3 });
  });

  it("ingen række + oprettet EFTER målestart => not-opened", () => {
    expect(rowOf([trip({ id: "t1" })]).opened).toEqual({ kind: "not-opened" });
  });

  it("ingen række + oprettet FØR målestart => not-measured (aldrig 'ikke åbnet endnu') med målestarten", () => {
    const r = rowOf([trip({ id: "t1", created_at: "2026-05-23T00:00:00Z" })]);
    expect(r.opened).toEqual({ kind: "not-measured", since: "2026-09-18T12:20:18.000Z" });
  });

  it("visits-kilden fejlede => unavailable for ALLE rækker (aldrig not-opened/not-measured)", () => {
    const rows = build(
      [trip({ id: "a" }), trip({ id: "b", created_at: "2026-05-23T00:00:00Z" })],
      { visits: FAIL },
    ).trips;
    expect(rows.map((r) => r.opened.kind)).toEqual(["unavailable", "unavailable"]);
  });

  it("malformed visit-række => unavailable, ikke en påstået tilstand", () => {
    const r = rowOf([trip({ id: "t1" })], {
      visits: OK([{ trip_id: "t1", first_opened_at: "x", last_opened_at: "y", visit_count: 0, open_count: 0 }]),
    });
    expect(r.opened.kind).toBe("unavailable");
  });
});

// ============================================================================
// B. Set (sektioner)
// ============================================================================
describe("B. Set (trip_section_engagement)", () => {
  const sec = (section: string, at = "2026-09-20T09:00:00Z"): SalesSectionRow => ({
    trip_id: "t1",
    section,
    last_seen_at: at,
  });

  it("n af m: kun afsnit rejseplanen HAR tælles (fuld rejseplan m. galleri = 5)", () => {
    const r = rowOf([trip({ id: "t1" })], { sections: OK([sec("itinerary"), sec("price")]) });
    expect(r.sections).toEqual({ kind: "reached", reached: 2, total: 5, price: true });
  });

  it("price markeres separat; uden price => price:false", () => {
    const r = rowOf([trip({ id: "t1" })], { sections: OK([sec("hotels")]) });
    expect(r.sections).toEqual({ kind: "reached", reached: 1, total: 5, price: false });
  });

  it("ingen rækker => none-registered (neutral, ikke 'ikke set')", () => {
    expect(rowOf([trip({ id: "t1" })]).sections).toEqual({ kind: "none-registered" });
  });

  it("afsnit rejseplanen IKKE har (fx galleri uden billeder) tælles ikke, og total krymper", () => {
    const noGallery = trip({ id: "t1", destination: "Ukendt" }); // ingen destination => intet galleri
    const r = rowOf([noGallery], { sections: OK([sec("gallery"), sec("price")]) });
    expect(r.sections).toEqual({ kind: "reached", reached: 1, total: 4, price: true });
  });

  it("ukendt/malformed section-værdi ignoreres", () => {
    const r = rowOf([trip({ id: "t1" })], { sections: OK([sec("intro"), sec("admin"), sec("")]) });
    expect(r.sections).toEqual({ kind: "none-registered" });
  });

  it("dubletter tælles kun én gang", () => {
    const r = rowOf([trip({ id: "t1" })], { sections: OK([sec("price"), sec("price")]) });
    expect(r.sections).toMatchObject({ reached: 1 });
  });

  it("malformed trip-data => unassessable (aldrig 'ingen registreret'), også med rækker", () => {
    const r = rowOf([trip({ id: "t1", data: { itinerary: "ikke et array" } })], {
      sections: OK([sec("price")]),
    });
    expect(r.sections).toEqual({ kind: "unassessable" });
  });

  it("sections-kilden fejlede => unavailable", () => {
    expect(rowOf([trip({ id: "t1" })], { sections: FAIL }).sections).toEqual({ kind: "unavailable" });
  });

  it("destinations-kilden fejlede => unavailable (galleri-eligibility ukendt)", () => {
    expect(rowOf([trip({ id: "t1" })], { destinations: FAIL }).sections).toEqual({ kind: "unavailable" });
  });

  it("fejl har forrang over ukendt eligibility", () => {
    const r = rowOf([trip({ id: "t1", data: null })], { sections: FAIL });
    expect(r.sections.kind).toBe("unavailable");
  });
});

// ============================================================================
// C. Kontakt (kun KLIKKET)
// ============================================================================
describe("C. Kontakt (trip_contact_intent)", () => {
  const click = (channel: string, at = "2026-09-20T09:30:00Z"): SalesContactRow => ({
    trip_id: "t1",
    channel,
    last_clicked_at: at,
  });

  it("telefon klikket / email klikket / begge", () => {
    expect(rowOf([trip({ id: "t1" })], { contact: OK([click("phone")]) }).contact).toEqual({
      kind: "clicked",
      phone: true,
      email: false,
    });
    expect(rowOf([trip({ id: "t1" })], { contact: OK([click("email")]) }).contact).toEqual({
      kind: "clicked",
      phone: false,
      email: true,
    });
    expect(
      rowOf([trip({ id: "t1" })], { contact: OK([click("phone"), click("email")]) }).contact,
    ).toEqual({ kind: "clicked", phone: true, email: true });
  });

  it("ingen rækker => none-registered", () => {
    expect(rowOf([trip({ id: "t1" })]).contact).toEqual({ kind: "none-registered" });
  });

  it("en gammel email-række tælles IKKE når rejseplanen ikke har advisorEmail", () => {
    const noEmail = trip({ id: "t1", data: { ...FULL_DATA, advisorEmail: null } });
    expect(rowOf([noEmail], { contact: OK([click("email")]) }).contact).toEqual({
      kind: "none-registered",
    });
    expect(rowOf([noEmail], { contact: OK([click("phone")]) }).contact).toEqual({
      kind: "clicked",
      phone: true,
      email: false,
    });
  });

  it("ukendt channel (fx intern navigation) ignoreres", () => {
    const r = rowOf([trip({ id: "t1" })], { contact: OK([click("kontakt"), click("sms")]) });
    expect(r.contact).toEqual({ kind: "none-registered" });
  });

  it("malformed trip-data => unassessable; kilde fejlet => unavailable (forrang)", () => {
    const bad = trip({ id: "t1", data: "x" });
    expect(rowOf([bad], { contact: OK([click("phone")]) }).contact).toEqual({ kind: "unassessable" });
    expect(rowOf([bad], { contact: FAIL }).contact).toEqual({ kind: "unavailable" });
  });
});

// ============================================================================
// D. De tre 'ingen'-tilstande blandes aldrig
// ============================================================================
describe("D. positive · ingen registreret · før måling · ukendt · læsefejl forbliver forskellige", () => {
  it("fem forskellige tilstande for Åbnet/Set/Kontakt, aldrig samme værdi for forskellig årsag", () => {
    const none = rowOf([trip({ id: "t1" })]);
    const failed = rowOf([trip({ id: "t1" })], { visits: FAIL, sections: FAIL, contact: FAIL });
    const bad = rowOf([trip({ id: "t1", data: null })]);
    const before = rowOf([trip({ id: "t1", created_at: "2026-05-01T00:00:00Z" })]);

    expect(none.opened.kind).toBe("not-opened");
    expect(before.opened.kind).toBe("not-measured");
    expect(failed.opened.kind).toBe("unavailable");

    expect(none.sections.kind).toBe("none-registered");
    expect(bad.sections.kind).toBe("unassessable");
    expect(failed.sections.kind).toBe("unavailable");

    expect(none.contact.kind).toBe("none-registered");
    expect(bad.contact.kind).toBe("unassessable");
    expect(failed.contact.kind).toBe("unavailable");
  });
});

// ============================================================================
// E. Seneste aktivitet
// ============================================================================
describe("E. lastActivityAt — kun observerede tidsstempler, deterministisk", () => {
  const visit = (last: string): SalesVisitRow => ({
    trip_id: "t1",
    first_opened_at: "2026-09-19T08:00:00Z",
    last_opened_at: last,
    visit_count: 1,
    open_count: 1,
  });

  it("nyeste af åbning, sektion og kontaktklik", () => {
    const r = rowOf([trip({ id: "t1" })], {
      visits: OK([visit("2026-09-19T10:00:00Z")]),
      sections: OK([{ trip_id: "t1", section: "price", last_seen_at: "2026-09-20T09:00:00Z" }]),
      contact: OK([{ trip_id: "t1", channel: "phone", last_clicked_at: "2026-09-19T12:00:00Z" }]),
    });
    expect(r.lastActivityAt).toBe("2026-09-20T09:00:00.000Z");
  });

  it("kontaktklik kan være nyest", () => {
    const r = rowOf([trip({ id: "t1" })], {
      visits: OK([visit("2026-09-19T10:00:00Z")]),
      contact: OK([{ trip_id: "t1", channel: "email", last_clicked_at: "2026-09-20T11:00:00Z" }]),
    });
    expect(r.lastActivityAt).toBe("2026-09-20T11:00:00.000Z");
  });

  it("ingen aktivitet => null (aldrig en opfundet dato)", () => {
    expect(rowOf([trip({ id: "t1" })]).lastActivityAt).toBeNull();
    expect(rowOf([trip({ id: "t1", created_at: "2026-05-01T00:00:00Z" })]).lastActivityAt).toBeNull();
  });

  it("en FEJLET kilde udelades — og udgør aldrig en aktivitet", () => {
    const r = rowOf([trip({ id: "t1" })], {
      visits: FAIL,
      sections: OK([{ trip_id: "t1", section: "price", last_seen_at: "2026-09-19T09:00:00Z" }]),
      contact: FAIL,
    });
    expect(r.lastActivityAt).toBe("2026-09-19T09:00:00.000Z");
    const none = rowOf([trip({ id: "t1" })], { visits: FAIL, sections: FAIL, contact: FAIL });
    expect(none.lastActivityAt).toBeNull();
  });

  it("ugyldige tidsstempler og ukendte enum-rækker ignoreres", () => {
    const r = rowOf([trip({ id: "t1" })], {
      sections: OK([
        { trip_id: "t1", section: "price", last_seen_at: "ikke-en-dato" },
        { trip_id: "t1", section: "intro", last_seen_at: "2030-01-01T00:00:00Z" },
      ]),
      contact: OK([{ trip_id: "t1", channel: "kontakt", last_clicked_at: "2030-01-01T00:00:00Z" }]),
    });
    expect(r.lastActivityAt).toBeNull();
  });

  it("er uafhængig af rækkefølgen af inputrækker", () => {
    const rows: SalesSectionRow[] = [
      { trip_id: "t1", section: "price", last_seen_at: "2026-09-19T09:00:00Z" },
      { trip_id: "t1", section: "hotels", last_seen_at: "2026-09-20T09:00:00Z" },
      { trip_id: "t1", section: "itinerary", last_seen_at: "2026-09-18T09:00:00Z" },
    ];
    const a = rowOf([trip({ id: "t1" })], { sections: OK(rows) }).lastActivityAt;
    const b = rowOf([trip({ id: "t1" })], { sections: OK([...rows].reverse()) }).lastActivityAt;
    expect(a).toBe(b);
    expect(a).toBe("2026-09-20T09:00:00.000Z");
  });

  it("latestTimestamp: tomme/ugyldige => null; ellers nyeste som ISO", () => {
    expect(latestTimestamp([])).toBeNull();
    expect(latestTimestamp([null, undefined, "x"])).toBeNull();
    expect(latestTimestamp(["2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z", null])).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });
});

// ============================================================================
// F. "Mine" og "Oprettet af"
// ============================================================================
describe("F. Mine (bekvemmelighedsfilter) og Oprettet af", () => {
  const profiles = OK<SalesProfileRow>([
    { id: VIEWER, full_name: "Anna Hansen", email: "anna@x.dk", advisor_match_name: "anna hansen " },
    { id: "u2", full_name: "Bo Jensen", email: "bo@x.dk", advisor_match_name: "Bo Jensen" },
  ]);

  it("matcher rådgivernavn case-insensitivt og trimmet mod den indloggedes advisor_match_name", () => {
    const res = build(
      [
        trip({ id: "a", data: { ...FULL_DATA, advisor: "ANNA HANSEN" } }),
        trip({ id: "b", data: { ...FULL_DATA, advisor: "Bo Jensen" } }),
      ],
      { profiles },
    );
    expect(res.viewer.mineAvailable).toBe(true);
    expect(res.trips.map((r) => r.mine)).toEqual([true, false]);
  });

  it("mineAvailable=false uden advisor_match_name, uden profil, eller når profiles-kilden fejlede", () => {
    const noMatch = OK<SalesProfileRow>([{ id: VIEWER, full_name: "A", email: null, advisor_match_name: null }]);
    expect(build([trip({ id: "a" })], { profiles: noMatch }).viewer.mineAvailable).toBe(false);
    expect(build([trip({ id: "a" })], { profiles: OK([]) }).viewer.mineAvailable).toBe(false);
    const failed = build([trip({ id: "a" })], { profiles: FAIL });
    expect(failed.viewer.mineAvailable).toBe(false);
    expect(failed.trips[0].mine).toBe(false);
    expect(failed.degraded).toContain("profiles");
  });

  it("malformed trip-data bruger stadig det rå rådgivernavn til 'Mine' (rækken forsvinder ikke)", () => {
    const res = build([trip({ id: "a", data: { advisor: "Anna Hansen", itinerary: "x" } })], { profiles });
    expect(res.trips[0].mine).toBe(true);
  });

  it("'Oprettet af' afledes af navn (fuldt navn → email → null); uuid'en sendes aldrig", () => {
    const res = build(
      [trip({ id: "a", created_by: "u2" }), trip({ id: "b", created_by: null }), trip({ id: "c", created_by: "ukendt" })],
      { profiles },
    );
    expect(res.trips.map((r) => r.created_by_name)).toEqual(["Bo Jensen", null, null]);
    expect(JSON.stringify(res)).not.toContain('"created_by"');
  });
});

// ============================================================================
// G. DTO er KOMPAKT og udleverer ikke rå/kundefølsomme felter
// ============================================================================
describe("G. DTO: intet rå, kompakt", () => {
  const ALLOWED_KEYS = [
    "id",
    "booking_no",
    "slug",
    "destination",
    "customer_name",
    "active",
    "created_at",
    "created_by_name",
    "mine",
    "opened",
    "sections",
    "contact",
    "lastActivityAt",
  ].sort();

  it("hver række har PRÆCIS de tilladte nøgler — aldrig data, raw_pdf_text eller created_by", () => {
    const res = build([trip({ id: "a", created_by: "u2" })]);
    expect(Object.keys(res.trips[0]).sort()).toEqual(ALLOWED_KEYS);
    for (const banned of ["data", "raw_pdf_text", "created_by", "hero_photo", "updated_at"]) {
      expect(res.trips[0]).not.toHaveProperty(banned);
    }
  });

  it("kundetekst i data/uuid'er lækker ikke ind i det serialiserede svar", () => {
    const MARK = "HEMMELIG-KUNDETEKST-987";
    const res = build(
      [
        trip({
          id: "a",
          created_by: "created-by-uuid-123",
          data: { ...FULL_DATA, intro: MARK, travellers: MARK, notes: MARK },
        }),
      ],
      { profiles: OK([{ id: "created-by-uuid-123", full_name: "Anna", email: "anna@x.dk", advisor_match_name: "X" }]) },
    );
    const json = JSON.stringify(res);
    expect(json).not.toContain(MARK);
    expect(json).not.toContain("created-by-uuid-123");
    expect(json).not.toContain("anna@x.dk"); // profil-email sendes aldrig (kun afledt navn)
    expect(json).not.toContain("anna@uniquetravel.dk"); // advisorEmail fra trip.data
  });

  it("300 realistiske rejseplaner (stor data, varierede tilstande) => svar under 150 KB", () => {
    const big = "x".repeat(6000); // ≈ 6 KB kundetekst pr. rejseplan i data — skal IKKE med
    const trips: SalesTripRow[] = Array.from({ length: 300 }, (_, i) =>
      trip({
        id: `trip-${String(i).padStart(4, "0")}-0000-0000-0000-000000000000`,
        booking_no: String(35000 + i),
        customer_name: `Susanne og Finn Bastegaard ${i}`,
        destination: i % 3 === 0 ? "Sri Lanka & Maldiverne" : "Bali",
        created_at: i % 4 === 0 ? "2026-09-19T10:00:00Z" : "2026-06-01T10:00:00Z",
        created_by: i % 2 ? "u2" : null,
        data: { ...FULL_DATA, intro: big },
      }),
    );
    const visits: SalesVisitRow[] = trips.slice(0, 40).map((t) => ({
      trip_id: t.id,
      first_opened_at: "2026-09-19T08:00:00Z",
      last_opened_at: "2026-09-20T08:00:00Z",
      visit_count: 4,
      open_count: 9,
    }));
    const sections: SalesSectionRow[] = trips
      .slice(0, 40)
      .flatMap((t) => ["itinerary", "hotels", "price"].map((s) => ({ trip_id: t.id, section: s, last_seen_at: "2026-09-20T08:00:00Z" })));
    const contact: SalesContactRow[] = trips
      .slice(0, 10)
      .map((t) => ({ trip_id: t.id, channel: "phone", last_clicked_at: "2026-09-20T09:00:00Z" }));
    const res = build(trips, {
      visits: OK(visits),
      sections: OK(sections),
      contact: OK(contact),
      profiles: OK([{ id: "u2", full_name: "Bo Jensen", email: null, advisor_match_name: null }]),
    });
    const bytes = Buffer.byteLength(JSON.stringify(res), "utf8");
    // Kontrast: det gamle svar sendte data + raw_pdf_text for hver rejseplan.
    const oldStyleBytes = Buffer.byteLength(JSON.stringify(trips), "utf8");
    expect(res.trips).toHaveLength(300);
    expect(bytes).toBeLessThan(150 * 1024);
    expect(bytes).toBeLessThan(oldStyleBytes / 10);
  });
});

// ============================================================================
// H. Fejl pr. kilde er uafhængige
// ============================================================================
describe("H. degraded: fejl pr. kilde", () => {
  it("ingen fejl => degraded er tom", () => {
    expect(build([trip({ id: "a" })]).degraded).toEqual([]);
  });

  it("hver fejlet kilde rapporteres, og rækkerne bevares (listen vises stadig)", () => {
    const res = build([trip({ id: "a" }), trip({ id: "b" })], {
      visits: FAIL,
      contact: FAIL,
      destinations: FAIL,
    });
    expect(res.degraded).toEqual(["visits", "contact", "destinations"]);
    expect(res.trips).toHaveLength(2);
  });

  it("en fejlet kilde påvirker KUN sine egne kolonner", () => {
    const r = rowOf([trip({ id: "t1" })], {
      contact: FAIL,
      sections: OK([{ trip_id: "t1", section: "price", last_seen_at: "2026-09-20T09:00:00Z" }]),
    });
    expect(r.contact.kind).toBe("unavailable");
    expect(r.sections.kind).toBe("reached");
    expect(r.opened.kind).toBe("not-opened");
  });
});

// ============================================================================
// I. Ydeevne (grov vagt: normalisering af hundredvis af rejseplaner er billig)
// ============================================================================
describe("I. ydeevne", () => {
  it("500 rejseplaner med realistisk data bygges på under 2 sekunder", () => {
    const trips = Array.from({ length: 500 }, (_, i) =>
      trip({
        id: `t${i}`,
        data: {
          ...FULL_DATA,
          itinerary: Array.from({ length: 30 }, (_, k) => ({
            type: "activity",
            typeLabel: "AKTIVITET",
            title: `Punkt ${k}`,
            details: "y".repeat(100),
          })),
          hotels: Array.from({ length: 5 }, (_, k) => ({ name: `Hotel ${k}` })),
        },
      }),
    );
    const t0 = performance.now();
    const res = build(trips);
    const ms = performance.now() - t0;
    expect(res.trips).toHaveLength(500);
    expect(ms).toBeLessThan(2000);
  });
});
