import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

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

// Magic-byte-sniff: MIME-headeren er klient-styret og kan lyve — de første
// bytes kan ikke. Returnerer det faktiske format eller null.
function sniffImageFormat(buf: Buffer): "jpeg" | "png" | "webp" | "avif" | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";
  // WebP: "RIFF"...."WEBP"
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  // AVIF (ISO BMFF): "ftyp" på offset 4 + avif/avis-brand på offset 8
  if (
    buf.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(buf.toString("ascii", 8, 12))
  )
    return "avif";
  return null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
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
    return NextResponse.json(
      { error: `Filtype ikke tilladt: "${mime}". Tilladt: jpeg, png, webp, avif.` },
      { status: 400 },
    );
  }

  const cleanDest = slugifyDestination(destination);
  if (!cleanDest) {
    return NextResponse.json({ error: "Ugyldig destination" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const original = Buffer.from(arrayBuffer);

  const formatFrom = sniffImageFormat(original);
  if (!formatFrom) {
    return NextResponse.json(
      { error: "Filen er ikke et gyldigt billede" },
      { status: 400 },
    );
  }

  // Auto-resize + WebP: Mille uploader originalen (kamera/stock), serveren
  // klarer resten. Hero beskæres til 16:9, galleri til 4:3 (matcher
  // aspect-ratio-slotsene i DestinationManager). Output er typisk 100-500 KB.
  const isHero = slot === "hero";
  const { width, height, quality } = isHero
    ? { width: 1920, height: 1080, quality: 85 }
    : { width: 1200, height: 800, quality: 80 };

  let resized: Buffer;
  try {
    resized = await sharp(original)
      .rotate() // respektér EXIF-orientering fra kameraer før crop
      .resize({ width, height, fit: "cover", position: "center" })
      .webp({ quality })
      .toBuffer();
  } catch (e) {
    console.error("[POST /api/destinations/upload] sharp-fejl", e);
    return NextResponse.json(
      { error: "Kunne ikke behandle billedet — er det en gyldig JPEG, PNG eller WebP?" },
      { status: 400 },
    );
  }

  const path = `${cleanDest}/${slot}-${Date.now()}.webp`;

  try {
    const supabase = getSupabaseService();
    const { error: uploadError } = await supabase.storage
      .from("destinations")
      .upload(path, resized, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[POST /api/destinations/upload] Storage error", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage
      .from("destinations")
      .getPublicUrl(path);

    await writeAudit(supabase, {
      actor: `admin:${user.email ?? user.id}`,
      action: "destination_image_uploaded",
      resource: `${destination.trim()}/${slot}`,
      metadata: {
        original_size: original.length,
        resized_size: resized.length,
        format_from: formatFrom,
        format_to: "webp",
      },
    });

    return NextResponse.json({ url: pub.publicUrl, path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    console.error("[POST /api/destinations/upload] Throw", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
