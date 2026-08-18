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
