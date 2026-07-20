import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trin 1 af upload-flowet: udsted en signeret Supabase Storage-URL så
// browseren kan uploade ORIGINALEN direkte til Storage. Vercel serverless
// afviser request-bodies > 4,5 MB ved platform-kanten (413 før funktionen
// invokeres), så originalfotos (kamera 5-15 MB, stock op til 50 MB) kan
// aldrig gå gennem en API-route. Validering/resize sker i trin 3
// (POST /admin/api/destinations/finalize-upload).
//
// Bucket-forudsætning: 'destinations' har file_size_limit = 50 MB og
// allowed_mime_types = jpeg/png/webp/avif (hævet fra 10 MB 2026-07-20) —
// Storage håndhæver selv begge på den signerede upload.

const ALLOWED_SLOTS = new Set(["hero", "gallery-0", "gallery-1", "gallery-2"]);

const bodySchema = z.object({
  destination: z.string().min(1),
  slot: z.string(),
});

function slugifyDestination(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Best-effort oprydning af efterladte staging-filer (> 24 timer gamle).
// Kører opportunistisk ved hver ny upload-URL i stedet for en separat cron —
// med én bruger af flowet er "ryd op ved næste upload" tilstrækkeligt til at
// intet akkumulerer. Må aldrig blokere eller vælte selve URL-udstedelsen.
async function cleanupStaleStaging(supabase: SupabaseClient): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const { data: folders } = await supabase.storage
      .from("destinations")
      .list("_staging", { limit: 100 });
    for (const folder of folders ?? []) {
      if (folder.id !== null) continue; // filer direkte i _staging/ springes over
      const { data: files } = await supabase.storage
        .from("destinations")
        .list(`_staging/${folder.name}`, { limit: 100 });
      const stale = (files ?? [])
        .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
        .map((f) => `_staging/${folder.name}/${f.name}`);
      if (stale.length > 0) {
        await supabase.storage.from("destinations").remove(stale);
        console.log(`[upload-url] Ryddede ${stale.length} efterladte staging-filer op`);
      }
    }
  } catch (e) {
    console.error("[upload-url] Staging-oprydning fejlede (ignoreret):", e);
  }
}

export async function POST(req: Request) {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldige data" }, { status: 400 });
  }
  const { destination, slot } = parsed.data;

  if (!ALLOWED_SLOTS.has(slot)) {
    return NextResponse.json({ error: `Ugyldig slot: "${slot}"` }, { status: 400 });
  }
  const cleanDest = slugifyDestination(destination);
  if (!cleanDest) {
    return NextResponse.json({ error: "Ugyldig destination" }, { status: 400 });
  }

  // Random token i navnet: bucketen er public-read, så stien må ikke kunne
  // gættes i det korte vindue hvor originalen ligger i staging.
  const token = randomBytes(6).toString("hex");
  const path = `_staging/${cleanDest}/${slot}-${Date.now()}-${token}.tmp`;

  try {
    const supabase = getSupabaseService();
    await cleanupStaleStaging(supabase);

    const { data, error } = await supabase.storage
      .from("destinations")
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[POST /api/destinations/upload-url] Signed URL error", error);
      return NextResponse.json(
        { error: error?.message ?? "Kunne ikke oprette upload-URL" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    console.error("[POST /api/destinations/upload-url] Threw", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
