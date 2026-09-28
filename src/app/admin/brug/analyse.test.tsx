// Issue #92 — Analyse (/admin/brug): tre faner, URL-tilstand, to tilstande af
// salgsoversigten (admin-forsiden vs. Kundeadfærd), fejltilstande og at den
// komplette adfærds- og konverteringsvisning kun findes ét sted.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SalesOverviewTable } from "../SalesOverviewTable";
import { AnalyseTabs } from "./AnalyseTabs";
import { CustomerBehaviorView } from "./CustomerBehaviorPanel";
import { ANALYSE_TABS, DEFAULT_ANALYSE_TAB, analyseTabHref, nextTabIndex, parseAnalyseTab } from "./analyse-tabs";
import { fetchSalesOverview } from "@/lib/sales-overview-client";
import { COPY } from "@/lib/sales-overview-copy";
import type { SalesOverview, SalesOverviewRow } from "@/lib/sales-overview-types";

function row(over: Partial<SalesOverviewRow> & { id: string }): SalesOverviewRow {
  return {
    booking_no: "35001",
    slug: `s-${over.id}`,
    destination: "Bali",
    customer_name: "Kunde",
    active: true,
    created_at: "2026-09-19T10:00:00.000Z",
    opened: { kind: "not-opened" },
    sections: { kind: "none-registered" },
    contact: { kind: "none-registered" },
    ...over,
  };
}

const OVERVIEW: SalesOverview = {
  trips: [
    row({ id: "1", booking_no: "35001", lastActivityAt: "2026-09-27T10:00:00.000Z", opened: { kind: "opened", visitCount: 2, lastOpenedAt: "2026-09-27T10:00:00.000Z" } }),
    row({ id: "2", booking_no: "35002" }),
  ],
  viewer: { mineAvailable: true },
  degraded: [],
};

const noop = () => undefined;
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const headers = (markup: string) => Array.from(markup.matchAll(/<th>([^<]*)<\/th>/g), (m) => m[1]);

