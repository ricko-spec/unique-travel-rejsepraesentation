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
  if (/merpris|besparelse/i.test(s)) return s;
  if (s.startsWith("+")) return `Merpris: ${s}`;
  return `Besparelse: ${s}`;
}

// 'sub-hoteller' er parserens interne sprog og optræder i room-feltet på pakke-rejser —
// kunden skal se 'hoteller undervejs' (datamodellen/feltnavnene ændres ikke).
export function displayRoomLabel(room: string): string {
  return room.replace(/sub-?hoteller/gi, "hoteller undervejs");
}

// Kundenavne på grupper/familier er kommaseparerede lister der gør admin-tabellens
// rækker meget høje. Vis de to første navne + antal øvrige; navne uden komma
// (fx 'Susanne og Finn Bastegaard') vises uændret. Fuld liste hører til i title/Detaljer.
export function formatCustomerPreview(name: string): string {
  const parts = name
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 2) return name.trim();
  return `${parts[0]}, ${parts[1]} + ${parts.length - 2} rejsende`;
}

// Splitter en roomAllocation-streng som 'Værelse 3: 3 børn (1, 5 og 6 år)' i en
// fremhævet label ('Værelse 3') og resten — så gruppe-rejser kan vise en tydelig
// værelse-for-værelse-fordeling.
//
// Kun præfikser der faktisk NAVNGIVER et værelse bliver til label. En ren
// længdegrænse duer ikke: TravelWire skriver både korte 'Værelse 2:' og lange
// 'Værelse 4 (Family Suite Jacuzzi, 2 Bedrooms):' (44 tegn), mens fritekst som
// 'Fordeling af værelserne aftales ved ankomst: …' har sit kolon efter 42 tegn.
// Længde alene kan altså ikke skille de to — men begyndelsesordet kan.
// Alt andet vises uændret som rest, så ingen linje mister indhold.
const ROOM_LABEL = /^(?:værelse|room|suite|villa|bungalow)\b[^:]{0,48}$/i;

export function splitRoomAllocation(alloc: string): { label: string; rest: string } {
  const idx = alloc.indexOf(":");
  if (idx <= 0) return { label: "", rest: alloc.trim() };
  const label = alloc.slice(0, idx).trim();
  if (!ROOM_LABEL.test(label)) return { label: "", rest: alloc.trim() };
  return { label, rest: alloc.slice(idx + 1).trim() };
}

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

// Etiketten på tidslinjens udfold-knap. "Programmet" frem for "rundrejsen",
// fordi gruppen også rummer safarier, krydstogter og trekking, som ikke er
// rundrejser.
export function timelineToggleLabel(
  expandKind: string | null | undefined,
  typeLabel: string | null | undefined,
  activitiesCount: number,
): string | null {
  if (expandKind === "flight") return "Se flydetaljer";
  if (expandKind === "program") {
    return isMultiDayProgram(typeLabel) ? "Læs om programmet" : "Læs om udflugten";
  }
  // Én valgfri aktivitet er reelt én inkluderet udflugt, ikke en liste at vælge i.
  if (expandKind === "activities") {
    return activitiesCount === 1 ? "Læs om udflugten" : "Se udflugtsmuligheder";
  }
  return null;
}
