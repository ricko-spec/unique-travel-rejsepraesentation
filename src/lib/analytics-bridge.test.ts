import { describe, it, expect } from "vitest";
import {
  ANALYTICS_BRIDGE_SCHEMA_VERSION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  computeBookingMatchKey,
  decodeCursor,
  encodeCursor,
  isAuthorizedRequest,
  normalizeBookingNo,
  parseLimit,
  timingSafeEqualStrings,
  toTravelPlanRecord,
  type TripRowForExport,
} from "./analytics-bridge";

describe("timingSafeEqualStrings", () => {
  it("er true for identiske strenge", () => {
    expect(timingSafeEqualStrings("hemmelig-noegle", "hemmelig-noegle")).toBe(true);
  });

  it("er false for forskellige strenge af samme længde", () => {
    expect(timingSafeEqualStrings("hemmelig-noegleA", "hemmelig-noegleB")).toBe(false);
  });

  it("er false for forskellig længde uden at kaste", () => {
    expect(() => timingSafeEqualStrings("kort", "meget-laengere-streng")).not.toThrow();
    expect(timingSafeEqualStrings("kort", "meget-laengere-streng")).toBe(false);
  });

  it("er false for tomme strenge sammenlignet med noget", () => {
    expect(timingSafeEqualStrings("", "noget")).toBe(false);
  });

  it("er true for to tomme strenge", () => {
    expect(timingSafeEqualStrings("", "")).toBe(true);
  });
});

describe("isAuthorizedRequest — fail closed", () => {
  const KEY = "test-analytics-bridge-key-123";

  it("godkender korrekt Bearer-header mod korrekt nøgle", () => {
    expect(isAuthorizedRequest(`Bearer ${KEY}`, KEY)).toBe(true);
  });

  it("afviser manglende Authorization-header", () => {
    expect(isAuthorizedRequest(null, KEY)).toBe(false);
  });

  it("afviser forkert nøgle", () => {
    expect(isAuthorizedRequest("Bearer forkert-noegle", KEY)).toBe(false);
  });

  it("afviser manglende 'Bearer '-præfiks", () => {
    expect(isAuthorizedRequest(KEY, KEY)).toBe(false);
  });

  it("afviser tomt Bearer-indhold", () => {
    expect(isAuthorizedRequest("Bearer ", KEY)).toBe(false);
  });

  it("fail-closed: afviser ALTID når serverens nøgle ikke er konfigureret — selv med korrekt-udseende header", () => {
    expect(isAuthorizedRequest(`Bearer ${KEY}`, undefined)).toBe(false);
    expect(isAuthorizedRequest(`Bearer ${KEY}`, "")).toBe(false);
  });

  it("er case-sensitiv på selve nøgleværdien (ikke på 'Bearer'-præfikset i denne test — det er strengt per HTTP-spec)", () => {
    expect(isAuthorizedRequest(`Bearer ${KEY.toUpperCase()}`, KEY)).toBe(false);
  });

  it("afviser en lowercase 'bearer '-header (case-sensitivt skema-navn per RFC 6750)", () => {
    expect(isAuthorizedRequest(`bearer ${KEY}`, KEY)).toBe(false);
  });
});

describe("normalizeBookingNo", () => {
  it("trimmer whitespace", () => {
    expect(normalizeBookingNo("  35930  ")).toBe("35930");
  });

  it("laver ingen case-folding (ingen locale-magi)", () => {
    expect(normalizeBookingNo("AbC123")).toBe("AbC123");
  });

  it("er idempotent", () => {
    const once = normalizeBookingNo(" 35930 ");
    expect(normalizeBookingNo(once)).toBe(once);
  });
});

