import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trin 1 af upload-flowet: udsted en signeret Supabase Storage-URL så
// browseren kan uploade ORIGINALEN direkte til Storage. Vercel serverless
// afviser request-bodies > 4,5 MB ved platform-kanten (413 før funktionen
// invokeres), så originalfotos kan ikke gå gennem en API-route. Selve
// valideringen/resize sker i trin 3 (POST /admin/api/destinations/upload).

const ALLOWED_SLOTS = new Set(["hero", "gallery-0", "gallery-1", "gallery-2"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const MAX_SIZE = 10 * 1024 * 1024;

const bodySchema = z.object({
  destination: z.string().min(1),
  slot: z.string(),
  size: z.number().int().positive(),
  mime: z.string(),
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

export async function POST(req: Request) {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldige data" }, { status: 400 });
  }
  const { destination, slot, size, mime } = parsed.data;

  if (!ALLOWED_SLOTS.has(slot)) {
    return NextResponse.json({ error: `Ugyldig slot: "${slot}"` }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    const mb = (size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `Fil er for stor (max 10 MB) — modtog ${mb} MB` },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Filtype ikke tilladt: "${mime}". Tilladt: jpeg, png, webp, avif.` },
      { status: 400 },
    );
  }
  const cleanDest = slugifyDestination(destination);
  if (!cleanDest) {
    return NextResponse.json({ error: "Ugyldig destination" }, { status: 400 });
  }

  // Originalen parkeres under orig/ og slettes igen af process-trinnet.
  const path = `orig/${cleanDest}/${slot}-${Date.now()}`;

  try {
    const supabase = getSupabaseService();
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
    return NextResponse.json({ signedUrl: data.signedUrl, path: data.path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    console.error("[POST /api/destinations/upload-url] Threw", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
