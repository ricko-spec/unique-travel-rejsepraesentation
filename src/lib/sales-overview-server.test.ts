import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadSalesOverview,
  supabaseSalesSources,
  SalesOverviewError,
  SALES_COLUMNS,
} from "./sales-overview-server";

// Fase 4 (Issue #76): server-læsningen. Testene kører den FAKTISKE loader og den
// FAKTISKE Supabase-adapter mod en falsk klient, der (a) tæller hvert kald, (b) har
// et stille række-loft som PostgREST, (c) registrerer kolonner/sortering/count og
// (d) IKKE har en .in()-metode — et kald ville kaste. Det beviser: fast antal
// logiske læsninger, ingen N+1, ingen tavs afkortning.

type Tables = Record<string, unknown[]>;
type Call = { table: string; columns: string; count: boolean; order: string[]; from: number; to: number };

function fakeSupabase(
  tables: Tables,
  opts: { cap?: number; failTables?: string[]; failOnPage?: Record<string, number> } = {},
) {
  const calls: Call[] = [];
  const pageCount: Record<string, number> = {};
  const client = {
    from(table: string) {
      const call: Call = { table, columns: "", count: false, order: [], from: 0, to: 0 };
      const builder = {
        select(columns: string, options?: { count?: string }) {
          call.columns = columns;
          call.count = options?.count === "exact";
          return builder;
        },
        order(col: string) {
          call.order.push(col);
          return builder;
        },
        range(from: number, to: number) {
          call.from = from;
          call.to = to;
          calls.push({ ...call });
          pageCount[table] = (pageCount[table] ?? 0) + 1;
          if (opts.failTables?.includes(table) || opts.failOnPage?.[table] === pageCount[table]) {
            return Promise.resolve({ data: null, error: { message: `fejl i ${table}` }, count: null });
          }
          const all = tables[table] ?? [];
          const want = to - from + 1;
          const slice = all.slice(from, from + Math.min(want, opts.cap ?? 1000));
          return Promise.resolve({ data: slice, error: null, count: call.count ? all.length : null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const uuid = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const FULL_DATA = {
  bookingNo: "1",
  destination: "Bali",
  advisor: "Anna Hansen",
  advisorEmail: "anna@uniquetravel.dk",
  itinerary: [{ type: "activity", typeLabel: "AKTIVITET", title: "Tempeltur" }],
  hotels: [{ name: "Hotel Test" }],
};

function makeTables(nTrips: number, extra: Partial<Tables> = {}): Tables {
  return {
    trips: Array.from({ length: nTrips }, (_, i) => ({
      id: uuid(i),
      booking_no: String(35000 + i),
      slug: `slug-${i}`,
      destination: "Bali",
      customer_name: "Kunde",
      active: true,
      created_at: "2026-09-19T10:00:00Z",
      created_by: null,
      data: FULL_DATA,
    })),
    profiles: [{ id: "viewer", full_name: "Anna Hansen", email: "a@x.dk", advisor_match_name: "Anna Hansen" }],
    trip_visits: [],
    trip_section_engagement: [],
    trip_contact_intent: [],
    destinations: [{ name: "Bali", hero_url: null, gallery: ["https://example.test/a.jpg"] }],
    ...extra,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("A. fast antal læsninger — ingen N+1, ingen .in()", () => {
  it.each([10, 500])("%s rejseplaner => PRÆCIS seks forespørgsler (én pr. kilde)", async (n) => {
    const { client, calls } = fakeSupabase(makeTables(n));
    await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => c.table).sort()).toEqual(
      ["destinations", "profiles", "trip_contact_intent", "trip_section_engagement", "trip_visits", "trips"].sort(),
    );
  });

  it("antallet er ens for 10 og 500 rejseplaner (uafhængigt af antal rækker under sideloftet)", async () => {
    const small = fakeSupabase(makeTables(10));
    const big = fakeSupabase(makeTables(500));
    await loadSalesOverview(supabaseSalesSources(small.client), "viewer");
    await loadSalesOverview(supabaseSalesSources(big.client), "viewer");
    expect(big.calls.length).toBe(small.calls.length);
  });

  it("aldrig ét kald pr. række: 500 rejseplaner med data i alle kilder giver stadig kun ét kald pr. kilde", async () => {
    const trips = 500;
    const { client, calls } = fakeSupabase(
      makeTables(trips, {
        trip_visits: Array.from({ length: trips }, (_, i) => ({
          trip_id: uuid(i), first_opened_at: "2026-09-19T08:00:00Z", last_opened_at: "2026-09-20T08:00:00Z", visit_count: 1, open_count: 1,
        })),
        trip_section_engagement: Array.from({ length: trips }, (_, i) => ({ trip_id: uuid(i), section: "price", last_seen_at: "2026-09-20T08:00:00Z" })),
        trip_contact_intent: Array.from({ length: trips }, (_, i) => ({ trip_id: uuid(i), channel: "phone", last_clicked_at: "2026-09-20T09:00:00Z" })),
      }),
    );
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(calls).toHaveLength(6);
    expect(res.trips.every((t) => t.opened.kind === "opened" && t.contact.kind === "clicked")).toBe(true);
  });

  it("kun første side beder om eksakt count; alle sider bruger stabil sortering", async () => {
    const { client, calls } = fakeSupabase(
      makeTables(10, {
        trip_section_engagement: Array.from({ length: 2500 }, (_, i) => ({
          trip_id: uuid(i % 10), section: ["itinerary", "gallery", "hotels", "price", "contact"][i % 5], last_seen_at: "2026-09-20T08:00:00Z",
        })),
      }),
    );
    await loadSalesOverview(supabaseSalesSources(client), "viewer");
    const sectionCalls = calls.filter((c) => c.table === "trip_section_engagement");
    expect(sectionCalls.map((c) => c.count)).toEqual([true, false, false]);
    expect(sectionCalls.map((c) => c.from)).toEqual([0, 1000, 2000]);
    expect(sectionCalls.every((c) => c.order.join() === "trip_id,section")).toBe(true);
    expect(calls.find((c) => c.table === "trips")?.order).toEqual(["id"]);
  });
});

describe("B. kolonner: ingen rå felter hentes unødigt", () => {
  it("trips-læsningen henter IKKE raw_pdf_text, hero_photo eller updated_at (data kun til server-side eligibility)", async () => {
    const { client, calls } = fakeSupabase(makeTables(3));
    await loadSalesOverview(supabaseSalesSources(client), "viewer");
    const cols = calls.find((c) => c.table === "trips")!.columns;
    expect(cols).toBe(SALES_COLUMNS.trips);
    expect(cols).not.toMatch(/raw_pdf_text|hero_photo|updated_at/);
    expect(cols).toMatch(/\bdata\b/); // server-side only
    expect(cols).toMatch(/\bcreated_by\b/); // afledes til navn server-side
  });

  it("profiles læses ÉN gang og dækker både 'Oprettet af' og 'Mine'", async () => {
    const { client, calls } = fakeSupabase(makeTables(3));
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(calls.filter((c) => c.table === "profiles")).toHaveLength(1);
    expect(res.viewer.mineAvailable).toBe(true);
  });
});

describe("C. >1000 rækker og server-loft afkorter ALDRIG tavst (AK-3)", () => {
  it("1 500 rejseplaner + 2 500 sektionsrækker => alle medtaget og talt korrekt", async () => {
    const trips = 1500;
    const sections = Array.from({ length: 2500 }, (_, i) => ({
      trip_id: uuid(Math.floor(i / 5)), // 5 afsnit pr. trip for de første 500 trips
      section: ["itinerary", "gallery", "hotels", "price", "contact"][i % 5],
      last_seen_at: "2026-09-20T08:00:00Z",
    }));
    const { client, calls } = fakeSupabase(makeTables(trips, { trip_section_engagement: sections }));
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(res.trips).toHaveLength(1500);
    expect(res.degraded).toEqual([]);
    // De første 500 rejseplaner har alle fem afsnit nået; resten ingen.
    expect(res.trips.slice(0, 500).every((t) => t.sections.kind === "reached" && t.sections.reached === 5)).toBe(true);
    expect(res.trips.slice(500).every((t) => t.sections.kind === "none-registered")).toBe(true);
    expect(calls.filter((c) => c.table === "trips")).toHaveLength(2); // 1500 rækker = 2 sider
    expect(calls.filter((c) => c.table === "trip_section_engagement")).toHaveLength(3);
  });

  it("server-loft lavere end sidestørrelsen (500) giver stadig hele sættet", async () => {
    const { client } = fakeSupabase(makeTables(1300), { cap: 500 });
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(res.trips).toHaveLength(1300);
  });
});

describe("D. fejl: kilde-fejl bliver 'kunne ikke hentes' — aldrig 'ingen aktivitet' (AK-3/AK-4)", () => {
  it.each([
    ["trip_visits", "visits"],
    ["trip_section_engagement", "sections"],
    ["trip_contact_intent", "contact"],
    ["destinations", "destinations"],
    ["profiles", "profiles"],
  ] as const)("%s fejler => degraded indeholder %s, rækkerne bevares", async (table, source) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase(makeTables(20), { failTables: [table] });
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(res.degraded).toEqual([source]);
    expect(res.trips).toHaveLength(20);
  });

  it("fejlet trip_visits => Åbnet unavailable for ALLE (aldrig not-opened/not-measured)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase(makeTables(5), { failTables: ["trip_visits"] });
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(res.trips.every((t) => t.opened.kind === "unavailable")).toBe(true);
  });

  it("fejlet contact => Kontakt unavailable, ikke none-registered; øvrige kolonner uberørt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase(makeTables(5), { failTables: ["trip_contact_intent"] });
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(res.trips.every((t) => t.contact.kind === "unavailable")).toBe(true);
    expect(res.trips.every((t) => t.sections.kind === "none-registered")).toBe(true);
  });

  it("en fejl på en SENERE side (afkortning) kasserer hele kilden — ikke en delvis liste", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sections = Array.from({ length: 2500 }, (_, i) => ({ trip_id: uuid(i % 10), section: "price", last_seen_at: "2026-09-20T08:00:00Z" }));
    const { client } = fakeSupabase(makeTables(10, { trip_section_engagement: sections }), {
      failOnPage: { trip_section_engagement: 2 },
    });
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    expect(res.degraded).toEqual(["sections"]);
    expect(res.trips.every((t) => t.sections.kind === "unavailable")).toBe(true);
  });

  it("fejlet trips-læsning kaster SalesOverviewError (route svarer 500 som før)", async () => {
    const { client } = fakeSupabase(makeTables(5), { failTables: ["trips"] });
    await expect(loadSalesOverview(supabaseSalesSources(client), "viewer")).rejects.toBeInstanceOf(SalesOverviewError);
  });

  it("fejl-logning er sanitiseret: kun kildenavn, fejlklasse og DB-fejltekst — aldrig rækkedata", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase(
      makeTables(3, { trip_contact_intent: [{ trip_id: uuid(0), channel: "phone", last_clicked_at: "2026-09-20T09:00:00Z" }] }),
      { failTables: ["trip_visits"] },
    );
    await loadSalesOverview(supabaseSalesSources(client), "viewer");
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("visits");
    expect(logged).not.toContain("35000"); // bookingnummer
    expect(logged).not.toContain("slug-");
    expect(logged).not.toContain("anna@uniquetravel.dk");
    expect(logged).not.toContain(uuid(0));
  });
});

describe("E. DTO'et (AK-1) — hele kæden fra database-rækker til serialiseret svar", () => {
  it("indeholder hverken data, raw_pdf_text eller created_by — også når databasen har dem", async () => {
    const MARK = "KUNDETEKST-XYZ-123";
    const tables = makeTables(5);
    (tables.trips as Record<string, unknown>[]).forEach((t) => {
      t.raw_pdf_text = MARK;
      t.data = { ...FULL_DATA, intro: MARK };
      t.created_by = "viewer";
    });
    const { client } = fakeSupabase(tables);
    const res = await loadSalesOverview(supabaseSalesSources(client), "viewer");
    const json = JSON.stringify(res);
    expect(json).not.toContain(MARK);
    expect(json).not.toContain('"created_by"');
    expect(json).not.toContain('"data"');
    expect(json).not.toContain("raw_pdf_text");
    expect(res.trips[0].created_by_name).toBe("Anna Hansen"); // afledt, ikke uuid
  });
});

describe("F. auth: uautentificeret listekald giver 401 (AK-8) — statisk kontrakt for ruten", () => {
  const src = readFileSync(join(process.cwd(), "src/app/admin/api/trips/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const getFn = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));

  it("GET kalder getSessionUser() FØR enhver datalæsning og svarer 401 uden session", () => {
    expect(getFn.indexOf("getSessionUser()")).toBeGreaterThan(-1);
    expect(getFn.indexOf("getSessionUser()")).toBeLessThan(getFn.indexOf("loadSalesOverview"));
    expect(getFn).toMatch(/if \(!user\)[\s\S]{0,120}status: 401/);
  });

  it("GET bruger det kompakte DTO og selecter ikke selv rå kolonner", () => {
    expect(getFn).toMatch(/loadSalesOverview\(supabaseSalesSources\(getSupabaseService\(\)\), user\.id\)/);
    expect(getFn).not.toMatch(/raw_pdf_text|\.select\(|\.in\(/);
  });

  it("service-role-klienten bruges kun server-side (route.ts er en server-route, ingen 'use client')", () => {
    expect(src).not.toMatch(/use client/);
  });
});
