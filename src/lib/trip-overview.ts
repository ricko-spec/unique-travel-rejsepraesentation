// Rejseoverblikket i førstehåndsindtrykket (Vision 2.0 fase 1).
// Rene udregninger på data der allerede findes på trip'en — ingen nye felter,
// intet schema, ingen reparse. Se docs/VISION-2.0-PLAN.md, fase 1.
//
// Kunden får i dag to datoer og må selv regne rejsens omfang ud. Her udledes
// varighed og antal destinationer af hotellerne, som alle 230 aktive rejser har
// (median 14 nætter, 3 destinationer).

type OverviewHotel = {
  nights?: number | null;
  location?: string | null;
  isPackage?: boolean | null;
  subHotels?: { location?: string | null }[] | null;
};

/** Samlet antal nætter. 0 når hotellerne ikke oplyser nætter — så vises intet. */
export function totalNights(hotels: OverviewHotel[] | null | undefined): number {
  if (!hotels?.length) return 0;
  return hotels.reduce((sum, h) => sum + (Number(h?.nights) || 0), 0);
}

/**
 * Unikke destinationer i rejsens rækkefølge. Pakke-/rundrejsekort tæller også
 * deres sub-hoteller med, ellers ville en rundrejse med fem stop tælle som ét.
 * Sammenligning er case- og whitespace-ufølsom, men den viste form er den
 * første stavemåde rejsen selv bruger.
 */
export function destinationList(hotels: OverviewHotel[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const name = (raw ?? "").trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const h of hotels ?? []) {
    add(h?.location);
    for (const sub of h?.subHotels ?? []) add(sub?.location);
  }
  return out;
}

/** "14 nætter" / "1 nat" / "" når tallet mangler. */
export function nightsLabel(nights: number): string {
  if (!Number.isFinite(nights) || nights <= 0) return "";
  return `${nights} ${nights === 1 ? "nat" : "nætter"}`;
}

/** "3 destinationer" / "1 destination" / "" når listen er tom. */
export function destinationsLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return `${count} ${count === 1 ? "destination" : "destinationer"}`;
}

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
