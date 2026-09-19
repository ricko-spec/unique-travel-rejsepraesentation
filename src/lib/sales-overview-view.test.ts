import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_VIEW,
  PAGE_SIZE,
  applyView,
  hasMeasuredActivity,
  isActivityUnknown,
  isSearching,
  matchesActivity,
  paginate,
  remainingCount,
  sortRows,
  type SalesViewState,
} from "./sales-overview-view";
import {
  COPY,
  allStaticCopy,
  contactLines,
  lastActivityText,
  matchText,
  moreText,
  openedLines,
  sectionsLines,
  showingText,
} from "./sales-overview-copy";
import type { SalesOverviewRow } from "./sales-overview-types";

// Fase 4 (Issue #76): filtre, sorteringer og pagination (klient-side) + tekster.

function row(over: Partial<SalesOverviewRow> & { id: string }): SalesOverviewRow {
  return {
    booking_no: "35001",
    slug: `s-${over.id}`,
    destination: "Bali",
    customer_name: "Kunde",
    active: true,
    created_at: "2026-09-19T10:00:00.000Z",
    created_by_name: null,
    mine: false,
    opened: { kind: "not-opened" },
    sections: { kind: "none-registered" },
    contact: { kind: "none-registered" },
    lastActivityAt: null,
    ...over,
  };
}
const ids = (rows: SalesOverviewRow[]) => rows.map((r) => r.id);
const view = (over: Partial<SalesViewState> = {}): SalesViewState => ({ ...DEFAULT_VIEW, ...over });

// Et lille, blandet datasæt.
const R = {
  // aktivitet
  recent: row({ id: "recent", lastActivityAt: "2026-09-20T10:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z",
    opened: { kind: "opened", lastOpenedAt: "2026-09-20T10:00:00.000Z", visitCount: 2 } }),
  older: row({ id: "older", lastActivityAt: "2026-09-19T10:00:00.000Z", created_at: "2026-09-10T00:00:00.000Z",
    opened: { kind: "opened", lastOpenedAt: "2026-09-19T10:00:00.000Z", visitCount: 1 } }),
  clickOnly: row({ id: "clickOnly", lastActivityAt: "2026-09-20T12:00:00.000Z", created_at: "2026-09-05T00:00:00.000Z",
    contact: { kind: "clicked", phone: true, email: false } }),
  // ingen aktivitet — kendt
  newNone: row({ id: "newNone", created_at: "2026-09-19T09:00:00.000Z" }),
  oldNone: row({ id: "oldNone", created_at: "2026-05-01T00:00:00.000Z", opened: { kind: "not-measured", since: "2026-09-18T12:20:18.000Z" } }),
  // ingen aktivitet — UKENDT (fejlet kilde / ukendt eligibility)
  unknownSrc: row({ id: "unknownSrc", created_at: "2026-09-18T00:00:00.000Z", contact: { kind: "unavailable" } }),
  unassessable: row({ id: "unassessable", created_at: "2026-09-17T00:00:00.000Z", sections: { kind: "unassessable" }, contact: { kind: "unassessable" } }),
  // deaktiveret + andens
  inactive: row({ id: "inactive", active: false, lastActivityAt: "2026-09-20T13:00:00.000Z" }),
  mine: row({ id: "mine", mine: true, created_at: "2026-09-02T00:00:00.000Z" }),
};
const ALL = Object.values(R);

describe("A. default-visning (godkendt beslutning #4)", () => {
  it("er alle AKTIVE, sorteret efter seneste aktivitet, rækker uden aktivitet UNDER dem", () => {
    const out = applyView(ALL, DEFAULT_VIEW);
    expect(ids(out)).not.toContain("inactive");
    const first3 = ids(out).slice(0, 3);
    expect(first3).toEqual(["clickOnly", "recent", "older"]); // nyeste aktivitet først
    // resten har ingen aktivitet, Oprettet ↓ (nyeste først)
    expect(ids(out).slice(3)).toEqual(["newNone", "unknownSrc", "unassessable", "mine", "oldNone"]);
  });

  it("rækker uden aktivitet skjules ALDRIG som default", () => {
    const out = applyView(ALL, DEFAULT_VIEW);
    expect(out).toHaveLength(ALL.length - 1); // kun den deaktiverede er skjult
  });

  it("DEFAULT_VIEW-konstanten er præcis den godkendte", () => {
    expect(DEFAULT_VIEW).toEqual({
      activity: "all",
      mine: "all",
      showInactive: false,
      sort: "latest-activity",
      search: "",
    });
  });
});

