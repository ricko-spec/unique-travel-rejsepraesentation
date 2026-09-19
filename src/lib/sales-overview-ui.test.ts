import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Fase 4 (Issue #76): kontrakter for UI-forbindelserne. Repoet har ingen
// component-test-opsætning, og komponenterne er bevidst tynde (al beslutningslogik er
// unit-testet i src/lib/sales-overview*.ts). Disse scans låser de forbindelser der
// ikke kan udtrykkes som ren logik: hvad UI'et viser når, og at intet fortolkes.

function code(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("SalesOverviewTable", () => {
  const src = code("src/app/admin/SalesOverviewTable.tsx");

  it("starter i den godkendte default-visning og bruger applyView + paginate", () => {
    expect(src).toMatch(/useState<SalesViewState>\(DEFAULT_VIEW\)/);
    expect(src).toMatch(/applyView\(trips, view\)/);
    expect(src).toMatch(/paginate\(matched, visibleCount\)/);
  });

  it("'Mine'-filteret vises KUN når den indloggedes profil har advisor_match_name (viewer.mineAvailable)", () => {
    expect(src).toMatch(/viewer\.mineAvailable\s*&&/);
    // og der findes ikke et ubetinget Mine-valg uden for den blok
    const beforeGuard = src.slice(0, src.indexOf("viewer.mineAvailable"));
    expect(beforeGuard).not.toMatch(/COPY\.mineOptions/);
  });

  it("de tre filtre + tre sorteringer + den eksisterende søgning er til stede", () => {
    expect(src).toMatch(/COPY\.activityOptions/);
    expect(src).toMatch(/COPY\.sortOptions/);
    expect(src).toMatch(/COPY\.filters\.showInactive/);
    expect(src).toMatch(/type="search"/);
    expect(src).toMatch(/placeholder=\{COPY\.searchPlaceholder\}/);
  });

  it("aktiv søgning viser ALLE match (som før Fase 4); ellers pagineres i sider á PAGE_SIZE", () => {
    expect(src).toMatch(/searching \? matched : paginate\(matched, visibleCount\)/);
    expect(src).toMatch(/setVisibleCount\(\(n\) => n \+ PAGE_SIZE\)/);
  });

  it("nyt filter/sortering nulstiller til første side", () => {
    expect(src).toMatch(/setVisibleCount\(PAGE_SIZE\)/);
  });

  it("degraderede kilder vises i en synlig bemærkning — rækkerne udelades aldrig", () => {
    expect(src).toMatch(/degraded\.length > 0/);
    expect(src).toMatch(/COPY\.degradedBanner/);
    expect(src).not.toMatch(/\.filter\([^)]*degraded/);
  });

  it("alle tre aktivitetskolonner renderes via de testede tekst-funktioner (ingen egne tekster)", () => {
    expect(src).toMatch(/openedLines\(row\.opened\)/);
    expect(src).toMatch(/sectionsLines\(row\.sections\)/);
    expect(src).toMatch(/contactLines\(row\.contact\)/);
    expect(src).toMatch(/lastActivityText\(t\.lastActivityAt\)/);
  });

  it("intet i komponenten blokerer/ændrer data: ingen skrivning, cookie eller storage", () => {
    expect(src).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.cookie|preventDefault/);
  });
});

describe("AdminDashboard", () => {
  const src = code("src/app/admin/AdminDashboard.tsx");

  it("bruger salgsoversigten, og genindlæsning efter handlinger er STILLE (nulstiller ikke filtre)", () => {
    expect(src).toMatch(/<SalesOverviewTable/);
    expect(src).toMatch(/loadTrips\(true\)/);
    expect(src).toMatch(/if \(!silent\)/);
  });

  it("henter hele listen (også deaktiverede) — bruges til at genkende eksisterende bookingnumre ved upload", () => {
    expect(src).toMatch(/trips\.find\(\(t\) => t\.booking_no === trip\.bookingNo\)/);
  });

  it("modtager kun det kompakte DTO (viewer + degraded) — ingen rå felter refereres", () => {
    expect(src).toMatch(/j\.viewer\?\.mineAvailable/);
    expect(src).toMatch(/j\.degraded/);
    expect(src).not.toMatch(/raw_pdf_text|created_by\b|\.data\b/);
  });
});
