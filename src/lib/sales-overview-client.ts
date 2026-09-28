// Issue #92 — én klient-side læsevej for salgsoversigtens kompakte DTO
// (GET /admin/api/trips). Bruges af både admin-forsidens administrationsliste
// og Analyse → Kundeadfærd, så der aldrig findes to parallelle læsninger med
// hver sin fortolkning. Kun de felter DTO'en har (trips, viewer, degraded) —
// ingen rå felter som data/raw_pdf_text.
//
// En fejl er ALTID { ok: false } (aldrig en tom liste), så UI'et kan vise en
// fejltilstand frem for "ingen rejseplaner"/"ingen aktivitet".

import type { SalesOverview } from "./sales-overview-types";

export type SalesOverviewFetchResult = { ok: true; overview: SalesOverview } | { ok: false };

export async function fetchSalesOverview(
  fetchImpl: (input: string) => Promise<Response> = (input) => fetch(input),
): Promise<SalesOverviewFetchResult> {
  try {
    const res = await fetchImpl("/admin/api/trips");
    if (!res.ok) return { ok: false };
    const j = await res.json();
    if (!j || !Array.isArray(j.trips)) return { ok: false };
    return {
      ok: true,
      overview: {
        trips: j.trips,
        viewer: { mineAvailable: !!j.viewer?.mineAvailable },
        degraded: Array.isArray(j.degraded) ? j.degraded : [],
      },
    };
  } catch {
    return { ok: false };
  }
}
