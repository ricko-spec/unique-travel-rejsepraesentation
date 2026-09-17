import { describe, it, expect } from "vitest";
import {
  canonicalizeBucket,
  diffBucket,
  diffAllBuckets,
  selectBucketsForBaseline,
} from "./storage-drift.mjs";

const EXPECTED = {
  name: "destinations",
  public: true,
  file_size_limit: 52428800,
  allowed_mime_types: ["image/avif", "image/jpeg", "image/png", "image/webp"],
};

describe("canonicalizeBucket", () => {
  it("beholder kun de produktkritiske felter", () => {
    const raw = {
      id: "abc-123",
      name: "destinations",
      owner: "",
      public: true,
      file_size_limit: 52428800,
      allowed_mime_types: ["image/jpeg", "image/png"],
      created_at: "2026-07-20T10:00:00.000Z",
      updated_at: "2026-07-20T10:00:00.000Z",
      type: "STANDARD",
    };
    expect(canonicalizeBucket(raw)).toEqual({
      name: "destinations",
      public: true,
      file_size_limit: 52428800,
      allowed_mime_types: ["image/jpeg", "image/png"],
    });
  });

  it("sorterer allowed_mime_types deterministisk", () => {
    const raw = { name: "x", public: true, allowed_mime_types: ["image/webp", "image/avif"] };
    expect(canonicalizeBucket(raw).allowed_mime_types).toEqual(["image/avif", "image/webp"]);
  });

  it("håndterer manglende file_size_limit/allowed_mime_types uden at kaste", () => {
    expect(canonicalizeBucket({ name: "x", public: false })).toEqual({
      name: "x",
      public: false,
      file_size_limit: null,
      allowed_mime_types: [],
    });
  });
});

describe("diffBucket", () => {
  it("giver ingen mismatches ved præcist match", () => {
    expect(diffBucket(EXPECTED, canonicalizeBucket({ ...EXPECTED }))).toEqual([]);
  });

  it("ignorerer støjende metadata der ikke er del af kontrakten (ingen false positive)", () => {
    const live = canonicalizeBucket({
      ...EXPECTED,
      id: "helt-andet-id",
      owner: "en-anden-ejer",
      created_at: "2099-01-01T00:00:00.000Z",
      updated_at: "2099-01-01T00:00:00.000Z",
    });
    expect(diffBucket(EXPECTED, live)).toEqual([]);
  });

  it("rapporterer en manglende bucket", () => {
    expect(diffBucket(EXPECTED, undefined)).toEqual([`bucket "destinations" findes ikke live`]);
    expect(diffBucket(EXPECTED, null)).toEqual([`bucket "destinations" findes ikke live`]);
  });

  it("rapporterer forkert public-status", () => {
    const live = canonicalizeBucket({ ...EXPECTED, public: false });
    expect(diffBucket(EXPECTED, live)).toEqual([
      "public: baseline=true live=false",
    ]);
  });

  it("rapporterer forkert file_size_limit", () => {
    const live = canonicalizeBucket({ ...EXPECTED, file_size_limit: 10 * 1024 * 1024 });
    expect(diffBucket(EXPECTED, live)).toEqual([
      "file_size_limit: baseline=52428800 live=10485760",
    ]);
  });

  it("rapporterer ændret allowed_mime_types-sæt", () => {
    const live = canonicalizeBucket({ ...EXPECTED, allowed_mime_types: ["image/jpeg"] });
    const result = diffBucket(EXPECTED, live);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("allowed_mime_types");
  });

  it("giver INGEN mismatch hvis allowed_mime_types blot står i anden rækkefølge", () => {
    const live = canonicalizeBucket({
      ...EXPECTED,
      allowed_mime_types: ["image/webp", "image/avif", "image/png", "image/jpeg"],
    });
    expect(diffBucket(EXPECTED, live)).toEqual([]);
  });

  it("rapporterer flere samtidige mismatches", () => {
    const live = canonicalizeBucket({
      ...EXPECTED,
      public: false,
      file_size_limit: 1024,
      allowed_mime_types: [],
    });
    expect(diffBucket(EXPECTED, live)).toHaveLength(3);
  });

  it("håndterer malformed live-data (null-felter) uden at kaste", () => {
    const malformed = { name: "destinations", public: undefined, file_size_limit: undefined, allowed_mime_types: undefined };
    expect(() => diffBucket(EXPECTED, malformed)).not.toThrow();
    expect(diffBucket(EXPECTED, malformed).length).toBeGreaterThan(0);
  });
});

