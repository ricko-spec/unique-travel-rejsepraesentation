import { describe, it, expect } from "vitest";
import { formatShortSha } from "./build-info";

describe("formatShortSha", () => {
  it("korter en fuld 40-tegns SHA til 7 tegn", () => {
    expect(formatShortSha("fa1eade47b73733d6312d5abfad33ce9e4068081")).toBe("fa1eade");
  });

  it("lader en allerede kort (7-tegns) SHA være uændret", () => {
    expect(formatShortSha("0875a7a")).toBe("0875a7a");
  });

  it("giver null ved manglende værdi (lokal dev uden Vercel)", () => {
    expect(formatShortSha(undefined)).toBeNull();
    expect(formatShortSha(null)).toBeNull();
    expect(formatShortSha("")).toBeNull();
  });

  it("giver null ved tomt/whitespace-only input", () => {
    expect(formatShortSha("   ")).toBeNull();
  });

  it("giver null ved malformed værdi i stedet for at vise noget forkert", () => {
    expect(formatShortSha("ikke-en-sha!")).toBeNull();
    expect(formatShortSha("<script>alert(1)</script>")).toBeNull();
    expect(formatShortSha("12345")).toBeNull(); // for kort til at være en reel SHA
  });

  it("trimmer omgivende whitespace før validering", () => {
    expect(formatShortSha("  0875a7a  ")).toBe("0875a7a");
  });

  it("er case-insensitiv på hex-tegn (git-SHA'er er lowercase, men skal ikke fejle på store bogstaver)", () => {
    expect(formatShortSha("FA1EADE47B73733D6312D5ABFAD33CE9E4068081")).toBe("FA1EADE");
  });
});
