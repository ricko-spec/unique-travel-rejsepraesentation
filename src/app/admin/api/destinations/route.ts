import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST er et rent opret-endpoint. Billed-URLs skrives KUN af
// finalize-upload-routen (server-side efter behandling) — de blev tidligere
// upsertet herfra af klienten, men det flow forsvandt med signed-URL-upload.
const createSchema = z.object({
  name: z.string(),
});

export async function GET() {
  if (!(await getSessionUser())) {
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
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldigt JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldigt body" }, { status: 400 });
  }
  const name = parsed.data.name.trim();
  if (!name) {
    return NextResponse.json({ error: "Destinationsnavn må ikke være tomt" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseService();

    // Dublet-tjek case-insensitivt: "japan" og "Japan" er samme destination —
    // to rækker ville splitte billedbiblioteket og forvirre hero-opslaget.
    const { data: existing, error: dupError } = await supabase
      .from("destinations")
      .select("name")
      .ilike("name", name)
      .limit(1);

    if (dupError) {
      console.error("[POST /api/destinations] Duplicate check error", dupError);
      return NextResponse.json({ error: dupError.message }, { status: 500 });
    }
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `Destinationen "${existing[0].name}" findes allerede` },
        { status: 409 },
      );
    }

    // Ny række med tomme billedfelter — hero/galleri uploades bagefter via
    // det eksisterende signed-URL-flow (upload-url → PUT → finalize-upload).
    const { data, error } = await supabase
      .from("destinations")
      .insert({ name, hero_url: null, gallery: [] })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/destinations] Insert error", error);
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Destinationen "${name}" findes allerede` },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ destination: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
