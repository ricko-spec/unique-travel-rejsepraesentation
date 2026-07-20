import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { getSessionUser } from "@/lib/supabase/auth";
import { getSupabaseService } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Download af op til 50 MB + sharp-decode af store stock-billeder kan tage tid.
export const maxDuration = 60;

// Trin 3 af upload-flowet (trin 1: /upload-url udsteder signeret URL,
// trin 2: browseren PUT'er originalen direkte til Storage — udenom Vercels
// 4,5 MB body-grænse). Her hentes originalen fra _staging/, valideres på
// magic bytes, resizes til WebP, lægges på den endelige sti, staging-filen
// slettes, og destinations-rækken opdateres — så klienten kun skal kalde
// dette ene endpoint efter upload.

const ALLOWED_SLOTS = ["hero", "gallery-0", "gallery-1", "gallery-2"] as const;
type Slot = (typeof ALLOWED_SLOTS)[number];
const MAX_SIZE = 50 * 1024 * 1024;

// Kun stier vores eget upload-url-trin kan have udstedt accepteres —
// forhindrer at endpointet bruges til at læse/slette vilkårlige objekter.
const STAGING_PATH_RE =
  /^_staging\/[a-z0-9-]{1,60}\/(hero|gallery-[0-2])-\d{10,16}-[0-9a-f]{12}\.tmp$/;

const bodySchema = z.object({
  destination: z.string().min(1),
  slot: z.enum(ALLOWED_SLOTS),
  stagingPath: z.string().regex(STAGING_PATH_RE, "Ugyldig staging-sti"),
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
  const { destination, slot, stagingPath } = parsed.data;

  const cleanDest = slugifyDestination(destination);
  if (!cleanDest) {
    return NextResponse.json({ error: "Ugyldig destination" }, { status: 400 });
  }
  // Stien skal høre til PRÆCIS denne destination — ikke bare være en gyldig
  // staging-sti for en anden.
  if (!stagingPath.startsWith(`_staging/${cleanDest}/`)) {
    return NextResponse.json(
      { error: "Staging-sti matcher ikke destinationen" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseService();

  async function removeStaging() {
    try {
      const { error } = await supabase.storage.from("destinations").remove([stagingPath]);
      if (error) console.error("[finalize] Kunne ikke slette staging-fil:", error);
    } catch (e) {
      console.error("[finalize] Sletning af staging-fil kastede:", e);
    }
  }

  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from("destinations")
      .download(stagingPath);

    if (dlError || !blob) {
      console.error("[POST /api/destinations/finalize-upload] Download error", dlError);
      return NextResponse.json(
        { error: "Kunne ikke hente den uploadede fil — prøv at uploade igen" },
        { status: 500 },
      );
    }

    const original = Buffer.from(await blob.arrayBuffer());

    if (original.length > MAX_SIZE) {
      await removeStaging();
      const mb = (original.length / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        { error: `Fil er for stor (max 50 MB) — modtog ${mb} MB` },
        { status: 400 },
      );
    }

    const formatFrom = sniffImageFormat(original);
    if (!formatFrom) {
      await removeStaging();
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
      console.error("[POST /api/destinations/finalize-upload] sharp-fejl", e);
      await removeStaging();
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
      console.error("[POST /api/destinations/finalize-upload] Storage error", uploadError);
      await removeStaging();
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage
      .from("destinations")
      .getPublicUrl(finalPath);
    const url = pub.publicUrl;

    // Staging slettes FØR destinations-rækken opdateres (aftalt rækkefølge).
    await removeStaging();

    // Opdater destinations-rækken server-side — klienten skal ikke længere
    // selv POSTe til /admin/api/destinations bagefter.
    const { data: existing, error: readError } = await supabase
      .from("destinations")
      .select("hero_url, gallery")
      .eq("name", destination.trim())
      .maybeSingle();

    if (readError) {
      console.error("[POST /api/destinations/finalize-upload] Row read error", readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    const payload: { name: string; hero_url?: string; gallery?: string[] } = {
      name: destination.trim(),
    };
    if (slot === "hero") {
      payload.hero_url = url;
    } else {
      const idx = Number(slot.replace("gallery-", ""));
      const gallery: string[] = Array.isArray(existing?.gallery)
        ? [...(existing!.gallery as string[])]
        : [];
      while (gallery.length <= idx) gallery.push("");
      gallery[idx] = url;
      payload.gallery = gallery.filter((u) => !!u);
    }

    const { error: upsertError } = await supabase
      .from("destinations")
      .upsert(payload, { onConflict: "name" });

    if (upsertError) {
      console.error("[POST /api/destinations/finalize-upload] Row upsert error", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

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

    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    console.error("[POST /api/destinations/finalize-upload] Throw", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
