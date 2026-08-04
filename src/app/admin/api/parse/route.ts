import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { parsePdfWithClaude, extractPdfRawText } from "@/lib/claude";
import { enrichAdvisorContact } from "@/lib/profiles";
import { tripSchema, normalizeTrip } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF er for stor (max 10 MB)" }, { status: 400 });
  }

  const actor = `admin:${user.email ?? user.id}`;
  const pdfName = file instanceof File ? file.name : null;

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

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
    if (typeof rawResp === "string") {
      // Claude svarede, men svaret kunne ikke parses som JSON.
      await logParseFailure({ actor, kind: "invalid_json", rawResponse: rawResp, pdfName });
    } else {
      // Ingen rå response = fejlen kom fra Anthropic-kaldet selv (API/billing/config).
      await logParseFailure({ actor, kind: "anthropic_error", rawResponse: msg, pdfName });
    }
    // Anthropic sender billing-fejl som rå API-tekst ("Your credit balance is too
    // low...") — sælgerne skal ikke se den, kun en intern besked de kan handle på.
    if (/credit balance|billing/i.test(msg)) {
      console.error("[parse] Anthropic billing-fejl", msg);
      return NextResponse.json(
        {
          error:
            "AI-parseren kan ikke køre lige nu, fordi API-kontoen mangler credits. Kontakt Ricko/admin.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const parsed = tripSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 6).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
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
    return NextResponse.json(
      {
        error: "Claude returnerede data der ikke matcher det forventede skema.",
        issues,
        raw,
      },
      { status: 422 },
    );
  }

  const trip = await enrichAdvisorContact(normalizeTrip(parsed.data));
  return NextResponse.json({ trip, rawPdfText });
}
