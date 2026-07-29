// Rene display-/formaterings-helpers til kundevisningen. Ingen data- eller
// schema-logik her — den bor i src/lib/types.ts.
import { parseFlexibleDate } from "./types";

// Format dato som '3. oktober 2026' (dansk langform uden ugedag) — til hero-pillen.
// Falder tilbage til original streng hvis input ikke kan parses (fx allerede dansk fritekst).
export function formatMediumDateDK(s: string | null | undefined): string {
  if (!s) return "";
  const date = parseFlexibleDate(s);
  if (!date) return s;
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

// Parseren gemmer både merpris OG besparelse i samme 'savings'-felt, så etiketten kan
// ikke hardkodes: ordet 'merpris' i strengen eller et '+'-præfiks betyder at alternativet
// koster MERE end det valgte hotel (verificeret mod TravelWire-kilden, booking 35385).
export function formatAlternativePriceLine(savings: string): string {
  const s = savings.trim();
  if (!s) return "";
  if (/merpris/i.test(s)) return s;
  if (s.startsWith("+")) return `Merpris: ${s}`;
  return `Besparelse: ${s}`;
}

// 'sub-hoteller' er parserens interne sprog og optræder i room-feltet på pakke-rejser —
// kunden skal se 'hoteller undervejs' (datamodellen/feltnavnene ændres ikke).
export function displayRoomLabel(room: string): string {
  return room.replace(/sub-?hoteller/gi, "hoteller undervejs");
}

// Splitter en roomAllocation-streng som 'Værelse 3: 3 børn (1, 5 og 6 år)' i en
// fremhævet label ('Værelse 3') og resten — så gruppe-rejser kan vise en tydelig
// værelse-for-værelse-fordeling. Strenge uden 'Label: ...'-form (eller med et
// urimeligt langt præfiks, dvs. et kolon midt i fritekst) vises uændret som rest.
const MAX_ALLOCATION_LABEL_LEN = 24;

export function splitRoomAllocation(alloc: string): { label: string; rest: string } {
  const idx = alloc.indexOf(":");
  if (idx <= 0 || idx > MAX_ALLOCATION_LABEL_LEN) {
    return { label: "", rest: alloc.trim() };
  }
  return { label: alloc.slice(0, idx).trim(), rest: alloc.slice(idx + 1).trim() };
}
