// Flerdagsprogrammer (safari, rundrejse, turprogram, krydstogt, trekking) vs.
// endagsudflugter. Egen fil (ikke format.ts) fordi types.ts' normalizeTrip også
// skal bruge den, og format.ts importerer allerede types.ts (ville blive cirkulært).

// expandKind 'program' dækker to vidt forskellige ting: endagsudflugter og
// flerdagsforløb (safari, rundrejse, turprogram, krydstogt, trekking). For de
// sidste er "udflugten" misvisende — de har overnatninger.
//
// Skillelinjen læses af typeLabel, ikke af antallet af blokke i expand.days:
// parseren bruger nemlig også days til at dele ÉN dag op i "Formiddag" og
// "Eftermiddag", så 2 blokke kan sagtens være én udflugt. typeLabel siger
// derimod enten "DAG 11" (én dag) eller "DAG 7–8" / "3 DAGE / 2 NÆTTER".
// Målt på production (sep. 2026, 218 program-items) rammer de to mønstre 81
// flerdagsforløb og 137 endagsture uden en eneste fejlklassifikation.
const DAY_RANGE = /dag\s*\d+\s*[–—-]\s*\d+/i;
const DAY_COUNT = /\d+\s*(dage|nætter|nat)\b/i;

export function isMultiDayProgram(typeLabel: string | null | undefined): boolean {
  const s = typeLabel ?? "";
  return DAY_RANGE.test(s) || DAY_COUNT.test(s);
}

// Ord der ikke skiller en pakke fra en anden i en titel ("Safari" alene er for løst).
function titleKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

interface ProgramLike {
  title?: string | null;
  typeLabel?: string | null;
  expandKind?: string | null;
}

/**
 * Ligger pakkens flerdagsprogram i rejseplanen? Kun så er det sikkert at fjerne
 * pakke-kortets included/notIncluded (ellers ville listen forsvinde helt).
 *
 * En ENDAGS-udflugt med expandKind 'program' tæller IKKE — den er en selvstændig
 * aktivitet, ikke pakkens program (Issue #94). Matchet er bevidst konservativt:
 * titlen skal svare til pakkens navn, eller der skal være netop ét flerdagsprogram
 * og netop én pakke. Ved tvivl returneres false, så listen bevares (dobbeltvisning
 * er bedre end tabt indhold).
 */
export function findPackageProgram<T extends ProgramLike>(
  packageName: string,
  itinerary: T[],
  packageCount: number,
): T | undefined {
  const programs = itinerary.filter(
    (it) => it.expandKind === "program" && isMultiDayProgram(it.typeLabel),
  );
  const key = titleKey(packageName);
  if (key) {
    const byTitle = programs.find((it) => {
      const t = titleKey(it.title ?? "");
      return t !== "" && (t === key || t.includes(key) || key.includes(t));
    });
    if (byTitle) return byTitle;
  }
  return programs.length === 1 && packageCount === 1 ? programs[0] : undefined;
}
