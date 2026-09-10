// Sælgervendte fejlbeskeder for PDF-parsing. Tekniske detaljer (Anthropics rå
// API-tekst, Zod-issues, Claudes rå svar) hører til i console.error og
// parse_failures — aldrig i admin-UI'et, hvor de hverken kan bruges til noget
// eller forstås.

export type ParseErrorKind = "billing" | "config" | "transient" | "unreadable";

// Anthropic sender billing-fejl som rå API-tekst ("Your credit balance is too low…").
const BILLING = /credit balance|billing|insufficient[_ ]quota|payment required/i;
// Manglende/forkert nøgle er en driftsfejl, ikke sælgerens PDF.
const CONFIG = /ANTHROPIC_API_KEY|invalid x-api-key|authentication[_ ]error|not configured|ikke konfigureret/i;
// Netværk og midlertidig utilgængelighed — et nyt forsøg plejer at virke.
const TRANSIENT =
  /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network error|overloaded|rate limit|service unavailable/i;
// Anthropic afviser selve dokumentet. De to første mønstre er de faktiske
// API-svar, verificeret ved at sende en tom og en korrupt PDF (sep. 2026):
//   "PDF cannot be empty" og "The PDF specified was not valid."
const UNREADABLE_DOC =
  /(pdf|document|image)[^.]{0,40}(cannot be empty|is empty|not valid|invalid|malformed)|could not process|unable to process|corrupt|malformed|unsupported (file|media|document)|invalid (pdf|document|base64)|too many pages/i;

export function classifyParseFailure(input: {
  message: string;
  /** HTTP-status fra Anthropic-SDK'ens APIError, hvis fejlen har en. */
  status?: number;
  /** Claude svarede, men svaret kunne ikke parses som JSON. */
  claudeReplied?: boolean;
}): ParseErrorKind {
  const msg = input.message ?? "";
  if (BILLING.test(msg)) return "billing";
  // 404 = modellen findes ikke (fx udgået model-id). Driftsfejl, ikke sælgerens PDF.
  if (input.status === 401 || input.status === 403 || input.status === 404 || CONFIG.test(msg))
    return "config";
  // Claude nåede at svare, men ikke med JSON. Set i production tre gange, hver
  // gang på en fuldt gyldig TravelWire-PDF hvor modellen indledte med prosa —
  // altså ikke en PDF-fejl. Et nyt forsøg er den rigtige handling.
  if (input.claudeReplied) return "transient";
  if (input.status === 429 || (input.status !== undefined && input.status >= 500)) return "transient";
  if (TRANSIENT.test(msg)) return "transient";
  if (UNREADABLE_DOC.test(msg)) return "unreadable";
  return "unreadable";
}

const MESSAGES: Record<ParseErrorKind, string> = {
  billing:
    "AI-parseren kan ikke køre lige nu, fordi API-kontoen mangler credits. Kontakt Ricko/admin.",
  config: "AI-parseren er ikke sat rigtigt op lige nu. Kontakt Ricko/admin.",
  transient: "Rejseplanen kunne ikke læses lige nu. Prøv igen om lidt.",
  unreadable:
    "PDF'en kunne ikke læses. Tjek at det er en TravelWire-rejsebeskrivelse, og prøv igen.",
};

const STATUS: Record<ParseErrorKind, number> = {
  billing: 502,
  config: 502,
  transient: 503,
  unreadable: 422,
};

export function parseErrorMessage(kind: ParseErrorKind): string {
  return MESSAGES[kind];
}

export function parseErrorStatus(kind: ParseErrorKind): number {
  return STATUS[kind];
}
