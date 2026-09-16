import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { parsePdfWithClaude, extractPdfRawText } from "@/lib/claude";
import { enrichAdvisorContact } from "@/lib/profiles";
import { tripSchema, normalizeTrip } from "@/lib/types";
import {
  classifyParseFailure,
  parseErrorMessage,
  parseErrorStatus,
} from "@/lib/parse-errors";
import {
  createUploadEvent,
  hashBookingNo,
  markUploadEventFailed,
  markUploadEventParsed,
  resolveActorName,
} from "@/lib/upload-events";
import { isPdf } from "@/lib/file-sniff";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SEC-4: beskytter den dyre Claude-parse (ikke statiske/admin GETs) mod
// misbrug/spam fra en autentificeret session, uden at genere normalt
// sælgerarbejde. 20 forsøg / 10 minutter pr. bruger: en sælger der
// arbejder sig igennem en bunke bookinger (inkl. et par re-forsøg ved en
// dårlig PDF) rammer aldrig dette i praksis, men en løbsk klient/kapret
// session kan højst udløse ~120 Claude-kald/time i stedet for ubegrænset.
// Key er brugerens Supabase Auth-id (IKKE ip) — flere sælgere bag samme
// kontor-IP må ikke dele hinandens kvote, og vi har allerede en sikker
// identitet fra getSessionUser() på dette tidspunkt.
const PARSE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PARSE_RATE_LIMIT_MAX_ATTEMPTS = 20;

