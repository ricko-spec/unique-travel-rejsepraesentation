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

For itinerary items gælder (BRUG DISSE EKSAKTE FELT-NAVNE — ingen andre):
- type: 'flight' | 'transfer' | 'hotel' | 'activity' (kun disse fire)
- typeLabel: kort label-tekst, fx 'FLY · DAG 1' eller 'HOTEL · 5 NÆTTER · DAG 5–9' eller 'SAFARI · 4 DAGE / 3 NÆTTER · DAG 3–6'
- dateLabel: kompakt dato-label så kunden ikke skal regne ud hvilken dato 'DAG N' er. Format:
  * Single dag (FLY/TRANSFER/ACTIVITY): '<UGEDAG> <DAG>. <MÅNED>', fx 'SØN 27. DEC' eller 'TOR 31. DEC'.
  * Range over flere dage (HOTEL/SAFARI), samme måned: '<UGEDAG1> <DAG1>. – <UGEDAG2> <DAG2>. <MÅNED>', fx 'MAN 28. – TOR 31. DEC'.
  * Range der krydser månedsskifte: '<UGEDAG1> <DAG1>. <MÅNED1> – <UGEDAG2> <DAG2>. <MÅNED2>', fx 'ONS 30. DEC – SØN 3. JAN'.
  Ugedage (3 bogstaver versaler): MAN, TIR, ONS, TOR, FRE, LØR, SØN. Måneder (3 bogstaver versaler): JAN, FEB, MAR, APR, MAJ, JUN, JUL, AUG, SEP, OKT, NOV, DEC. Brug PDF'ens faktiske datoer til at finde ugedag korrekt.
- title: kort titel, fx 'Copenhagen → Koh Samui' eller 'Mará Hotel, Koh Lanta'
- details: én linje med kort, læsbar oversigt (fx 'EK152 · Afgang lør. 6. feb. kl. 14:45 · Ankomst søn. 7. feb. kl. 00:10 · Rejsetid: 6t 25m')
- chips: array af 2-5 korte nøgleord (fx ['Emirates Air', 'EK152', '6t 25m', 'Via Dubai'] eller ['Halvpension', '7 nætter', 'Sea View Villa'])
- obs: { title, text } hvis PDF'en har en relevant note (OBS!, ankomstinstruktion, måltids-info, bagage-begrænsninger, tidevands-info). null ellers.
- isOptional: true hvis aktiviteten har 'Tilkøb:' prefix (valgfri ekstra). False ellers.
- expandKind + expand: definerer det udvidelige indhold under itemet. Vælg én kombination, eller udelad begge (sæt til null) hvis intet at udvide (typisk simple transfers).

  a) expandKind: "flight" → for fly-elementer. expand: { details: [{label, value}] } med rækker som:
     ['Flynummer','EK152'], ['Selskab','Emirates Air'], ['Afgang','Copenhagen (CPH) · lørdag 6. februar 2027 kl. 14:45'], ['Ankomst','Dubai (DXB) · søndag 7. februar 2027 kl. 00:10'], ['Varighed','6 timer, 25 min'], evt. ['Mellemlanding','Dubai (DXB), 2 timer 50 min stop'], evt. ['Bagage','20 kg pr. person (standard)'], evt. ['Note','(PG) Denne flyvning opereres af Bangkok Airways' / '*Betjenes af SAS' / '(TR) Denne flyvning opereres af Scoot'].

  b) expandKind: "program" → for udflugter/safari/rundrejser som ÉN aktivitet med flere dages program. expand: { days: [{label, text, meal?}], included: [string] }.
     VIGTIGT: hvis aktiviteten er en pakke-rejse med sub-hoteller (Sri Lanka rundrejse, Halong Cruise, Sumatra-tur etc. med 'X dage/Y nætter (KODE)' og navngivne overnatningssteder), placér den i hotels[] med isPackage=true i stedet for itinerary.

  c) expandKind: "activities" → for udflugts-blokke med flere uafhængige aktiviteter at vælge mellem. expand: { activities: [{title, desc}] }.

ALDRIG brug felt-navnene 'times', 'summary', 'timeLabel', 'info', eller læg fly-/program-/aktivitets-data i sibling-keys ('flight', 'turprogram', 'aktivitet') på itemet. Alt udvideligt indhold SKAL ligge i 'expand'-objektet og være parret med en 'expandKind'.

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
