// Kundevendt oprydning af sted-etiketter. Ren streng-til-streng — ingen schema-
// eller data-logik. Kaldes fra normalizeTrip i src/lib/types.ts, så både nye og
// allerede gemte rejser renses ved render (ingen re-upload, ingen migration).
//
// Baggrund: Jimbaran-koden i TravelWire hænger på Kuta, så PDF'en kan skrive
// opholdet som "Jimbaran (Kuta)", "Jimbaran/Kuta" eller "Kuta/Jimbaran".
// Kunden må ikke se Kuta, når rejsen reelt er til Jimbaran.

// Kuta som selvstændig stedangivelse. Negativt lookahead holder sammensatte
// navne ("Kuta Beach", "Kuta Selatan") ude — de er egne steder, ikke TW-koden.
const KUTA_ALONE = String.raw`Kuta\b(?!\s+\p{L})`;

// Kun de mønstre hvor Jimbaran og Kuta står side om side med en TW-separator
// (parentes, skråstreg, komma). "Jimbaran nær Kuta" og lignende fritekst
// røres bevidst ikke — der er Kuta en reel oplysning, ikke en kode-artefakt.
const RULES: { re: RegExp; to: string }[] = [
  // "Hotel i Jimbaran (Kuta)" → "Hotel i Jimbaran"
  { re: new RegExp(String.raw`\s*\(\s*${KUTA_ALONE}\s*\)`, "giu"), to: "" },
  // "Jimbaran / Kuta, Bali" → "Jimbaran, Bali"
  { re: new RegExp(String.raw`(\bJimbaran\b)\s*/\s*${KUTA_ALONE}`, "giu"), to: "$1" },
  // "Kuta/Jimbaran hotel" → "Jimbaran hotel"
  { re: new RegExp(String.raw`\bKuta\s*/\s*(Jimbaran\b)`, "giu"), to: "$1" },
  // "The Open House Bali Jimbaran, Kuta" → "The Open House Bali Jimbaran"
  { re: new RegExp(String.raw`(\bJimbaran\b)\s*,\s*${KUTA_ALONE}`, "giu"), to: "$1" },
  // "Kuta, Jimbaran" → "Jimbaran"
  { re: new RegExp(String.raw`\bKuta\s*,\s*(Jimbaran\b)`, "giu"), to: "$1" },
];

const HAS_JIMBARAN = /\bJimbaran\b/iu;
const HAS_KUTA = /\bKuta\b/iu;

// Fjerner TravelWires Kuta-vedhæng fra en etiket der handler om Jimbaran.
// Strenge uden BEGGE stednavne returneres uændret — "Kuta" alene, "Kuta Beach"
// og alle øvrige Bali-områder er dermed urørte.
export function normalizeLocationLabel(value: string): string {
  if (!value) return value;
  if (!HAS_JIMBARAN.test(value) || !HAS_KUTA.test(value)) return value;

  let out = value;
  for (const { re, to } of RULES) out = out.replace(re, to);
  if (out === value) return value;

  return out.replace(/\s{2,}/g, " ").trim();
}
