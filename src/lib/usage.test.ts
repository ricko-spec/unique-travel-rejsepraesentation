import { describe, it, expect } from "vitest";
import {
  fetchAllUsageEvents,
  mergeUsageSummary,
  periodStart,
  summarizeUsage,
  type FetchEventsPage,
  type UsageAggregateResponse,
  type UsageEventRow,
  type UsageProfile,
} from "./usage";

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

describe("summarizeUsage — timestamp-sammenligning må ikke være lexikografisk (reviewfund)", () => {
  // Postgres/PostgREST kan returnere timestamptz i forskellige, lige gyldige
  // string-formater (mikrosekund-præcision + "+00:00" i stedet for "Z"), som
  // IKKE nødvendigvis sorterer korrekt mod hinanden som rene strenge — kun
  // som reelle tidspunkter (Date/epoch ms). Disse tests bruger bevidst
  // blandede formater for at bevise at filtrering/min/max regner rigtigt.
  it("filtrerer korrekt på periode selvom eventets timestamp har '+00:00'-suffiks og mikrosekunder", () => {
    // NOW = 2026-09-16T12:00:00.000Z. Dette event er ca. 2 dage gammel —
    // skal medtages i 7d — men strengen sorterer FØR en simpel
    // "YYYY-MM-DDT...Z"-cutoff-streng ville man fejlagtigt kunne tro,
    // fordi "+00:00" (starter med '+', 0x2B) < "Z" (0x5A) tegn-for-tegn.
    const events: UsageEventRow[] = [
      {
        id: "e1",
        user_id: "user-1",
        actor_name: "Anne Berg",
        received_at: "2026-09-14T12:00:00.123456+00:00",
        status: "received",
        save_kind: null,
      },
    ];
    const summary = summarizeUsage(PROFILES, events, "7d", NOW);
    expect(summary.totalUploads).toBe(1);
  });

  it("ekskluderer korrekt et event der reelt er ældre end cutoff, selvom dets streng har flere fraktions-cifre", () => {
    // Eventet er ca. 10 dage gammelt (uden for 7d), men har en længere,
    // "senere-udseende" streng end en naiv 7d-cutoff — kun numerisk
    // sammenligning afgør det korrekt.
    const events: UsageEventRow[] = [
      {
        id: "e1",
        user_id: "user-1",
        actor_name: "Anne Berg",
        received_at: "2026-09-06T12:00:00.999999+00:00",
        status: "received",
        save_kind: null,
      },
    ];
    const summary = summarizeUsage(PROFILES, events, "7d", NOW);
    expect(summary.totalUploads).toBe(0);
  });

  it("finder trackingSince (min) korrekt på tværs af blandede timestamp-formater", () => {
    const events: UsageEventRow[] = [
      { id: "e1", user_id: "user-1", actor_name: "Anne Berg", received_at: "2026-09-10T00:00:00.000Z", status: "received", save_kind: null },
      { id: "e2", user_id: "user-1", actor_name: "Anne Berg", received_at: "2026-09-01T00:00:00.500000+00:00", status: "received", save_kind: null },
    ];
    const summary = summarizeUsage(PROFILES, events, "all", NOW);
    expect(summary.trackingSince).toBe("2026-09-01T00:00:00.500000+00:00");
  });
});

