import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveContactChannels } from "./contact-intent-trip";
import {
  CONTACT_CHANNELS,
  buildContactIntentDisplay,
  type ContactChannel,
} from "./contact-intent";
import {
  CONTACT_INTENT_TRACKING_SINCE,
  buildContactIntentTrackingNote,
} from "./contact-intent-tracking";
import { handleContactIntent, type ContactIntentDeps } from "./contact-intent-endpoint";
import { TRACKING_SINCE } from "./trip-visit";
import { formatDateLongDK } from "./trip-engagement";

// Review-fund på PR #74 (ChatGPT): (1) admin skal bruge SAMME runtime-sandhed
// som kundesiden og endpointet, og (2) Fase 3 skal have sin EGEN tracking-
// cutover — Fase 1B's TRACKING_SINCE gælder kun åbninger.

// ============================================================================
// A. resolveContactChannels — tripSchema + normalizeTrip
// ============================================================================
describe("A. resolveContactChannels (samme runtime-sandhed som kunde + endpoint)", () => {
  it("valid normaliseret trip med advisorEmail => email + phone", () => {
    expect(
      resolveContactChannels({
        bookingNo: "1234567",
        destination: "Bali",
        advisorEmail: "raadgiver@uniquetravel.dk",
      }),
    ).toEqual(["email", "phone"]);
  });

  it("valid trip UDEN advisorEmail => kun phone (ActionBar 'Ring' findes altid)", () => {
    for (const advisorEmail of [null, undefined, ""]) {
      expect(
        resolveContactChannels({ bookingNo: "1234567", destination: "Bali", advisorEmail }),
      ).toEqual(["phone"]);
    }
    expect(resolveContactChannels({ bookingNo: "1234567", destination: "Bali" })).toEqual([
      "phone",
    ]);
  });

  it("valid trip med rigtigt indhold parser og normaliseres", () => {
    expect(
      resolveContactChannels({
        bookingNo: "1",
        destination: "Bali",
        advisorEmail: "a@b.dk",
        itinerary: [{ type: "activity", typeLabel: "AKTIVITET", title: "Tempeltur" }],
        hotels: [{ name: "Hotel Test" }],
      }),
    ).toEqual(["email", "phone"]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["en streng", "ikke et objekt"],
    ["et tal", 42],
    ["et array", []],
    ["itinerary er ikke et array", { itinerary: "ikke et array" }],
    ["hotels er ikke et array", { hotels: 7 }],
    ["ukendt itinerary-type", { itinerary: [{ type: "bogus", typeLabel: "x", title: "y" }] }],
    ["ugyldig (ikke-streng) advisorEmail", { advisorEmail: 123 }],
  ])("malformed trip-data (%s) => null — ALDRIG en tom liste", (_label, data) => {
    expect(resolveContactChannels(data)).toBeNull();
  });

  it("kaster aldrig, uanset input", () => {
    for (const data of [null, undefined, {}, [], "x", 1, { itinerary: 5 }, Symbol.iterator]) {
      expect(() => resolveContactChannels(data)).not.toThrow();
    }
  });
});

// ============================================================================
// B. Admin-visning: malformed trip-data => ALDRIG falsk phone/email "—"
// ============================================================================
describe("B. malformed trip-data giver aldrig et falsk negativt signal", () => {
  const MALFORMED = [
    null,
    "ikke et objekt",
    { itinerary: "ikke et array" },
    { advisorEmail: 123 },
  ];

  it.each(MALFORMED.map((d, i) => [i, d] as const))(
    "malformed #%s: DB-læsning OK + ugyldig trip-data => unassessable, ingen kanaler",
    (_i, data) => {
      const display = buildContactIntentDisplay({
        eligibleChannels: resolveContactChannels(data),
        rows: [],
        readFailed: false,
      });
      expect(display).toEqual({ kind: "unassessable" });
      // Ingen phone/email-tilstand overhovedet — hverken klikket eller "—".
      expect(JSON.stringify(display)).not.toMatch(/phone|email|clicked/);
    },
  );

  it("unassessable selv når der ligger en klik-række (vi ved ikke hvad der fandtes)", () => {
    expect(
      buildContactIntentDisplay({
        eligibleChannels: null,
        rows: [{ channel: "phone", last_clicked_at: "2026-09-18T14:33:40Z" }],
        readFailed: false,
      }),
    ).toEqual({ kind: "unassessable" });
  });

  it("DB read failure har forrang: unavailable, også med ugyldig trip-data", () => {
    expect(
      buildContactIntentDisplay({ eligibleChannels: null, rows: null, readFailed: true }),
    ).toEqual({ kind: "unavailable" });
  });

  it("valid trip + phone/email: available med de rigtige kanaler (uændret adfærd)", () => {
    const withEmail = buildContactIntentDisplay({
      eligibleChannels: resolveContactChannels({ advisorEmail: "a@b.dk" }),
      rows: [{ channel: "email", last_clicked_at: "2026-09-18T14:33:40Z" }],
      readFailed: false,
    });
    expect(withEmail).toEqual({
      kind: "available",
      channels: [
        { channel: "phone", clicked: false, lastClickedAt: null },
        { channel: "email", clicked: true, lastClickedAt: "2026-09-18T14:33:40Z" },
      ],
    });
    const withoutEmail = buildContactIntentDisplay({
      eligibleChannels: resolveContactChannels({}),
      rows: [],
      readFailed: false,
    });
    expect(withoutEmail).toEqual({
      kind: "available",
      channels: [{ channel: "phone", clicked: false, lastClickedAt: null }],
    });
  });
});

// ============================================================================
// C. PARITET: admin og endpoint kan aldrig være uenige om eligibility
// ============================================================================
describe("C. admin-eligibility === endpoint-eligibility (samme funktion, bevist på tværs af data)", () => {
  const SLUG = "abc123";
  const BOOKING_NO = "1234567";
  const TRIP_ID = "11111111-2222-3333-4444-555555555555";

  async function endpointWrites(data: unknown, channel: ContactChannel): Promise<boolean> {
    const recordIntent = vi.fn<ContactIntentDeps["recordIntent"]>(async () => ({ kind: "ok" }));
    await handleContactIntent(
      {
        slug: SLUG,
        body: { channel },
        accessCookieValue: BOOKING_NO,
        gate: {
          vercelEnv: "production",
          host: "rejseplaner.uniquetravel.dk",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
          cookieNames: [`trip_access_${SLUG}`],
        },
      },
      {
        loadTrip: async () => ({ id: TRIP_ID, booking_no: BOOKING_NO, data }),
        recordIntent,
      },
    );
    return recordIntent.mock.calls.length === 1;
  }

  const CASES: [string, unknown][] = [
    ["valid + advisorEmail", { advisorEmail: "a@b.dk" }],
    ["valid uden advisorEmail", { destination: "Bali" }],
    ["valid tom advisorEmail", { advisorEmail: "" }],
    ["malformed: itinerary ikke array", { itinerary: "x" }],
    ["malformed: ugyldig advisorEmail", { advisorEmail: 123 }],
    ["malformed: null", null],
    ["malformed: streng", "x"],
  ];

  it.each(CASES)("%s", async (_label, data) => {
    const admin = resolveContactChannels(data);
    for (const channel of CONTACT_CHANNELS) {
      const adminSaysEligible = admin?.includes(channel) ?? false;
      expect(await endpointWrites(data, channel)).toBe(adminSaysEligible);
    }
  });
});

// ============================================================================
// D. Fase 3 tracking-cutover — separat fra Fase 1B's TRACKING_SINCE
// ============================================================================
describe("D. CONTACT_INTENT_TRACKING_SINCE (Fase 3 cutover)", () => {
  it("er null før release-cutover, ELLERS en fast ISO-8601 UTC-streng", () => {
    expect(
      CONTACT_INTENT_TRACKING_SINCE === null ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(CONTACT_INTENT_TRACKING_SINCE),
    ).toBe(true);
    if (CONTACT_INTENT_TRACKING_SINCE !== null) {
      expect(Number.isNaN(new Date(CONTACT_INTENT_TRACKING_SINCE).getTime())).toBe(false);
    }
  });

  it("er en ANDEN, senere dato end Fase 1B's TRACKING_SINCE (hvis sat) — aldrig genbrugt", () => {
    if (CONTACT_INTENT_TRACKING_SINCE === null) return; // før cutover
    expect(CONTACT_INTENT_TRACKING_SINCE).not.toBe(TRACKING_SINCE);
    expect(new Date(CONTACT_INTENT_TRACKING_SINCE).getTime()).toBeGreaterThan(
      new Date(TRACKING_SINCE ?? 0).getTime(),
    );
  });

  it("er (hvis sat) ALDRIG migrationstidspunktet — migrationen er DB-parathed, ikke tracking-start", () => {
    // Migration 012 blev kørt i production 2026-09-19T07:43:41Z
    // (20260919074341_trip_contact_intent). Ingen kode skriver til tabellen før
    // PR #74 er deployet, så tracking-start kan ikke ligge på eller før dette
    // tidspunkt — en sådan værdi ville lade et "—" påstå dækning uden tracking.
    const MIGRATION_012_APPLIED_AT = "2026-09-19T07:43:41Z";
    if (CONTACT_INTENT_TRACKING_SINCE === null) return; // før cutover
    expect(CONTACT_INTENT_TRACKING_SINCE).not.toBe(MIGRATION_012_APPLIED_AT);
    expect(new Date(CONTACT_INTENT_TRACKING_SINCE).getTime()).toBeGreaterThan(
      new Date(MIGRATION_012_APPLIED_AT).getTime(),
    );
  });
});

// ============================================================================
// E. No-row-semantik: "—" = "intet klik siden tracking blev sat i drift"
// ============================================================================
describe("E. buildContactIntentTrackingNote (scoper hvad et '—' betyder)", () => {
  const fmt = (iso: string) => `«${iso}»`;

  it("uden cutover-dato: INGEN konkret dato — kun 'fra funktionen sættes i drift'", () => {
    const note = buildContactIntentTrackingNote(null, fmt);
    expect(note).toBe("Kontaktklik registreres fra det tidspunkt funktionen sættes i drift.");
    expect(note).not.toMatch(/\d{4}|«/); // ingen årstal/dato/formatteret værdi
    expect(note).not.toMatch(/måles fra/);
  });

  it("med cutover-dato: 'Kontaktklik måles fra <dato>.'", () => {
    expect(buildContactIntentTrackingNote("2026-09-20T09:00:00Z", fmt)).toBe(
      "Kontaktklik måles fra «2026-09-20T09:00:00Z».",
    );
  });

  it("bruger den rigtige danske datoformattering (samme som resten af admin)", () => {
    expect(buildContactIntentTrackingNote("2026-09-20T09:00:00Z", formatDateLongDK)).toBe(
      "Kontaktklik måles fra 20. september 2026.",
    );
  });

  it("ugyldig/uparsebar dato eller tom formatering falder tilbage til den dato-løse tekst", () => {
    const fallback = "Kontaktklik registreres fra det tidspunkt funktionen sættes i drift.";
    expect(buildContactIntentTrackingNote("ikke-en-dato", fmt)).toBe(fallback);
    expect(buildContactIntentTrackingNote("2026-09-20T09:00:00Z", () => "")).toBe(fallback);
  });

  it("uden cutover-dato nævner noten ALDRIG Fase 1B's TRACKING_SINCE-dato (åbningsmålingens start)", () => {
    expect(TRACKING_SINCE).not.toBeNull(); // Fase 1B's dato findes, og må ikke lække ind her
    const openingsDate = formatDateLongDK(TRACKING_SINCE as string);
    expect(openingsDate).not.toBe("");
    expect(buildContactIntentTrackingNote(null, formatDateLongDK)).not.toContain(openingsDate);
  });

  it("noten for den AKTUELLE konstant følger reglen (dato-løs indtil cutover)", () => {
    const note = buildContactIntentTrackingNote(CONTACT_INTENT_TRACKING_SINCE, formatDateLongDK);
    if (CONTACT_INTENT_TRACKING_SINCE === null) {
      expect(note).toBe("Kontaktklik registreres fra det tidspunkt funktionen sættes i drift.");
    } else {
      expect(note).toMatch(/^Kontaktklik måles fra .+\.$/);
    }
  });
});

// ============================================================================
// F. Statiske kontrakter for admin-filerne (ingen component-test-opsætning)
// ============================================================================
function code(relPath: string): string {
  const src = readFileSync(join(process.cwd(), relPath), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("F. admin-filer: samme runtime-sandhed + scopede datoer", () => {
  const page = () => code("src/app/admin/trips/[id]/page.tsx");
  const detail = () => code("src/app/admin/trips/[id]/TripDetail.tsx");

  it("admin page.tsx afleder kontakt-eligibility via resolveContactChannels(row.data) — ikke rå JSON", () => {
    expect(page()).toMatch(/resolveContactChannels\(row\.data\)/);
    expect(page()).toMatch(/eligibleChannels:\s*contactChannels/);
    expect(page()).not.toMatch(/computeEligibleChannels/);
  });

  it("TripDetail: Fase 1B's TRACKING_SINCE er eksplicit label'et som ÅBNINGSMÅLING", () => {
    expect(detail()).toMatch(/Åbningsmåling fra \{formatDateLongDK\(TRACKING_SINCE\)\}/);
    expect(detail()).not.toMatch(/Måling fra/); // ingen uscopet "Måling fra …"
  });

  it("TripDetail: Kontakt-intent-blokken bruger CONTACT_INTENT_TRACKING_SINCE — aldrig Fase 1B's TRACKING_SINCE", () => {
    const src = detail();
    const start = src.indexOf('contactIntent.kind === "unavailable"');
    const end = src.indexOf("</>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toMatch(/buildContactIntentTrackingNote\(/);
    expect(block).toMatch(/CONTACT_INTENT_TRACKING_SINCE/);
    expect(block).not.toMatch(/\bTRACKING_SINCE\b/); // \b: CONTACT_INTENT_TRACKING_SINCE matcher ikke
  });

  it("TripDetail: 'kunne ikke vurderes' vises for unassessable og ligner aldrig et '—'", () => {
    const src = detail();
    expect(src).toMatch(/contactIntent\.kind === "unassessable"/);
    expect(src).toMatch(/Kontaktaktivitet kunne ikke vurderes/);
    expect(src).toMatch(/Kontaktaktivitet kunne ikke hentes/);
  });
});