// ERR-2: best-effort dead-letter i parse_failures. Må ALDRIG kaste eller
// blokere fejlresponsen til sælgeren (samme mønster som writeAudit).
// raw_response kan indeholde kundedata — tabellen er service-role-only.
async function logParseFailure(entry: {
  actor: string;
  kind: "invalid_json" | "schema_mismatch" | "max_tokens" | "anthropic_error";
  rawResponse?: string | null;
  issues?: unknown;
  pdfName?: string | null;
}): Promise<void> {
  try {
    const { error } = await getSupabaseService().from("parse_failures").insert({
      actor: entry.actor,
      kind: entry.kind,
      raw_response: entry.rawResponse ? entry.rawResponse.slice(0, 8000) : null,
      issues: entry.issues ?? null,
      pdf_name: entry.pdfName ?? null,
    });
    if (error) console.error("[parse] parse_failures insert error:", error);
  } catch (e) {
    console.error("[parse] parse_failures insert threw:", e);
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Ingen fil modtaget" }, { status: 400 });
  }

  const actor = `admin:${user.email ?? user.id}`;
  const pdfName = file instanceof File ? file.name : null;

  // SEC-4: FØR upload_events-insert og Claude — se konstanterne øverst i
  // filen for antal/vindue/begrundelse. Et rate-limitet forsøg tæller ikke
  // som en registreret upload (ingen upload_events-række oprettes), da det
  // aldrig når frem til et reelt parse-forsøg.
  const rl = await checkRateLimit(`parse:${user.id}`, {
    windowMs: PARSE_RATE_LIMIT_WINDOW_MS,
    maxAttempts: PARSE_RATE_LIMIT_MAX_ATTEMPTS,
  });
  if (!rl.allowed) {
    await writeAudit(getSupabaseService(), {
      actor,
      action: "parse_rate_limited",
      resource: "parse",
      metadata: { attempt_count: rl.attempts },
    });
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `For mange PDF-uploads. Prøv igen om ${minutes} minutter.` },
      { status: 429 },
    );
  }

  // ISSUE-38: fail-closed. Så snart vi har en autentificeret bruger og en
  // reel fil-upload, oprettes upload-eventet FØR Claude kaldes. Fejler dette
  // insert, må Claude ikke kaldes og uploaden må ikke fortsætte — ellers kan
  // en behandlet PDF eksistere uden at være talt med i brugsoverblikket.
  const actorName = await resolveActorName(getSupabaseService(), user);
  const eventResult = await createUploadEvent({
    userId: user.id,
    actorName,
    fileSizeBytes: file.size,
  });
  if (!eventResult.ok) {
    console.error("[parse] upload_events insert fejlede — stopper før Claude", eventResult.error);
    return NextResponse.json(
      { error: "Uploaden kunne ikke registreres. Prøv igen om lidt." },
      { status: 503 },
    );
  }
  const uploadEventId = eventResult.id;

  if (file.size > 10 * 1024 * 1024) {
    await markUploadEventFailed(uploadEventId, "validation_failed", "file_too_large");
    return NextResponse.json({ error: "PDF er for stor (max 10 MB)" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  // SEC-4: filnavn/MIME-type er klient-styret og kan forfalskes — kun de
  // faktiske bytes afgør om det er en PDF. Uploadeventet beholdes (det er
  // stadig en modtaget upload), markeres validation_failed, og Claude kaldes
  // aldrig med indhold der ikke engang er en PDF.
  if (!isPdf(fileBuffer)) {
    await markUploadEventFailed(uploadEventId, "validation_failed", "invalid_file_type");
    return NextResponse.json(
      { error: "Filen er ikke en gyldig PDF. Upload en TravelWire-rejseplan som PDF." },
      { status: 400 },
    );
  }

  const base64 = fileBuffer.toString("base64");

  let raw: unknown;
  let rawPdfText = "";
  try {
    [raw, rawPdfText] = await Promise.all([
      parsePdfWithClaude(base64),
      extractPdfRawText(base64).catch(() => ""),
    ]);
  } catch (e) {
    const rawResp = (e as Error & { rawResponse?: string }).rawResponse;
    if (typeof rawResp === "string") {
      console.error("[parse] Claude returned invalid JSON", {
        totalLength: rawResp.length,
        first500: rawResp.slice(0, 500),
        last500: rawResp.slice(-500),
      });
    }
    const msg = e instanceof Error ? e.message : "Ukendt fejl ved parsing";
    const claudeReplied = typeof rawResp === "string";
    if (claudeReplied) {
      // Claude svarede, men svaret kunne ikke parses som JSON.
      await logParseFailure({ actor, kind: "invalid_json", rawResponse: rawResp, pdfName });
      await markUploadEventFailed(uploadEventId, "parse_failed", "invalid_json");
    } else {
      // Ingen rå response = fejlen kom fra Anthropic-kaldet selv (API/billing/config).
      await logParseFailure({ actor, kind: "anthropic_error", rawResponse: msg, pdfName });
      await markUploadEventFailed(uploadEventId, "parse_failed", "anthropic_error");
    }
    const status = (e as { status?: number }).status;
    const kind = classifyParseFailure({ message: msg, status, claudeReplied });
    // Den tekniske tekst bliver her på serveren — sælgeren får en besked de kan
    // handle på, og detaljerne ligger i logs + parse_failures til fejlsøgning.
    console.error("[parse] fejl", { kind, status, msg });
    return NextResponse.json(
      { error: parseErrorMessage(kind) },
      { status: parseErrorStatus(kind) },
    );
  }

  const parsed = tripSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[parse] Schema validation failed", {
      issues: parsed.error.issues,
      raw,
    });
    await logParseFailure({
      actor,
      kind: "schema_mismatch",
      rawResponse: JSON.stringify(raw),
      issues: parsed.error.issues,
      pdfName,
    });
    await markUploadEventFailed(uploadEventId, "parse_failed", "schema_mismatch");
    // issues og raw bliver på serveren: de er uforståelige for sælgeren, og raw
    // indeholder kundedata der ikke har noget at gøre i et browsersvar.
    return NextResponse.json(
      { error: parseErrorMessage("unreadable") },
      { status: parseErrorStatus("unreadable") },
    );
  }

  const trip = await enrichAdvisorContact(normalizeTrip(parsed.data));
  await markUploadEventParsed(uploadEventId, hashBookingNo(trip.bookingNo));
  return NextResponse.json({ trip, rawPdfText, uploadEventId });
}
