import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/auth";
import { describeFetchError, getSupabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INTRO_LEN = 500;

// Tom intro er tilladt (Hero skjuler den når tom); kun længden begrænses.
const introSchema = z.object({
  intro: z.string().max(MAX_INTRO_LEN, `Intro må højst være ${MAX_INTRO_LEN} tegn`),
});

// Best-effort audit-logning af sælger-redigering — må aldrig blokere selve gemningen.
// Samme tabel/form som kunde-unlock-loggen i src/app/[bookingId]/actions.ts.
async function writeAudit(
  supabase: SupabaseClient,
  actor: string,
  slug: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { error } = await supabase.from("audit_log").insert({
      actor,
      action: "intro_edited",
      resource: slug,
      ip,
      user_agent: h.get("user-agent"),
      metadata,
    });
    if (error) console.error("[audit] intro_edited insert error:", error);
  } catch (e) {
    console.error("[audit] intro_edited insert threw:", e);
  }
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

    await writeAudit(supabase, actor, row.slug, {
      booking_no: row.booking_no,
      before,
      after: intro,
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
