import { describe, it, expect } from "vitest";
import {
  classifyParseFailure,
  parseErrorMessage,
  parseErrorStatus,
  type ParseErrorKind,
} from "./parse-errors";

const kindOf = (message: string, extra: { status?: number; claudeReplied?: boolean } = {}) =>
  classifyParseFailure({ message, ...extra });

describe("classifyParseFailure", () => {
  it("billing genkendes på Anthropics rå tekst", () => {
    expect(
      kindOf("Your credit balance is too low to access the Anthropic API"),
    ).toBe("billing");
    expect(kindOf("400 {\"type\":\"error\",\"error\":{\"message\":\"billing issue\"}}")).toBe(
      "billing",
    );
  });

  it("manglende eller forkert nøgle er en driftsfejl, ikke en PDF-fejl", () => {
    expect(kindOf("ANTHROPIC_API_KEY ikke konfigureret")).toBe("config");
    expect(kindOf("invalid x-api-key", { status: 401 })).toBe("config");
    expect(kindOf("noget andet", { status: 403 })).toBe("config");
  });

  it("Claude svarede men ikke med JSON — det er transient, ikke en dårlig PDF", () => {
    // De tre faktiske production-fejl (sep. 2026) var alle gyldige TravelWire-PDF'er,
    // hvor modellen indledte med prosa. Et nyt forsøg er den rigtige handling.
    expect(
      kindOf("Claude returnerede ikke gyldig JSON. Forsøg igen.", { claudeReplied: true }),
    ).toBe("transient");
  });

  it("429 og 5xx er transient", () => {
    expect(kindOf("Rate limit", { status: 429 })).toBe("transient");
    expect(kindOf("Overloaded", { status: 529 })).toBe("transient");
    expect(kindOf("Internal server error", { status: 500 })).toBe("transient");
  });

  it("netværk og timeout er transient", () => {
    expect(kindOf("fetch failed")).toBe("transient");
    expect(kindOf("Request timed out")).toBe("transient");
    expect(kindOf("connect ETIMEDOUT 1.2.3.4:443")).toBe("transient");
    expect(kindOf("socket hang up")).toBe("transient");
  });

  it("Anthropics dokumentafvisning er en PDF-fejl", () => {
    // De to første er de faktiske API-svar, verificeret ved at sende en tom og
    // en korrupt PDF gennem produktionsmodellen (sep. 2026).
    expect(
      kindOf(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.document.source.base64: PDF cannot be empty"}}',
        { status: 400 },
      ),
    ).toBe("unreadable");
    expect(
      kindOf(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.pdf.source.base64.data: The PDF specified was not valid."}}',
        { status: 400 },
      ),
    ).toBe("unreadable");
    expect(kindOf("Could not process pdf", { status: 400 })).toBe("unreadable");
    expect(kindOf("The document is malformed", { status: 400 })).toBe("unreadable");
    expect(kindOf("unsupported file type", { status: 400 })).toBe("unreadable");
  });

  it("404 er en udgaaet/forkert model, ikke en daarlig PDF", () => {
    expect(
      kindOf('404 {"type":"error","error":{"type":"not_found_error","message":"model: gammel-model"}}', {
        status: 404,
      }),
    ).toBe("config");
  });

  it("ukendte fejl falder tilbage til PDF-fejl frem for at afsløre teknik", () => {
    expect(kindOf("Ingen tekst i Claude-svaret")).toBe("unreadable");
    expect(kindOf("Ukendt fejl ved parsing")).toBe("unreadable");
    expect(kindOf("")).toBe("unreadable");
  });

  it("billing vinder over status-koden", () => {
    // Anthropic sender billing som 400 — den må ikke ende som 'unreadable'
    expect(kindOf("Your credit balance is too low", { status: 400 })).toBe("billing");
  });
});

describe("parseErrorMessage / parseErrorStatus", () => {
  const alle: ParseErrorKind[] = ["billing", "config", "transient", "unreadable"];

  it("hver fejltype har en dansk besked uden teknisk indhold", () => {
    for (const k of alle) {
      const m = parseErrorMessage(k);
      expect(m.length).toBeGreaterThan(20);
      // ingen teknik-lækage til sælgeren
      expect(m).not.toMatch(/JSON|schema|Zod|Anthropic|API_KEY|stack|undefined|\bnull\b/i);
    }
  });

  it("teksterne er dem Ricko har bedt om", () => {
    expect(parseErrorMessage("unreadable")).toBe(
      "PDF'en kunne ikke læses. Tjek at det er en TravelWire-rejsebeskrivelse, og prøv igen.",
    );
    expect(parseErrorMessage("transient")).toBe(
      "Rejseplanen kunne ikke læses lige nu. Prøv igen om lidt.",
    );
  });

  it("billing-beskeden er bevaret ordret fra før", () => {
    expect(parseErrorMessage("billing")).toBe(
      "AI-parseren kan ikke køre lige nu, fordi API-kontoen mangler credits. Kontakt Ricko/admin.",
    );
  });

  it("status-koderne matcher fejltypen", () => {
    expect(parseErrorStatus("billing")).toBe(502);
    expect(parseErrorStatus("config")).toBe(502);
    expect(parseErrorStatus("transient")).toBe(503);
    expect(parseErrorStatus("unreadable")).toBe(422);
  });
});
