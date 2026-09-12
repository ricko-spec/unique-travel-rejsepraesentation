import { describe, it, expect } from "vitest";
import { splitIntro } from "./hero-intro";

const LONG_TAIL =
  "Fra Kuala Lumpurs energi til Borneos orangutanger og Perhentian Islands hvide strande, samlet i en skraeddersyet kombinationsrejse med god tid hvert sted.";

describe("splitIntro", () => {
  it("bruger foerste saetning som anslag og resten som broedtekst", () => {
    const lead = "Atten dage gennem Malaysias tre ansigter, storby, regnskov og oe.";
    const { lead: l, rest, leadTruncated } = splitIntro(`${lead} ${LONG_TAIL}`);
    expect(l).toBe(lead);
    expect(rest).toBe(LONG_TAIL);
    expect(leadTruncated).toBe(false);
  });

  it("kort intro staar alene uden foldeknap", () => {
    const { lead, rest } = splitIntro("En rolig uge paa Bali.");
    expect(lead).toBe("En rolig uge paa Bali.");
    expect(rest).toBe("");
  });

  it("punktum efter tal er ikke et saetningsslut", () => {
    // "26. juni" ville ellers give et anslag paa tre tegn.
    const text =
      "I rejser ud 26. juni og lander i Kuala Lumpur dagen efter, klar til tre uger i Malaysia. " +
      LONG_TAIL;
    const { lead } = splitIntro(text);
    expect(lead.startsWith("I rejser ud 26. juni")).toBe(true);
    expect(lead.endsWith("i Malaysia.")).toBe(true);
  });

  it("uden brugbar saetningsgraense brydes der ved en ordgraense", () => {
    const text = Array.from({ length: 60 }, (_, i) => `ord${i}`).join(" ");
    const { lead, rest, leadTruncated } = splitIntro(text);
    expect(leadTruncated).toBe(true);
    expect(lead.endsWith(" ")).toBe(false);
    expect(`${lead} ${rest}`).toBe(text);
  });

  it("hele teksten bevares, uanset hvor der brydes", () => {
    const text = `${"Et anslag der er langt nok til at taelle som en saetning."} ${LONG_TAIL}`;
    const { lead, rest } = splitIntro(text);
    expect(`${lead} ${rest}`.trim()).toBe(text);
  });

  it("tom og manglende vaerdi", () => {
    expect(splitIntro("")).toEqual({ lead: "", rest: "", leadTruncated: false });
    expect(splitIntro(null)).toEqual({ lead: "", rest: "", leadTruncated: false });
    expect(splitIntro(undefined)).toEqual({ lead: "", rest: "", leadTruncated: false });
  });
});
