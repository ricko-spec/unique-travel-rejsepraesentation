import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Trin 3 af upload-flowet (trin 1: /upload-url udsteder signeret URL,
// trin 2: browseren PUT'er originalen direkte til Storage — udenom Vercels
// 4,5 MB body-grænse). Her hentes originalen fra orig/-stien, valideres på
// magic bytes, resizes til WebP, lægges på den endelige sti, og originalen
// slettes igen.

const ALLOWED_SLOTS = new Set(["hero", "gallery-0", "gallery-1", "gallery-2"]);
const MAX_SIZE = 10 * 1024 * 1024;

// Kun stier vores eget upload-url-trin kan have udstedt accepteres —
// forhindrer at endpointet bruges til at læse/slette vilkårlige objekter.
const ORIG_PATH_RE = /^orig\/[a-z0-9-]{1,60}\/(hero|gallery-[0-2])-\d{10,16}$/;

const bodySchema = z.object({
  path: z.string().regex(ORIG_PATH_RE, "Ugyldig upload-sti"),
  destination: z.string().min(1),
  slot: z.string(),
});

// Magic-byte-sniff: MIME-headeren er klient-styret og kan lyve — de første
// bytes kan ikke. Returnerer det faktiske format eller null.
function sniffImageFormat(buf: Buffer): "jpeg" | "png" | "webp" | "avif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
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

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Ugyldige data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { path: origPath, destination, slot } = parsed.data;

  if (!ALLOWED_SLOTS.has(slot)) {
    return NextResponse.json({ error: `Ugyldig slot: "${slot}"` }, { status: 400 });
  }

  const supabase = getSupabaseService();
  // Slugify'et destination står allerede i orig-stien (upload-url-trinnet
  // byggede den) — genbrug det så endelig sti og orig-sti altid matcher.
  const cleanDest = origPath.split("/")[1];

  // Best-effort oprydning af originalen — må ikke vælte svaret.
  async function removeOriginal() {
    try {
      const { error } = await supabase.storage.from("destinations").remove([origPath]);
      if (error) console.error("[upload] Kunne ikke slette original:", error);
    } catch (e) {
      console.error("[upload] Sletning af original kastede:", e);
    }
  }

  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from("destinations")
      .download(origPath);

    if (dlError || !blob) {
      console.error("[POST /api/destinations/upload] Download error", dlError);
      return NextResponse.json(
        { error: "Kunne ikke hente den uploadede fil — prøv igen" },
        { status: 500 },
      );
    }

    const original = Buffer.from(await blob.arrayBuffer());

    if (original.length > MAX_SIZE) {
      await removeOriginal();
      const mb = (original.length / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        { error: `Fil er for stor (max 10 MB) — modtog ${mb} MB` },
        { status: 400 },
      );
    }

    const formatFrom = sniffImageFormat(original);
    if (!formatFrom) {
      await removeOriginal();
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
      await removeOriginal();
      return NextResponse.json(
        { error: "Kunne ikke behandle billedet — er det en gyldig JPEG, PNG eller WebP?" },
        { status: 400 },
      );
    }

    const finalPath = `${cleanDest}/${slot}-${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("destinations")
      .upload(finalPath, resized, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("[POST /api/destinations/upload] Storage error", uploadError);
      await removeOriginal();
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    await removeOriginal();

    const { data: pub } = supabase.storage
      .from("destinations")
      .getPublicUrl(finalPath);

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

    return NextResponse.json({ url: pub.publicUrl, path: finalPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    console.error("[POST /api/destinations/upload] Throw", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