describe("fetchAllUsageEvents — keyset-paginering (Issue #38-reviewfund: ingen skjult max-rækkegrænse)", () => {
  function makeStore(count: number): UsageEventRow[] {
    return Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(6, "0");
      return {
        id: `evt-${n}`,
        user_id: "user-1",
        actor_name: "Anne Berg",
        received_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        status: "received",
        save_kind: null,
      };
    });
  }

  function pageFrom(store: UsageEventRow[]): FetchEventsPage {
    return async (cursor, limit) => {
      const startIdx = cursor ? store.findIndex((r) => r.id === cursor) + 1 : 0;
      return store.slice(startIdx, startIdx + limit);
    };
  }

  it("henter alle rækker uden truncation når datamængden overstiger én side (>1000 events)", async () => {
    const store = makeStore(2500);
    const result = await fetchAllUsageEvents(pageFrom(store), 500);
    expect(result).toHaveLength(2500);
    expect(new Set(result.map((r) => r.id)).size).toBe(2500);
    expect(result[0].id).toBe("evt-000001");
    expect(result[2499].id).toBe("evt-002500");
  });

  it("stopper IKKE for tidligt selvom en side rammer en skjult server-max under det ønskede limit", async () => {
    // Simulerer at PostgREST/Supabase capser en side til færre rækker end
    // klienten bad om (fx projekt-config lavere end vores pageSize) —
    // pagineringsløkken må ikke tolke "færre end limit" som "færdig".
    const store = makeStore(1200);
    const SERVER_MAX = 300; // lavere end det ønskede limit (500)
    const fetchPage: FetchEventsPage = async (cursor, limit) => {
      const startIdx = cursor ? store.findIndex((r) => r.id === cursor) + 1 : 0;
      const capped = Math.min(limit, SERVER_MAX);
      return store.slice(startIdx, startIdx + capped);
    };
    const result = await fetchAllUsageEvents(fetchPage, 500);
    expect(result).toHaveLength(1200);
    expect(new Set(result.map((r) => r.id)).size).toBe(1200);
  });

  it("medtager et event indsat samtidigt med pagineringen, uden at duplikere allerede hentede rækker", async () => {
    const store = makeStore(600);
    let calls = 0;
    const fetchPage: FetchEventsPage = async (cursor, limit) => {
      calls += 1;
      if (calls === 1) {
        // En ny upload ankommer midt i pagineringen. Keyset (id > cursor)
        // fanger den uden at rykke rundt på allerede hentede rækker — i
        // modsætning til OFFSET-paginering, hvor et nyt insert kan skubbe
        // rækker og give dubletter/huller.
        store.push({
          id: "evt-000601",
          user_id: "user-2",
          actor_name: "Bo Nielsen",
          received_at: new Date().toISOString(),
          status: "received",
          save_kind: null,
        });
      }
      const startIdx = cursor ? store.findIndex((r) => r.id === cursor) + 1 : 0;
      return store.slice(startIdx, startIdx + limit);
    };
    const result = await fetchAllUsageEvents(fetchPage, 500);
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("evt-000601");
    expect(result).toHaveLength(601);
  });

  it("returnerer en tom liste uden fejl når der ingen events er", async () => {
    const fetchPage: FetchEventsPage = async () => [];
    const result = await fetchAllUsageEvents(fetchPage, 500);
    expect(result).toEqual([]);
  });

  it("respekterer en tilpasset sidestørrelse", async () => {
    const store = makeStore(37);
    const seenLimits: number[] = [];
    const fetchPage: FetchEventsPage = async (cursor, limit) => {
      seenLimits.push(limit);
      const startIdx = cursor ? store.findIndex((r) => r.id === cursor) + 1 : 0;
      return store.slice(startIdx, startIdx + limit);
    };
    const result = await fetchAllUsageEvents(fetchPage, 10);
    expect(result).toHaveLength(37);
    expect(seenLimits.every((l) => l === 10)).toBe(true);
    // 10+10+10+7 rækker over fire sider, plus én afsluttende tom side der
    // bekræfter "færdig" (terminering sker KUN på en tom side, aldrig på
    // "færre end limit" — se kommentaren ved fetchAllUsageEvents).
    expect(seenLimits.length).toBe(5);
  });
});

