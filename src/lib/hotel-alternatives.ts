import type { AlternativeHotel } from "./types";

// Parseren har kun ét 'alternative'-objekt pr. hotel. Når PDF'en lister flere
// alternative hoteller ("Andre hoteller der også kunne være noget for jer: ..."),
// havner nr. 2+ som rå tekst i hotel.notes (set på booking 35493, Maldiverne).
// Denne helper genkender sådanne noter og løfter dem til strukturerede
// alternativer, så alle vises ens som cards. Konservativ: kun noter med
// indlednings-frasen ELLER med både en nætter-del og en merpris/besparelse-del
// løftes — alt andet forbliver almindelige noter.

const LEAD_IN_RE =
  /^\s*(?:andre\s+hoteller|dette\s+(?:resort|hotel))\s+(?:der\s+)?(?:også\s+)?kunne\s+(?:måske\s+)?(?:også\s+)?være\s+noget\s+for\s+(?:jer|dig)\s*:?\s*/i;

// Anden TravelWire-variant (booking 35917, Mauritius):
//   "Alternativt hotel: La Pirogue — Deluxe Beach Family Pavilion værelse,
//    10 nætter, inkl. Halvpension. Merpris i alt for 10 nætter: ca. 30.200 kr."
// Her er der ingen '·'-separatorer, så splitSegments kan ikke bruges — noten er
// én sammenhængende sætning med et navn foran en tankestreg.
//
// Mønstret er bevidst stramt: ENTAL ("Alternativt hotel", ikke "Alternative
// hoteller") efterfulgt af kolon. Det holder generelle bemærkninger ude, fx
// "Alternative hoteller på Gili Air vil være væsentlig dyrere" (35634, 35811),
// som netop ikke navngiver et alternativ og skal blive stående som note.
const LABELLED_ALT_RE = /^\s*alternativ(?:t)?\s+(?:hotel|resort)\b\s*:\s*(.+)$/i;
// Navnet skilles fra beskrivelsen af en tankestreg med mellemrum omkring.
const NAME_DASH_RE = /\s+[—–-]\s+/;
const MAX_ALT_NAME_LEN = 60;
// Som SAVINGS_RE, men uden ^ — bruges til at finde prisdelen inde i en sætning.
const SAVINGS_ANYWHERE_RE = /(?:merpris|besparelse)\b/i;

// "Alternativt hotel: NAVN — beskrivelse. Merpris …" → struktureret alternativ.
// Returnerer null ved alt der ikke sikkert kan tolkes, så noten bevares.
function parseLabelledAlternativeNote(note: string): AlternativeHotel | null {
  const m = note.match(LABELLED_ALT_RE);
  if (!m) return null;

  const parts = m[1].trim().split(NAME_DASH_RE);
  // Uden tankestreg er der intet sikkert skel mellem navn og beskrivelse.
  if (parts.length < 2) return null;

  const name = parts[0].trim();
  if (!name || name.length > MAX_ALT_NAME_LEN) return null;

  const rest = parts.slice(1).join(" — ").trim();
  // Merpris/besparelse afslutter noten. Der splittes IKKE på punktum: både
  // "inkl." og "ca." indeholder punktummer midt i sætningen, så en
  // sætningsopdeling river beløbet af prisen ("… ca." + "30.200 kr.").
  const savingsAt = rest.search(SAVINGS_ANYWHERE_RE);
  // Punktummet bevares, så prislinjen ser ud som de alternativer der allerede
  // kommer struktureret fra parseren ("… ca. 2.800 kr." på booking 35493).
  const savings = savingsAt >= 0 ? rest.slice(savingsAt).trim() : "";
  const description = (savingsAt >= 0 ? rest.slice(0, savingsAt) : rest)
    .trim()
    .replace(/[.\s]+$/, "");
  if (!description && !savings) return null;

  const nights = Number(description.match(/(\d+)\s*n[æa]tter\b/i)?.[1] ?? 0);
  const meals = description.match(/inkl\.?\s+([^.,]+)/i)?.[1]?.trim() ?? "";

  return { name, description, nights, meals, savings };
}
const NIGHTS_RE = /^(\d+)\s*n[æa]tter\b\s*(?:inkl\.?|inklusive|med)?\s*(.*)$/i;
const SAVINGS_RE = /^(?:merpris|besparelse)\b/i;

function splitSegments(text: string): string[] {
  return text
    .replace(/\s*[\r\n]+\s*/g, " · ")
    .split(/\s+·\s+|\s+\|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Én note kan indeholde flere hoteller efter hinanden; en merpris/besparelse-linje
// afslutter et hotel, så det næste segment starter et nyt.
function groupByHotel(segments: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const seg of segments) {
    current.push(seg);
    if (SAVINGS_RE.test(seg)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function toAlternative(group: string[]): AlternativeHotel | null {
  if (group.length < 2) return null;
  // Ledende '*' er TravelWires punkt-markør ("*Sun Siyam …") — ikke en del af navnet.
  // Stjerner inde i navnet (LUX*) bevares.
  const name = group[0].replace(/^\*+\s*/, "").trim();
  if (!name) return null;
  let nights = 0;
  let meals = "";
  let savings = "";
  const description: string[] = [];
  for (const seg of group.slice(1)) {
    const n = seg.match(NIGHTS_RE);
    if (n && !nights) {
      nights = Number(n[1]);
      meals = n[2].trim();
      continue;
    }
    if (SAVINGS_RE.test(seg) && !savings) {
      savings = seg;
      continue;
    }
    description.push(seg.replace(/^\*+\s*/, ""));
  }
  return { name, description: description.join(" · "), nights, meals, savings };
}

export function parseAlternativeNote(note: string): AlternativeHotel[] {
  const labelled = parseLabelledAlternativeNote(note);
  if (labelled) return [labelled];

  const hasLeadIn = LEAD_IN_RE.test(note);
  const body = note.replace(LEAD_IN_RE, "");
  const segments = splitSegments(body);
  const hasNights = segments.some((s) => NIGHTS_RE.test(s));
  const hasSavings = segments.some((s) => SAVINGS_RE.test(s));
  if (!hasLeadIn && !(hasNights && hasSavings)) return [];
  if (!hasLeadIn && segments.length < 3) return [];
  return groupByHotel(segments)
    .map(toAlternative)
    .filter((a): a is AlternativeHotel => a !== null && (hasLeadIn || Boolean(a.savings)));
}

const normName = (s: string) => s.replace(/^\*+\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();

export function collectAlternatives(input: {
  alternative?: AlternativeHotel | null;
  alternatives?: AlternativeHotel[] | null;
  notes?: string[] | null;
}): { alternatives: AlternativeHotel[]; notes: string[] } {
  const out: AlternativeHotel[] = [];
  const seen = new Set<string>();
  const add = (a: AlternativeHotel | null | undefined) => {
    if (!a || !a.name?.trim()) return;
    const key = normName(a.name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...a, name: a.name.replace(/^\*+\s*/, "").trim() });
  };
  add(input.alternative);
  (input.alternatives ?? []).forEach(add);

  const notes: string[] = [];
  for (const note of input.notes ?? []) {
    const parsed = parseAlternativeNote(note);
    if (parsed.length === 0) {
      notes.push(note);
      continue;
    }
    // Rå alternativ-tekst fjernes fra noterne, uanset om hotellet allerede var
    // struktureret (dublet) eller løftes nu.
    parsed.forEach(add);
  }
  return { alternatives: out, notes };
}
