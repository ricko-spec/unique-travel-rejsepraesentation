import { describe, it, expect } from "vitest";
import {
  CONTACT_CHANNELS,
  isContactChannel,
  contactIntentBodySchema,
  computeEligibleChannels,
  shouldRecordContactIntent,
  shouldSendChannel,
  buildContactIntentDisplay,
  type ContactChannel,
} from "./contact-intent";

// ============================================================================
// A. Kanal-enum — kun email og phone
// ============================================================================
describe("A. channel enum", () => {
  it("CONTACT_CHANNELS er præcis email og phone", () => {
    expect(CONTACT_CHANNELS).toEqual(["email", "phone"]);
  });

  it("isContactChannel accepterer kun de to kendte værdier", () => {
    expect(isContactChannel("email")).toBe(true);
    expect(isContactChannel("phone")).toBe(true);
  });

  it("isContactChannel afviser alt andet — inkl. #kontakt-navigation og ikke-strenge", () => {
    for (const bad of ["kontakt", "contact", "Email", "PHONE", "sms", "", null, undefined, 1, {}]) {
      expect(isContactChannel(bad)).toBe(false);
    }
  });
});

// ============================================================================
// B. Strict body-schema (delt med endpointet)
// ============================================================================
describe("B. contactIntentBodySchema (strict)", () => {
  it("accepterer { channel: 'email' } og { channel: 'phone' }", () => {
    expect(contactIntentBodySchema.safeParse({ channel: "email" }).success).toBe(true);
    expect(contactIntentBodySchema.safeParse({ channel: "phone" }).success).toBe(true);
  });

  it("afviser en ukendt channel", () => {
    for (const channel of ["sms", "kontakt", "whatsapp", "", "Email"]) {
      expect(contactIntentBodySchema.safeParse({ channel }).success).toBe(false);
    }
  });

  it("afviser en manglende/ikke-streng channel og ikke-objekt bodies", () => {
    expect(contactIntentBodySchema.safeParse({}).success).toBe(false);
    expect(contactIntentBodySchema.safeParse({ channel: 1 }).success).toBe(false);
    expect(contactIntentBodySchema.safeParse({ channel: null }).success).toBe(false);
    expect(contactIntentBodySchema.safeParse(null).success).toBe(false);
    expect(contactIntentBodySchema.safeParse("phone").success).toBe(false);
    expect(contactIntentBodySchema.safeParse(["phone"]).success).toBe(false);
  });

  it("afviser ekstra nøgler — et forsøgt trip_id kan aldrig vælges af klienten", () => {
    expect(
      contactIntentBodySchema.safeParse({ channel: "phone", trip_id: "11111111-1111-1111-1111-111111111111" })
        .success,
    ).toBe(false);
    expect(contactIntentBodySchema.safeParse({ channel: "email", tripId: "x" }).success).toBe(false);
    expect(contactIntentBodySchema.safeParse({ channel: "email", booking_no: "123" }).success).toBe(
      false,
    );
    expect(contactIntentBodySchema.safeParse({ channel: "phone", source: "sticky" }).success).toBe(
      false,
    );
  });
});

// ============================================================================
// C. Eligibility
// ============================================================================
describe("C. computeEligibleChannels", () => {
  it("email + advisorEmail => email OG phone er eligible", () => {
    expect(computeEligibleChannels({ advisorEmail: "raadgiver@uniquetravel.dk" })).toEqual([
      "email",
      "phone",
    ]);
  });

  it("email uden advisorEmail => kun phone er eligible", () => {
    expect(computeEligibleChannels({ advisorEmail: null })).toEqual(["phone"]);
    expect(computeEligibleChannels({ advisorEmail: undefined })).toEqual(["phone"]);
    expect(computeEligibleChannels({ advisorEmail: "" })).toEqual(["phone"]);
  });

  it("phone er ALTID eligible (ActionBar har altid et faktisk tel:-link)", () => {
    expect(computeEligibleChannels({ advisorEmail: null })).toContain("phone");
    expect(computeEligibleChannels({ advisorEmail: "a@b.dk" })).toContain("phone");
  });
});

// ============================================================================
// D. Gate — samme fire betingelser som Fase 1B/2
// ============================================================================
describe("D. shouldRecordContactIntent (gate)", () => {
  const validInput = () => ({
    vercelEnv: "production",
    host: "rejseplaner.uniquetravel.dk",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
    cookieNames: ["trip_access_abc123"],
  });

  it("canonical production + kundeadgang => allowed", () => {
    expect(shouldRecordContactIntent(validInput())).toBe(true);
  });

  it("preview/development/ukendt env => no write", () => {
    for (const vercelEnv of ["preview", "development", undefined]) {
      expect(shouldRecordContactIntent({ ...validInput(), vercelEnv })).toBe(false);
    }
  });

  it("ikke-kanonisk host (fx Vercel branch-alias) => no write", () => {
    expect(
      shouldRecordContactIntent({
        ...validInput(),
        host: "unique-travel-rejsepraesentation-git-main-unique-travel.vercel.app",
      }),
    ).toBe(false);
  });

  it("bot UA => no write", () => {
    for (const userAgent of ["Googlebot/2.1", "curl/8.4.0", "", null]) {
      expect(shouldRecordContactIntent({ ...validInput(), userAgent })).toBe(false);
    }
  });

  it("admin auth-cookie til stede => no write", () => {
    expect(
      shouldRecordContactIntent({
        ...validInput(),
        cookieNames: ["trip_access_abc123", "sb-iunixfpthdftmkgpugex-auth-token"],
      }),
    ).toBe(false);
  });
});

