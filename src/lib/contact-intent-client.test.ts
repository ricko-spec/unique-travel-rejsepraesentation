import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  trackContactIntent,
  contactIntentUrl,
  type ContactIntentFetch,
} from "./contact-intent-client";
import type { ContactChannel } from "./contact-intent";

// Klient-beslutningslogikken for kontakt-intent. trackContactIntent() er den
// FAKTISKE funktion ContactIntentProvider/ContactIntentLink kalder ved et klik
// (komponenten er en ekstremt tynd wrapper) — testet uden browser via en
// injiceret fetch.

const SLUG = "abc123";

function okFetch() {
  return vi.fn<ContactIntentFetch>(async () => ({ ok: true }));
}

// ============================================================================
// A. Klik sender den rigtige kanal — og kun kanalen
// ============================================================================
describe("A. click => request", () => {
  it("email-klik sender { channel: 'email' } til /<slug>/intent", () => {
    const fetchImpl = okFetch();
    const sent = new Set<ContactChannel>();
    expect(trackContactIntent({ sent, channel: "email", slug: SLUG, fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/abc123/intent");
    expect(JSON.parse(init.body)).toEqual({ channel: "email" });
  });

  it("phone-klik sender { channel: 'phone' }", () => {
    const fetchImpl = okFetch();
    trackContactIntent({ sent: new Set(), channel: "phone", slug: SLUG, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ channel: "phone" });
  });

  it("transport: POST + JSON + same-origin + keepalive (overlever mailto:/tel:-navigation)", () => {
    const fetchImpl = okFetch();
    trackContactIntent({ sent: new Set(), channel: "phone", slug: SLUG, fetchImpl });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.credentials).toBe("same-origin");
    expect(init.keepalive).toBe(true);
  });

  it("body indeholder KUN channel — aldrig trip_id, bookingnummer, slug eller andet", () => {
    const fetchImpl = okFetch();
    trackContactIntent({ sent: new Set(), channel: "email", slug: SLUG, fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(Object.keys(body)).toEqual(["channel"]);
    expect(fetchImpl.mock.calls[0][1].body).not.toContain(SLUG);
  });

  it("endpointet er nested under kundens egen slug-path (cookie-scope), ikke /api", () => {
    expect(contactIntentUrl("min-rejse")).toBe("/min-rejse/intent");
    expect(contactIntentUrl("min-rejse")).not.toContain("/api");
  });
});

// ============================================================================
// B. Dedup pr. page load
// ============================================================================
describe("B. dedup", () => {
  it("samme kanal sendes højst én gang", () => {
    const fetchImpl = okFetch();
    const sent = new Set<ContactChannel>();
    expect(trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl })).toBe(true);
    expect(trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl })).toBe(false);
    expect(trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("email og phone kan begge sendes én gang på samme page load", () => {
    const fetchImpl = okFetch();
    const sent = new Set<ContactChannel>();
    trackContactIntent({ sent, channel: "email", slug: SLUG, fetchImpl });
    trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl });
    trackContactIntent({ sent, channel: "email", slug: SLUG, fetchImpl });
    trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((c) => JSON.parse(c[1].body).channel)).toEqual([
      "email",
      "phone",
    ]);
  });

  it("nyt page load (frisk Set) sender igen", () => {
    const fetchImpl = okFetch();
    trackContactIntent({ sent: new Set(), channel: "phone", slug: SLUG, fetchImpl });
    trackContactIntent({ sent: new Set(), channel: "phone", slug: SLUG, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// C. Tracking kan aldrig forstyrre kontakthandlingen
// ============================================================================
describe("C. fejl blokerer/forstyrrer aldrig", () => {
  it("afvist request: ingen throw, ingen unhandled rejection, INGEN retry", async () => {
    const fetchImpl = vi.fn<ContactIntentFetch>(() => Promise.reject(new Error("netværk nede")));
    const sent = new Set<ContactChannel>();
    expect(() =>
      trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // lad rejection nå at blive (u)håndteret
    // Næste klik på samme kanal retry'er ikke — kanalen er allerede markeret.
    expect(trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetch der kaster SYNKRONT: ingen throw og ingen retry", () => {
    const fetchImpl = vi.fn<ContactIntentFetch>(() => {
      throw new TypeError("Failed to fetch");
    });
    const sent = new Set<ContactChannel>();
    expect(() =>
      trackContactIntent({ sent, channel: "email", slug: SLUG, fetchImpl }),
    ).not.toThrow();
    expect(trackContactIntent({ sent, channel: "email", slug: SLUG, fetchImpl })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("serversvar (også 4xx/5xx) ignoreres — ingen throw, ingen retry", async () => {
    const fetchImpl = vi.fn<ContactIntentFetch>(async () => ({ ok: false, status: 500 }));
    const sent = new Set<ContactChannel>();
    trackContactIntent({ sent, channel: "phone", slug: SLUG, fetchImpl });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("afventer ALDRIG serversvaret: returnerer synkront selv om requesten aldrig afsluttes", () => {
    const hanging = vi.fn<ContactIntentFetch>(() => new Promise(() => {}));
    const result = trackContactIntent({
      sent: new Set(),
      channel: "phone",
      slug: SLUG,
      fetchImpl: hanging,
    });
    expect(result).toBe(true); // returneret straks — klikket er ikke blevet forsinket
  });

  it("uden tilgængelig fetch: no-op, ingen throw", () => {
    const original = globalThis.fetch;
    // @ts-expect-error — simulerer et miljø uden fetch
    globalThis.fetch = undefined;
    try {
      expect(() =>
        trackContactIntent({ sent: new Set(), channel: "phone", slug: SLUG }),
      ).not.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ============================================================================
// D. Komponent-kontrakter (statisk scan af de faktiske kildefiler)
// ============================================================================
// DOM-anchor-klik kan ikke afprøves uden en browser/jsdom (repoet har ingen
// component-test-opsætning), og wrapperen er bevidst ekstremt tynd. Disse
// scans låser derfor de kontrakter der ikke kan udtrykkes som ren logik: at
// klik-handleren aldrig blokerer navigationen, og præcis HVILKE links der er
// tracked / ikke tracked.
function code(relPath: string): string {
  const src = readFileSync(join(process.cwd(), relPath), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("D. komponent-kontrakter", () => {
  const link = () => code("src/components/trip/ContactIntentLink.tsx");

  it("ContactIntentLink blokerer aldrig navigationen (ingen preventDefault/stopPropagation/await)", () => {
    expect(link()).not.toMatch(/preventDefault|stopPropagation|stopImmediatePropagation/);
    expect(link()).not.toMatch(/\bawait\b|\basync\b/);
    expect(link()).not.toMatch(/window\.open|location\.(href|assign|replace)|target=/);
  });

  it("ingen cookie/localStorage/sessionStorage i click-sti eller helper", () => {
    for (const file of [
      "src/components/trip/ContactIntentLink.tsx",
      "src/lib/contact-intent-client.ts",
      "src/lib/contact-intent.ts",
    ]) {
      expect(code(file)).not.toMatch(/localStorage|sessionStorage|document\.cookie|cookies\(\)/);
    }
  });

  it("linket er et almindeligt <a href> hvis onClick KUN kalder track() som side-effect", () => {
    expect(link()).toMatch(/<a\s[^>]*href=\{href\}/);
    expect(link()).toMatch(/onClick=\{\(\) => track\?\.\(channel\)\}/);
  });

  it("ContactCTA: email + rådgiver-telefon er tracked; ingen 'rå' <a> tilbage", () => {
    const cta = code("src/components/trip/ContactCTA.tsx");
    expect(cta).toMatch(/<ContactIntentLink\s+channel="email"/);
    expect(cta).toMatch(/<ContactIntentLink\s+channel="phone"/);
    expect(cta).not.toMatch(/<a[\s>]/); // hvert anker går gennem den tracked komponent
  });

  it("ActionBar: 'Ring' er tracked (phone); 'Kontakt os' -> #kontakt er et UNTRACKED almindeligt <a>", () => {
    const bar = code("src/components/trip/ActionBar.tsx");
    expect(bar).toMatch(/<ContactIntentLink\s+channel="phone"[^>]*href="tel:\+4559498630"/);
    expect(bar.match(/<ContactIntentLink/g)).toHaveLength(1); // kun Ring
    expect(bar).toMatch(/<a className="action-contact" href="#kontakt">/);
  });
});
