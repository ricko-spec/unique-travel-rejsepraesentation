// Rejsende-feltet fra TravelWire er fritekst og kan være alt fra "2 voksne"
// til en liste med syv navne og aldre. Her skilles navnene ad, så info-strippens
// Rejsende-felt kan sætte dem pænt i stedet for at lade dem løbe ud af kolonnen.
// Intet navn fjernes eller forkortes.

// En afsluttende parentes er kun en opsummering hvis den TÆLLER rejsende
// ("2 voksne + 2 børn"). Ellers hører den til navnet foran — booking 34952
// slutter med "Ida Theil Lundgaard (7 år)", og dér ville en blind
// sidste-parentes-regel rive alderen af navnet og vise "7 år" som opsummering.
const TRAVELLER_SUMMARY_RE = /\d+\s*(voksne?|børn|barn|personer|rejsende|pers\.?)/i;

/**
 * Rejsende-feltet er fritekst fra TravelWire og kan være
 * "Anna Hansen, Bo Hansen (2 voksne)" eller bare et enkelt navn.
 * Navnene skilles ad, så de kan sættes pænt op i stedet for at løbe over.
 * Aldersparenteser på det enkelte navn bevares på navnet.
 */
export function splitTravellers(raw: string | null | undefined): {
  names: string[];
  summary: string;
} {
  const text = (raw ?? "").trim();
  if (!text) return { names: [], summary: "" };

  const m = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const isSummary = m ? TRAVELLER_SUMMARY_RE.test(m[2]) : false;
  const namesPart = isSummary && m ? m[1] : text;
  const summary = isSummary && m ? m[2].trim() : "";

  return { names: splitOutsideParens(namesPart), summary };
}

// Deler på komma og " og ", men kun uden for parenteser — ellers ville
// "Anna (12 år, allergi)" blive til to navne.
function splitOutsideParens(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (depth === 0) {
      if (ch === ",") {
        out.push(current);
        current = "";
        continue;
      }
      const og = text.slice(i).match(/^\s+og\s+/i);
      if (og) {
        out.push(current);
        current = "";
        i += og[0].length - 1;
        continue;
      }
    }
    current += ch;
  }
  out.push(current);
  return out.map((n) => n.trim()).filter(Boolean);
}
