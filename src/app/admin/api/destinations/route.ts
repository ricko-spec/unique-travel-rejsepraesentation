import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSupabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1),
  hero_url: z.string().url().nullable().optional(),
  gallery: z.array(z.string().url()).max(3).optional(),
});

export async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }
  try {
    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("destinations")
      .select("name, hero_url, gallery, updated_at")
      .order("name");
    if (error) {
      console.error("[GET /api/destinations] Supabase error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ destinations: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldigt JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldigt body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const supabase = getSupabaseService();
    const payload: Record<string, unknown> = { name: parsed.data.name };
    if (parsed.data.hero_url !== undefined) payload.hero_url = parsed.data.hero_url;
    if (parsed.data.gallery !== undefined) payload.gallery = parsed.data.gallery;
    const { data, error } = await supabase
      .from("destinations")
      .upsert(payload, { onConflict: "name" })
      .select()
      .single();
    if (error) {
      console.error("[POST /api/destinations] Supabase error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ destination: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