describe("computeBookingMatchKey — HMAC-SHA256", () => {
  const SECRET = "test-booking-match-secret";

  it("er deterministisk for samme input", () => {
    expect(computeBookingMatchKey("35930", SECRET)).toBe(computeBookingMatchKey("35930", SECRET));
  });

  it("er forskellig for forskellige bookingnumre", () => {
    expect(computeBookingMatchKey("35930", SECRET)).not.toBe(computeBookingMatchKey("35931", SECRET));
  });

  it("er forskellig for forskellige secrets — nøglen er ikke gættelig uden BOOKING_MATCH_SECRET", () => {
    expect(computeBookingMatchKey("35930", SECRET)).not.toBe(computeBookingMatchKey("35930", "andet-secret"));
  });

  it("normaliserer FØR HMAC — whitespace omkring bookingnummeret må ikke ændre match-key", () => {
    expect(computeBookingMatchKey("35930", SECRET)).toBe(computeBookingMatchKey("  35930  ", SECRET));
  });

  it("gemmer aldrig bookingnummeret i klartekst i outputtet", () => {
    expect(computeBookingMatchKey("35930", SECRET)).not.toContain("35930");
  });

  it("er en 64-tegns lowercase hex-streng (SHA-256-digest-længde)", () => {
    const key = computeBookingMatchKey("35930", SECRET);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("er IKKE almindelig SHA-256 uden nøgle — samme input med to forskellige secrets skal ikke kunne reproduceres uden secret", () => {
    // Ren sanity: HMAC med tomt secret giver et andet resultat end med et rigtigt secret.
    expect(computeBookingMatchKey("35930", "")).not.toBe(computeBookingMatchKey("35930", SECRET));
  });
});

describe("cursor — encode/decode roundtrip (v1: ren id-keyset, intet since)", () => {
  const VALID_CURSOR = { id: "11111111-1111-1111-1111-111111111111" };

  it("roundtripper korrekt", () => {
    const encoded = encodeCursor(VALID_CURSOR);
    expect(decodeCursor(encoded)).toEqual(VALID_CURSOR);
  });

  it("er opaque — ikke menneskeligt læsbar uden at afkode", () => {
    const encoded = encodeCursor(VALID_CURSOR);
    expect(encoded).not.toContain("11111111");
  });

  it("afviser ugyldig base64/JSON uden at kaste", () => {
    expect(() => decodeCursor("ikke-en-gyldig-cursor")).not.toThrow();
    expect(decodeCursor("ikke-en-gyldig-cursor")).toBeNull();
  });

  it("afviser gyldig JSON med manglende id-felt", () => {
    const malformed = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url");
    expect(decodeCursor(malformed)).toBeNull();
  });

  it("afviser en cursor med et ugyldigt uuid", () => {
    const bad = Buffer.from(JSON.stringify({ id: "ikke-et-uuid" }), "utf8").toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("ignorerer/kasserer et evt. gammelt since-felt i en cursor fra en tidligere API-version i stedet for at fejle", () => {
    // Bagudkompatibel afkodning: en cursor mintet af den forrige (siden
    // fjernede) since-baserede v1-kladde skal stadig kunne læses — id'et er
    // det eneste der tælles med, et evt. medsendt since ignoreres blot.
    const legacyShaped = Buffer.from(
      JSON.stringify({ since: "2026-09-16T10:00:00.000Z", id: VALID_CURSOR.id }),
      "utf8",
    ).toString("base64url");
    expect(decodeCursor(legacyShaped)).toEqual(VALID_CURSOR);
  });

  it("afviser en cursor der ikke er et objekt (fx en ren JSON-liste)", () => {
    const bad = Buffer.from(JSON.stringify([1, 2, 3]), "utf8").toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("afviser null-cursor", () => {
    const bad = Buffer.from("null", "utf8").toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe("parseLimit", () => {
  it("giver default ved manglende værdi", () => {
    expect(parseLimit(null)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("giver default ved ugyldig værdi (ikke et tal)", () => {
    expect(parseLimit("abc")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("giver default ved negativ eller nul", () => {
    expect(parseLimit("-5")).toBe(DEFAULT_PAGE_SIZE);
    expect(parseLimit("0")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("respekterer en gyldig værdi under loftet", () => {
    expect(parseLimit("50")).toBe(50);
  });

  it("klamper til MAX_PAGE_SIZE ved en for stor værdi", () => {
    expect(parseLimit("999999")).toBe(MAX_PAGE_SIZE);
  });
});

describe("toTravelPlanRecord — output-sanitisering", () => {
  const SECRET = "test-booking-match-secret";
  const CLEAN_ROW: TripRowForExport = {
    id: "22222222-2222-2222-2222-222222222222",
    booking_no: "35930",
    destination: "Malaysia",
    active: true,
    created_at: "2026-08-01T12:00:00.000Z",
  };

  it("indeholder præcis de forventede felter — schema_version-kompatibel", () => {
    const record = toTravelPlanRecord(CLEAN_ROW, SECRET);
    expect(Object.keys(record).sort()).toEqual(
      ["active", "booking_match_key", "destination", "online_plan_created_at", "trip_id"].sort(),
    );
    expect(ANALYTICS_BRIDGE_SCHEMA_VERSION).toBe(1);
  });

  it("mapper trip_id fra id og online_plan_created_at fra created_at", () => {
    const record = toTravelPlanRecord(CLEAN_ROW, SECRET);
    expect(record.trip_id).toBe(CLEAN_ROW.id);
    expect(record.online_plan_created_at).toBe(CLEAN_ROW.created_at);
  });

  it("indeholder aldrig bookingnummeret i klartekst, kun dets HMAC", () => {
    const record = toTravelPlanRecord(CLEAN_ROW, SECRET);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(CLEAN_ROW.booking_no);
    expect(record.booking_match_key).toBe(computeBookingMatchKey(CLEAN_ROW.booking_no, SECRET));
  });

  it("udelader online_plan_updated_at — ikke semantisk pålideligt som forretningssignal, og trips.updated_at hentes slet ikke i v1", () => {
    const record = toTravelPlanRecord(CLEAN_ROW, SECRET);
    expect(record).not.toHaveProperty("online_plan_updated_at");
  });

  it("lækker IKKE ekstra/følsomme felter selvom input-objektet (fejlagtigt) har dem", () => {
    // Simulerer at route-handleren en dag ved en fejl SELECT'er for meget —
    // inkl. updated_at, som v1 bevidst ikke henter (se testen ovenfor).
    const dirtyRow = {
      ...CLEAN_ROW,
      updated_at: "2026-09-01T09:30:00.000Z",
      slug: "a1b2c3d4e5f6",
      customer_name: "Anne Berg",
      hero_photo: "https://example.com/hero.jpg",
      raw_pdf_text: "Kære Anne Berg, her er jeres rejseplan...",
      data: { advisorEmail: "raadgiver@uniquetravel.dk", intro: "Velkommen..." },
      created_by: "33333333-3333-3333-3333-333333333333",
    };
    const record = toTravelPlanRecord(dirtyRow as unknown as TripRowForExport, SECRET);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("2026-09-01T09:30:00.000Z");
    expect(serialized).not.toContain("a1b2c3d4e5f6");
    expect(serialized).not.toContain("Anne Berg");
    expect(serialized).not.toContain("hero.jpg");
    expect(serialized).not.toContain("Kære Anne Berg");
    expect(serialized).not.toContain("raadgiver@uniquetravel.dk");
    expect(serialized).not.toContain("Velkommen");
    expect(serialized).not.toContain("33333333-3333-3333-3333-333333333333");
    expect(Object.keys(record).sort()).toEqual(
      ["active", "booking_match_key", "destination", "online_plan_created_at", "trip_id"].sort(),
    );
  });
});