describe("B. sortering — deterministisk, muterer ikke", () => {
  it("Seneste aktivitet: dato ↓, tie → Oprettet ↓, tie → id", () => {
    const a = row({ id: "b", lastActivityAt: "2026-09-20T10:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z" });
    const b = row({ id: "a", lastActivityAt: "2026-09-20T10:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z" });
    const c = row({ id: "c", lastActivityAt: "2026-09-20T10:00:00.000Z", created_at: "2026-09-05T00:00:00.000Z" });
    expect(ids(sortRows([a, b, c], "latest-activity"))).toEqual(["c", "a", "b"]);
  });

  it("samme resultat uanset inputrækkefølge (10 tilfældige permutationer)", () => {
    const expected = ids(sortRows(ALL, "latest-activity"));
    for (let i = 0; i < 10; i++) {
      const shuffled = [...ALL].sort(() => Math.random() - 0.5);
      expect(ids(sortRows(shuffled, "latest-activity"))).toEqual(expected);
    }
  });

  it("Oprettet (nyeste): created ↓, tie → id", () => {
    expect(ids(sortRows([R.oldNone, R.newNone, R.recent], "created"))).toEqual(["newNone", "recent", "oldNone"]);
  });

  it("Senest åbnet: åbnede først (senest ↓), derefter øvrige efter Oprettet ↓", () => {
    const out = sortRows([R.oldNone, R.older, R.newNone, R.recent, R.clickOnly], "last-opened");
    expect(ids(out)).toEqual(["recent", "older", "newNone", "clickOnly", "oldNone"]);
  });

  it("muterer ikke input", () => {
    const input = [...ALL];
    const snapshot = ids(input);
    sortRows(input, "latest-activity");
    applyView(input, DEFAULT_VIEW);
    expect(ids(input)).toEqual(snapshot);
  });

  it("ugyldig created_at crasher ikke (behandles som ældst)", () => {
    const bad = row({ id: "bad", created_at: "ikke-en-dato" });
    expect(() => sortRows([bad, R.newNone], "created")).not.toThrow();
    expect(ids(sortRows([bad, R.newNone], "created"))).toEqual(["newNone", "bad"]);
  });
});

describe("C. filtre — kombineres (AND)", () => {
  it("Vis deaktiverede: fra som default, til viser dem", () => {
    expect(ids(applyView(ALL, view({ showInactive: true })))).toContain("inactive");
    expect(ids(applyView(ALL, view({ showInactive: false })))).not.toContain("inactive");
  });

  it("Mine: kun rækker med mine=true", () => {
    expect(ids(applyView(ALL, view({ mine: "mine" })))).toEqual(["mine"]);
  });

  it("Aktivitet: 'Har målt aktivitet' = lastActivityAt findes", () => {
    expect(ids(applyView(ALL, view({ activity: "has-activity" })))).toEqual(["clickOnly", "recent", "older"]);
  });

  it("Aktivitet: 'Kontaktklik' = contact.kind === clicked", () => {
    expect(ids(applyView(ALL, view({ activity: "contact-click" })))).toEqual(["clickOnly"]);
  });

  it("Aktivitet: 'Ingen målt aktivitet' udelader rækker hvor et signal er UKENDT (aldrig falsk 'ingen')", () => {
    const out = ids(applyView(ALL, view({ activity: "no-activity" })));
    expect(out).toEqual(expect.arrayContaining(["newNone", "oldNone", "mine"]));
    expect(out).not.toContain("unknownSrc"); // kontakt-kilde fejlet
    expect(out).not.toContain("unassessable"); // malformed trip-data
    expect(out).not.toContain("recent");
  });

  it("isActivityUnknown/hasMeasuredActivity/matchesActivity er konsistente", () => {
    expect(isActivityUnknown(R.unknownSrc)).toBe(true);
    expect(isActivityUnknown(R.unassessable)).toBe(true);
    expect(isActivityUnknown(R.oldNone)).toBe(false); // not-measured er KENDT
    expect(hasMeasuredActivity(R.recent)).toBe(true);
    expect(matchesActivity(R.unknownSrc, "no-activity")).toBe(false);
    expect(matchesActivity(R.unknownSrc, "has-activity")).toBe(false);
    expect(matchesActivity(R.unknownSrc, "all")).toBe(true);
  });

  it("filtre kombineres: Mine + Aktivitet + Deaktiverede", () => {
    const rows = [
      row({ id: "m1", mine: true, lastActivityAt: "2026-09-20T10:00:00.000Z" }),
      row({ id: "m2", mine: true }),
      row({ id: "x1", mine: false, lastActivityAt: "2026-09-20T10:00:00.000Z" }),
      row({ id: "m3", mine: true, active: false, lastActivityAt: "2026-09-20T10:00:00.000Z" }),
    ];
    expect(ids(applyView(rows, view({ mine: "mine", activity: "has-activity" })))).toEqual(["m1"]);
    expect(ids(applyView(rows, view({ mine: "mine", activity: "has-activity", showInactive: true })))).toEqual(["m1", "m3"]);
  });
});