// ============================================================================
// E. Dedup pr. page load
// ============================================================================
describe("E. shouldSendChannel (dedup)", () => {
  it("email sendes første gang, ikke anden gang", () => {
    const sent = new Set<ContactChannel>();
    expect(shouldSendChannel(sent, "email")).toBe(true);
    sent.add("email");
    expect(shouldSendChannel(sent, "email")).toBe(false);
  });

  it("phone sendes første gang, ikke anden gang", () => {
    const sent = new Set<ContactChannel>();
    expect(shouldSendChannel(sent, "phone")).toBe(true);
    sent.add("phone");
    expect(shouldSendChannel(sent, "phone")).toBe(false);
  });

  it("email og phone kan BEGGE sendes én gang på samme page load", () => {
    const sent = new Set<ContactChannel>();
    sent.add("email");
    expect(shouldSendChannel(sent, "phone")).toBe(true);
    sent.add("phone");
    expect(shouldSendChannel(sent, "email")).toBe(false);
    expect(shouldSendChannel(sent, "phone")).toBe(false);
  });

  it("en frisk Set (nyt page load) kan sende igen — DB opdaterer kun last_clicked_at", () => {
    expect(shouldSendChannel(new Set<ContactChannel>(), "phone")).toBe(true);
  });
});

// ============================================================================
// F. Admin-visning — "Kontakt-intent"
// ============================================================================
describe("F. buildContactIntentDisplay", () => {
  const bothEligible: ContactChannel[] = ["email", "phone"];
  const CLICKED_AT = "2026-09-18T14:33:40Z";

  it("phone klikket: clicked=true med senest-klikket-tidspunkt", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: ["phone"],
      rows: [{ channel: "phone", last_clicked_at: CLICKED_AT }],
      readFailed: false,
    });
    expect(result).toEqual({
      kind: "available",
      channels: [{ channel: "phone", clicked: true, lastClickedAt: CLICKED_AT }],
    });
  });

  it("phone ikke klikket: clicked=false, intet tidspunkt", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: ["phone"],
      rows: [],
      readFailed: false,
    });
    expect(result).toEqual({
      kind: "available",
      channels: [{ channel: "phone", clicked: false, lastClickedAt: null }],
    });
  });

  it("email eligible + klikket", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: bothEligible,
      rows: [{ channel: "email", last_clicked_at: CLICKED_AT }],
      readFailed: false,
    });
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.channels.find((c) => c.channel === "email")).toEqual({
      channel: "email",
      clicked: true,
      lastClickedAt: CLICKED_AT,
    });
    expect(result.channels.find((c) => c.channel === "phone")?.clicked).toBe(false);
  });

  it("email eligible + ikke klikket", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: bothEligible,
      rows: [{ channel: "phone", last_clicked_at: CLICKED_AT }],
      readFailed: false,
    });
    if (result.kind !== "available") throw new Error("forventede available");
    expect(result.channels.find((c) => c.channel === "email")).toEqual({
      channel: "email",
      clicked: false,
      lastClickedAt: null,
    });
  });

  it("email ineligible UDELADES helt — også hvis der ligger en gammel email-række", () => {
    const withoutRow = buildContactIntentDisplay({
      eligibleChannels: ["phone"],
      rows: [],
      readFailed: false,
    });
    const withStaleRow = buildContactIntentDisplay({
      eligibleChannels: ["phone"],
      rows: [{ channel: "email", last_clicked_at: CLICKED_AT }],
      readFailed: false,
    });
    for (const result of [withoutRow, withStaleRow]) {
      if (result.kind !== "available") throw new Error("forventede available");
      expect(result.channels.map((c) => c.channel)).toEqual(["phone"]);
    }
  });

  it("visningsrækkefølge er telefon, dernæst email", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: bothEligible,
      rows: [],
      readFailed: false,
    });
    if (result.kind !== "available") throw new Error("forventede available");
    expect(result.channels.map((c) => c.channel)).toEqual(["phone", "email"]);
  });

  it("DB read failure => unavailable, ALDRIG 'ikke klikket' — uafhængigt af rows", () => {
    expect(
      buildContactIntentDisplay({ eligibleChannels: bothEligible, rows: null, readFailed: true }),
    ).toEqual({ kind: "unavailable" });
    expect(
      buildContactIntentDisplay({
        eligibleChannels: bothEligible,
        rows: [{ channel: "phone", last_clicked_at: CLICKED_AT }],
        readFailed: true,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("malformed/ukendt channel-række ignoreres sikkert — ingen falsk signal, ikke unavailable", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: bothEligible,
      rows: [
        { channel: "sms", last_clicked_at: CLICKED_AT },
        { channel: "kontakt", last_clicked_at: CLICKED_AT },
        { channel: null, last_clicked_at: CLICKED_AT },
        {},
      ],
      readFailed: false,
    });
    expect(result).toEqual({
      kind: "available",
      channels: [
        { channel: "phone", clicked: false, lastClickedAt: null },
        { channel: "email", clicked: false, lastClickedAt: null },
      ],
    });
  });

  it("gyldig channel med ugyldigt tidsstempel => clicked=true, intet tidspunkt (ingen crash)", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: ["phone"],
      rows: [{ channel: "phone", last_clicked_at: "ikke-en-dato" }],
      readFailed: false,
    });
    expect(result).toEqual({
      kind: "available",
      channels: [{ channel: "phone", clicked: true, lastClickedAt: null }],
    });
  });

  it("rows=null (ingen data, ingen fejl) => alle eligible kanaler ikke klikket", () => {
    const result = buildContactIntentDisplay({
      eligibleChannels: bothEligible,
      rows: null,
      readFailed: false,
    });
    if (result.kind !== "available") throw new Error("forventede available");
    expect(result.channels.every((c) => !c.clicked)).toBe(true);
  });
});
