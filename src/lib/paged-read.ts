// Vision 3.0 Fase 4 (Issue #76) — pagineret læsning af hele sæt fra PostgREST.
//
// PROBLEMET: Supabase/PostgREST returnerer som standard højst 1000 rækker pr.
// forespørgsel (`max_rows`), UDEN fejl. Et almindeligt `select(...)` på en tabel
// med >1000 rækker afkortes derfor tavst — og en afkortet
// `trip_section_engagement`/`trip_contact_intent` ville vise sig som falske
// "ingen registreret" i salgsoversigten. En "færdig når siden er kortere end
// sidestørrelsen"-løkke er ikke nok: er serverens `max_rows` LAVERE end vores
// sidestørrelse (fx 500), ser første side "kort" ud og løkken stopper for tidligt.
//
// LØSNINGEN: første side beder om et eksakt total (`count: "exact"`), og løkken
// er først færdig, når vi HAR hentet total rækker. Kortere sider er fint (næste
// offset = antal faktisk modtagne rækker). En tom side før total er nået, et
// manglende total eller en fejl er en FEJL — aldrig et tavst "færdig". Kalderen
// får `{ ok: false }` og viser "kunne ikke hentes" i stedet for "ingen".
//
// Ren funktion: `fetchPage` injiceres, så alt kan unit-testes uden Supabase.
// Kalderen SKAL levere en stabil, unik sortering (typisk primærnøglen), ellers
// kan rækker springes over/dubleres mellem sider.

export type PageRequest = {
  /** Første række (inklusiv, 0-indekseret) — `.range(from, to)`. */
  from: number;
  /** Sidste række (inklusiv). */
  to: number;
  /** Kun første side beder om `count: "exact"`. */
  withCount: boolean;
};

export type PageResponse<T> = {
  data: T[] | null;
  error: { message?: string | null } | null;
  count: number | null;
};

export type ReadAllResult<T> =
  | { ok: true; rows: T[]; pages: number }
  | { ok: false; reason: "error" | "no-count" | "truncated" | "too-many-pages"; message: string };

export const DEFAULT_PAGE_SIZE = 1000;

export async function readAllRows<T>(
  fetchPage: (req: PageRequest) => PromiseLike<PageResponse<T>>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<ReadAllResult<T>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? 1000;

  const rows: T[] = [];
  let total: number | null = null;
  let pages = 0;

  try {
    while (pages < maxPages) {
      const offset = rows.length;
      const res = await fetchPage({
        from: offset,
        to: offset + pageSize - 1,
        withCount: total === null,
      });
      pages += 1;

      if (res.error) {
        return { ok: false, reason: "error", message: res.error.message ?? "" };
      }
      if (total === null) {
        // Uden et verificerbart total kan vi ikke afgøre om vi har hele sættet —
        // så hellere fejl end en gætte-løkke der kan afkorte tavst.
        if (typeof res.count !== "number" || !Number.isFinite(res.count) || res.count < 0) {
          return { ok: false, reason: "no-count", message: "manglende eksakt antal" };
        }
        total = res.count;
      }

      const data = res.data ?? [];
      rows.push(...data);

      if (rows.length >= total) return { ok: true, rows, pages };
      if (data.length === 0) {
        return {
          ok: false,
          reason: "truncated",
          message: `tom side efter ${rows.length} af ${total} rækker`,
        };
      }
    }
    return { ok: false, reason: "too-many-pages", message: `over ${maxPages} sider` };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.name : "unknown" };
  }
}
