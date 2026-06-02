import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { parsePdfWithClaude, extractPdfRawText } from "@/lib/claude";
import { enrichAdvisorContact } from "@/lib/profiles";
import { tripSchema, normalizeTrip } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await getSessionUser())) {
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
