import { describe, it, expect } from "vitest";
import { isPdf } from "./file-sniff";

describe("isPdf", () => {
  it("godkender en buffer der starter med %PDF-", () => {
    expect(isPdf(Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n"))).toBe(true);
  });

  it("godkender %PDF- efter et par bytes junk (BOM/kommentar), inden for scan-vinduet", () => {
    const junk = Buffer.alloc(10, 0x20); // 10 mellemrum
    const pdf = Buffer.concat([junk, Buffer.from("%PDF-1.7")]);
    expect(isPdf(pdf)).toBe(true);
  });

  it("afviser en PNG (forkerte magic bytes)", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isPdf(png)).toBe(false);
  });

  it("afviser almindelig tekst der bare hedder noget med pdf", () => {
    expect(isPdf(Buffer.from("dette er ikke en pdf-fil, bare tekst"))).toBe(false);
  });

  it("afviser en tom buffer", () => {
    expect(isPdf(Buffer.alloc(0))).toBe(false);
  });

  it("afviser hvis %PDF- først dukker op udenfor scan-vinduet", () => {
    const junk = Buffer.alloc(2000, 0x20);
    const pdf = Buffer.concat([junk, Buffer.from("%PDF-1.4")]);
    expect(isPdf(pdf)).toBe(false);
  });
});
