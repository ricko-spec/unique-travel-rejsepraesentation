import { describe, it, expect } from "vitest";
import { sanitizeHotelWebsite } from "./hotel-website";

describe("sanitizeHotelWebsite", () => {
  it("accepterer en gyldig https-URL", () => {
    expect(sanitizeHotelWebsite("https://www.example-resort.com")).toBe(
      "https://www.example-resort.com/",
    );
  });

  it("accepterer en gyldig http-URL", () => {
    expect(sanitizeHotelWebsite("http://example-resort.com")).toBe("http://example-resort.com/");
  });

  it("trimmer whitespace omkring URL'en", () => {
    expect(sanitizeHotelWebsite("  https://example.com  ")).toBe("https://example.com/");
  });

  it("afviser tom streng", () => {
    expect(sanitizeHotelWebsite("")).toBeNull();
    expect(sanitizeHotelWebsite("   ")).toBeNull();
  });

  it("afviser null/undefined uden at kaste", () => {
    expect(sanitizeHotelWebsite(null)).toBeNull();
    expect(sanitizeHotelWebsite(undefined)).toBeNull();
  });

  it("afviser en malformed URL (ingen protokol)", () => {
    expect(sanitizeHotelWebsite("example-resort.com")).toBeNull();
    expect(sanitizeHotelWebsite("www.example.com")).toBeNull();
  });

  it("afviser protokol-relative URLs i stedet for at gætte https://", () => {
    expect(sanitizeHotelWebsite("//example.com")).toBeNull();
  });

  it("afviser javascript:-URLs", () => {
    expect(sanitizeHotelWebsite("javascript:alert(1)")).toBeNull();
  });

  it("afviser data:-URLs", () => {
    expect(sanitizeHotelWebsite("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("afviser mailto:-URLs", () => {
    expect(sanitizeHotelWebsite("mailto:hotel@example.com")).toBeNull();
  });

  it("afviser rene bogstavsuppe/tekst", () => {
    expect(sanitizeHotelWebsite("Ikke en URL")).toBeNull();
  });
});