describe("diffAllBuckets", () => {
  it("returnerer tom rapport ved fuldt match", () => {
    const liveMap = new Map([["destinations", canonicalizeBucket({ ...EXPECTED })]]);
    expect(diffAllBuckets([EXPECTED], liveMap)).toEqual([]);
  });

  it("medtager kun buckets med reel afvigelse", () => {
    const ok = { name: "destinations", public: true, file_size_limit: 100, allowed_mime_types: ["image/png"] };
    const bad = { name: "other-bucket", public: true, file_size_limit: 100, allowed_mime_types: ["image/png"] };
    const liveMap = new Map([
      ["destinations", canonicalizeBucket(ok)],
      ["other-bucket", canonicalizeBucket({ ...bad, public: false })],
    ]);
    const report = diffAllBuckets([ok, bad], liveMap);
    expect(report).toHaveLength(1);
    expect(report[0].name).toBe("other-bucket");
    expect(report[0].mismatches).toEqual(["public: baseline=true live=false"]);
  });

  it("rapporterer en helt manglende bucket via det samlede kort", () => {
    const report = diffAllBuckets([EXPECTED], new Map());
    expect(report).toEqual([
      { name: "destinations", mismatches: [`bucket "destinations" findes ikke live`] },
    ]);
  });
});

describe("selectBucketsForBaseline — SAFETY: --update-baseline må ikke acceptere en manglende expected bucket", () => {
  it("returnerer bucket-listen når alle expected navne findes live", () => {
    const liveMap = new Map([["destinations", canonicalizeBucket({ ...EXPECTED })]]);
    expect(selectBucketsForBaseline(["destinations"], liveMap)).toEqual([
      canonicalizeBucket({ ...EXPECTED }),
    ]);
  });

  it("kaster i stedet for at skrive en baseline der 'godkender' en manglende bucket væk", () => {
    // Dette er selve regressionen: en tom/delvis liveMap må ALDRIG give en
    // reduceret-men-succesfuld baseline — kun en eksplicit fejl.
    const emptyLiveMap = new Map();
    expect(() => selectBucketsForBaseline(["destinations"], emptyLiveMap)).toThrow(
      /destinations/,
    );
    expect(() => selectBucketsForBaseline(["destinations"], emptyLiveMap)).toThrow(
      /Baseline er IKKE skrevet/,
    );
  });

  it("kaster hvis KUN ÉN af flere forventede buckets mangler — delvist match er ikke nok", () => {
    const liveMap = new Map([["destinations", canonicalizeBucket({ ...EXPECTED })]]);
    expect(() =>
      selectBucketsForBaseline(["destinations", "en-slettet-bucket"], liveMap),
    ).toThrow(/en-slettet-bucket/);
  });

  it("nævner ALLE manglende buckets i fejlbeskeden, ikke kun den første", () => {
    expect(() =>
      selectBucketsForBaseline(["bucket-a", "bucket-b"], new Map()),
    ).toThrow(/bucket-a.*bucket-b/s);
  });

  it("sorterer output deterministisk (samme kontrakt som før fixet)", () => {
    const liveMap = new Map([
      ["z-bucket", canonicalizeBucket({ name: "z-bucket", public: true })],
      ["a-bucket", canonicalizeBucket({ name: "a-bucket", public: true })],
    ]);
    const result = selectBucketsForBaseline(["z-bucket", "a-bucket"], liveMap);
    expect(result.map((b) => b.name)).toEqual(["a-bucket", "z-bucket"]);
  });
});
