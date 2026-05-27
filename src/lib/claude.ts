import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `Du er en dansk rejserådgiver for Unique Travel. Du modtager en TravelWire-PDF (enten et 'Rejseforslag' eller en 'Faktura' — begge er gyldige) og skal returnere struktureret JSON.

Returnér KUN gyldigt JSON — ingen forklaring, ingen kommentarer, ingen markdown.

Eksempel struktur:
- bookingNo, destination, subtitle (rejsemål med antal nætter, fx '3N. Hanoi, 4N. Hoi An'), departure, return, travellers, advisor
- destination kan være 1-3 lande, separeret med ' & ' (fx 'Sri Lanka & Maldiverne', 'Vietnam & Cambodia & Thailand'). Bevar formatet som det står i PDF'en.
- subtitle kan indeholde '0N. [By]' for transit-stops uden overnatning, og 'XN turprogram' eller 'XD turprogram' for pakke-rejse-dele.
- travellers: navne i en kort, læsbar streng. Hvis PDF har 'Efternavn/Fornavn (mellem)'-format (fx 'Schlie/Fie Vesti'), så VEND til naturlig rækkefølge ('Fie Vesti Schlie'). Hvis PDF allerede har naturlig rækkefølge ('Herdis Bach Madsen'), bevar som-er. Inkluder børne-aldre i parentes ('Olivia Flyvholm (6 år)'). Slut med samlet antal i parentes ('(6 voksne)' eller '(2 voksne + 2 børn)'). Eksempel: 'Christian Herskind Dam, Pernille Brandt, Michael Kaas Jensen og 3 andre (6 voksne)' eller 'Lene Nielsen, Lars Korsholm Nielsen, Pia Pugdahl Byskov, Jan Byskov (4 voksne)'.
- advisor: navnet fra 'Vores ref:' linjen (fx 'Sebastian Kehler', 'Gustav Gotfredsen', 'Randi Jensen').
- heroPhoto: lad det være null — brugeren vælger billede selv.
- intro: kort og varm dansk velkomsttekst (2-3 sætninger) der opsummerer hvad rejsen byder på — løft de bedste elementer ud fra PDF'en.
- itinerary: liste af alle rejseplan-elementer i kronologisk rækkefølge (fly, transfer, færge, hotel-ophold, udflugter, pakke-rejser).
- hotels: liste af hvert hotel-ophold med felter: name, location, nights, room, meals, checkIn, checkOut. Plus:
  * roomAllocations: array af strenge med værelsesfordeling fra PDF, fx ['Værelse 1: 2 voksne', 'Værelse 2: 2 voksne + 2 børn (8+6)']. Acceptér både 'voksen' (ental) og 'voksne' (flertal). Tom array hvis ikke listet.
  * alternative: hvis PDF nævner et alternativt hotel (typisk efter 'sætning som Dette resort kunne måske også være noget for jer:'), så et objekt { name, description, nights, meals, savings }. null hvis intet.
  * isPackage: true hvis dette 'hotel' faktisk er en pakke-rejse (Sri Lanka rundrejse, Safari, Orangutang Search, Sumatra-tur, Halong Cruise). Disse genkendes ved mønstret: navn + 'X dage/Y nætter (KODE)' efterfulgt af '*Hotellerne på rundrejsen er:*' (eller lignende) med liste af sub-hoteller.
  * subHotels: hvis isPackage er true, en array af { name, location, room, nights } for hvert sub-hotel.
  * included: array af strenge fra 'Inkluderet i prisen:' liste (hvis findes).
  * notIncluded: array af strenge fra 'Ikke inkluderet i prisen:' liste (hvis findes).
  * notes: array af 'Bemærk:'-tekster eller 'hotel-specifikke noter' der hører til opholdet (fx tidevands-info, lokal turistskat, bagage-begrænsninger).
- price: { total, perPerson, note } — total er '##.### kr.', perPerson er '##.### kr. pr. person · # voksne', note kort forklaring. Hvis PDF er Faktura, skær 'Faktura: XXX' og 'Fakturadato' væk.
- disclaimer: kort dansk standardforbehold fra PDF'ens forbeholds-side.
- documentType: 'rejseforslag' eller 'faktura' (kig efter ordet 'Faktura:' øverst i PDF).

For itinerary items gælder:
- type: 'flight' | 'transfer' | 'ferry' | 'hotel' | 'activity'
- timeLabel: fx 'FLY · DAG 1' eller 'HOTEL · 5 NÆTTER · DAG 5–9'
- title: kort titel, fx 'Copenhagen → Koh Samui' eller 'Mará Hotel, Koh Lanta'
- summary: én linje med relevant indhold (rute, fly nr, varighed, måltider)
- times: array af korte informationer (fx ['Via Singapore', '##t ##m', 'Emirates Flight'])
- info: lang tekst hvis der er ekstra praktiske oplysninger fra PDF'en (fx ankomstinstruktion, hotel nævner gebyr, eksisterende notater), eventuelt som { title, body }. Ellers null.
- isOptional: true hvis aktiviteten har 'Tilkøb:' prefix (valgfri ekstra). False ellers.
- flight + travel: laver ÉN af nedenstående — baseret hvad PDF noterer:

  a) 'flight' → brug HVIS aktiviteten er ÉN specifikke fly/transfer (privat eller del-til-del transfer). Fx 'Operating Carrier — Bangkok' der bører over # park. Format: { fly: [{fra, til, dato?}], operator: [...] }. Skal kunne match med fly-numre i PDF'en endda hvis opérated under et code-share (fx '(PG) = Denne flyvning opereres af Bangkok Airways', '(TR): Denne flyning opereres af Scoot', '*Betjenes af SAS').

  b) 'turprogram' → brug HVIS aktiv pår udsgørendes FLERE forskellige aktiviteter eller den nævne udflugt (Sri Lanka rundrejse, Safari, Orangutang Search etc.) der erstatter ophold på et hotel. Format:
    VIGTIGT: hvis aktiviteten har 'X dage/Y nætter (KODE)' og inkluderer sub-hoteller, læg den i hotels (med isPackage=true), IKKE 'turprogram' for én aktivitet.

  c) 'aktivitet' → brug ALTID for type=activity udflugter. Format: { stations: [{titel, varighed}, ...] }.
    Parsér aktivitet med kode som det står i PDF'en spec som (uden nogen variation per):
      - 'Flynummer' (fx 'SQ###')
      - 'Selskab' (fx 'Singapore Airlines')
      - 'Afgang' (fx 'København · 6. februar 2027 kl. 14:45')
      - 'Ankomst' (fx 'Singapore · 7. februar 2027 kl. 06:25')
      - 'Varighed' (fx '12 timer, 30 min')
      - Eventuelt 'Mellemlanding' (fx '1 time, 30 min')
      - Eventuelt note (fx 'OBS! Denne strækning flyves af Bangkok Airways' eller '(PG) Denne flyvning opereres af Bangkok Airways').

Skriv ALT på dansk. Returnér KUN det rene JSON-objekt.`;

export async function parsePdfWithClaude(pdfBase64: string): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ikke konfigureret");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: "Ekstraher rejseplanen som JSON efter specifikationen.",
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Ingen tekst i Claude-svaret");
  }

  const raw = textBlock.text.trim();
  // Strip accidental markdown fences if Claude wrapped the JSON.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    throw new Error("Claude returnerede ikke gyldig JSON. Forsøg igen.");
  }
}


export async function extractPdfRawText(pdfBase64: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ikke konfigureret");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      "Du modtager en PDF og returnerer KUN den rå tekst, eksakt som den fremgår. Bevar linjeskift mellem afsnit. Tilføj IKKE kommentarer, overskrifter eller forklaringer.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: "Returnér PDF'ens fulde rå tekst.",
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return "";
  return textBlock.text.trim();
}