describe("faner og URL-tilstand", () => {
  it("tre faner i fast rækkefølge; Kundeadfærd er standard; ukendt/manglende visning ⇒ standard", () => {
    expect(ANALYSE_TABS.map((t) => [t.key, t.label])).toEqual([
      ["kunder", "Kundeadfærd"],
      ["brug", "Intern brug"],
      ["konvertering", "Konvertering"],
    ]);
    expect(DEFAULT_ANALYSE_TAB).toBe("kunder");
    expect(parseAnalyseTab(undefined)).toBe("kunder");
    expect(parseAnalyseTab("hmm")).toBe("kunder");
    expect(parseAnalyseTab("brug")).toBe("brug");
    expect(parseAnalyseTab(["konvertering", "brug"])).toBe("konvertering");
  });

  it("stabile, delbare URL'er pr. fane", () => {
    expect(analyseTabHref("kunder")).toBe("/admin/brug?visning=kunder");
    expect(analyseTabHref("brug")).toBe("/admin/brug?visning=brug");
    expect(analyseTabHref("konvertering")).toBe("/admin/brug?visning=konvertering");
  });

  it("tastatur: pile cirkulært, Home/End, andre taster ignoreres", () => {
    expect(nextTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextTabIndex(1, "Home", 3)).toBe(0);
    expect(nextTabIndex(1, "End", 3)).toBe(2);
    expect(nextTabIndex(1, "Enter", 3)).toBeNull();
  });

  it.each(["kunder", "brug", "konvertering"] as const)("server-render med visning=%s: korrekt aktiv fane, ARIA og kun det panel monteret", (tab) => {
    const markup = html(createElement(AnalyseTabs, { initialTab: tab }));
    expect(markup).toContain('role="tablist"');
    expect((markup.match(/role="tab"/g) ?? []).length).toBe(3);
    expect((markup.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(markup).toMatch(new RegExp(`id="analyse-tab-${tab}"[^>]*aria-selected="true"[^>]*tabindex="0"`));
    for (const other of ANALYSE_TABS.filter((t) => t.key !== tab)) {
      expect(markup).toMatch(new RegExp(`id="analyse-tab-${other.key}"[^>]*aria-selected="false"[^>]*tabindex="-1"`));
      expect(markup).toMatch(new RegExp(`id="analyse-panel-${other.key}"[^>]*hidden=""`));
    }
    expect(markup).not.toMatch(new RegExp(`id="analyse-panel-${tab}"[^>]*hidden`));
  });
});

describe("salgsoversigtens to tilstande (samme komponent, samme DTO)", () => {
  it("admin-forsiden: administrationshandlinger, INGEN adfærdskolonner eller aktivitetsfilter", () => {
    const markup = html(createElement(SalesOverviewTable, { mode: "admin", overview: OVERVIEW, onCopyLink: noop, onToggleActive: noop }));
    expect(headers(markup)).toEqual(["Booking", "Destination", "Kunde", "Oprettet", "Status", "Handlinger"]);
    for (const a of ["Kopiér link", "Åbn", "Detaljer", "Sammenlign", "Deaktivér"]) expect(markup).toContain(a);
    expect(markup).not.toContain(COPY.filters.activity);
    expect(markup).not.toContain(COPY.footnote);
    expect(markup).toContain(COPY.filters.showInactive);
    expect(markup).toContain(COPY.searchPlaceholder);
  });

  it("Kundeadfærd: Åbnet, Set, Kontakt, Seneste aktivitet + filtre/sortering + Detaljer, ingen skrivende handlinger", () => {
    const markup = html(createElement(SalesOverviewTable, { mode: "behavior", overview: OVERVIEW }));
    expect(headers(markup)).toEqual(["Booking", "Destination", "Kunde", "Oprettet", "Åbnet", "Set", "Kontakt", "Seneste aktivitet", "Status", "Handlinger"]);
    expect(markup).toContain(COPY.filters.activity);
    expect(markup).toContain(COPY.filters.sort);
    expect(markup).toContain(COPY.footnote);
    expect(markup).toContain('href="/admin/trips/1"');
    expect(markup).not.toContain("Kopiér link");
    expect(markup).not.toContain("Deaktivér");
    expect(markup).not.toContain("Aktivér");
  });

  it("Codex-review 5343143339: Kundeadfærd har KUN Detaljer — ingen Åbn, Kopiér link, Sammenlign eller Aktivér/Deaktivér", () => {
    const markup = html(createElement(SalesOverviewTable, { mode: "behavior", overview: OVERVIEW }));
    // Handlingscellen for hver række: præcis ét link, og det er Detaljer.
    const actionCells = Array.from(markup.matchAll(/<div class="admin-row-actions">([\s\S]*?)<\/div>/g), (m) => m[1]);
    expect(actionCells).toHaveLength(OVERVIEW.trips.length);
    for (const [i, cell] of actionCells.entries()) {
      const labels = Array.from(cell.matchAll(/>([^<>]+)<\/(?:a|button)>/g), (m) => m[1].trim());
      expect(labels).toEqual(["Detaljer"]);
      expect(cell).toContain(`href="/admin/trips/${OVERVIEW.trips[i].id}"`);
      expect(cell).not.toContain(`href="/${OVERVIEW.trips[i].slug}"`); // Åbn (kundens præsentation)
      expect(cell).not.toContain("/admin/qa/"); // Sammenlign
    }
    for (const forbidden of [">Åbn<", "Kopiér link", "Sammenlign", "Deaktivér", "Aktivér"]) expect(markup).not.toContain(forbidden);
    expect(markup).not.toContain("<button"); // ingen skrivende eller kopierende handlinger overhovedet
  });

  it("admin-forsiden har fortsat alle fem handlinger pr. række, inkl. Åbn til kundens præsentation", () => {
    const markup = html(createElement(SalesOverviewTable, { mode: "admin", overview: OVERVIEW, onCopyLink: noop, onToggleActive: noop }));
    const actionCells = Array.from(markup.matchAll(/<div class="admin-row-actions">([\s\S]*?)<\/div>/g), (m) => m[1]);
    for (const [i, cell] of actionCells.entries()) {
      const labels = Array.from(cell.matchAll(/>([^<>]+)<\/(?:a|button)>/g), (m) => m[1].trim());
      expect(labels).toEqual(["Kopiér link", "Åbn", "Detaljer", "Sammenlign", "Deaktivér"]);
      expect(cell).toContain(`href="/${OVERVIEW.trips[i].slug}"`);
    }
  });

  it("Kundeadfærd: en fejlet kilde vises som 'Kunne ikke hentes' med bemærkning — aldrig som ingen aktivitet", () => {
    const degraded: SalesOverview = {
      ...OVERVIEW,
      trips: [row({ id: "9", opened: { kind: "unavailable" }, sections: { kind: "unavailable" }, contact: { kind: "unavailable" } })],
      degraded: ["visits", "sections", "contact"],
    };
    const markup = html(createElement(SalesOverviewTable, { mode: "behavior", overview: degraded }));
    expect(markup).toContain(COPY.degradedBanner);
    expect(markup).toContain(COPY.notFetched);
    expect(markup).not.toContain(COPY.none);
  });
});

describe("Kundeadfærd-panelet: egen loading- og fejltilstand", () => {
  it("fejl ⇒ tydelig fejl + 'Prøv igen', ingen tabel eller nul-tal", () => {
    const markup = html(createElement(CustomerBehaviorView, { loading: false, error: true, overview: null, onRetry: noop }));
    expect(markup).toContain('data-state="customer-behavior-error"');
    expect(markup).toContain("Prøv igen");
    expect(markup).not.toContain("<table");
  });

  it("loading ⇒ spinner; data ⇒ tabellen i tilstanden Kundeadfærd", () => {
    expect(html(createElement(CustomerBehaviorView, { loading: true, error: false, overview: null, onRetry: noop }))).toContain(
      'data-state="customer-behavior-loading"',
    );
    const ok = html(createElement(CustomerBehaviorView, { loading: false, error: false, overview: OVERVIEW, onRetry: noop }));
    expect(ok).toContain("Kundeadfærd pr. rejseplan");
    expect(ok).toContain("<th>Åbnet</th>");
  });
});

describe("fælles læsevej fetchSalesOverview", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("mapper det kompakte DTO (trips, viewer, degraded)", async () => {
    const r = await fetchSalesOverview(async () => res(200, { trips: OVERVIEW.trips, viewer: { mineAvailable: true }, degraded: ["visits"] }));
    expect(r).toEqual({ ok: true, overview: { trips: OVERVIEW.trips, viewer: { mineAvailable: true }, degraded: ["visits"] } });
  });

  it.each([
    ["HTTP 500", async () => res(500, { error: "x" })],
    ["netværksfejl", async () => Promise.reject(new Error("net"))],
    ["uden trips-liste", async () => res(200, { viewer: {} })],
  ])("%s ⇒ ok:false (aldrig en tom liste)", async (_n, impl) => {
    expect(await fetchSalesOverview(impl as () => Promise<Response>)).toEqual({ ok: false });
  });
});

describe("ingen dubletter af den komplette visning", () => {
  function sources(dir: string): { file: string; src: string }[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
      return [{ file: p.replace(/\\/g, "/"), src: readFileSync(p, "utf8") }];
    });
  }
  const app = sources(join(process.cwd(), "src", "app"));

  it("konverteringsmålingen renderes kun i Analyse-fanen", () => {
    const users = app.filter((f) => /<ConversionMeasurement\b/.test(f.src)).map((f) => f.file.split("/src/")[1]);
    expect(users).toEqual(["app/admin/brug/AnalyseTabs.tsx"]);
  });

  it("den komplette kundeadfærdsvisning (mode=\"behavior\") renderes kun i Kundeadfærd-panelet", () => {
    const users = app.filter((f) => /mode="behavior"/.test(f.src)).map((f) => f.file.split("/src/")[1]);
    expect(users).toEqual(["app/admin/brug/CustomerBehaviorPanel.tsx"]);
  });

  it("admin-forsiden bruger administrationstilstanden, linker til Analyse og har ingen konverteringsvisning", () => {
    const dash = readFileSync(join(process.cwd(), "src", "app", "admin", "AdminDashboard.tsx"), "utf8");
    expect(dash).toMatch(/<SalesOverviewTable\s+mode="admin"/);
    expect(dash).toContain('href="/admin/brug?visning=kunder"');
    expect(dash).toMatch(/href="\/admin\/brug">\s*Analyse\s*</);
    expect(dash).not.toMatch(/ConversionMeasurement/);
  });
});
