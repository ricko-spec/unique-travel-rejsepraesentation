import { describe, it, expect } from "vitest";
import { periodStart, summarizeUsage, type UsageEventRow, type UsageProfile } from "./usage";

const NOW = new Date("2026-09-16T12:00:00.000Z");

const PROFILES: UsageProfile[] = [
  { id: "user-1", full_name: "Anne Berg", email: "anne@uniquetravel.dk" },
  { id: "user-2", full_name: null, email: "bo@uniquetravel.dk" },
  { id: "user-3", full_name: "Carl Dahl", email: "carl@uniquetravel.dk" },
];

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

describe("periodStart", () => {
  it("giver null for 'all' (ingen nedre grænse)", () => {
    expect(periodStart("all", NOW)).toBeNull();
  });

  it("giver 7 dage tilbage for '7d'", () => {
    expect(periodStart("7d", NOW)).toBe(iso(7));
  });

  it("giver 30 dage tilbage for '30d'", () => {
    expect(periodStart("30d", NOW)).toBe(iso(30));
  });
});

describe("summarizeUsage — grundtilfælde", () => {
  it("inkluderer profiler med 0 uploads (Test-case 8)", () => {
    const summary = summarizeUsage(PROFILES, [], "30d", NOW);
    expect(summary.users).toHaveLength(3);
    expect(summary.zeroUploadUsers).toBe(3);
    expect(summary.activeUsers).toBe(0);
    expect(summary.totalUploads).toBe(0);
  });

  it("bruger full_name når den findes, ellers email", () => {
    const summary = summarizeUsage(PROFILES, [], "30d", NOW);
    const bo = summary.users.find((u) => u.userId === "user-2");
    expect(bo?.name).toBe("bo@uniquetravel.dk");
    const anne = summary.users.find((u) => u.userId === "user-1");
    expect(anne?.name).toBe("Anne Berg");
  });

  it("sorterer flest uploads først, men beholder 0-brugere", () => {
    const events: UsageEventRow[] = [
      { id: "e1", user_id: "user-3", actor_name: "Carl Dahl", received_at: iso(1), status: "received", save_kind: null },
      { id: "e2", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(2), status: "received", save_kind: null },
      { id: "e3", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "received", save_kind: null },
    ];
    const summary = summarizeUsage(PROFILES, events, "30d", NOW);
    expect(summary.users.map((u) => u.userId)).toEqual(["user-1", "user-3", "user-2"]);
  });
});

describe("summarizeUsage — statusoptælling (Test-case 4/5)", () => {
  // Hver upload_events-række opdateres IN-PLACE og har derfor kun ÉN aktuel
  // status i disse fixtures (status er slutresultatet, ikke en historik) —
  // men den tæller stadig som ét "upload", jf. row.uploads-kommentaren i
  // usage.ts: received_at gør den til en upload uanset hvor den endte.
  it("tæller published + save_kind=created som ny rejseplan, og stadig som én upload", () => {
    const events: UsageEventRow[] = [
      { id: "e1", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "published", save_kind: "created" },
    ];
    const summary = summarizeUsage(PROFILES, events, "30d", NOW);
    const anne = summary.users.find((u) => u.userId === "user-1")!;
    expect(anne.uploads).toBe(1);
    expect(anne.published).toBe(1);
    expect(anne.newTrips).toBe(1);
    expect(anne.reuploads).toBe(0);
  });

  it("tæller published + save_kind=updated som re-upload uden at ændre nye-rejseplaner-tallet", () => {
    const events: UsageEventRow[] = [
      { id: "e1", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "published", save_kind: "updated" },
    ];
    const summary = summarizeUsage(PROFILES, events, "30d", NOW);
    const anne = summary.users.find((u) => u.userId === "user-1")!;
    expect(anne.published).toBe(1);
    expect(anne.newTrips).toBe(0);
    expect(anne.reuploads).toBe(1);
  });

  it("tæller validation_failed/parse_failed/save_failed som fejl, men stadig som uploads", () => {
    const events: UsageEventRow[] = [
      { id: "e1", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "validation_failed", save_kind: null },
      { id: "e2", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "parse_failed", save_kind: null },
      { id: "e3", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "save_failed", save_kind: null },
    ];
    const summary = summarizeUsage(PROFILES, events, "30d", NOW);
    const anne = summary.users.find((u) => u.userId === "user-1")!;
    expect(anne.errors).toBe(3);
    expect(anne.uploads).toBe(3);
  });

  it("tæller 'parsed' der aldrig blev gemt separat, uden at melde det som fejl", () => {
    const events: UsageEventRow[] = [
      { id: "e1", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "parsed", save_kind: null },
    ];
    const summary = summarizeUsage(PROFILES, events, "30d", NOW);
    const anne = summary.users.find((u) => u.userId === "user-1")!;
    expect(anne.parsedNotSaved).toBe(1);
    expect(anne.errors).toBe(0);
    expect(anne.uploads).toBe(1);
  });
});

describe("summarizeUsage — perioder (Test-case 10)", () => {
  const events: UsageEventRow[] = [
    { id: "recent", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(2), status: "received", save_kind: null },
    { id: "mid", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(15), status: "received", save_kind: null },
    { id: "old", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(200), status: "received", save_kind: null },
  ];

  it("7d medtager kun eventet fra for 2 dage siden", () => {
    expect(summarizeUsage(PROFILES, events, "7d", NOW).totalUploads).toBe(1);
  });

  it("30d medtager eventerne fra 2 og 15 dage siden", () => {
    expect(summarizeUsage(PROFILES, events, "30d", NOW).totalUploads).toBe(2);
  });

  it("all medtager alle tre uanset alder", () => {
    expect(summarizeUsage(PROFILES, events, "all", NOW).totalUploads).toBe(3);
  });
});

describe("summarizeUsage — integritetsindikatorer", () => {
  it("tæller received/parsed events ældre end 24 timer som ufærdiggjorte, uanset periode", () => {
    const events: UsageEventRow[] = [
      { id: "stalled", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(3), status: "parsed", save_kind: null },
      { id: "fresh", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(0), status: "received", save_kind: null },
    ];
    // Selv med 7d-perioden (som stadig inkluderer begge events her) skal det
    // stallede event tælles med — sektionen er bevidst periode-uafhængig.
    const summary = summarizeUsage(PROFILES, events, "7d", NOW);
    expect(summary.stalledEvents).toBe(1);
  });

  it("tæller events uden user_id som historisk-actor, men taber dem ikke", () => {
    const events: UsageEventRow[] = [
      { id: "orphan", user_id: null, actor_name: "Slettet Bruger", received_at: iso(1), status: "received", save_kind: null },
    ];
    const summary = summarizeUsage(PROFILES, events, "30d", NOW);
    expect(summary.historicalActorEvents).toBe(1);
    expect(summary.totalUploads).toBe(1);
  });

  it("sætter trackingSince til det ældste event uanset valgt periode", () => {
    const events: UsageEventRow[] = [
      { id: "old", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(200), status: "received", save_kind: null },
      { id: "new", user_id: "user-1", actor_name: "Anne Berg", received_at: iso(1), status: "received", save_kind: null },
    ];
    const summary = summarizeUsage(PROFILES, events, "7d", NOW);
    expect(summary.trackingSince).toBe(iso(200));
  });

  it("giver trackingSince = null når der slet ingen events er", () => {
    expect(summarizeUsage(PROFILES, [], "all", NOW).trackingSince).toBeNull();
  });
});
