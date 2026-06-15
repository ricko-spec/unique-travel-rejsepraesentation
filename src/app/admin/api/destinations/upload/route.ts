import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_SLOTS = new Set(["hero", "gallery-0", "gallery-1", "gallery-2"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ugyldig form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  const destination = formData.get("destination");
  const slot = formData.get("slot");

  // --- DIAGNOSTIK (midlertidig, kun til preview-fejlfinding af gallery-upload) ---
  // Fanger PRÆCIS hvad klienten sender, FØR validering, så vi kan se om gallery-
  // uploads afvises pga. mime-type (fx HEIC fra iPhone) før de når storage.
  console.log(
    "[upload-diagnose] indkommende:",
    JSON.stringify({
      slot: typeof slot === "string" ? slot : "(mangler)",
      destination: typeof destination === "string" ? destination : "(mangler)",
      fileName: file instanceof File ? file.name : "(ikke en File)",
      mimeType: file instanceof File ? file.type : "(ukendt)",
      sizeBytes: file instanceof Blob ? file.size : -1,
    }),
  );
  // --- /DIAGNOSTIK ---

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Ingen fil modtaget" }, { status: 400 });
  }
  if (typeof destination !== "string" || !destination.trim()) {
    return NextResponse.json({ error: "Destination mangler" }, { status: 400 });
  }
  if (typeof slot !== "string" || !ALLOWED_SLOTS.has(slot)) {
    return NextResponse.json({ error: `Ugyldig slot: "${String(slot)}"` }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json({ error: `Fil er for stor (max 10 MB) — modtog ${mb} MB` }, { status: 400 });
  }
  const mime = (file as File).type || "image/jpeg";
  if (!ALLOWED_MIME.has(mime)) {
    console.error(`[upload-diagnose] AFVIST mime="${mime}" slot="${slot}"`);
    return NextResponse.json(
      { error: `Filtype ikke tilladt: "${mime}". Tilladt: jpeg, png, webp, avif.` },
      { status: 400 },
    );
  }

  const extFromMime = mime.split("/").pop() || "jpg";
  const cleanDest = slugifyDestination(destination);
  if (!cleanDest) {
    return NextResponse.json({ error: "Ugyldig destination" }, { status: 400 });
  }
  const path = `${cleanDest}/${slot}-${Date.now()}.${extFromMime}`;

  try {
    const supabase = getSupabaseService();
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("destinations")
      .upload(path, Buffer.from(arrayBuffer), {
        contentType: mime,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error(
        "[upload-diagnose] Storage-fejl:",
        JSON.stringify({ slot, path, mime, error: uploadError.message }),
      );
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage
      .from("destinations")
      .getPublicUrl(path);

    console.log("[upload-diagnose] OK:", JSON.stringify({ slot, path, mime }));
    return NextResponse.json({ url: pub.publicUrl, path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    console.error("[POST /api/destinations/upload] Throw", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
