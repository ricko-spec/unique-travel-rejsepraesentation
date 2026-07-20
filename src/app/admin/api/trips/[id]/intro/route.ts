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
      .select("id, slug, booking_no, data")
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
    const actor = `user:${user.email ?? user.id}`;
    const nextData = {
      ...currentData,
      intro,
      introEditedAt: new Date().toISOString(),
      introEditedBy: user.email ?? user.id,
    };

    const { error: updateError } = await supabase
      .from("trips")
      .update({ data: nextData })
      .eq("id", params.id);

    if (updateError) {
      console.error("[POST /api/trips/:id/intro] Update error", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await writeAudit(supabase, {
      actor,
      action: "intro_edited",
      resource: row.slug,
      metadata: {
        booking_no: row.booking_no,
        before,
        after: intro,
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
