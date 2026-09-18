import { describe, it, expect } from "vitest";
import {
  uniqueCreatorIds,
  resolveCreatedByName,
  withCreatedByName,
  type CreatorProfile,
} from "./trip-creator";

const GUSTAV: CreatorProfile = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Gustav Gotfredsen",
  email: "gustav@uniquetravel.dk",
};

const EMAIL_ONLY: CreatorProfile = {
  id: "22222222-2222-2222-2222-222222222222",
  full_name: null,
  email: "ingen-navn@uniquetravel.dk",
};

describe("uniqueCreatorIds", () => {
  it("dedupliker flere trips fra samme creator til ét id", () => {
    expect(uniqueCreatorIds([GUSTAV.id, GUSTAV.id, GUSTAV.id])).toEqual([GUSTAV.id]);
  });

  it("filtrerer null/undefined fra (ældre trips uden created_by)", () => {
    expect(uniqueCreatorIds([GUSTAV.id, null, undefined, EMAIL_ONLY.id])).toEqual([
      GUSTAV.id,
      EMAIL_ONLY.id,
    ]);
  });

  it("tom liste giver tom liste", () => {
    expect(uniqueCreatorIds([])).toEqual([]);
    expect(uniqueCreatorIds([null, null, undefined])).toEqual([]);
  });
});

describe("resolveCreatedByName", () => {
  it("kendt creator med full_name", () => {
    expect(resolveCreatedByName(GUSTAV.id, [GUSTAV])).toBe("Gustav Gotfredsen");
  });

  it("fallback til email når full_name mangler", () => {
    expect(resolveCreatedByName(EMAIL_ONLY.id, [EMAIL_ONLY])).toBe("ingen-navn@uniquetravel.dk");
  });

  it("fallback til email når full_name er en tom/whitespace-streng", () => {
    const blank: CreatorProfile = { id: "id-3", full_name: "   ", email: "blank@uniquetravel.dk" };
    expect(resolveCreatedByName(blank.id, [blank])).toBe("blank@uniquetravel.dk");
  });

  it("null created_by (ældre trips) giver null", () => {
    expect(resolveCreatedByName(null, [GUSTAV])).toBeNull();
    expect(resolveCreatedByName(undefined, [GUSTAV])).toBeNull();
  });

  it("creator-id uden matchende profil giver null", () => {
    expect(resolveCreatedByName("ukendt-id", [GUSTAV, EMAIL_ONLY])).toBeNull();
  });

  it("profil uden hverken full_name eller email giver null", () => {
    const tom: CreatorProfile = { id: "id-4", full_name: null, email: null };
    expect(resolveCreatedByName(tom.id, [tom])).toBeNull();
  });
});

describe("withCreatedByName", () => {
  it("flere trips med samme creator får samme navn, uden ekstra opslag pr. trip", () => {
    const rows = [
      { id: "t1", created_by: GUSTAV.id },
      { id: "t2", created_by: GUSTAV.id },
      { id: "t3", created_by: GUSTAV.id },
    ];
    const result = withCreatedByName(rows, [GUSTAV]);
    expect(result.map((r) => r.created_by_name)).toEqual([
      "Gustav Gotfredsen",
      "Gustav Gotfredsen",
      "Gustav Gotfredsen",
    ]);
  });

  it("blandet: kendt creator, ukendt creator, og null created_by i samme liste", () => {
    const rows = [
      { id: "t1", created_by: GUSTAV.id },
      { id: "t2", created_by: "ukendt-id" },
      { id: "t3", created_by: null },
    ];
    const result = withCreatedByName(rows, [GUSTAV]);
    expect(result.map((r) => r.created_by_name)).toEqual(["Gustav Gotfredsen", null, null]);
  });

  it("fjerner created_by fra det returnerede objekt — kun created_by_name sendes videre", () => {
    const rows = [{ id: "t1", booking_no: "35928", created_by: GUSTAV.id }];
    const result = withCreatedByName(rows, [GUSTAV]);
    expect(result[0]).toEqual({ id: "t1", booking_no: "35928", created_by_name: "Gustav Gotfredsen" });
    expect(result[0]).not.toHaveProperty("created_by");
  });

  it("tom profiles-liste giver null for alle rækker uden at kaste", () => {
    const rows = [{ id: "t1", created_by: GUSTAV.id }];
    expect(withCreatedByName(rows, [])[0].created_by_name).toBeNull();
  });
});
