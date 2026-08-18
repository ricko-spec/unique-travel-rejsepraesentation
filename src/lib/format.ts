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
