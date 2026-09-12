// Deler rådgiverens intro i de to niveauer Claude Design v2 bruger i heroen:
// et fremhævet anslag (.lead) og resten i brødtekst (.rest).
//
// Der omskrives intet og fjernes intet — teksten deles kun, og lead + rest
// sat sammen igen giver altid den oprindelige tekst (på mellemrum nær).

// Et anslag på mere end dette ville fylde for meget ved 22px.
const LEAD_MAX = 220;
// Et anslag under dette er for kort til at bære heroen alene.
const LEAD_MIN = 40;
// Findes ingen brugbar sætningsgrænse, brydes der ved sidste ordgrænse her.
const FALLBACK_CUT = 180;

export type IntroParts = {
  lead: string;
  rest: string;
  /** Sandt når anslaget er brudt midt i en sætning — så vises "…" når det er foldet. */
  leadTruncated: boolean;
};

export function splitIntro(raw: string | null | undefined): IntroParts {
  const full = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!full) return { lead: "", rest: "", leadTruncated: false };

  // Første sætning er det naturlige anslag, hvis den har en rimelig længde.
  // Et punktum efter et tal er en dansk ordensmarkering ("26. juni", "1. klasse")
  // — ikke et sætningsslut — så der springes videre til næste kandidat.
  const ends = /[.!?…](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = ends.exec(full)) !== null) {
    const cut = m.index + 1;
    if (cut > LEAD_MAX) break;
    if (cut < LEAD_MIN) continue;
    if (/\d/.test(full[m.index - 1] ?? "")) continue;
    return {
      lead: full.slice(0, cut).trim(),
      rest: full.slice(cut).trim(),
      leadTruncated: false,
    };
  }

  if (full.length <= LEAD_MAX) return { lead: full, rest: "", leadTruncated: false };

  const space = full.lastIndexOf(" ", FALLBACK_CUT);
  const cut = space > 0 ? space : FALLBACK_CUT;
  return {
    lead: full.slice(0, cut).replace(/[.,;:\s]+$/, ""),
    rest: full.slice(cut).trim(),
    leadTruncated: true,
  };
}
