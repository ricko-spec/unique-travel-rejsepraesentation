import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import { describeFetchError, getSupabaseService } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INTRO_LEN = 500;

// Tom intro er tilladt (Hero skjuler den når tom); kun længden begrænses.
const introSchema = z.object({
  intro: z.string().max(MAX_INTRO_LEN, `Intro må højst være ${MAX_INTRO_LEN} tegn`),
});

// Kort, ikke-reversibelt fingerprint af en tekst. Audit-loggen må ikke
// indeholde selve intro-teksterne (PII/kundedata, SEC-3) — men fingerprint +
// længde er nok til at se AT og HVORNÅR teksten skiftede, og til at matche
// mod data.introOriginal/intro på trip-rækken, hvor det fulde revisionsspor bor.
function fingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = introSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Ugyldige data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const intro = parsed.data.intro;

  try {
    const supabase = getSupabaseService();

    const { data: row, error: readError } = await supabase
      .from("trips")
      .select("id, slug, booking_no, data, updated_at")
      .eq("id", params.id)
      .maybeSingle();

    if (readError) {
      console.error("[POST /api/trips/:id/intro] Read error", readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Rejsen blev ikke fundet" }, { status: 404 });
    }

    const currentData = (row.data ?? {}) as Record<string, unknown>;
    const before = typeof currentData.intro === "string" ? currentData.intro : "";
    // "admin:{email}" er det dokumenterede actor-format i audit_log
    // (tidligere "user:{email}" — unificeret her; ingen gamle rækker fandtes).
    const actor = `admin:${user.email ?? user.id}`;
    const nextData = {
      ...currentData,
      intro,
      introEditedAt: new Date().toISOString(),
      introEditedBy: user.email ?? user.id,
    };

    // Optimistisk lås (DATA-1): UPDATE rammer kun hvis rækken stadig har det
    // updated_at vi læste. Har en anden (sælger eller re-upload) ændret rækken
    // imens, opdateres 0 rækker — og vi melder konflikt frem for at overskrive.
    const { data: updated, error: updateError } = await supabase
      .from("trips")
      .update({ data: nextData })
      .eq("id", params.id)
      .eq("updated_at", row.updated_at)
      .select("id");

    if (updateError) {
      console.error("[POST /api/trips/:id/intro] Update error", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Rejsen er ændret af en anden imens. Reload og prøv igen." },
        { status: 409 },
      );
    }

    await writeAudit(supabase, {
      actor,
      action: "intro_edited",
      resource: row.slug,
      metadata: {
        booking_no: row.booking_no,
        before_len: before.length,
        after_len: intro.length,
        before_fp: fingerprint(before),
        after_fp: fingerprint(intro),
      },
    });

    return NextResponse.json({ ok: true, trip: nextData });
  } catch (e) {
    console.error("[POST /api/trips/:id/intro] Threw", e);
    return NextResponse.json(
      { error: `Forbindelse til Supabase fejlede: ${describeFetchError(e)}` },
      { status: 500 },
    );
  }
}
