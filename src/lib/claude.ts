import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `Du er en præcis dataekstraktor for Unique Travel. Du modtager en TravelWire rejseplan-PDF og skal returnere struktureret JSON.

Returnér KUN gyldig JSON — ingen markdown, ingen forklaringer, ingen kodeblokke.

Ekstraher følgende:
- bookingNo, destination, subtitle (byerne adskilt med ·), departure, return, travellers (fx "2 voksne" eller "Susanne og Finn Bastegaard"), advisor
- heroPhoto: sæt til null — den sættes manuelt af rådgiver
- intro: skriv en kort, stemningsfuld introduktionstekst på dansk (2-3 linjer) der beskriver rejsen som helhed — uden at opfinde detaljer der ikke fremgår af PDF'en
- itinerary: array af alle elementer i kronologisk rækkefølge (fly, transfer, hotel, aktivitet/turprogram, fridag). Hvert element skal have et unikt id (1, 2, 3, ...).
- hotels: array af alle hoteller med navn, lokation, nætter, værelse, måltider, check-in, check-ud, samt:
  * roomAllocations: array af strenge med værelsesfordeling fra PDF, fx ["Værelse 1: 2 voksne", "Værelse 2: 2 voksne", "Værelse 3: 3 voksne"]. Tom array hvis PDF ikke specificerer hvor mange der bor i hvert værelse.
  * alternative: hvis PDF nævner et alternativt hotel (typisk efter sætning som "Dette resort kunne måske også være noget for jer:"), så et objekt { name, description, nights, meals, savings } hvor description er værelsestype/beskrivelse (fx "6x Superior Building + 2x ekstra opredninger"), savings er besparelsen som tekst (fx "ca. 12.000 kr."). null hvis intet alternativ nævnt
- price: { total, perPerson, note } — total fx "83.045 kr.", perPerson fx "41.523 kr. pr. person · 2 voksne", note kort beskrivelse af hvad der er inkluderet
- practicalNote: eventuelle bemærkninger fra prissiden om vejledende priser og ikke-bekræftede elementer. Hvis ingen, returnér tom streng.

For hvert itinerary-element:
- type: "flight" | "hotel" | "transfer" | "activity"
- typeLabel: fx "FLY · DAG 1" eller "HOTEL · 3 NÆTTER · DAG 2–5"
- title: kort titel, fx "Copenhagen → Kuala Lumpur" eller "Meliá Hotel, Kuala Lumpur"
- details: én linje med tekniske detaljer (flynr, tider, værelse, måltider)
- chips: array af korte informationspills (fx ["Via Singapore", "12t 30m", "Economy Flex"])
- obs: hvis der er en vigtig praktisk bemærkning inline i PDF'en (fx chaufførinstruktion, gebyr der betales kontant, terminalskift), ekstraher den som { title, text }. Ellers null.
- expandKind + expand: vælg ÉN af disse — eller null hvis intet matcher:

  a) "program" → brug HVIS elementet er ÉN inkluderet udflugt/turprogram (typisk over flere dage) med et dag-for-dag forløb. Fx "Orangutang Search — Borneo" der løber over 4 dage. Format: { days: [{label, text, meal?}], included: [...] }. Skriv dagsprogrammet komplet ud — én "day" pr. dag i PDF'en. "included" er det samlede "Inkluderet"-afsnit for hele udflugten.

  b) "activities" → brug HVIS kunden får præsenteret FLERE valgfrie aktiviteter de kan vælge imellem (tilkøb eller bare forslag). Typisk en sektion som "Frie udflugtsmuligheder", "Tilvalg på destinationen", "Vælg blandt følgende oplevelser". Format: { activities: [{title, desc}] }. Kun valgfrie/optional aktiviteter — ikke inkluderede.
    VIGTIGT: hvis sektionen kun indeholder ÉN aktivitet, så er det reelt en inkluderet udflugt → brug "program" i stedet (med en enkelt day-blok hvis nødvendigt), IKKE "activities" med ét element.

  c) "flight" → brug ALTID for type="flight" elementer. Format: { details: [{label, value}, ...] }.
    Populér details med alt hvad PDF'en oplyser om flyet — fx (men ikke begrænset til):
      - "Flynummer" (fx "SQ351")
      - "Selskab" (fx "Singapore Airlines")
      - "Afgang" (fx "København (CPH) · 26. juni 2027 kl. 11:55")
      - "Ankomst" (fx "Kuala Lumpur (KUL) · 27. juni 2027 kl. 10:35")
      - "Varighed" (fx "12t 30m")
      - "Mellemlanding" / "Via" (fx "Singapore (SIN), 1t 30m stop")
      - "Sædeklasse" / "Billettype" (fx "Economy Flex")
      - "Bagage" (fx "23 kg + 7 kg håndbagage")
      - "Måltid" (fx "Inkluderet")
      - "Terminal" (afgang / ankomst hvis nævnt)
      - Frequent-flyer programmer, sædepræferencer, andre noter.
    Det er OK at gentage info fra "details"/"chips"-felterne — den udvidede visning skal stå alene som komplet flyinfo. Hvis et felt ikke fremgår af PDF'en, så udelad det helt (returnér ikke "ukendt" eller tomme værdier).

  d) null → for transfer/hotel-elementer hvor alt allerede står i details og der ikke er et dagsprogram eller flere aktiviteter.

For "program" days: ekstraher dag-for-dag med label (fx "Dag 1 — Sandakan & Sepilok"), tekst, måltider (én linje, fx "Frokost og aftensmad inkluderet"). Skriv dagsteksten ud i den fulde længde fra PDF'en.
For "activities": ekstraher titel og den FULDE beskrivelse pr. aktivitet — kopiér teksten direkte fra PDF'en uden at forkorte eller omformulere. Hvis beskrivelsen fylder flere sætninger eller afsnit i PDF'en, så medtag det hele.
For "flight" details: brug korte labels (fx "Bagage", "Måltid", "Sædeklasse", "Terminal afgang", "Billettype") og fulde værdier som de fremgår af PDF'en.

Medtag IKKE standardvilkår, annulleringsregler, forsikringstekst eller indrejseregler i selve rejseplanen — de hører til i practicalNote eller udelades.

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