describe("fetchAllUsageEvents brugt med en TILFÆLDIG (ikke-monoton) id — reviewfund PR #39", () => {
  // upload_events.id er gen_random_uuid() — IKKE en monoton nøgle. Denne
  // test er en REGRESSIONSTEST der bevidst DOKUMENTERER svagheden: den
  // beviser at fetchAllUsageEvents (den generiske keyset-paginator) misser
  // et event hvis dets id sorterer FØR en cursor vi allerede har passeret —
  // præcis det scenarie en tilfældig uuid kan give. Det er netop derfor
  // GET /admin/api/usage IKKE bruger denne funktion til upload_events, men
  // usage_period_summary-RPC'en (ét SQL-statement = ét Postgres-snapshot,
  // se supabase/009_upload_events.sql) i stedet.
  it("misser demonstrativt et event hvis dets id sorterer FØR en allerede passeret cursor", async () => {
    function row(id: string, userId: string, name: string): UsageEventRow {
      return {
        id,
        user_id: userId,
        actor_name: name,
        received_at: new Date().toISOString(),
        status: "received",
        save_kind: null,
      };
    }
    const byId = (a: UsageEventRow, b: UsageEventRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

    let store: UsageEventRow[] = [
      row("a-001", "user-1", "Anne Berg"),
      row("a-002", "user-1", "Anne Berg"),
      row("a-003", "user-1", "Anne Berg"),
      row("a-004", "user-1", "Anne Berg"),
      row("a-005", "user-1", "Anne Berg"),
      row("a-006", "user-1", "Anne Berg"),
    ];

    let calls = 0;
    const fetchPage: FetchEventsPage = async (cursor, limit) => {
      calls += 1;
      if (calls === 2) {
        // En ny upload ankommer HER, mens pagineringen er i gang. Dens
        // tilfældige uuid ("a-0025") sorterer efter "a-002" (allerede
        // hentet i side 1) men FØR "a-003" (cursoren efter side 1) — fuldt
        // muligt for en reel gen_random_uuid(), som ikke afspejler
        // indsættelsestidspunkt.
        store = [...store, row("a-0025", "user-2", "Bo Nielsen")].sort(byId);
      }
      const sorted = [...store].sort(byId);
      const filtered = cursor ? sorted.filter((r) => r.id > cursor) : sorted;
      return filtered.slice(0, limit);
    };

    const result = await fetchAllUsageEvents(fetchPage, 3);
    const resultIds = result.map((r) => r.id);

    // Selve reviewfundet: eventet findes reelt (bekræftet nedenfor), men
    // pagineringen så det aldrig, fordi dens cursor allerede havde passeret
    // det tidspunkt i id-rækkefølgen hvor det nye event endte.
    expect(store.map((r) => r.id)).toContain("a-0025");
    expect(resultIds).not.toContain("a-0025");
  });
});

describe("mergeUsageSummary — fletter RPC-aggregat med profiles (produktions-aggregeringsvejen)", () => {
  function aggregate(overrides: Partial<UsageAggregateResponse> = {}): UsageAggregateResponse {
    return {
      totalUploads: 0,
      trackingSince: null,
      stalledEvents: 0,
      historicalActorEvents: 0,
      users: [],
      ...overrides,
    };
  }

  it("inkluderer profiler med 0 uploads (Test-case 8)", () => {
    const summary = mergeUsageSummary(PROFILES, aggregate(), "30d", iso(30));
    expect(summary.users).toHaveLength(3);
    expect(summary.zeroUploadUsers).toBe(3);
    expect(summary.activeUsers).toBe(0);
  });

  it("bruger tallene direkte fra RPC-aggregatet uden at genberegne dem", () => {
    const agg = aggregate({
      totalUploads: 5,
      trackingSince: iso(40),
      stalledEvents: 2,
      historicalActorEvents: 1,
      users: [
        {
          userId: "user-1",
          isHistorical: false,
          latestActorName: "Anne Berg",
          uploads: 3,
          published: 2,
          newTrips: 1,
          reuploads: 1,
          errors: 1,
          parsedNotSaved: 0,
          lastUploadAt: iso(1),
        },
      ],
    });
    const summary = mergeUsageSummary(PROFILES, agg, "30d", iso(30));
    expect(summary.totalUploads).toBe(5);
    expect(summary.trackingSince).toBe(iso(40));
    expect(summary.stalledEvents).toBe(2);
    expect(summary.historicalActorEvents).toBe(1);
    const anne = summary.users.find((u) => u.userId === "user-1")!;
    expect(anne).toMatchObject({
      uploads: 3,
      published: 2,
      newTrips: 1,
      reuploads: 1,
      errors: 1,
      parsedNotSaved: 0,
      lastUploadAt: iso(1),
    });
  });

  it("sorterer flest uploads først, men beholder 0-brugere", () => {
    const agg = aggregate({
      users: [
        { userId: "user-3", isHistorical: false, latestActorName: "Carl Dahl", uploads: 1, published: 0, newTrips: 0, reuploads: 0, errors: 0, parsedNotSaved: 0, lastUploadAt: iso(1) },
        { userId: "user-1", isHistorical: false, latestActorName: "Anne Berg", uploads: 4, published: 0, newTrips: 0, reuploads: 0, errors: 0, parsedNotSaved: 0, lastUploadAt: iso(1) },
      ],
    });
    const summary = mergeUsageSummary(PROFILES, agg, "30d", iso(30));
    expect(summary.users.map((u) => u.userId)).toEqual(["user-1", "user-3", "user-2"]);
  });

  it("viser en aggregat-række for en user_id der (stadig) er sat på eventet, men ikke (længere) findes i profiles", () => {
    const agg = aggregate({
      users: [
        { userId: "user-fjernet-fra-profiles", isHistorical: false, latestActorName: "Tidligere Sælger", uploads: 2, published: 0, newTrips: 0, reuploads: 0, errors: 0, parsedNotSaved: 0, lastUploadAt: iso(1) },
      ],
    });
    const summary = mergeUsageSummary(PROFILES, agg, "30d", iso(30));
    expect(summary.users).toHaveLength(4); // 3 profiler + 1 orphan
    const orphan = summary.users.find((u) => u.userId === "user-fjernet-fra-profiles")!;
    expect(orphan.name).toBe("Tidligere Sælger");
    expect(orphan.uploads).toBe(2);
    expect(orphan.isHistorical).toBe(false);
  });

  // Reviewfund: upload_events med user_id = NULL (auth-brugeren/profilen er
  // slettet siden, ON DELETE SET NULL) må IKKE kun tælles i
  // historicalActorEvents — actor_name er netop gemt for at bevare hvem der
  // uploadede. RPC'en grupperer disse under isHistorical: true, userId: null.
  describe("historiske/orphan-uploads (user_id IS NULL, gemt via actor_name)", () => {
    it("beviser at uploaden BÅDE ligger i totalUploads OG vises som en tydeligt markeret historisk bruger-række", () => {
      const agg = aggregate({
        totalUploads: 2, // de to eneste events i perioden — begge fra den slettede bruger
        users: [
          {
            userId: null,
            isHistorical: true,
            latestActorName: "Dorte Hansen",
            uploads: 2,
            published: 1,
            newTrips: 1,
            reuploads: 0,
            errors: 1,
            parsedNotSaved: 0,
            lastUploadAt: iso(1),
          },
        ],
      });
      const summary = mergeUsageSummary(PROFILES, agg, "30d", iso(30));

      // 1) I totalen:
      expect(summary.totalUploads).toBe(2);

      // 2) Som sin egen, tydeligt markerede række i tabellen:
      const historical = summary.users.find((u) => u.isHistorical)!;
      expect(historical).toBeDefined();
      expect(historical.name).toBe("Tidligere bruger: Dorte Hansen");
      expect(historical.uploads).toBe(2);
      expect(historical.published).toBe(1);
      expect(historical.newTrips).toBe(1);
      expect(historical.errors).toBe(1);
      expect(historical.lastUploadAt).toBe(iso(1));
    });

    it("tælles IKKE som en nuværende 0-upload-profil, og påvirker ikke activeUsers/zeroUploadUsers", () => {
      const agg = aggregate({
        totalUploads: 1,
        users: [
          {
            userId: null,
            isHistorical: true,
            latestActorName: "Dorte Hansen",
            uploads: 1,
            published: 0,
            newTrips: 0,
            reuploads: 0,
            errors: 0,
            parsedNotSaved: 1,
            lastUploadAt: iso(1),
          },
        ],
      });
      const summary = mergeUsageSummary(PROFILES, agg, "30d", iso(30));

      // Stadig kun de 3 rigtige profiler tæller som aktive/0-upload —
      // uanset at der nu er 4 rækker i tabellen.
      expect(summary.users).toHaveLength(4);
      expect(summary.zeroUploadUsers).toBe(3);
      expect(summary.activeUsers).toBe(0);
    });

    it("bruger en stabil, ikke-forvekslelig nøgle (aldrig en rigtig profil-id) til den historiske række", () => {
      const agg = aggregate({
        users: [
          { userId: null, isHistorical: true, latestActorName: "Anne Berg", uploads: 1, published: 0, newTrips: 0, reuploads: 0, errors: 0, parsedNotSaved: 0, lastUploadAt: iso(1) },
        ],
      });
      const summary = mergeUsageSummary(PROFILES, agg, "30d", iso(30));
      const activeAnne = summary.users.find((u) => u.userId === "user-1")!;
      const historicalAnne = summary.users.find((u) => u.isHistorical)!;
      // Selvom navnet ligner (samme person kan i princippet både have en
      // aktiv profil OG en historisk orphan-gruppe fra før profilen fandtes),
      // må de to rækkers userId aldrig kollidere.
      expect(activeAnne.userId).not.toBe(historicalAnne.userId);
      expect(historicalAnne.userId).not.toBe("user-1");
    });
  });

  it("videregiver period og periodStart uændret til svaret", () => {
    const summary = mergeUsageSummary(PROFILES, aggregate(), "7d", iso(7));
    expect(summary.period).toBe("7d");
    expect(summary.periodStart).toBe(iso(7));
  });

  it("giver periodStart = null for 'all'", () => {
    const summary = mergeUsageSummary(PROFILES, aggregate(), "all", null);
    expect(summary.periodStart).toBeNull();
  });
});
