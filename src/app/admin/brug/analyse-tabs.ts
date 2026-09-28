// Issue #92 — fanerne i Analyse (/admin/brug) og deres stabile URL-tilstand.
// Ren logik (ingen React), så den kan testes direkte.

export const ANALYSE_TABS = [
  { key: "kunder", label: "Kundeadfærd" },
  { key: "brug", label: "Intern brug" },
  { key: "konvertering", label: "Konvertering" },
] as const;

export type AnalyseTabKey = (typeof ANALYSE_TABS)[number]["key"];

/** Kundeadfærd er standard (hyppigste operative brug); ukendt/manglende værdi ⇒ standard. */
export const DEFAULT_ANALYSE_TAB: AnalyseTabKey = "kunder";

export function parseAnalyseTab(value: string | string[] | null | undefined): AnalyseTabKey {
  const v = Array.isArray(value) ? value[0] : value;
  return ANALYSE_TABS.some((t) => t.key === v) ? (v as AnalyseTabKey) : DEFAULT_ANALYSE_TAB;
}

export function analyseTabHref(key: AnalyseTabKey): string {
  return `/admin/brug?visning=${key}`;
}

/** Tastaturnavigation i fanelisten (WAI-ARIA): pile cirkulært, Home/End til yderpunkterne. */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  const last = count - 1;
  if (key === "ArrowRight") return current >= last ? 0 : current + 1;
  if (key === "ArrowLeft") return current <= 0 ? last : current - 1;
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}
