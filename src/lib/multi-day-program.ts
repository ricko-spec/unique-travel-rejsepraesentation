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

function titleKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Et titelmatch skal være specifikt: lighed, eller at den ene titel indgår i den
// anden med mindst to ord i den korteste. En generisk titel som "Safari" (ét ord)
// må aldrig matche "Safari Nord" og "Safari Syd" begge.
function titlesRelated(a: string, b: string): boolean {
  const x = titleKey(a);
  const y = titleKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.split(" ").length >= 2 && long.includes(short);
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
 * aktivitet, ikke pakkens program (Issue #94). Titelmatchet skal være gensidigt
 * entydigt: pakken matcher præcis ét program, og det program matcher ingen anden
 * pakke. Ellers gælder fallbacken: netop ét flerdagsprogram og netop én pakke.
 * Ved tvivl returneres undefined, så listen bevares (dobbeltvisning er bedre end
 * tabt indhold).
 */
export function findPackageProgram<T extends ProgramLike>(
  packageName: string,
  itinerary: T[],
  allPackageNames: string[],
): T | undefined {
  const programs = itinerary.filter(
    (it) => it.expandKind === "program" && isMultiDayProgram(it.typeLabel),
  );
  const matches = programs.filter((it) => titlesRelated(it.title ?? "", packageName));
  if (matches.length === 1) {
    const [program] = matches;
    const claimedByOthers = allPackageNames.filter(
      (n) => n !== packageName && titlesRelated(program.title ?? "", n),
    );
    // Samme navn på to pakker kan heller ikke skilles ad.
    const sameName = allPackageNames.filter((n) => n === packageName).length > 1;
    if (claimedByOthers.length === 0 && !sameName) return program;
    return undefined;
  }
  if (matches.length > 1) return undefined;
  return programs.length === 1 && allPackageNames.length === 1 ? programs[0] : undefined;
}