describe("D. eksisterende søgning virker uændret", () => {
  it("matcher bookingnummer, kunde, destination og slug; tokens ANDes; '#' ignoreres", () => {
    const rows = [
      row({ id: "1", booking_no: "35685", destination: "Bali", customer_name: "Susanne Bastegaard" }),
      row({ id: "2", booking_no: "35700", destination: "Sri Lanka", customer_name: "Finn" }),
    ];
    expect(ids(applyView(rows, view({ search: "35685" })))).toEqual(["1"]);
    expect(ids(applyView(rows, view({ search: "#35685" })))).toEqual(["1"]);
    expect(ids(applyView(rows, view({ search: "sri lanka" })))).toEqual(["2"]);
    expect(ids(applyView(rows, view({ search: "bali bastegaard" })))).toEqual(["1"]);
    expect(ids(applyView(rows, view({ search: "bali finn" })))).toEqual([]);
  });

  it("søgning kombineres med filtrene, og isSearching afspejler et reelt søgeord", () => {
    expect(isSearching(view({ search: "#" }))).toBe(false);
    expect(isSearching(view({ search: "bali" }))).toBe(true);
    const rows = [row({ id: "a", destination: "Bali", active: false }), row({ id: "b", destination: "Bali" })];
    expect(ids(applyView(rows, view({ search: "bali" })))).toEqual(["b"]);
  });
});

describe("E. pagination", () => {
  const many = Array.from({ length: 130 }, (_, i) => row({ id: `r${String(i).padStart(3, "0")}` }));

  it("PAGE_SIZE er 50; paginate viser de første n, resten er 'Vis flere'", () => {
    expect(PAGE_SIZE).toBe(50);
    expect(paginate(many, PAGE_SIZE)).toHaveLength(50);
    expect(paginate(many, PAGE_SIZE * 2)).toHaveLength(100);
    expect(paginate(many, 1000)).toHaveLength(130);
    expect(remainingCount(many.length, PAGE_SIZE)).toBe(80);
    expect(remainingCount(130, 500)).toBe(0);
  });

  it("negative/0 tal giver tom side og ingen fejl", () => {
    expect(paginate(many, 0)).toEqual([]);
    expect(paginate(many, -5)).toEqual([]);
  });
});

// ============================================================================
// Tekster (AK-11, AK-12)
// ============================================================================
const BANNED = /\b(hot|varm|varme|lead|leads|score|scoring|scorer|interesseret|interesse|sandsynlig|sandsynligt|sandsynlige)\b/i;

