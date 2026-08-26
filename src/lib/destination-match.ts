// Vælg den rette destinations-række til en rejses hero/galleri.
//
// Kundesidens destination kan være 1-3 lande ("Sri Lanka & Maldiverne",
// "Vietnam & Thailand & Bali") — parseren bevarer PDF'ens format. Destinations-
// tabellen har derimod ét billedsæt pr. LAND ("Sri Lanka", "Maldiverne"). Et
// eksakt navnematch fejler derfor for kombi-rejser, og heroen faldt tilbage til
// den flade fallback selv om landets hero fandtes.
//
// Reglen (generel, ikke destinations-specifik): prøv hele navnet først; ellers
// hvert land-segment i rute-rækkefølge (adskilt af ' & '). Første match vinder,
// så kombi-rejser får deres primære/første destinations hero. Match er tolerant
// over for store/små bogstaver og mellemrum.

export type DestinationRecord = {
  name: string;
  hero_url: string | null;
  gallery: unknown;
};

export type DestinationMatch = {
  heroUrl: string | null;
  gallery: string[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Kandidater i prioritetsrækkefølge: hele navnet, dernæst hvert ' & '-segment.
export function destinationCandidates(name: string): string[] {
  const full = norm(name);
  const segments = name
    .split(/\s*&\s*/)
    .map(norm)
    .filter(Boolean);
  const ordered = [full, ...segments].filter(Boolean);
  return Array.from(new Set(ordered));
}

export function pickDestinationMatch(
  destinations: DestinationRecord[],
  name: string,
): DestinationMatch | null {
  if (!name || destinations.length === 0) return null;
  const byName = new Map(destinations.map((d) => [norm(d.name), d]));
  for (const candidate of destinationCandidates(name)) {
    const hit = byName.get(candidate);
    if (hit) {
      return {
        heroUrl: (hit.hero_url as string | null) ?? null,
        gallery: Array.isArray(hit.gallery) ? (hit.gallery as string[]) : [],
      };
    }
  }
  return null;
}
