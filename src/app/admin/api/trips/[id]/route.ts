import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import { describeFetchError, getSupabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  active: z.boolean().optional(),
  heroPhoto: z.string().url().optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldige data" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  if (parsed.data.heroPhoto !== undefined) update.hero_photo = parsed.data.heroPhoto;

  try {
    const supabase = getSupabaseService();
    const { error } = await supabase.from("trips").update(update).eq("id", params.id);
    if (error) {
      console.error("[PATCH /api/trips/:id] Supabase error", error);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/trips/:id] Threw", e);
    return NextResponse.json(
      { error: `Forbindelse til Supabase fejlede: ${describeFetchError(e)}` },
      { status: 500 },
    );
  }
}