describe("F. tekster: kun observerede fakta, ingen fortolkning (AK-11/AK-12)", () => {
  const openedCells = [
    { kind: "opened", lastOpenedAt: "2026-09-20T10:00:00.000Z", visitCount: 1 },
    { kind: "opened", lastOpenedAt: "2026-09-20T10:00:00.000Z", visitCount: 7 },
    { kind: "not-opened" },
    { kind: "not-measured", since: "2026-09-18T12:20:18.000Z" },
    { kind: "no-recent-data" },
    { kind: "unavailable" },
  ] as const;
  const sectionCells = [
    { kind: "reached", reached: 3, total: 5, price: true },
    { kind: "reached", reached: 1, total: 4, price: false },
    { kind: "none-registered" },
    { kind: "unassessable" },
    { kind: "unavailable" },
  ] as const;
  const contactCells = [
    { kind: "clicked", phone: true, email: true },
    { kind: "clicked", phone: true, email: false },
    { kind: "clicked", phone: false, email: true },
    { kind: "none-registered" },
    { kind: "unassessable" },
    { kind: "unavailable" },
  ] as const;

  function allDynamicText(): string[] {
    const out: string[] = [];
    for (const c of openedCells) {
      const l = openedLines(c);
      out.push(l.primary, l.secondary ?? "");
    }
    for (const c of sectionCells) {
      const l = sectionsLines(c);
      out.push(l.primary, l.secondary ?? "");
    }
    for (const c of contactCells) out.push(...contactLines(c));
    out.push(lastActivityText(null), lastActivityText("2026-09-20T10:00:00.000Z"));
    out.push(showingText(5, 5), showingText(1, 1), showingText(50, 267), matchText(1), matchText(4), moreText(80));
    return out.filter(Boolean);
  }

  it("ingen af de fortolkende ord i nogen statisk eller dynamisk UI-tekst", () => {
    for (const text of [...allStaticCopy(), ...allDynamicText()]) {
      expect(text, `tekst: "${text}"`).not.toMatch(BANNED);
    }
  });

  it("kontaktklik omtales som KLIKKET — aldrig kontaktet/booket/samtale/henvendelse", () => {
    const texts = contactCells.flatMap((c) => contactLines(c)).join(" | ");
    expect(texts).toMatch(/Telefon klikket/);
    expect(texts).toMatch(/Email klikket/);
    expect(texts).not.toMatch(/kontaktet|booket|booking på vej|samtale|henvendelse|ringede|skrev/i);
    expect(COPY.footnote).toMatch(/ikke om kontakt er gennemført/);
  });

  it("'før måling' skrives som 'Ingen åbning målt siden <dato>' — aldrig 'Ikke åbnet endnu'", () => {
    const before = openedLines({ kind: "not-measured", since: "2026-09-18T12:20:18.000Z" }).primary;
    expect(before).toBe("Ingen åbning målt siden 18. september 2026");
    expect(before).not.toMatch(/Ikke åbnet endnu/);
    expect(openedLines({ kind: "not-opened" }).primary).toBe("Ikke åbnet endnu");
  });

  it("fejl/ukendt har egne tekster og ligner aldrig 'ingen registreret'", () => {
    expect(COPY.notFetched).not.toBe(COPY.none);
    expect(COPY.notAssessable).not.toBe(COPY.none);
    expect(COPY.notFetched).not.toBe(COPY.notAssessable);
    expect(sectionsLines({ kind: "unavailable" }).primary).toBe(COPY.notFetched);
    expect(sectionsLines({ kind: "unassessable" }).primary).toBe(COPY.notAssessable);
    expect(contactLines({ kind: "unavailable" })).toEqual([COPY.notFetched]);
    expect(contactLines({ kind: "unassessable" })).toEqual([COPY.notAssessable]);
    expect(openedLines({ kind: "unavailable" }).primary).toBe(COPY.notFetched);
  });

  it("'Set': n af m + Pris nået; ingen procent, ingen vurdering", () => {
    expect(sectionsLines({ kind: "reached", reached: 3, total: 5, price: true })).toEqual({
      primary: "3 af 5 afsnit",
      secondary: "Pris nået",
    });
    expect(sectionsLines({ kind: "reached", reached: 3, total: 5, price: false }).secondary).toBeUndefined();
  });

  it("de faktiske komponent-kilder indeholder ingen fortolkende ord i tekst (statisk scan)", () => {
    const strip = (rel: string) =>
      readFileSync(join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const rel of ["src/app/admin/AdminDashboard.tsx", "src/app/admin/SalesOverviewTable.tsx"]) {
      const src = strip(rel);
      // Kun tekst mellem tags og i strenge: fjern identifikatorer ved at scanne ord-for-ord.
      const words = src.match(/[A-Za-zÆØÅæøå]+/g) ?? [];
      const hits = words.filter((w) => BANNED.test(w));
      expect(hits, `${rel}: ${hits.join(", ")}`).toEqual([]);
    }
  });
});
